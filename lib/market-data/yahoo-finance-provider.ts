import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { request as httpsRequest } from "node:https";
import { join } from "node:path";
import { promisify } from "node:util";

import { buildQuoteFromCandles } from "../mock-data.ts";
import {
  createMarketProviderState,
  TIMEFRAME_OPTIONS,
  type Candle,
  type MarketSnapshot,
  type MetalSymbolCode,
  type QuoteData,
  type Timeframe,
} from "../market-types.ts";
import { MarketDataProviderError, isMarketDataProviderError } from "./errors.ts";
import {
  type HistoricalCandlesRequest,
  type HistoricalCandlesResponse,
  type LatestQuoteRequest,
  type LatestQuoteResponse,
  type MarketDataProvider,
  type ProviderInstrumentMetadata,
} from "./types.ts";

type YahooFinanceMeta = {
  regularMarketPrice?: number;
  chartPreviousClose?: number;
  previousClose?: number;
  regularMarketDayHigh?: number;
  regularMarketDayLow?: number;
  regularMarketOpen?: number;
  regularMarketVolume?: number;
  regularMarketTime?: number;
};

type YahooFinanceResult = {
  meta?: YahooFinanceMeta;
  timestamp?: number[];
  indicators?: {
    quote?: Array<{
      open?: Array<number | null>;
      high?: Array<number | null>;
      low?: Array<number | null>;
      close?: Array<number | null>;
      volume?: Array<number | null>;
    }>;
  };
};

type YahooFinanceChartResponse = {
  chart?: {
    result?: YahooFinanceResult[];
    error?: {
      description?: string;
    } | null;
  };
};

type PersistedYahooResult = {
  fetchedAt: string;
  result: YahooFinanceResult;
};

type PersistedYahooCache = Record<string, PersistedYahooResult>;

type YahooTimeframeConfig = {
  interval: string;
  range: string;
  resampleSeconds?: number;
};

type CreateYahooFinanceProviderOptions = {
  requestWithCurl?: (
    url: string,
    referer: string,
  ) => Promise<YahooFinanceChartResponse>;
  requestWithHttps?: (
    url: string,
    referer: string,
  ) => Promise<YahooFinanceChartResponse>;
  readPersistedResult?: (
    symbol: MetalSymbolCode,
    timeframe: Timeframe,
  ) => Promise<PersistedYahooResult | null>;
  persistResult?: (
    symbol: MetalSymbolCode,
    timeframe: Timeframe,
    result: YahooFinanceResult,
  ) => Promise<void>;
};

const execFileAsync = promisify(execFile);
const YAHOO_CHART_HOSTS = [
  "query1.finance.yahoo.com",
  "query2.finance.yahoo.com",
] as const;
const YAHOO_CACHE_FILE_PATH = join(process.cwd(), "data", "yahoo-chart-cache.json");

export const YAHOO_FINANCE_SYMBOLS: Record<
  MetalSymbolCode,
  ProviderInstrumentMetadata
> = {
  XAUUSD: {
    providerSymbol: "GC=F",
    exchange: "COMEX",
    type: "futures",
  },
  XAGUSD: {
    providerSymbol: "SI=F",
    exchange: "COMEX",
    type: "futures",
  },
  XPTUSD: {
    providerSymbol: "PL=F",
    exchange: "NYMEX",
    type: "futures",
  },
  XCUUSD: {
    providerSymbol: "HG=F",
    exchange: "COMEX",
    type: "futures",
  },
  XURUSD: {
    providerSymbol: "URNM",
    exchange: "NYSEARCA",
    type: "etf",
  },
  SPXUSD: {
    providerSymbol: "^GSPC",
    exchange: "INDEX",
    type: "index",
  },
};

const YAHOO_TIMEFRAMES: Record<Timeframe, YahooTimeframeConfig> = {
  "1m": {
    interval: "1m",
    range: "1d",
  },
  "5m": {
    interval: "5m",
    range: "5d",
  },
  "15m": {
    interval: "15m",
    range: "1mo",
  },
  "30m": {
    interval: "30m",
    range: "1mo",
  },
  "1H": {
    interval: "60m",
    range: "3mo",
  },
  "4H": {
    interval: "60m",
    range: "6mo",
    resampleSeconds: 14400,
  },
  Daily: {
    interval: "1d",
    range: "1y",
  },
  Weekly: {
    interval: "1wk",
    range: "5y",
  },
};

export function getYahooFinanceInstrumentConfig(symbol: MetalSymbolCode) {
  return YAHOO_FINANCE_SYMBOLS[symbol];
}

function buildSnapshotCacheKey(symbol: MetalSymbolCode, timeframe: Timeframe) {
  return `${symbol}:${timeframe}`;
}

function isFiniteNumber(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function resampleCandles(candles: Candle[], bucketSeconds: number): Candle[] {
  if (candles.length === 0) {
    return [];
  }

  const buckets = new Map<number, Candle>();

  for (const candle of candles) {
    const bucketTime = Math.floor(candle.time / bucketSeconds) * bucketSeconds;
    const existing = buckets.get(bucketTime);

    if (!existing) {
      buckets.set(bucketTime, {
        time: bucketTime,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
        volume: candle.volume ?? 0,
      });
      continue;
    }

    existing.high = Math.max(existing.high, candle.high);
    existing.low = Math.min(existing.low, candle.low);
    existing.close = candle.close;
    existing.volume = (existing.volume ?? 0) + (candle.volume ?? 0);
  }

  return Array.from(buckets.values()).sort((left, right) => left.time - right.time);
}

export function extractYahooFinanceCandles(
  result: YahooFinanceResult,
  timeframe: Timeframe,
): Candle[] {
  const timestamps = result.timestamp ?? [];
  const quote = result.indicators?.quote?.[0];
  const opens = quote?.open ?? [];
  const highs = quote?.high ?? [];
  const lows = quote?.low ?? [];
  const closes = quote?.close ?? [];
  const volumes = quote?.volume ?? [];

  const candles: Candle[] = [];

  for (let index = 0; index < timestamps.length; index += 1) {
    const time = timestamps[index];
    const open = opens[index];
    const high = highs[index];
    const low = lows[index];
    const close = closes[index];
    const volume = volumes[index];

    if (
      !isFiniteNumber(time) ||
      !isFiniteNumber(open) ||
      !isFiniteNumber(high) ||
      !isFiniteNumber(low) ||
      !isFiniteNumber(close)
    ) {
      continue;
    }

    candles.push({
      time,
      open,
      high,
      low,
      close,
      volume: isFiniteNumber(volume) ? volume : undefined,
    });
  }

  const timeframeConfig = YAHOO_TIMEFRAMES[timeframe];
  const normalized = timeframeConfig.resampleSeconds
    ? resampleCandles(candles, timeframeConfig.resampleSeconds)
    : candles;

  return normalized.slice(-TIMEFRAME_OPTIONS[timeframe].candleCount);
}

export function buildYahooFinanceQuote(
  symbol: MetalSymbolCode,
  candles: Candle[],
  meta?: YahooFinanceMeta,
): QuoteData {
  const baseQuote = buildQuoteFromCandles(symbol, candles, "yahoo-finance");
  const previousClose =
    meta?.chartPreviousClose ?? meta?.previousClose ?? baseQuote.previousClose;
  const lastPrice = meta?.regularMarketPrice ?? baseQuote.lastPrice;
  const change = lastPrice - previousClose;
  const changePercent = previousClose ? (change / previousClose) * 100 : 0;

  return {
    ...baseQuote,
    lastPrice,
    change,
    changePercent,
    high: meta?.regularMarketDayHigh ?? baseQuote.high,
    low: meta?.regularMarketDayLow ?? baseQuote.low,
    open: meta?.regularMarketOpen ?? baseQuote.open,
    previousClose,
    volume: meta?.regularMarketVolume ?? baseQuote.volume,
    updatedAt: meta?.regularMarketTime
      ? new Date(meta.regularMarketTime * 1000).toISOString()
      : baseQuote.updatedAt,
    source: "yahoo-finance",
  };
}

async function requestYahooChartResponseWithHttps(
  url: string,
  referer: string,
): Promise<YahooFinanceChartResponse> {
  return new Promise((resolve, reject) => {
    const req = httpsRequest(
      url,
      {
        method: "GET",
        headers: {
          Accept: "application/json",
          "Accept-Language": "en-US,en;q=0.9",
          Origin: "https://finance.yahoo.com",
          Referer: referer,
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        },
      },
      (response) => {
        let payload = "";

        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          payload += chunk;
        });
        response.on("end", () => {
          const statusCode = response.statusCode;

          if (!statusCode || statusCode >= 400) {
            reject(
              new MarketDataProviderError({
                code: statusCode === 429 ? "rate_limited" : "bad_response",
                endpoint: "chart",
                status: statusCode,
                message:
                  statusCode === 429
                    ? "Yahoo Finance chart request hit a rate limit."
                    : `Yahoo Finance chart request failed with HTTP ${statusCode ?? "unknown"}.`,
              }),
            );
            return;
          }

          try {
            resolve(JSON.parse(payload) as YahooFinanceChartResponse);
          } catch (error) {
            reject(
              new MarketDataProviderError({
                code: "bad_response",
                endpoint: "chart",
                status: statusCode,
                message: "Yahoo Finance returned a non-JSON chart response.",
                cause: error,
              }),
            );
          }
        });
      },
    );

    req.on("error", (error) => {
      reject(
        new MarketDataProviderError({
          code: "network_failure",
          endpoint: "chart",
          message:
            "Yahoo Finance chart request failed because the network request did not complete.",
          cause: error,
        }),
      );
    });
    req.setTimeout(10_000, () => {
      req.destroy(
        new MarketDataProviderError({
          code: "network_failure",
          endpoint: "chart",
          message: "Yahoo Finance chart request timed out.",
          retriable: true,
        }),
      );
    });
    req.end();
  });
}

async function requestYahooChartResponseWithCurl(
  url: string,
  referer: string,
): Promise<YahooFinanceChartResponse> {
  try {
    const { stdout } = await execFileAsync(
      "curl",
      [
        "-sS",
        "--max-time",
        "10",
        "-w",
        "\n%{http_code}",
        "-H",
        "User-Agent: Mozilla/5.0",
        "-H",
        "Accept: application/json",
        "-H",
        "Accept-Language: en-US,en;q=0.9",
        "-H",
        "Origin: https://finance.yahoo.com",
        "-H",
        `Referer: ${referer}`,
        url,
      ],
      {
        timeout: 10_000,
        maxBuffer: 8 * 1024 * 1024,
      },
    );

    const separatorIndex = stdout.lastIndexOf("\n");
    const payload = separatorIndex === -1 ? stdout : stdout.slice(0, separatorIndex);
    const statusText = separatorIndex === -1 ? "0" : stdout.slice(separatorIndex + 1).trim();
    const statusCode = Number(statusText);

    if (!Number.isFinite(statusCode) || statusCode >= 400) {
      throw new MarketDataProviderError({
        code: statusCode === 429 ? "rate_limited" : "bad_response",
        endpoint: "chart",
        status: Number.isFinite(statusCode) ? statusCode : undefined,
        message:
          statusCode === 429
            ? "Yahoo Finance chart request hit a rate limit."
            : `Yahoo Finance chart request failed with HTTP ${Number.isFinite(statusCode) ? statusCode : "unknown"}.`,
      });
    }

    try {
      return JSON.parse(payload) as YahooFinanceChartResponse;
    } catch (error) {
      throw new MarketDataProviderError({
        code: "bad_response",
        endpoint: "chart",
        status: statusCode,
        message: "Yahoo Finance returned a non-JSON chart response.",
        cause: error,
      });
    }
  } catch (error) {
    if (isMarketDataProviderError(error)) {
      throw error;
    }

    throw new MarketDataProviderError({
      code: "network_failure",
      endpoint: "chart",
      message:
        "Yahoo Finance chart request failed because the network request did not complete.",
      cause: error,
    });
  }
}

async function readPersistedYahooCache() {
  try {
    const raw = await readFile(YAHOO_CACHE_FILE_PATH, "utf8");

    return JSON.parse(raw) as PersistedYahooCache;
  } catch {
    return {};
  }
}

async function readPersistedYahooResult(
  symbol: MetalSymbolCode,
  timeframe: Timeframe,
) {
  const cache = await readPersistedYahooCache();

  return cache[buildSnapshotCacheKey(symbol, timeframe)] ?? null;
}

async function persistYahooResult(
  symbol: MetalSymbolCode,
  timeframe: Timeframe,
  result: YahooFinanceResult,
) {
  const cache = await readPersistedYahooCache();
  const cacheKey = buildSnapshotCacheKey(symbol, timeframe);

  cache[cacheKey] = {
    fetchedAt: new Date().toISOString(),
    result,
  };

  await mkdir(join(process.cwd(), "data"), { recursive: true });
  await writeFile(YAHOO_CACHE_FILE_PATH, JSON.stringify(cache, null, 2));
}

function buildMarketSnapshotFromYahooResult(
  symbol: MetalSymbolCode,
  timeframe: Timeframe,
  result: YahooFinanceResult,
  options?: {
    warning?: string;
    status?: "live" | "fallback";
    message?: string;
  },
): MarketSnapshot {
  const candles = extractYahooFinanceCandles(result, timeframe);

  if (candles.length === 0) {
    throw new MarketDataProviderError({
      code: "empty_candles",
      endpoint: "chart",
      message: "Yahoo Finance returned no valid OHLC candles.",
    });
  }

  const metadata = getYahooFinanceInstrumentConfig(symbol);

  return {
    symbol,
    timeframe,
    candles,
    quote: buildYahooFinanceQuote(symbol, candles, result.meta),
    source: "yahoo-finance",
    provider: createMarketProviderState({
      id: "yahoo-finance",
      status: options?.status ?? "live",
      configured: true,
      symbol: metadata.providerSymbol,
      message:
        options?.message ?? "Live market data is active from Yahoo Finance.",
    }),
    warning: options?.warning,
  };
}

async function fetchYahooChartResult(
  symbol: MetalSymbolCode,
  timeframe: Timeframe,
  requestWithCurl: (
    url: string,
    referer: string,
  ) => Promise<YahooFinanceChartResponse>,
  requestWithHttps: (
    url: string,
    referer: string,
  ) => Promise<YahooFinanceChartResponse>,
) {
  const metadata = getYahooFinanceInstrumentConfig(symbol);
  const timeframeConfig = YAHOO_TIMEFRAMES[timeframe];
  const referer = `https://finance.yahoo.com/quote/${metadata.providerSymbol}`;
  const errors: MarketDataProviderError[] = [];

  for (const requester of [requestWithCurl, requestWithHttps]) {
    for (const host of YAHOO_CHART_HOSTS) {
      try {
        const url = new URL(`https://${host}/v8/finance/chart/${metadata.providerSymbol}`);
        url.searchParams.set("interval", timeframeConfig.interval);
        url.searchParams.set("range", timeframeConfig.range);
        url.searchParams.set("corsDomain", "finance.yahoo.com");
        url.searchParams.set("includePrePost", "true");
        url.searchParams.set("events", "div,splits");

        const response = await requester(url.toString(), referer);
        const result = response.chart?.result?.[0];

        if (!result) {
          throw new MarketDataProviderError({
            code: "bad_response",
            endpoint: "chart",
            message:
              response.chart?.error?.description ??
              "Yahoo Finance returned no chart result for this symbol/timeframe.",
          });
        }

        return result;
      } catch (error) {
        errors.push(
          isMarketDataProviderError(error)
            ? error
            : new MarketDataProviderError({
                code: "unknown",
                endpoint: "chart",
                message: "Yahoo Finance chart request failed unexpectedly.",
                cause: error,
              }),
        );
      }
    }
  }

  const rateLimitedError = errors.find((error) => error.code === "rate_limited");
  const networkError = errors.find((error) => error.code === "network_failure");
  const primaryError = rateLimitedError ?? networkError ?? errors[0];

  throw new MarketDataProviderError({
    code: primaryError?.code ?? "unknown",
    endpoint: "chart",
    message:
      errors.length > 0
        ? errors.map((error) => error.message).join(" | ")
        : "Yahoo Finance chart request failed.",
    retriable: primaryError?.retriable ?? true,
  });
}

export function createYahooFinanceProvider(
  options: CreateYahooFinanceProviderOptions = {},
): MarketDataProvider {
  const requestWithCurl = options.requestWithCurl ?? requestYahooChartResponseWithCurl;
  const requestWithHttps = options.requestWithHttps ?? requestYahooChartResponseWithHttps;
  const readPersistedResult = options.readPersistedResult ?? readPersistedYahooResult;
  const persistResult = options.persistResult ?? persistYahooResult;

  async function getLiveResult(symbol: MetalSymbolCode, timeframe: Timeframe) {
    return fetchYahooChartResult(
      symbol,
      timeframe,
      requestWithCurl,
      requestWithHttps,
    );
  }

  return {
    id: "yahoo-finance",
    isConfigured() {
      return true;
    },
    getInstrumentMetadata(symbol) {
      return getYahooFinanceInstrumentConfig(symbol);
    },
    async getHistoricalCandles(
      request: HistoricalCandlesRequest,
    ): Promise<HistoricalCandlesResponse> {
      const result = await getLiveResult(request.symbol, request.timeframe);
      const candles = extractYahooFinanceCandles(result, request.timeframe);

      if (candles.length === 0) {
        throw new MarketDataProviderError({
          code: "empty_candles",
          endpoint: "chart",
          message: "Yahoo Finance returned no valid OHLC candles.",
        });
      }

      return {
        symbol: request.symbol,
        timeframe: request.timeframe,
        candles,
        metadata: getYahooFinanceInstrumentConfig(request.symbol),
        source: "yahoo-finance",
      };
    },
    async getLatestQuote(request: LatestQuoteRequest): Promise<LatestQuoteResponse> {
      const result = await getLiveResult(request.symbol, request.timeframe);
      const candles =
        request.candles.length > 0
          ? request.candles
          : extractYahooFinanceCandles(result, request.timeframe);

      if (candles.length === 0) {
        throw new MarketDataProviderError({
          code: "empty_candles",
          endpoint: "chart",
          message: "Yahoo Finance returned no valid OHLC candles.",
        });
      }

      return {
        symbol: request.symbol,
        timeframe: request.timeframe,
        quote: buildYahooFinanceQuote(request.symbol, candles, result.meta),
        metadata: getYahooFinanceInstrumentConfig(request.symbol),
        source: "yahoo-finance",
      };
    },
    async getMarketSnapshot(symbol, timeframe) {
      try {
        const result = await getLiveResult(symbol, timeframe);
        void persistResult(symbol, timeframe, result).catch(() => undefined);

        return buildMarketSnapshotFromYahooResult(symbol, timeframe, result);
      } catch (error) {
        const persistedResult = await readPersistedResult(symbol, timeframe);

        if (persistedResult) {
          return buildMarketSnapshotFromYahooResult(symbol, timeframe, persistedResult.result, {
            status: "fallback",
            message:
              "Yahoo Finance live refresh failed. HareAssets is showing the most recent cached Yahoo Finance snapshot.",
            warning: `Yahoo Finance live refresh failed. HareAssets is showing cached Yahoo Finance data from ${persistedResult.fetchedAt}.`,
          });
        }

        throw error;
      }
    },
  };
}
