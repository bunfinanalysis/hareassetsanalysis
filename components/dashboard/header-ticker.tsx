"use client";

import { Activity, Coins } from "lucide-react";

import { SymbolSwitcher } from "@/components/dashboard/symbol-switcher";
import { Badge } from "@/components/ui/badge";
import {
  METAL_SYMBOLS,
  type MarketSnapshot,
  type MetalSymbolCode,
  type QuoteData,
} from "@/lib/market-types";
import { getMarketFeedPresentation } from "@/lib/market-data/feed-status";
import {
  cn,
  formatClock,
  formatCompactNumber,
  formatPercent,
  formatPrice,
} from "@/lib/utils";

function TickerMetric({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "positive" | "negative";
}) {
  return (
    <div className="rounded-xl border border-white/6 bg-white/4 px-3 py-3">
      <p className="text-[11px] uppercase tracking-[0.3em] text-muted-foreground">
        {label}
      </p>
      <p
        className={cn(
          "mt-2 text-sm font-medium sm:text-base",
          tone === "positive" && "text-positive",
          tone === "negative" && "text-negative",
          tone === "neutral" && "text-foreground",
        )}
      >
        {value}
      </p>
    </div>
  );
}

type HeaderTickerProps = {
  isRefreshing: boolean;
  quote: QuoteData | null;
  selectedSymbol: MetalSymbolCode;
  snapshot?: Pick<MarketSnapshot, "provider" | "source"> | null;
};

export function HeaderTicker({
  isRefreshing,
  quote,
  selectedSymbol,
  snapshot,
}: HeaderTickerProps) {
  const precision = METAL_SYMBOLS[selectedSymbol].precision;
  const isPositive = (quote?.changePercent ?? 0) >= 0;
  const feed = getMarketFeedPresentation(snapshot);

  return (
    <header className="sticky top-0 z-30 border-b border-white/8 bg-[rgba(5,8,18,0.86)] backdrop-blur-xl">
      <div className="mx-auto flex w-full max-w-[1820px] flex-col gap-4 px-4 py-4 lg:px-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-primary/25 bg-primary/10 text-primary shadow-[0_0_32px_rgba(216,168,77,0.12)]">
              <Coins className="h-5 w-5" />
            </div>

            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-semibold text-foreground sm:text-2xl">
                  HareAssets
                </h1>
                <Badge variant="outline" className="border-white/10 text-muted-foreground">
                  Gold, Silver, Platinum, Copper, Uranium & S&amp;P500
                </Badge>
                <Badge
                  className={cn(
                    feed.badgeTone === "positive" &&
                      "bg-emerald-500/12 text-emerald-300 hover:bg-emerald-500/12",
                    feed.badgeTone === "warning" &&
                      "bg-amber-500/12 text-amber-200 hover:bg-amber-500/12",
                    feed.badgeTone === "negative" &&
                      "bg-rose-500/12 text-rose-200 hover:bg-rose-500/12",
                    feed.badgeTone === "neutral" &&
                      "bg-white/8 text-muted-foreground hover:bg-white/8",
                  )}
                >
                  <Activity className="mr-1.5 h-3.5 w-3.5" />
                  {feed.badgeLabel}
                </Badge>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                Elliott Wave charting workspace for metals, uranium, and index proxies.
              </p>
              <p className="mt-1 text-xs text-muted-foreground/90">
                {feed.description}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 rounded-full border border-white/8 bg-white/4 px-3 py-1.5 text-xs uppercase tracking-[0.24em] text-muted-foreground">
              <span
                className={cn(
                  "h-2.5 w-2.5 rounded-full",
                  isRefreshing
                    ? "animate-pulse bg-primary"
                    : feed.connectionTone === "positive"
                      ? "bg-positive"
                      : feed.connectionTone === "warning"
                        ? "bg-warning"
                        : feed.connectionTone === "negative"
                          ? "bg-negative"
                          : "bg-muted-foreground",
                )}
              />
              {isRefreshing ? `Refreshing ${feed.connectionLabel}` : feed.connectionLabel}
            </div>
            <SymbolSwitcher selectedSymbol={selectedSymbol} />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          <TickerMetric
            label={feed.priceLabel}
            value={quote ? `$${formatPrice(quote.lastPrice, precision)}` : "Loading"}
          />
          <TickerMetric
            label="Change"
            tone={isPositive ? "positive" : "negative"}
            value={
              quote
                ? `${formatPercent(quote.changePercent)} (${isPositive ? "+" : ""}$${formatPrice(Math.abs(quote.change), precision)})`
                : "Loading"
            }
          />
          <TickerMetric
            label="Session High"
            value={quote ? `$${formatPrice(quote.high, precision)}` : "Loading"}
          />
          <TickerMetric
            label="Session Low"
            value={quote ? `$${formatPrice(quote.low, precision)}` : "Loading"}
          />
          <TickerMetric label="Volume" value={formatCompactNumber(quote?.volume)} />
          <TickerMetric
            label="Updated"
            value={quote ? formatClock(quote.updatedAt) : "Waiting for feed"}
          />
        </div>
      </div>
    </header>
  );
}
