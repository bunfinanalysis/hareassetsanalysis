"use client";

import { startTransition } from "react";

import { Button } from "@/components/ui/button";
import { METAL_SYMBOLS, type MetalSymbolCode } from "@/lib/market-types";
import { cn } from "@/lib/utils";
import { useMarketStore } from "@/store/market-store";

type SymbolSwitcherProps = {
  compact?: boolean;
  selectedSymbol: MetalSymbolCode;
};

export function SymbolSwitcher({
  compact = false,
  selectedSymbol,
}: SymbolSwitcherProps) {
  const setSelectedSymbol = useMarketStore((state) => state.setSelectedSymbol);

  return (
    <div
      className={cn(
        "inline-flex border border-white/8 bg-white/4",
        compact ? "rounded-[16px] p-0.5" : "rounded-2xl p-1",
      )}
    >
      {(Object.keys(METAL_SYMBOLS) as MetalSymbolCode[]).map((symbol) => {
        const meta = METAL_SYMBOLS[symbol];
        const isActive = symbol === selectedSymbol;

        return (
          <Button
            key={symbol}
            className={cn(
              compact
                ? "min-w-[84px] rounded-[12px] border-transparent px-2.5 py-3 text-left shadow-none"
                : "min-w-[124px] rounded-[14px] border-transparent px-4 py-5 text-left shadow-none",
              !isActive && "text-muted-foreground hover:text-foreground",
            )}
            size="sm"
            variant={isActive ? "default" : "ghost"}
            onClick={() => {
              startTransition(() => {
                setSelectedSymbol(symbol);
              });
            }}
          >
            <div className="flex flex-col items-start">
              <span className={cn("font-semibold", compact ? "text-xs" : "text-sm")}>
                {meta.label}
              </span>
              <span
                className={cn(
                  "uppercase opacity-70",
                  compact ? "text-[10px] tracking-[0.2em]" : "text-[11px] tracking-[0.28em]",
                )}
              >
                {meta.displayTicker}
              </span>
            </div>
          </Button>
        );
      })}
    </div>
  );
}
