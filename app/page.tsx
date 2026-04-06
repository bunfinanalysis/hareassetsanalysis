"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  CandlestickChart,
  Construction,
  KeyRound,
  Radar,
  ShieldAlert,
  Waves,
} from "lucide-react";

import {
  MetalChart,
  type MetalChartInteractionMode,
  type MetalChartWaveAnalysis,
} from "@/components/charts/metal-chart";
import { HeaderTicker } from "@/components/dashboard/header-ticker";
import { TimeframeSwitcher } from "@/components/dashboard/timeframe-switcher";
import { WaveAnalysisPanel } from "@/components/WaveAnalysisPanel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useMarketPolling } from "@/hooks/use-market-polling";
import {
  type WaveCount,
  type WavePoint,
  type WaveValidationResult,
} from "@/lib/elliottWaveUtils";
import { METAL_SYMBOLS, TIMEFRAME_OPTIONS } from "@/lib/market-types";
import { cn, formatClock, formatCompactNumber, formatPrice } from "@/lib/utils";
import { useMarketStore } from "@/store/market-store";

const ACCESS_CODE = "Hare5626";
const ACCESS_STORAGE_KEY = "hareassets-site-access";

function AccessGate({
  accessCode,
  errorMessage,
  onAccessCodeChange,
  onSubmit,
}: {
  accessCode: string;
  errorMessage: string | null;
  onAccessCodeChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-[radial-gradient(circle_at_top,rgba(56,113,224,0.16),transparent_62%)]" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-[28rem] bg-[radial-gradient(circle_at_right,rgba(216,168,77,0.12),transparent_58%)]" />

      <Card className="relative z-10 w-full max-w-xl overflow-hidden border-white/8 bg-[linear-gradient(180deg,rgba(11,17,30,0.98),rgba(7,11,21,0.98))]">
        <CardHeader className="border-b border-white/6 pb-5">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary">
              <Construction className="h-5 w-5" />
            </div>
            <div>
              <Badge className="bg-primary/12 text-primary hover:bg-primary/12">
                HareAssets
              </Badge>
              <CardTitle className="mt-3 text-2xl">Under Construction</CardTitle>
            </div>
          </div>
          <CardDescription className="mt-4 text-sm leading-7 text-muted-foreground">
            Hello there! Unfortunetly this website is currently under construction.
            If you are a developer, please type the code below to access the site.
          </CardDescription>
        </CardHeader>

        <CardContent className="pt-6">
          <form className="space-y-4" onSubmit={onSubmit}>
            <div className="space-y-2">
              <label
                htmlFor="developer-access-code"
                className="text-xs uppercase tracking-[0.24em] text-muted-foreground"
              >
                Developer Access Code
              </label>
              <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/4 px-4 py-3">
                <KeyRound className="h-4 w-4 shrink-0 text-primary" />
                <input
                  id="developer-access-code"
                  type="password"
                  value={accessCode}
                  onChange={(event) => onAccessCodeChange(event.target.value)}
                  placeholder="Enter access code"
                  className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
                  autoComplete="off"
                  spellCheck={false}
                />
              </div>
            </div>

            {errorMessage ? (
              <div className="rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
                {errorMessage}
              </div>
            ) : null}

            <Button type="submit" className="w-full">
              Access Site
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function DashboardContent() {
  useMarketPolling();

  const snapshot = useMarketStore((state) => state.snapshot);
  const selectedSymbol = useMarketStore((state) => state.selectedSymbol);
  const selectedTimeframe = useMarketStore((state) => state.selectedTimeframe);
  const isLoading = useMarketStore((state) => state.isLoading);
  const isRefreshing = useMarketStore((state) => state.isRefreshing);

  const [wavePoints, setWavePoints] = useState<WavePoint[]>([]);
  const [waveAnalysis, setWaveAnalysis] = useState<MetalChartWaveAnalysis | null>(null);
  const [alternateCount, setAlternateCount] = useState<WaveCount | null>(null);
  const [alternateValidation, setAlternateValidation] =
    useState<WaveValidationResult | null>(null);
  const [interactionMode, setInteractionMode] =
    useState<MetalChartInteractionMode>("manual");

  const quote = snapshot?.quote ?? null;
  const symbolMeta = METAL_SYMBOLS[selectedSymbol];
  const timeframeLabel = TIMEFRAME_OPTIONS[selectedTimeframe].label;
  const range = quote ? quote.high - quote.low : 0;
  const sessionPosition =
    quote && range > 0 ? ((quote.lastPrice - quote.low) / range) * 100 : 0;
  const isPositive = (quote?.changePercent ?? 0) >= 0;

  const clearWaveWorkspace = useCallback(() => {
    setWavePoints([]);
    setWaveAnalysis(null);
    setAlternateCount(null);
    setAlternateValidation(null);
    setInteractionMode("manual");
  }, []);

  useEffect(() => {
    clearWaveWorkspace();
  }, [clearWaveWorkspace, selectedSymbol, selectedTimeframe]);

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-56 bg-[radial-gradient(circle_at_top,rgba(56,113,224,0.18),transparent_60%)]" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-[32rem] bg-[radial-gradient(circle_at_right,rgba(216,168,77,0.1),transparent_58%)]" />

      <HeaderTicker
        isRefreshing={isRefreshing}
        quote={quote}
        selectedSymbol={selectedSymbol}
        source={snapshot?.source}
      />

      <main className="relative z-10 mx-auto flex w-full max-w-[1760px] flex-1 flex-col gap-4 px-4 py-4 lg:px-5">
        {snapshot?.warning ? (
          <div className="flex items-start gap-3 rounded-2xl border border-warning/20 bg-warning/8 px-4 py-3 text-sm text-amber-100">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            <p className="leading-6">{snapshot.warning}</p>
          </div>
        ) : null}

        <div className="grid flex-1 gap-3 xl:grid-cols-[minmax(0,1fr)_340px]">
          <Card className="flex min-h-[72vh] flex-col overflow-hidden xl:h-[86vh] xl:min-h-0 xl:max-h-[960px]">
            <CardHeader className="border-b border-white/6 px-4 py-3 sm:px-5">
              <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_280px] xl:items-start">
                <div className="space-y-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className="bg-primary/12 text-primary hover:bg-primary/12">
                      <CandlestickChart className="mr-1.5 h-3.5 w-3.5" />
                      Live Workspace
                    </Badge>
                    <Badge
                      variant="outline"
                      className="border-white/10 text-muted-foreground"
                    >
                      {symbolMeta.displayName}
                    </Badge>
                    <Badge
                      variant="outline"
                      className="border-white/10 text-muted-foreground"
                    >
                      {timeframeLabel}
                    </Badge>
                    <Badge className="bg-emerald-500/12 text-emerald-300 hover:bg-emerald-500/12">
                      <Radar className="mr-1.5 h-3.5 w-3.5" />
                      {snapshot?.source === "mock" ? "Fallback Feed" : "Yahoo Finance"}
                    </Badge>
                  </div>

                  <div>
                    <CardTitle className="text-xl text-foreground sm:text-2xl">
                      Elliott Wave Dashboard
                    </CardTitle>
                    <CardDescription className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
                      Real-time Gold and Silver charting with manual wave placement,
                      auto-detect scaffolding, live Fibonacci overlays, and a
                      dedicated analysis rail.
                    </CardDescription>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <div className="rounded-full border border-white/8 bg-white/4 px-3 py-1.5 text-xs text-muted-foreground">
                      Live:{" "}
                      <span
                        className={cn(
                          "font-semibold",
                          isPositive ? "text-positive" : "text-negative",
                        )}
                      >
                        {quote
                          ? `$${formatPrice(quote.lastPrice, symbolMeta.precision)}`
                          : "Loading"}
                      </span>
                    </div>
                    <div className="rounded-full border border-white/8 bg-white/4 px-3 py-1.5 text-xs text-muted-foreground">
                      Session:{" "}
                      <span className="font-semibold text-foreground">
                        {quote ? `${sessionPosition.toFixed(1)}%` : "Loading"}
                      </span>
                    </div>
                    <div className="rounded-full border border-white/8 bg-white/4 px-3 py-1.5 text-xs text-muted-foreground">
                      Volume:{" "}
                      <span className="font-semibold text-foreground">
                        {formatCompactNumber(quote?.volume)}
                      </span>
                    </div>
                    <div className="rounded-full border border-white/8 bg-white/4 px-3 py-1.5 text-xs text-muted-foreground">
                      Updated:{" "}
                      <span className="font-semibold text-foreground">
                        {quote ? formatClock(quote.updatedAt) : "Waiting"}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="w-full xl:w-auto xl:min-w-[280px]">
                  <div className="rounded-[20px] border border-white/8 bg-white/4 p-2.5">
                    <div className="flex items-center gap-2">
                      <Waves className="h-4 w-4 text-primary" />
                      <p className="text-sm font-medium text-foreground">
                        Timeframe Controls
                      </p>
                    </div>
                    <div className="mt-2.5">
                      <TimeframeSwitcher />
                    </div>
                  </div>
                </div>
              </div>
            </CardHeader>

            <CardContent className="flex min-h-0 flex-1 flex-col p-2.5 pt-2.5 sm:p-3">
              <MetalChart
                candles={snapshot?.candles ?? []}
                isLoading={isLoading}
                symbol={selectedSymbol}
                timeframeLabel={timeframeLabel}
                wavePoints={wavePoints}
                onWavePointsChange={setWavePoints}
                interactionMode={interactionMode}
                onInteractionModeChange={setInteractionMode}
                onWaveAnalysisChange={setWaveAnalysis}
                onAlternateCountChange={(nextAlternateCount, nextAlternateValidation) => {
                  setAlternateCount(nextAlternateCount);
                  setAlternateValidation(nextAlternateValidation);
                }}
              />
            </CardContent>
          </Card>

          <WaveAnalysisPanel
            className="min-h-[72vh] xl:h-[86vh] xl:min-h-0 xl:max-h-[960px]"
            waveAnalysis={waveAnalysis}
            wavePoints={wavePoints}
            alternateCount={alternateCount}
            alternateValidation={alternateValidation}
            onClearWaves={clearWaveWorkspace}
            pricePrecision={symbolMeta.precision}
            symbolLabel={`${symbolMeta.label} · ${timeframeLabel}`}
          />
        </div>
      </main>

      <footer className="relative z-10 border-t border-white/6 bg-[rgba(5,8,18,0.72)] px-4 py-4 text-center text-xs text-muted-foreground backdrop-blur-xl lg:px-5">
        For educational purposes only. Not financial advice.
      </footer>
    </div>
  );
}

export default function Home() {
  const [accessCode, setAccessCode] = useState("");
  const [accessError, setAccessError] = useState<string | null>(null);
  const [hasAccess, setHasAccess] = useState(false);
  const [isCheckingAccess, setIsCheckingAccess] = useState(true);

  useEffect(() => {
    try {
      setHasAccess(window.localStorage.getItem(ACCESS_STORAGE_KEY) === ACCESS_CODE);
    } finally {
      setIsCheckingAccess(false);
    }
  }, []);

  const handleSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      if (accessCode.trim() !== ACCESS_CODE) {
        setAccessError("That code is incorrect. Please try again.");
        return;
      }

      try {
        window.localStorage.setItem(ACCESS_STORAGE_KEY, ACCESS_CODE);
      } catch {}

      setAccessError(null);
      setAccessCode("");
      setHasAccess(true);
    },
    [accessCode],
  );

  if (isCheckingAccess) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="rounded-2xl border border-white/8 bg-white/4 px-5 py-4 text-sm text-muted-foreground">
          Checking site access...
        </div>
      </div>
    );
  }

  if (!hasAccess) {
    return (
      <AccessGate
        accessCode={accessCode}
        errorMessage={accessError}
        onAccessCodeChange={(value) => {
          setAccessCode(value);
          if (accessError) {
            setAccessError(null);
          }
        }}
        onSubmit={handleSubmit}
      />
    );
  }

  return <DashboardContent />;
}
