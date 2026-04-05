"use client";

import { Activity, CandlestickChart, Radar, Waves } from "lucide-react";

import { HeaderTicker } from "@/components/dashboard/header-ticker";
import { TimeframeSwitcher } from "@/components/dashboard/timeframe-switcher";
import { MetalChart } from "@/components/charts/metal-chart";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useMarketPolling } from "@/hooks/use-market-polling";
import { METAL_SYMBOLS, TIMEFRAME_OPTIONS } from "@/lib/market-types";
import { cn, formatClock, formatCompactNumber, formatPrice } from "@/lib/utils";
import { useMarketStore } from "@/store/market-store";

function InfoMetric({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "positive" | "negative";
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-white/6 py-3 last:border-b-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span
        className={cn(
          "text-sm font-medium",
          tone === "positive" && "text-positive",
          tone === "negative" && "text-negative",
          tone === "neutral" && "text-foreground",
        )}
      >
        {value}
      </span>
    </div>
  );
}

export function DashboardPage() {
  useMarketPolling();

  const snapshot = useMarketStore((state) => state.snapshot);
  const selectedSymbol = useMarketStore((state) => state.selectedSymbol);
  const selectedTimeframe = useMarketStore((state) => state.selectedTimeframe);
  const isLoading = useMarketStore((state) => state.isLoading);
  const isRefreshing = useMarketStore((state) => state.isRefreshing);

  const quote = snapshot?.quote ?? null;
  const range = quote ? quote.high - quote.low : 0;
  const sessionPosition =
    quote && range > 0 ? ((quote.lastPrice - quote.low) / range) * 100 : 0;
  const symbolMeta = METAL_SYMBOLS[selectedSymbol];
  const timeframeLabel = TIMEFRAME_OPTIONS[selectedTimeframe].label;

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-56 bg-[radial-gradient(circle_at_top,rgba(56,113,224,0.18),transparent_60%)]" />

      <HeaderTicker
        isRefreshing={isRefreshing}
        quote={quote}
        selectedSymbol={selectedSymbol}
        source={snapshot?.source}
      />

      <main className="relative z-10 mx-auto flex w-full max-w-[1820px] flex-1 flex-col gap-4 px-4 py-4 lg:px-5">
        {snapshot?.warning ? (
          <div className="flex items-start gap-3 rounded-2xl border border-warning/20 bg-warning/8 px-4 py-3 text-sm text-amber-100">
            <Radar className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            <p className="leading-6">{snapshot.warning}</p>
          </div>
        ) : null}

        <div className="grid flex-1 gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
          <Card className="flex min-h-[72vh] flex-col overflow-hidden">
            <CardHeader className="border-b border-white/6 px-4 py-4 sm:px-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Badge className="bg-primary/12 text-primary hover:bg-primary/12">
                      <CandlestickChart className="mr-1.5 h-3.5 w-3.5" />
                      Stage 1
                    </Badge>
                    <Badge variant="outline" className="border-white/10 text-muted-foreground">
                      {symbolMeta.displayName}
                    </Badge>
                  </div>
                  <div>
                    <CardTitle className="text-xl text-foreground sm:text-2xl">
                      Market Dashboard
                    </CardTitle>
                    <CardDescription className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
                      TradingView-style candlesticks with live Yahoo Finance
                      polling, timeframe controls, and a production-ready shell
                      for the Elliott Wave tools coming next.
                    </CardDescription>
                    <p className="mt-2 text-xs text-muted-foreground">
                      Data from Yahoo Finance
                    </p>
                  </div>
                </div>

                <TimeframeSwitcher />
              </div>
            </CardHeader>

            <CardContent className="flex flex-1 flex-col p-4 pt-4 sm:p-5">
              <MetalChart
                candles={snapshot?.candles ?? []}
                isLoading={isLoading}
                symbol={selectedSymbol}
                timeframeLabel={timeframeLabel}
              />
            </CardContent>
          </Card>

          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Session Structure</CardTitle>
                <CardDescription>
                  Real-time context for the currently selected metal.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <InfoMetric
                  label="Selected Market"
                  value={`${symbolMeta.label} (${selectedSymbol})`}
                />
                <InfoMetric
                  label="Session Position"
                  value={`${sessionPosition.toFixed(1)}%`}
                  tone={
                    sessionPosition >= 60
                      ? "positive"
                      : sessionPosition <= 40
                        ? "negative"
                        : "neutral"
                  }
                />
                <InfoMetric
                  label="Intraday Range"
                  value={quote ? `$${formatPrice(range, symbolMeta.precision)}` : "Loading"}
                />
                <InfoMetric
                  label="Estimated Volume"
                  value={formatCompactNumber(quote?.volume)}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Feed Status</CardTitle>
                <CardDescription>
                  Data mode, update cadence, and environment readiness.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <InfoMetric label="Polling Interval" value="10 seconds" />
                <InfoMetric
                  label="Historical Candles"
                  value={
                    snapshot?.source === "mock"
                      ? "Fallback modeled"
                      : "Yahoo Finance OHLC"
                  }
                />
                <InfoMetric
                  label="Last Update"
                  value={quote ? formatClock(quote.updatedAt) : "Waiting for feed"}
                />
                <InfoMetric
                  label="Feed Provider"
                  value={snapshot?.source === "mock" ? "Fallback Feed" : "Yahoo Finance"}
                  tone={snapshot?.source === "mock" ? "negative" : "positive"}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Build Track</CardTitle>
                <CardDescription>
                  The next milestones planned directly from your spec.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {[
                  {
                    icon: Activity,
                    title: "Manual Wave Drawing",
                    body: "Click-to-place impulse and corrective labels with drag-to-edit controls.",
                  },
                  {
                    icon: Waves,
                    title: "Auto Elliott Detection",
                    body: "ZigZag swing detection, wave validation, and alternate-count scaffolding.",
                  },
                  {
                    icon: Radar,
                    title: "Fib & Rules Panel",
                    body: "Retracement targets, extension levels, and live rule-compliance signals.",
                  },
                ].map((item) => (
                  <div
                    key={item.title}
                    className="rounded-xl border border-white/6 bg-white/3 p-3"
                  >
                    <div className="flex items-start gap-3">
                      <div className="rounded-lg border border-white/8 bg-accent p-2 text-primary">
                        <item.icon className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">
                          {item.title}
                        </p>
                        <p className="mt-1 text-sm leading-6 text-muted-foreground">
                          {item.body}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
