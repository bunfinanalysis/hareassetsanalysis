import { buildQuoteFromCandles } from "../mock-data.ts";
import {
  createMarketProviderState,
  METAL_SYMBOLS,
  TIMEFRAME_OPTIONS,
  type Candle,
  type MarketSnapshot,
  type MetalSymbolCode,
  type QuoteData,
  type Timeframe,
} from "../market-types.ts";
import {
  type HistoricalCandlesRequest,
  type HistoricalCandlesResponse,
  type LatestQuoteRequest,
  type LatestQuoteResponse,
  type MarketDataProvider,
  type ProviderInstrumentMetadata,
} from "./types.ts";
import {
  MarketDataProviderError,
  toMarketDataProviderError,
} from "./errors.ts";
import { getMarketInstrumentAvailability } from "./instrument-availability.ts";
import { resolveTwelveDataApiKey } from "./twelve-data-config.ts";

const TWELVE_DATA_BASE_URL = "https://api.twelvedata.com";

type TwelveDataAssetType =
  | "ETF"
  | "Physical Currency";

type TwelveDataInstrumentConfig = ProviderInstrumentMetadata & {
  providerSymbol: string;
  type?: TwelveDataAssetType;
};

type TwelveDataTimeframeConfig = {
  interval: string;
  outputSize: number;
};

type TwelveDataTimeSeriesValue = {
  datetime?: string;
  open?: string;
  high?: string;
  low?: string;
  close?: string;
  volume?: string;
};

type TwelveDataTimeSeriesResponse = {
  meta?: {
    symbol?: string;
    interval?: string;
    exchange?: string;
    type?: string;
    currency?: string;
    exchange_timezone?: string;
  };
  values?: TwelveDataTimeSeriesValue[];
  status?: string;
  code?: number;
  message?: string;
};

type TwelveDataQuoteResponse = {
  symbol?: string;
  name?: string;
  exchange?: string;
  type?: string;
  currency?: string;
  datetime?: string;
  timestamp?: number | string;
  open?: string;
  high?: string;
  low?: string;
  close?: string;
  previous_close?: string;
  volume?: string;
  change?: string;
  percent_change?: string;
  status?: string;
  code?: number;
  message?: string;
};

type CreateTwelveDataProviderOptions = {
  apiKey?: string;
  fetcher?: typeof fetch;
};

// Internal HareAssets identifiers stay stable even when provider-specific
// symbols differ. Do not derive provider symbols from display tickers.
export const TWELVE_DATA_SYMBOLS: Record<MetalSymbolCode, TwelveDataInstrumentConfig> = {
  XAUUSD: {
    providerSymbol: "XAU/USD",
    type: "Physical Currency",
  },
  XAGUSD: {
    providerSymbol: "XAG/USD",
    type: "Physical Currency",
  },
  XPTUSD: {
    providerSymbol: "XPT/USD",
    type: "Physical Currency",
  },
  XCUUSD: {
    providerSymbol: "XG/USD",
    type: "Physical Currency",
  },
  XURUSD: {
    providerSymbol: "URNM",
    type: "ETF",
    exchange: "NYSE",
    country: "United States",
  },
  SPXUSD: {
    providerSymbol: "SPX",
  },
};

const TWELVE_DATA_TIMEFRAMES: Record<Timeframe, TwelveDataTimeframeConfig> = {
  "1m": {
    interval: "1min",
    outputSize: TIMEFRAME_OPTIONS["1m"].candleCount,
  },
  "5m": {
    interval: "5min",
    outputSize: TIMEFRAME_OPTIONS["5m"].candleCount,
  },
  "15m": {
    interval: "15min",
    outputSize: TIMEFRAME_OPTIONS["15m"].candleCount,
  },
  "30m": {
    interval: "30min",
    outputSize: TIMEFRAME_OPTIONS["30m"].candleCount,
  },
  "1H": {
    interval: "1h",
    outputSize: TIMEFRAME_OPTIONS["1H"].candleCount,
  },
  "4H": {
    interval: "4h",
    outputSize: TIMEFRAME_OPTIONS["4H"].candleCount,
  },
  Daily: {
    interval: "1day",
    outputSize: TIMEFRAME_OPTIONS.Daily.candleCount,
  },
  Weekly: {
    interval: "1week",
    outputSize: TIMEFRAME_OPTIONS.Weekly.candleCount,
  },
};

export function getTwelveDataInstrumentConfig(symbol: MetalSymbolCode) {
  return TWELVE_DATA_SYMBOLS[symbol];
}

function toFiniteNumber(value: string | number | null | undefined): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

export function normalizeTwelveDataTimestamp(
  value: string | number | null | undefined,
): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? Math.floor(value) : null;
  }

  if (typeof value !== "string" || value.trim().length === 0) {
    return null;
  }

  if (/^\d+$/.test(value)) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.floor(parsed) : null;
  }

  const normalizedValue = value.includes("T") ? value : value.replace(" ", "T");
  const hasExplicitZone =
    /[zZ]$/.test(normalizedValue) || /[+-]\d{2}:\d{2}$/.test(normalizedValue);
  const withZone = hasExplicitZone
    ? normalizedValue
    : normalizedValue.length === 10
      ? `${normalizedValue}T00:00:00Z`
      : `${normalizedValue}Z`;
  const parsed = Date.parse(withZone);

  if (!Number.isFinite(parsed)) {
    return null;
  }

  return Math.floor(parsed / 1000);
}

function assertTwelveDataSuccess(
  payload: { status?: string; code?: number; message?: string },
  endpoint: string,
) {
  if (payload.status === "error" || payload.code) {
    throw new MarketDataProviderError({
      code:
        payload.code === 429 || /rate limit|credits/i.test(payload.message ?? "")
          ? "rate_limited"
          : "bad_response",
      endpoint,
      status: payload.code,
      message: payload.message
        ? `Twelve Data ${endpoint} request failed: ${payload.message}`
        : `Twelve Data ${endpoint} request failed.`,
    });
  }
}

export function normalizeTwelveDataCandles(
  payload: TwelveDataTimeSeriesResponse,
  timeframe: Timeframe,
): Candle[] {
  assertTwelveDataSuccess(payload, "time_series");

  const candles: Candle[] = [];

  for (const value of payload.values ?? []) {
    const time = normalizeTwelveDataTimestamp(value.datetime);
    const open = toFiniteNumber(value.open);
    const high = toFiniteNumber(value.high);
    const low = toFiniteNumber(value.low);
    const close = toFiniteNumber(value.close);
    const volume = toFiniteNumber(value.volume);

    if (
      time === null ||
      open === null ||
      high === null ||
      low === null ||
      close === null
    ) {
      continue;
    }

    candles.push({
      time,
      open,
      high,
      low,
      close,
      volume: volume ?? undefined,
    });
  }

  candles.sort((left, right) => left.time - right.time);

  return candles.slice(-TIMEFRAME_OPTIONS[timeframe].candleCount);
}

export function normalizeTwelveDataQuote(
  symbol: MetalSymbolCode,
  candles: Candle[],
  payload: TwelveDataQuoteResponse | null,
): QuoteData {
  const baseQuote = buildQuoteFromCandles(symbol, candles, "twelve-data");

  if (!payload) {
    return baseQuote;
  }

  assertTwelveDataSuccess(payload, "quote");

  const previousClose =
    toFiniteNumber(payload.previous_close) ?? baseQuote.previousClose;
  const lastPrice = toFiniteNumber(payload.close) ?? baseQuote.lastPrice;
  const change =
    toFiniteNumber(payload.change) ?? (lastPrice - previousClose);
  const changePercent =
    toFiniteNumber(payload.percent_change) ??
    (previousClose ? (change / previousClose) * 100 : 0);
  const updatedAtTimestamp =
    normalizeTwelveDataTimestamp(payload.timestamp) ??
    normalizeTwelveDataTimestamp(payload.datetime);

  return {
    ...baseQuote,
    displayName: payload.name ?? METAL_SYMBOLS[symbol].displayName,
    lastPrice,
    change,
    changePercent,
    high: toFiniteNumber(payload.high) ?? baseQuote.high,
    low: toFiniteNumber(payload.low) ?? baseQuote.low,
    open: toFiniteNumber(payload.open) ?? baseQuote.open,
    previousClose,
    volume: toFiniteNumber(payload.volume) ?? baseQuote.volume,
    updatedAt: updatedAtTimestamp
      ? new Date(updatedAtTimestamp * 1000).toISOString()
      : baseQuote.updatedAt,
    source: "twelve-data",
  };
}

function buildTwelveDataUrl(
  endpoint: string,
  apiKey: string,
  metadata: TwelveDataInstrumentConfig,
  timeframe: TwelveDataTimeframeConfig,
) {
  const url = new URL(`${TWELVE_DATA_BASE_URL}/${endpoint}`);

  url.searchParams.set("apikey", apiKey);
  url.searchParams.set("symbol", metadata.providerSymbol);
  url.searchParams.set("interval", timeframe.interval);
  url.searchParams.set("format", "JSON");
  url.searchParams.set("dp", "-1");

  if (metadata.type) {
    url.searchParams.set("type", metadata.type);
  }

  if (metadata.exchange) {
    url.searchParams.set("exchange", metadata.exchange);
  }

  if (metadata.country) {
    url.searchParams.set("country", metadata.country);
  }

  return url;
}

async function requestTwelveData<T>(
  fetcher: typeof fetch,
  endpoint: string,
  apiKey: string,
  metadata: TwelveDataInstrumentConfig,
  timeframe: TwelveDataTimeframeConfig,
  extraParams: Record<string, string> = {},
): Promise<T> {
  const url = buildTwelveDataUrl(endpoint, apiKey, metadata, timeframe);

  Object.entries(extraParams).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });

  let response: Response;

  try {
    response = await fetcher(url, {
      cache: "no-store",
      headers: {
        Accept: "application/json",
      },
    });
  } catch (error) {
    throw new MarketDataProviderError({
      code: "network_failure",
      endpoint,
      message: `Twelve Data ${endpoint} request failed because the network request did not complete.`,
      cause: error,
    });
  }

  if (!response.ok) {
    throw new MarketDataProviderError({
      code: response.status === 429 ? "rate_limited" : "bad_response",
      endpoint,
      status: response.status,
      message:
        response.status === 429
          ? `Twelve Data ${endpoint} request hit the provider rate limit.`
          : `Twelve Data ${endpoint} request failed with HTTP ${response.status}.`,
    });
  }

  try {
    return (await response.json()) as T;
  } catch (error) {
    throw new MarketDataProviderError({
      code: "bad_response",
      endpoint,
      status: response.status,
      message: `Twelve Data ${endpoint} returned a non-JSON response.`,
      cause: error,
    });
  }
}

export function createTwelveDataProvider(
  options: CreateTwelveDataProviderOptions = {},
): MarketDataProvider {
  const resolvedConfig =
    typeof options.apiKey === "string"
      ? {
          apiKey: options.apiKey.trim(),
          isConfigured: options.apiKey.trim().length > 0,
          status: options.apiKey.trim().length > 0 ? "configured" : "missing",
          message:
            options.apiKey.trim().length > 0
              ? "Twelve Data API key provided directly to the provider."
              : "A Twelve Data API key was expected but the injected provider key was empty.",
        }
      : resolveTwelveDataApiKey();
  const apiKey = resolvedConfig.apiKey;
  const fetcher = options.fetcher ?? fetch;

  function buildMissingApiKeyError() {
    return new MarketDataProviderError({
      code:
        resolvedConfig.status === "misnamed-public-env"
          ? "misnamed_public_api_key"
          : "missing_api_key",
      message: resolvedConfig.message,
      retriable: false,
    });
  }

  async function getHistoricalCandles(
    request: HistoricalCandlesRequest,
  ): Promise<HistoricalCandlesResponse> {
    if (!apiKey) {
      throw buildMissingApiKeyError();
    }

    const availability = getMarketInstrumentAvailability(request.symbol);

    if (!availability.liveEnabled) {
      throw new MarketDataProviderError({
        code: "unsupported_instrument",
        endpoint: "time_series",
        message: availability.reason ?? "This instrument is unavailable on the active provider profile.",
        retriable: false,
      });
    }

    const metadata = TWELVE_DATA_SYMBOLS[request.symbol];
    const timeframe = TWELVE_DATA_TIMEFRAMES[request.timeframe];
    const response = await requestTwelveData<TwelveDataTimeSeriesResponse>(
      fetcher,
      "time_series",
      apiKey,
      metadata,
      timeframe,
      {
        outputsize: String(timeframe.outputSize),
        order: "asc",
        timezone: "UTC",
      },
    );
    const candles = normalizeTwelveDataCandles(response, request.timeframe);

    if (candles.length === 0) {
      throw new MarketDataProviderError({
        code: "empty_candles",
        endpoint: "time_series",
        message: "Twelve Data returned no valid OHLC candles.",
      });
    }

    return {
      symbol: request.symbol,
      timeframe: request.timeframe,
      candles,
      metadata,
      source: "twelve-data",
    };
  }

  async function getLatestQuote(
    request: LatestQuoteRequest,
  ): Promise<LatestQuoteResponse> {
    if (!apiKey) {
      throw buildMissingApiKeyError();
    }

    const metadata = TWELVE_DATA_SYMBOLS[request.symbol];
    const timeframe = TWELVE_DATA_TIMEFRAMES[request.timeframe];
    const response = await requestTwelveData<TwelveDataQuoteResponse>(
      fetcher,
      "quote",
      apiKey,
      metadata,
      timeframe,
    );

    return {
      symbol: request.symbol,
      timeframe: request.timeframe,
      quote: normalizeTwelveDataQuote(request.symbol, request.candles, response),
      metadata,
      source: "twelve-data",
    };
  }

  return {
    id: "twelve-data",
    isConfigured() {
      return resolvedConfig.isConfigured;
    },
    getInstrumentMetadata(symbol: MetalSymbolCode) {
      return TWELVE_DATA_SYMBOLS[symbol];
    },
    getHistoricalCandles,
    getLatestQuote,
    async getMarketSnapshot(
      symbol: MetalSymbolCode,
      timeframe: Timeframe,
    ): Promise<MarketSnapshot> {
      const historical = await getHistoricalCandles({ symbol, timeframe });

      try {
        const latestQuote = await getLatestQuote({
          symbol,
          timeframe,
          candles: historical.candles,
        });

        return {
          symbol,
          timeframe,
          candles: historical.candles,
          quote: latestQuote.quote,
          source: "twelve-data",
          provider: createMarketProviderState({
            status: "live",
            configured: resolvedConfig.isConfigured,
            symbol: historical.metadata.providerSymbol,
            message: "Live market data is active from Twelve Data.",
          }),
        };
      } catch (error) {
        const providerError = toMarketDataProviderError(error, {
          code: "quote_unavailable",
          endpoint: "quote",
          message: "Twelve Data quote refresh failed.",
        });

        return {
          symbol,
          timeframe,
          candles: historical.candles,
          quote: buildQuoteFromCandles(symbol, historical.candles, "twelve-data"),
          source: "twelve-data",
          provider: createMarketProviderState({
            status: "fallback",
            configured: resolvedConfig.isConfigured,
            symbol: historical.metadata.providerSymbol,
            errorCode: providerError.code,
            message:
              "Live quote refresh is unavailable. HareAssets is showing the most recent confirmed Twelve Data candle instead of a live quote.",
          }),
          warning: `Twelve Data quote refresh was unavailable, so HareAssets derived the latest quote from the most recent confirmed candle. ${providerError.message}`,
        };
      }
    },
  };
}
