"use client";

import { create } from "zustand";

import { fetchMarketSnapshot } from "@/lib/api/client";
import { type MarketSnapshot, type MetalSymbolCode, type Timeframe } from "@/lib/market-types";

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

export const useMarketStore = create<MarketState>((set, get) => ({
  selectedSymbol: "XAGUSD",
  selectedTimeframe: "1H",
  snapshot: null,
  isLoading: true,
  isRefreshing: false,
  error: null,
  clearError: () => set({ error: null }),
  setSelectedSymbol: (symbol) => set({ selectedSymbol: symbol }),
  setSelectedTimeframe: (timeframe) => set({ selectedTimeframe: timeframe }),
  refresh: async ({ silent = false } = {}) => {
    const { selectedSymbol, selectedTimeframe, snapshot } = get();

    set({
      isLoading: !silent && snapshot === null,
      isRefreshing: silent || snapshot !== null,
      error: null,
    });

    try {
      const nextSnapshot = await fetchMarketSnapshot(
        selectedSymbol,
        selectedTimeframe,
      );

      set({
        snapshot: nextSnapshot,
        isLoading: false,
        isRefreshing: false,
        error: null,
      });
    } catch {
      set({
        isLoading: false,
        isRefreshing: false,
        error:
          "HareAssets could not refresh the market feed. Please try again in a moment.",
      });
    }
  },
}));
