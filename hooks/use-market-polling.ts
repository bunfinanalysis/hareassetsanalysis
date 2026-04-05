"use client";

import { useEffect } from "react";
import { toast } from "sonner";

import { useMarketStore } from "@/store/market-store";

const POLLING_INTERVAL_MS = 10_000;

export function useMarketPolling() {
  const selectedSymbol = useMarketStore((state) => state.selectedSymbol);
  const selectedTimeframe = useMarketStore((state) => state.selectedTimeframe);
  const refresh = useMarketStore((state) => state.refresh);
  const error = useMarketStore((state) => state.error);
  const clearError = useMarketStore((state) => state.clearError);

  useEffect(() => {
    void refresh();
  }, [selectedSymbol, selectedTimeframe, refresh]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      void refresh({ silent: true });
    }, POLLING_INTERVAL_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [selectedSymbol, selectedTimeframe, refresh]);

  useEffect(() => {
    if (!error) {
      return;
    }

    toast.error(error);
    clearError();
  }, [clearError, error]);
}
