"use client";

import { startTransition, useEffect } from "react";

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { TIMEFRAME_OPTIONS, type Timeframe } from "@/lib/market-types";
import { useMarketStore } from "@/store/market-store";

const VISIBLE_TIMEFRAMES: Timeframe[] = ["15m", "30m", "1H", "4H", "Daily", "Weekly"];

export function TimeframeSwitcher() {
  const selectedTimeframe = useMarketStore((state) => state.selectedTimeframe);
  const setSelectedTimeframe = useMarketStore((state) => state.setSelectedTimeframe);

  useEffect(() => {
    if (VISIBLE_TIMEFRAMES.includes(selectedTimeframe)) {
      return;
    }

    startTransition(() => {
      setSelectedTimeframe("15m");
    });
  }, [selectedTimeframe, setSelectedTimeframe]);

  return (
    <div className="overflow-x-auto">
      <ToggleGroup
        type="single"
        value={selectedTimeframe}
        onValueChange={(value) => {
          if (!value) {
            return;
          }

          startTransition(() => {
            setSelectedTimeframe(value as Timeframe);
          });
        }}
        className="flex-wrap justify-start"
      >
        {VISIBLE_TIMEFRAMES.map((timeframe) => TIMEFRAME_OPTIONS[timeframe]).map((option) => (
          <ToggleGroupItem key={option.value} value={option.value}>
            {option.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  );
}
