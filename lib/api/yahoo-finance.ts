import { exec } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { request as httpsRequest } from "node:https";
import { join } from "node:path";

import { buildMockSnapshot, buildQuoteFromCandles } from "@/lib/mock-data";
import {
  METAL_SYMBOLS,
  TIMEFRAME_OPTIONS,
  type Candle,
  type MarketSnapshot,
  type MetalSymbolCode,
  type QuoteData,
  type Timeframe,
} from "@/lib/market-types";

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

type MarketSnapshotOptions = {
  forceRefresh?: boolean;
};

type SnapshotCacheEntry = {
  snapshot: MarketSnapshot;
  fetchedAt: number;
};

type PersistedYahooResult = {
  fetchedAt: string;
  result: YahooFinanceResult;
};

type PersistedYahooCache = Record<string, PersistedYahooResult>;

const YAHOO_CHART_HOSTS = [
  "query1.finance.yahoo.com",
  "query2.finance.yahoo.com",
] as const;
const SNAPSHOT_CACHE_TTL_MS = 12_000;
const YAHOO_CACHE_FILE_PATH = join(process.cwd(), "data", "yahoo-chart-cache.json");
const snapshotCache = new Map<string, SnapshotCacheEntry>();
const inFlightRequests = new Map<string, Promise<MarketSnapshot>>();

async function fetchYahooChartResponse(
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
          if (!response.statusCode || response.statusCode >= 400) {
            reject(
              new Error(
                `Yahoo Finance request failed with ${response.statusCode ?? "unknown"}`,
              ),
            );
            return;
          }

          try {
            resolve(JSON.parse(payload) as YahooFinanceChartResponse);
          } catch (error) {
            reject(error);
          }
        });
      },
    );

    req.on("error", reject);
    req.setTimeout(10_000, () => {
      req.destroy(new Error("Yahoo Finance request timed out"));
    });
    req.end();
  });
}

async function fetchYahooChartResponseWithCurl(
  url: string,
  referer: string,
): Promise<YahooFinanceChartResponse> {
  return new Promise((resolve, reject) => {
    const command =
      `curl -sS --max-time 10 '${url}' ` +
      `-H 'User-Agent: Mozilla/5.0' ` +
      `-H 'Accept: application/json' ` +
      `-H 'Accept-Language: en-US,en;q=0.9' ` +
      `-H 'Origin: https://finance.yahoo.com' ` +
      `-H 'Referer: ${referer}'`;

    exec(
      command,
      { timeout: 10_000, maxBuffer: 8 * 1024 * 1024 },
      (error, stdout) => {
        if (error) {
          reject(error);
          return;
        }

        try {
          resolve(JSON.parse(stdout) as YahooFinanceChartResponse);
        } catch (parseError) {
          reject(parseError);
        }
      },
    );
  });
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

function extractCandles(result: YahooFinanceResult, timeframe: Timeframe): Candle[] {
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

  const timeframeConfig = TIMEFRAME_OPTIONS[timeframe];
  const resampleSeconds =
    "resampleSeconds" in timeframeConfig
      ? timeframeConfig.resampleSeconds
      : undefined;
  const normalized = resampleSeconds
    ? resampleCandles(candles, resampleSeconds)
    : candles;

  return normalized.slice(-timeframeConfig.candleCount);
}

function buildYahooQuote(
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

function buildSnapshotCacheKey(symbol: MetalSymbolCode, timeframe: Timeframe) {
  return `${symbol}:${timeframe}`;
}

function getCachedSnapshot(cacheKey: string) {
  const cacheEntry = snapshotCache.get(cacheKey);

  if (!cacheEntry) {
    return null;
  }

  if (Date.now() - cacheEntry.fetchedAt > SNAPSHOT_CACHE_TTL_MS) {
    return null;
  }

  return cacheEntry.snapshot;
}

function setCachedSnapshot(cacheKey: string, snapshot: MarketSnapshot) {
  snapshotCache.set(cacheKey, {
    snapshot,
    fetchedAt: Date.now(),
  });
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
  warning?: string,
): MarketSnapshot {
  const extractedCandles = extractCandles(result, timeframe);

  if (extractedCandles.length === 0) {
    throw new Error("Yahoo Finance returned no valid OHLC candles");
  }

  const candles = extractedCandles;

  return {
    symbol,
    timeframe,
    candles,
    quote: buildYahooQuote(symbol, candles, result.meta),
    source: "yahoo-finance",
    warning,
  };
}

async function fetchYahooChartFromHost(
  host: (typeof YAHOO_CHART_HOSTS)[number],
  symbol: MetalSymbolCode,
  timeframe: Timeframe,
) {
  const timeframeConfig = TIMEFRAME_OPTIONS[timeframe];
  const url = new URL(
    `https://${host}/v8/finance/chart/${METAL_SYMBOLS[symbol].yahooSymbol}`,
  );

  url.searchParams.set("interval", timeframeConfig.yahooInterval);
  url.searchParams.set("range", timeframeConfig.yahooRange);
  url.searchParams.set("corsDomain", "finance.yahoo.com");
  url.searchParams.set("includePrePost", "true");
  url.searchParams.set("events", "div,splits");

  const data = await fetchYahooChartResponse(
    url.toString(),
    `https://finance.yahoo.com/quote/${METAL_SYMBOLS[symbol].yahooSymbol}`,
  );
  const result = data.chart?.result?.[0];

  if (!result) {
    throw new Error(data.chart?.error?.description ?? "No Yahoo Finance chart result");
  }

  return result;
}

async function fetchYahooChartFromHostWithCurl(
  host: (typeof YAHOO_CHART_HOSTS)[number],
  symbol: MetalSymbolCode,
  timeframe: Timeframe,
) {
  const timeframeConfig = TIMEFRAME_OPTIONS[timeframe];
  const url = new URL(
    `https://${host}/v8/finance/chart/${METAL_SYMBOLS[symbol].yahooSymbol}`,
  );

  url.searchParams.set("interval", timeframeConfig.yahooInterval);
  url.searchParams.set("range", timeframeConfig.yahooRange);
  url.searchParams.set("corsDomain", "finance.yahoo.com");
  url.searchParams.set("includePrePost", "true");
  url.searchParams.set("events", "div,splits");

  const referer = `https://finance.yahoo.com/quote/${METAL_SYMBOLS[symbol].yahooSymbol}`;
  const data = await fetchYahooChartResponseWithCurl(url.toString(), referer);
  const result = data.chart?.result?.[0];

  if (!result) {
    throw new Error(data.chart?.error?.description ?? "No Yahoo Finance chart result");
  }

  return result;
}

async function fetchYahooChart(symbol: MetalSymbolCode, timeframe: Timeframe) {
  const errors: string[] = [];

  for (const host of YAHOO_CHART_HOSTS) {
    try {
      return await fetchYahooChartFromHostWithCurl(host, symbol, timeframe);
    } catch (error) {
      errors.push(
        `${host} (curl): ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  for (const host of YAHOO_CHART_HOSTS) {
    try {
      return await fetchYahooChartFromHost(host, symbol, timeframe);
    } catch (error) {
      errors.push(
        `${host}: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  throw new Error(errors.join(" | "));
}

export async function getMarketSnapshot(
  symbol: MetalSymbolCode,
  timeframe: Timeframe,
  options: MarketSnapshotOptions = {},
): Promise<MarketSnapshot> {
  const cacheKey = buildSnapshotCacheKey(symbol, timeframe);
  const cachedSnapshot = !options.forceRefresh ? getCachedSnapshot(cacheKey) : null;

  if (cachedSnapshot) {
    return cachedSnapshot;
  }

  const activeRequest = inFlightRequests.get(cacheKey);

  if (activeRequest) {
    return activeRequest;
  }

  const request = (async () => {
    try {
      const result = await fetchYahooChart(symbol, timeframe);
      const snapshot = buildMarketSnapshotFromYahooResult(symbol, timeframe, result);

      setCachedSnapshot(cacheKey, snapshot);
      void persistYahooResult(symbol, timeframe, result).catch(() => undefined);

      return snapshot;
    } catch (error) {
      const staleSnapshot = snapshotCache.get(cacheKey)?.snapshot;

      if (staleSnapshot) {
        return {
          ...staleSnapshot,
          warning:
            "Yahoo Finance rate-limited the latest refresh, so HareAssets is showing the most recent confirmed live market snapshot.",
        };
      }

      const persistedResult = await readPersistedYahooResult(symbol, timeframe);

      if (persistedResult) {
        const snapshot = buildMarketSnapshotFromYahooResult(
          symbol,
          timeframe,
          persistedResult.result,
          `Yahoo Finance rate-limited the live refresh, so HareAssets is showing the most recently refreshed Yahoo snapshot from ${persistedResult.fetchedAt}.`,
        );

        setCachedSnapshot(cacheKey, snapshot);

        return snapshot;
      }

      return buildMockSnapshot(
        symbol,
        timeframe,
        "mock",
        `Yahoo Finance could not be reached, so HareAssets switched to its fallback market feed. ${error instanceof Error ? error.message : "Unknown error."}`,
      );
    } finally {
      inFlightRequests.delete(cacheKey);
    }
  })();

  inFlightRequests.set(cacheKey, request);

  return request;
}
