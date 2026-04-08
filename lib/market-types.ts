export const METAL_SYMBOLS = {
  XAUUSD: {
    code: "XAUUSD",
    metal: "XAU",
    currency: "USD",
    yahooSymbol: "GC=F",
    label: "Gold",
    displayName: "Gold Spot",
    precision: 2,
    minMove: 0.01,
    basePrice: 3248.45,
  },
  XAGUSD: {
    code: "XAGUSD",
    metal: "XAG",
    currency: "USD",
    yahooSymbol: "SI=F",
    label: "Silver",
    displayName: "Silver Spot",
    precision: 3,
    minMove: 0.001,
    basePrice: 73.17,
  },
  XPTUSD: {
    code: "XPTUSD",
    metal: "XPT",
    currency: "USD",
    yahooSymbol: "PL=F",
    label: "Platinum",
    displayName: "Platinum Spot",
    precision: 2,
    minMove: 0.01,
    basePrice: 1958.5,
  },
  XCUUSD: {
    code: "XCUUSD",
    metal: "XCU",
    currency: "USD",
    yahooSymbol: "HG=F",
    label: "Copper",
    displayName: "Copper Spot",
    precision: 3,
    minMove: 0.001,
    basePrice: 5.12,
  },
  XURUSD: {
    code: "XURUSD",
    metal: "XUR",
    currency: "USD",
    yahooSymbol: "URNM",
    label: "Uranium",
    displayName: "Sprott Uranium Miners ETF",
    precision: 2,
    minMove: 0.01,
    basePrice: 39.5,
  },
} as const;

export type MetalSymbolCode = keyof typeof METAL_SYMBOLS;

export const TIMEFRAME_OPTIONS = {
  "1m": {
    value: "1m",
    label: "1m",
    seconds: 60,
    candleCount: 240,
    yahooInterval: "1m",
    yahooRange: "1d",
  },
  "5m": {
    value: "5m",
    label: "5m",
    seconds: 300,
    candleCount: 220,
    yahooInterval: "5m",
    yahooRange: "5d",
  },
  "15m": {
    value: "15m",
    label: "15m",
    seconds: 900,
    candleCount: 220,
    yahooInterval: "15m",
    yahooRange: "1mo",
  },
  "30m": {
    value: "30m",
    label: "30m",
    seconds: 1800,
    candleCount: 220,
    yahooInterval: "30m",
    yahooRange: "1mo",
  },
  "1H": {
    value: "1H",
    label: "1H",
    seconds: 3600,
    candleCount: 220,
    yahooInterval: "60m",
    yahooRange: "3mo",
  },
  "4H": {
    value: "4H",
    label: "4H",
    seconds: 14400,
    candleCount: 220,
    yahooInterval: "60m",
    yahooRange: "6mo",
    resampleSeconds: 14400,
  },
  Daily: {
    value: "Daily",
    label: "Daily",
    seconds: 86400,
    candleCount: 200,
    yahooInterval: "1d",
    yahooRange: "1y",
  },
  Weekly: {
    value: "Weekly",
    label: "Weekly",
    seconds: 604800,
    candleCount: 160,
    yahooInterval: "1wk",
    yahooRange: "5y",
  },
} as const;

export type Timeframe = keyof typeof TIMEFRAME_OPTIONS;

export type MarketDataSource = "mock" | "yahoo-finance";

export type Candle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
};

export type QuoteData = {
  symbol: MetalSymbolCode;
  displayName: string;
  lastPrice: number;
  change: number;
  changePercent: number;
  high: number;
  low: number;
  open: number;
  previousClose: number;
  volume?: number;
  updatedAt: string;
  source: MarketDataSource;
};

export type MarketSnapshot = {
  symbol: MetalSymbolCode;
  timeframe: Timeframe;
  candles: Candle[];
  quote: QuoteData;
  source: MarketDataSource;
  warning?: string;
};

export function isMetalSymbolCode(value: string): value is MetalSymbolCode {
  return value in METAL_SYMBOLS;
}

export function isTimeframe(value: string): value is Timeframe {
  return value in TIMEFRAME_OPTIONS;
}
