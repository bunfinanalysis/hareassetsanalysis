import { type MetalSymbolCode } from "../market-types.ts";

export const MARKET_DATA_PROFILE_ID = "twelve-data-current-plan" as const;

export type MarketInstrumentAvailability = {
  symbol: MetalSymbolCode;
  liveEnabled: boolean;
  reason?: string;
  isDefault?: boolean;
};

const CURRENT_PLAN_AVAILABILITY: Record<
  MetalSymbolCode,
  MarketInstrumentAvailability
> = {
  XAUUSD: {
    symbol: "XAUUSD",
    liveEnabled: true,
    isDefault: true,
  },
  XAGUSD: {
    symbol: "XAGUSD",
    liveEnabled: false,
    reason:
      "Silver spot is unavailable on the current Twelve Data plan. Re-enable it only through a metals-capable provider adapter or upgraded plan.",
  },
  XPTUSD: {
    symbol: "XPTUSD",
    liveEnabled: false,
    reason:
      "Platinum spot is unavailable on the current Twelve Data plan. Re-enable it only through a metals-capable provider adapter or upgraded plan.",
  },
  XCUUSD: {
    symbol: "XCUUSD",
    liveEnabled: false,
    reason:
      "Copper is disabled because the current Twelve Data adapter/profile is not verified for this instrument.",
  },
  XURUSD: {
    symbol: "XURUSD",
    liveEnabled: true,
  },
  SPXUSD: {
    symbol: "SPXUSD",
    liveEnabled: true,
  },
};

export function getMarketInstrumentAvailability(symbol: MetalSymbolCode) {
  return CURRENT_PLAN_AVAILABILITY[symbol];
}

export function isMarketInstrumentLiveEnabled(symbol: MetalSymbolCode) {
  return CURRENT_PLAN_AVAILABILITY[symbol].liveEnabled;
}

export function getLiveEnabledMarketSymbols() {
  return (Object.keys(CURRENT_PLAN_AVAILABILITY) as MetalSymbolCode[]).filter(
    (symbol) => CURRENT_PLAN_AVAILABILITY[symbol].liveEnabled,
  );
}

export function getDefaultLiveMarketSymbol(): MetalSymbolCode {
  const explicitDefault = (Object.keys(CURRENT_PLAN_AVAILABILITY) as MetalSymbolCode[]).find(
    (symbol) => CURRENT_PLAN_AVAILABILITY[symbol].isDefault,
  );

  if (explicitDefault) {
    return explicitDefault;
  }

  const firstEnabled = getLiveEnabledMarketSymbols()[0];

  if (!firstEnabled) {
    throw new Error("No live-enabled market symbols are configured.");
  }

  return firstEnabled;
}

export function resolveLiveMarketSymbol(symbol: MetalSymbolCode): MetalSymbolCode {
  return isMarketInstrumentLiveEnabled(symbol)
    ? symbol
    : getDefaultLiveMarketSymbol();
}
