export const METAL_SYMBOLS = {
  XAUUSD: {
    code: "XAUUSD",
    metal: "XAU",
    currency: "USD",
    displayTicker: "XAU/USD",
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
    displayTicker: "XAG/USD",
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
    displayTicker: "XPT/USD",
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
    displayTicker: "XCU/USD",
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
    displayTicker: "URNM",
    label: "Uranium",
    displayName: "Sprott Uranium Miners ETF",
    precision: 2,
    minMove: 0.01,
    basePrice: 39.5,
  },
  SPXUSD: {
    code: "SPXUSD",
    metal: "SPX",
    currency: "USD",
    displayTicker: "SPX",
    label: "S&P 500",
    displayName: "S&P 500 Index",
    precision: 2,
    minMove: 0.01,
    basePrice: 5310.25,
  },
} as const;

export type MetalSymbolCode = keyof typeof METAL_SYMBOLS;

export const TIMEFRAME_OPTIONS = {
  "1m": {
    value: "1m",
    label: "1m",
    seconds: 60,
    candleCount: 240,
  },
  "5m": {
    value: "5m",
    label: "5m",
    seconds: 300,
    candleCount: 220,
  },
  "15m": {
    value: "15m",
    label: "15m",
    seconds: 900,
    candleCount: 220,
  },
  "30m": {
    value: "30m",
    label: "30m",
    seconds: 1800,
    candleCount: 220,
  },
  "1H": {
    value: "1H",
    label: "1H",
    seconds: 3600,
    candleCount: 220,
  },
  "4H": {
    value: "4H",
    label: "4H",
    seconds: 14400,
    candleCount: 220,
  },
  Daily: {
    value: "Daily",
    label: "Daily",
    seconds: 86400,
    candleCount: 200,
  },
  Weekly: {
    value: "Weekly",
    label: "Weekly",
    seconds: 604800,
    candleCount: 160,
  },
} as const;

export type Timeframe = keyof typeof TIMEFRAME_OPTIONS;

export type MarketDataSource = "mock" | "twelve-data" | "yahoo-finance";
export type MarketProviderId = "twelve-data" | "yahoo-finance";
export type MarketProviderStatus = "live" | "fallback" | "unavailable" | "error";
export type MarketProviderErrorCode =
  | "missing_api_key"
  | "misnamed_public_api_key"
  | "network_failure"
  | "rate_limited"
  | "bad_response"
  | "empty_candles"
  | "unsupported_instrument"
  | "quote_unavailable"
  | "unknown";

export type MarketProviderState = {
  id: MarketProviderId;
  status: MarketProviderStatus;
  configured: boolean;
  isLive: boolean;
  message: string;
  errorCode?: MarketProviderErrorCode;
  symbol?: string;
};

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
  provider: MarketProviderState;
  warning?: string;
};

export function createMarketProviderState(
  input: Omit<MarketProviderState, "id" | "isLive"> & {
    id?: MarketProviderId;
  },
): MarketProviderState {
  return {
    id: input.id ?? "yahoo-finance",
    status: input.status,
    configured: input.configured,
    isLive: input.status === "live",
    message: input.message,
    errorCode: input.errorCode,
    symbol: input.symbol,
  };
}

export function isMetalSymbolCode(value: string): value is MetalSymbolCode {
  return value in METAL_SYMBOLS;
}

export function isTimeframe(value: string): value is Timeframe {
  return value in TIMEFRAME_OPTIONS;
}
