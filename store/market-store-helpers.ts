import type {
  MarketSnapshot,
  MetalSymbolCode,
  Timeframe,
} from "@/lib/market-types";

export type MarketSelection = {
  symbol: MetalSymbolCode;
  timeframe: Timeframe;
};

export function snapshotMatchesSelection(
  snapshot: Pick<MarketSnapshot, "symbol" | "timeframe"> | null | undefined,
  selection: MarketSelection,
) {
  return (
    snapshot?.symbol === selection.symbol &&
    snapshot?.timeframe === selection.timeframe
  );
}

export function shouldApplyMarketSnapshotResponse(input: {
  currentSelection: MarketSelection;
  requestSelection: MarketSelection;
  currentSelectionVersion: number;
  requestSelectionVersion: number;
}) {
  return (
    input.currentSelectionVersion === input.requestSelectionVersion &&
    input.currentSelection.symbol === input.requestSelection.symbol &&
    input.currentSelection.timeframe === input.requestSelection.timeframe
  );
}
