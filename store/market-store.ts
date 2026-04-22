"use client";

import { create } from "zustand";

import { fetchMarketSnapshot } from "@/lib/api/client";
import { type MarketSnapshot, type MetalSymbolCode, type Timeframe } from "@/lib/market-types";
import {
  shouldApplyMarketSnapshotResponse,
  snapshotMatchesSelection,
  type MarketSelection,
} from "@/store/market-store-helpers";

type RefreshOptions = {
  silent?: boolean;
};

type MarketState = {
  selectedSymbol: MetalSymbolCode;
  selectedTimeframe: Timeframe;
  snapshot: MarketSnapshot | null;
  isLoading: boolean;
  isRefreshing: boolean;
  error: string | null;
  clearError: () => void;
  setSelectedSymbol: (symbol: MetalSymbolCode) => void;
  setSelectedTimeframe: (timeframe: Timeframe) => void;
  refresh: (options?: RefreshOptions) => Promise<void>;
};

let marketSelectionVersion = 0;

export const useMarketStore = create<MarketState>((set, get) => ({
  selectedSymbol: "XAGUSD",
  selectedTimeframe: "1H",
  snapshot: null,
  isLoading: true,
  isRefreshing: false,
  error: null,
  clearError: () => set({ error: null }),
  setSelectedSymbol: (symbol) =>
    set((state) => {
      if (state.selectedSymbol === symbol) {
        return state;
      }

      marketSelectionVersion += 1;

      return {
        selectedSymbol: symbol,
        snapshot: null,
        isLoading: true,
        isRefreshing: false,
        error: null,
      };
    }),
  setSelectedTimeframe: (timeframe) =>
    set((state) => {
      if (state.selectedTimeframe === timeframe) {
        return state;
      }

      marketSelectionVersion += 1;

      return {
        selectedTimeframe: timeframe,
        snapshot: null,
        isLoading: true,
        isRefreshing: false,
        error: null,
      };
    }),
  refresh: async ({ silent = false } = {}) => {
    const { selectedSymbol, selectedTimeframe, snapshot } = get();
    const selection: MarketSelection = {
      symbol: selectedSymbol,
      timeframe: selectedTimeframe,
    };
    const selectionVersionAtRequest = marketSelectionVersion;
    const selectionHasSnapshot = snapshotMatchesSelection(snapshot, selection);

    set({
      isLoading: !silent && !selectionHasSnapshot,
      isRefreshing: silent || selectionHasSnapshot,
      error: null,
    });

    try {
      const nextSnapshot = await fetchMarketSnapshot(
        selection.symbol,
        selection.timeframe,
      );

      const currentState = get();
      const currentSelection: MarketSelection = {
        symbol: currentState.selectedSymbol,
        timeframe: currentState.selectedTimeframe,
      };

      if (
        !shouldApplyMarketSnapshotResponse({
          currentSelection,
          requestSelection: selection,
          currentSelectionVersion: marketSelectionVersion,
          requestSelectionVersion: selectionVersionAtRequest,
        })
      ) {
        return;
      }

      set({
        snapshot: nextSnapshot,
        isLoading: false,
        isRefreshing: false,
        error: null,
      });
    } catch (error) {
      const currentState = get();
      const currentSelection: MarketSelection = {
        symbol: currentState.selectedSymbol,
        timeframe: currentState.selectedTimeframe,
      };

      if (
        !shouldApplyMarketSnapshotResponse({
          currentSelection,
          requestSelection: selection,
          currentSelectionVersion: marketSelectionVersion,
          requestSelectionVersion: selectionVersionAtRequest,
        })
      ) {
        return;
      }

      set({
        isLoading: false,
        isRefreshing: false,
        error:
          error instanceof Error
            ? error.message
            : "HareAssets could not refresh the market feed. Please try again in a moment.",
      });
    }
  },
}));
