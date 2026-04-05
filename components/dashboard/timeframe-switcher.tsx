"use client";

import { startTransition } from "react";

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { TIMEFRAME_OPTIONS, type Timeframe } from "@/lib/market-types";
import { useMarketStore } from "@/store/market-store";

export function TimeframeSwitcher() {
  const selectedTimeframe = useMarketStore((state) => state.selectedTimeframe);
  const setSelectedTimeframe = useMarketStore((state) => state.setSelectedTimeframe);

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
        {Object.values(TIMEFRAME_OPTIONS).map((option) => (
          <ToggleGroupItem key={option.value} value={option.value}>
            {option.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  );
}
