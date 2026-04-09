"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";

import type { FocusModeContextCard } from "@/lib/elliott-engine/focus-mode-presentation";
import { cn } from "@/lib/utils";

type FocusModeContextBarProps = {
  cards: FocusModeContextCard[];
  summary: string;
  className?: string;
};

export function FocusModeContextBar({
  cards,
  summary,
  className,
}: FocusModeContextBarProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (cards.length === 0) {
    return null;
  }

  return (
    <div
      aria-label="Focus mode context"
      role="region"
      className={cn(
        "rounded-[18px] border border-white/8 bg-[linear-gradient(180deg,rgba(10,16,29,0.9),rgba(7,12,22,0.88))] px-2 py-1.5 shadow-[0_14px_36px_rgba(0,0,0,0.14)] backdrop-blur-xl",
        className,
      )}
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
            Focus summary
          </p>
          <p className="mt-1 text-[12.5px] font-medium leading-5 text-foreground">
            {summary}
          </p>
        </div>
        <button
          type="button"
          aria-expanded={isExpanded}
          className="inline-flex h-7 shrink-0 items-center gap-1 rounded-full border border-white/10 bg-white/6 px-2.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground transition-colors hover:border-white/16 hover:text-foreground"
          onClick={() => setIsExpanded((currentValue) => !currentValue)}
        >
          {isExpanded ? (
            <ChevronUp className="h-3.5 w-3.5" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5" />
          )}
          Why
        </button>
      </div>

      <div className="mt-1.5 grid gap-1 xl:grid-cols-[minmax(0,1.45fr)_minmax(0,1.1fr)_minmax(0,0.95fr)]">
        {cards.map((card) => (
          <div
            key={card.key}
            className={cn(
              "rounded-[16px] border px-2.5 py-1.25",
              card.key === "setup" &&
              /not yet|needs more confirmation/i.test(card.statusTag ?? "")
                ? "border-rose-300/12 bg-rose-300/6"
                : card.key === "setup"
                  ? "border-primary/16 bg-primary/7"
                : card.key === "risk-line" &&
                    /\d/.test(card.title)
                  ? "border-amber-300/12 bg-amber-300/6"
                  : "border-white/6 bg-white/[0.03]",
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                {card.label}
              </p>
              {card.statusTag ? (
                <span
                  className={cn(
                    "rounded-full border px-2 py-0.5 text-[10px] font-semibold leading-none",
                    /yes, if confirmed/i.test(card.statusTag)
                      ? "border-emerald-300/18 bg-emerald-300/8 text-emerald-100"
                      : /not yet|needs more confirmation/i.test(card.statusTag)
                        ? "border-rose-300/18 bg-rose-300/8 text-rose-100"
                        : "border-white/10 bg-white/6 text-muted-foreground",
                  )}
                >
                  {card.statusTag}
                </span>
              ) : null}
            </div>
            <div className="mt-1.5 flex flex-wrap items-baseline gap-x-1.5 gap-y-1">
              <p className={cn(
                "font-semibold leading-4 text-foreground",
                card.key === "setup" ? "text-[13.5px]" : "text-[13px]",
              )}>
                {card.title}
              </p>
            </div>
          </div>
        ))}
      </div>

      {isExpanded ? (
        <div className="mt-1.5 grid gap-1.5 border-t border-white/6 pt-1.5 xl:grid-cols-3">
          {cards.map((card) => (
            <div key={`${card.key}-detail`} className="min-w-0">
              <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                {card.label}
              </p>
              <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
                {card.detail}
              </p>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
