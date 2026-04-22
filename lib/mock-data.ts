import {
  createMarketProviderState,
  METAL_SYMBOLS,
  TIMEFRAME_OPTIONS,
  type Candle,
  type MarketDataSource,
  type MarketProviderState,
  type MarketSnapshot,
  type MetalSymbolCode,
  type QuoteData,
  type Timeframe,
} from "./market-types.ts";

function createSeededRandom(seed: number) {
  let current = seed;

  return () => {
    const value = Math.sin(current) * 10000;
    current += 1;

    return value - Math.floor(value);
  };
}

function buildSeed(symbol: MetalSymbolCode, timeframe: Timeframe) {
  return `${symbol}-${timeframe}`
    .split("")
    .reduce((total, character) => total + character.charCodeAt(0), 0);
}

function sumVolume(candles: Candle[]) {
  return candles.reduce((total, candle) => total + (candle.volume ?? 0), 0);
}

function getMockMarketProfile(symbol: MetalSymbolCode) {
  if (symbol === "XAUUSD") {
    return {
      volatilityUnit: 5.8,
      trendBias: 0.22,
      baseVolume: 7600,
    };
  }

  if (symbol === "XPTUSD") {
    return {
      volatilityUnit: 4.2,
      trendBias: 0.16,
      baseVolume: 5200,
    };
  }

  if (symbol === "XCUUSD") {
    return {
      volatilityUnit: 0.18,
      trendBias: 0.03,
      baseVolume: 11800,
    };
  }

  if (symbol === "XURUSD") {
    return {
      volatilityUnit: 0.44,
      trendBias: 0.04,
      baseVolume: 9400,
    };
  }

  if (symbol === "SPXUSD") {
    return {
      volatilityUnit: 34,
      trendBias: 0.09,
      baseVolume: 2840000,
    };
  }

  return {
    volatilityUnit: 0.78,
    trendBias: 0.05,
    baseVolume: 14200,
  };
}

export function generateMockCandles({
  symbol,
  timeframe,
  anchorPrice,
}: {
  symbol: MetalSymbolCode;
  timeframe: Timeframe;
  anchorPrice?: number;
}) {
  const config = TIMEFRAME_OPTIONS[timeframe];
  const meta = METAL_SYMBOLS[symbol];
  const random = createSeededRandom(buildSeed(symbol, timeframe));
  const { volatilityUnit, trendBias, baseVolume } = getMockMarketProfile(symbol);
  const candleCount = config.candleCount;
  const alignedEndTime =
    Math.floor(Date.now() / 1000 / config.seconds) * config.seconds;

  let price = meta.basePrice * (0.985 + random() * 0.03);
  const candles: Candle[] = [];

  for (let index = 0; index < candleCount; index += 1) {
    const wave = Math.sin(index / 9) * volatilityUnit * 0.42;
    const momentum = (random() - 0.5) * volatilityUnit * 1.25;
    const drift = (random() - 0.48) * trendBias;
    const close = Math.max(
      meta.minMove,
      price + wave * 0.08 + momentum + drift,
    );
    const high = Math.max(price, close) + random() * volatilityUnit * 0.56;
    const low = Math.max(
      meta.minMove,
      Math.min(price, close) - random() * volatilityUnit * 0.56,
    );

    candles.push({
      time: alignedEndTime - config.seconds * (candleCount - 1 - index),
      open: price,
      high,
      low,
      close,
      volume: Math.round(baseVolume * (0.7 + random() * 0.8)),
    });

    price = close;
  }

  if (typeof anchorPrice === "number") {
    const offset = anchorPrice - candles[candles.length - 1].close;

    return candles.map((candle) => ({
      ...candle,
      open: candle.open + offset,
      high: candle.high + offset,
      low: candle.low + offset,
      close: candle.close + offset,
    }));
  }

  return candles;
}

export function buildQuoteFromCandles(
  symbol: MetalSymbolCode,
  candles: Candle[],
  source: MarketDataSource,
): QuoteData {
  const meta = METAL_SYMBOLS[symbol];
  const recentCandles = candles.slice(-24);
  const lastCandle = candles[candles.length - 1];
  const previousCandle = candles[candles.length - 2] ?? lastCandle;
  const high = Math.max(...recentCandles.map((candle) => candle.high));
  const low = Math.min(...recentCandles.map((candle) => candle.low));
  const change = lastCandle.close - previousCandle.close;
  const changePercent = previousCandle.close
    ? (change / previousCandle.close) * 100
    : 0;

  return {
    symbol,
    displayName: meta.displayName,
    lastPrice: lastCandle.close,
    change,
    changePercent,
    high,
    low,
    open: recentCandles[0]?.open ?? lastCandle.open,
    previousClose: previousCandle.close,
    volume: sumVolume(recentCandles),
    updatedAt: new Date(lastCandle.time * 1000).toISOString(),
    source,
  };
}

export function buildMockSnapshot(
  symbol: MetalSymbolCode,
  timeframe: Timeframe,
  options: {
    source?: MarketDataSource;
    warning?: string;
    provider?: Omit<MarketProviderState, "id" | "isLive">;
  } = {},
): MarketSnapshot {
  const source = options.source ?? "mock";
  const candles = generateMockCandles({ symbol, timeframe });

  return {
    symbol,
    timeframe,
    candles,
    quote: buildQuoteFromCandles(symbol, candles, source),
    source,
    provider: createMarketProviderState(
      options.provider ?? {
        status: source === "mock" ? "fallback" : "live",
        configured: source !== "mock",
        message:
          source === "mock"
            ? "Live market data is unavailable. HareAssets is showing demo fallback data."
            : "Live market data is active.",
      },
    ),
    warning: options.warning,
  };
}
