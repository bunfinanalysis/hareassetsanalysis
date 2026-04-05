"use client";

import { startTransition } from "react";

import { Button } from "@/components/ui/button";
import { METAL_SYMBOLS, type MetalSymbolCode } from "@/lib/market-types";
import { cn } from "@/lib/utils";
import { useMarketStore } from "@/store/market-store";

type SymbolSwitcherProps = {
  selectedSymbol: MetalSymbolCode;
};

export function SymbolSwitcher({ selectedSymbol }: SymbolSwitcherProps) {
  const setSelectedSymbol = useMarketStore((state) => state.setSelectedSymbol);

  return (
    <div className="inline-flex rounded-2xl border border-white/8 bg-white/4 p-1">
      {(Object.keys(METAL_SYMBOLS) as MetalSymbolCode[]).map((symbol) => {
        const meta = METAL_SYMBOLS[symbol];
        const isActive = symbol === selectedSymbol;

        return (
          <Button
            key={symbol}
            className={cn(
              "min-w-[124px] rounded-[14px] border-transparent px-4 py-5 text-left shadow-none",
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
              <span className="text-sm font-semibold">{meta.label}</span>
              <span className="text-[11px] uppercase tracking-[0.28em] opacity-70">
                {meta.metal}/USD
              </span>
            </div>
          </Button>
        );
      })}
    </div>
  );
}
