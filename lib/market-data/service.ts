import {
  createMarketProviderState,
  type MarketSnapshot,
  type MetalSymbolCode,
  type Timeframe,
} from "../market-types.ts";
import {
  type MarketDataProviderError,
  toMarketDataProviderError,
} from "./errors.ts";
import {
  createYahooFinanceProvider,
} from "./yahoo-finance-provider.ts";
import {
  type MarketDataProvider,
  type MarketSnapshotOptions,
} from "./types.ts";

const SNAPSHOT_CACHE_TTL_MS = 12_000;

type SnapshotCacheEntry = {
  snapshot: MarketSnapshot;
  fetchedAt: number;
};

type CreateMarketDataServiceOptions = {
  provider?: MarketDataProvider;
  now?: () => number;
};

function buildSnapshotCacheKey(symbol: MetalSymbolCode, timeframe: Timeframe) {
  return `${symbol}:${timeframe}`;
}

function describeProviderFailure(error: MarketDataProviderError) {
  switch (error.code) {
    case "rate_limited":
      return {
        providerMessage:
          "Latest Yahoo Finance refresh hit a rate limit.",
        warning:
          "Yahoo Finance rate-limited the latest refresh, so HareAssets is showing the most recent confirmed Yahoo Finance snapshot instead of a fresh live update.",
      };
    case "network_failure":
      return {
        providerMessage:
          "Yahoo Finance could not be reached over the network.",
        warning:
          "Yahoo Finance could not be reached over the network, so HareAssets is showing the most recent confirmed Yahoo Finance snapshot instead of a fresh live update.",
      };
    case "bad_response":
      return {
        providerMessage:
          "Yahoo Finance returned an invalid response.",
        warning:
          "Yahoo Finance returned an invalid response, so HareAssets is showing the most recent confirmed Yahoo Finance snapshot instead of a fresh live update.",
      };
    case "empty_candles":
      return {
        providerMessage:
          "Yahoo Finance returned no valid OHLC candles.",
        warning:
          "Yahoo Finance returned no valid OHLC candles for this symbol/timeframe, so HareAssets is showing the most recent confirmed Yahoo Finance snapshot instead of a fresh live update.",
      };
    default:
      return {
        providerMessage:
          "Yahoo Finance failed unexpectedly.",
        warning:
          "Yahoo Finance failed unexpectedly, so HareAssets is showing the most recent confirmed Yahoo Finance snapshot instead of a fresh live update.",
      };
  }
}

function logProviderFailure(
  symbol: MetalSymbolCode,
  timeframe: Timeframe,
  error: MarketDataProviderError,
) {
  const logger =
    error.code === "network_failure" || error.code === "rate_limited"
      ? console.warn
      : console.error;

  logger("[market-data] Yahoo Finance provider failure", {
    symbol,
    timeframe,
    code: error.code,
    endpoint: error.endpoint,
    status: error.status,
    message: error.message,
  });
}

export function createMarketDataService(
  options: CreateMarketDataServiceOptions = {},
) {
  const provider = options.provider ?? createYahooFinanceProvider();
  const now = options.now ?? Date.now;
  const snapshotCache = new Map<string, SnapshotCacheEntry>();
  const inFlightRequests = new Map<string, Promise<MarketSnapshot>>();

  function getCachedSnapshot(cacheKey: string) {
    const cacheEntry = snapshotCache.get(cacheKey);

    if (!cacheEntry) {
      return null;
    }

    if (now() - cacheEntry.fetchedAt > SNAPSHOT_CACHE_TTL_MS) {
      snapshotCache.delete(cacheKey);
      return null;
    }

    return cacheEntry.snapshot;
  }

  function setCachedSnapshot(cacheKey: string, snapshot: MarketSnapshot) {
    snapshotCache.set(cacheKey, {
      snapshot,
      fetchedAt: now(),
    });
  }

  return {
    provider,
    async getMarketSnapshot(
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
          const snapshot = await provider.getMarketSnapshot(symbol, timeframe);
          setCachedSnapshot(cacheKey, snapshot);

          return snapshot;
        } catch (error) {
          const providerError = toMarketDataProviderError(error, {
            code: "unknown",
            message: "Yahoo Finance provider failed unexpectedly.",
          });
          const failure = describeProviderFailure(providerError);
          logProviderFailure(symbol, timeframe, providerError);
          const staleSnapshot = snapshotCache.get(cacheKey)?.snapshot;

          if (staleSnapshot) {
            return {
              ...staleSnapshot,
              provider: createMarketProviderState({
                id: "yahoo-finance",
                status: "fallback",
                configured: staleSnapshot.provider.configured,
                symbol: staleSnapshot.provider.symbol,
                errorCode: providerError.code,
                message:
                  "Latest Yahoo Finance refresh failed. HareAssets is showing the most recent confirmed Yahoo Finance snapshot.",
              }),
              warning: `${failure.warning} Most recent confirmed snapshot time: ${staleSnapshot.quote.updatedAt}.`,
            };
          }

          throw providerError;
        } finally {
          inFlightRequests.delete(cacheKey);
        }
      })();

      inFlightRequests.set(cacheKey, request);

      return request;
    },
  };
}

const marketDataService = createMarketDataService();

export async function getMarketSnapshot(
  symbol: MetalSymbolCode,
  timeframe: Timeframe,
  options: MarketSnapshotOptions = {},
) {
  return marketDataService.getMarketSnapshot(symbol, timeframe, options);
}
