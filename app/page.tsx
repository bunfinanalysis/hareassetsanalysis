"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  CandlestickChart,
  Construction,
  KeyRound,
  Maximize2,
  Minimize2,
  Radar,
  ShieldAlert,
  Waves,
} from "lucide-react";

import {
  MetalChart,
  type MetalChartInteractionMode,
  type MetalChartWaveAnalysis,
} from "@/components/charts/metal-chart";
import { DisclaimerModal } from "@/components/dashboard/disclaimer-modal";
import { FocusModeContextBar } from "@/components/dashboard/focus-mode-context-bar";
import { FocusModeRailDrawer } from "@/components/dashboard/focus-mode-rail-drawer";
import { HeaderTicker } from "@/components/dashboard/header-ticker";
import { SymbolSwitcher } from "@/components/dashboard/symbol-switcher";
import { TimeframeSwitcher } from "@/components/dashboard/timeframe-switcher";
import { WaveAnalysisPanel } from "@/components/WaveAnalysisPanel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useMarketPolling } from "@/hooks/use-market-polling";
import { buildAnalysisRailSections } from "@/lib/elliott-engine/analysis-rail-presentation";
import {
  buildFocusModeViewModel,
  getFocusModeShortcutAction,
} from "@/lib/elliott-engine/focus-mode-presentation";
import { getMarketFeedPresentation } from "@/lib/market-data/feed-status";
import {
  persistDisclaimerAcceptance,
  resolveDisclaimerAcceptance,
} from "@/lib/disclaimer";
import { buildWaveReactionAnalysis } from "@/lib/elliottReactionEngine";
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
            Hello there! Unfortunately this website is currently under construction.
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
  const [isFocusMode, setIsFocusMode] = useState(false);
  const [isFocusRailVisible, setIsFocusRailVisible] = useState(false);

  const quote = snapshot?.quote ?? null;
  const symbolMeta = METAL_SYMBOLS[selectedSymbol];
  const timeframeLabel = TIMEFRAME_OPTIONS[selectedTimeframe].label;
  const range = quote ? quote.high - quote.low : 0;
  const sessionPosition =
    quote && range > 0 ? ((quote.lastPrice - quote.low) / range) * 100 : 0;
  const isPositive = (quote?.changePercent ?? 0) >= 0;
  const feed = getMarketFeedPresentation(snapshot);

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

  useEffect(() => {
    if (!isFocusMode && isFocusRailVisible) {
      setIsFocusRailVisible(false);
    }
  }, [isFocusMode, isFocusRailVisible]);

  const toggleFocusMode = useCallback(() => {
    setIsFocusMode((currentValue) => {
      const nextValue = !currentValue;

      if (!nextValue) {
        setIsFocusRailVisible(false);
      }

      return nextValue;
    });
  }, []);

  const toggleFocusRail = useCallback(() => {
    setIsFocusRailVisible((currentValue) => !currentValue);
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const action = getFocusModeShortcutAction({
        event,
        isFocusMode,
        isFocusRailVisible,
      });

      if (!action) {
        return;
      }

      event.preventDefault();

      if (action === "toggle-focus-mode") {
        toggleFocusMode();
        return;
      }

      if (action === "close-focus-rail") {
        setIsFocusRailVisible(false);
        return;
      }

      setIsFocusMode(false);
      setIsFocusRailVisible(false);
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isFocusMode, isFocusRailVisible, toggleFocusMode]);

  const reactionAnalysis = useMemo(
    () =>
      buildWaveReactionAnalysis(
        waveAnalysis?.activeCount ?? null,
        waveAnalysis?.validation ?? null,
      ),
    [waveAnalysis],
  );
  const analysisRailSections = useMemo(
    () =>
      buildAnalysisRailSections({
        activeCount: waveAnalysis?.activeCount ?? null,
        reactionAnalysis,
        primaryScenario: waveAnalysis?.abcScenarios?.[0] ?? null,
        alternateScenario:
          waveAnalysis?.abcScenarios?.find(
            (scenario) => scenario.scenarioRole === "alternate",
          ) ?? null,
        noTradeState: waveAnalysis?.abcNoTradeState ?? null,
        pricePrecision: symbolMeta.precision,
      }),
    [reactionAnalysis, symbolMeta.precision, waveAnalysis],
  );
  const focusModeView = useMemo(
    () =>
      buildFocusModeViewModel({
        isFocusMode,
        isFocusRailVisible,
        sections: analysisRailSections,
      }),
    [analysisRailSections, isFocusMode, isFocusRailVisible],
  );

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-56 bg-[radial-gradient(circle_at_top,rgba(56,113,224,0.18),transparent_60%)]" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-[32rem] bg-[radial-gradient(circle_at_right,rgba(216,168,77,0.1),transparent_58%)]" />

      {!isFocusMode ? (
        <HeaderTicker
          isRefreshing={isRefreshing}
          quote={quote}
          selectedSymbol={selectedSymbol}
          snapshot={snapshot}
        />
      ) : null}

      <main
        className={cn(
          "relative z-10 mx-auto flex min-h-0 w-full flex-1 flex-col",
          isFocusMode
            ? "max-w-[1920px] gap-1 px-1.5 py-1 lg:px-1.5"
            : "max-w-[1760px] gap-4 px-4 py-4 lg:px-5",
        )}
      >
        {snapshot?.warning ? (
          <div
            className={cn(
              "flex items-start gap-3 rounded-2xl border border-warning/20 bg-warning/8 text-amber-100",
              isFocusMode ? "px-2.5 py-1.5 text-[11px]" : "px-4 py-3 text-sm",
            )}
          >
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            <p className="leading-6">{snapshot.warning}</p>
          </div>
        ) : null}

        <div
          className={cn(
            "grid min-h-0 flex-1",
            isFocusMode ? "grid-rows-[minmax(0,1fr)] gap-1" : "gap-3",
            focusModeView.showRailColumn
              ? "xl:grid-cols-[minmax(0,1fr)_340px]"
              : "grid-cols-1",
          )}
        >
          <Card
            className={cn(
              "flex flex-col overflow-hidden xl:min-h-0",
              isFocusMode
                ? "h-full min-h-0 rounded-[28px] xl:max-h-none"
                : "min-h-[72vh] xl:h-[86vh] xl:max-h-[960px]",
            )}
          >
            <CardHeader
              className={cn(
                "border-b border-white/6",
                isFocusMode ? "px-2 py-1 sm:px-2.5" : "px-4 py-3 sm:px-5",
              )}
            >
              {isFocusMode ? (
                <div className="flex flex-wrap items-center justify-between gap-1">
                  <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
                    <SymbolSwitcher compact selectedSymbol={selectedSymbol} />
                    <div className="rounded-[14px] border border-white/8 bg-white/4 px-1.5 py-0.5">
                      <TimeframeSwitcher />
                    </div>
                    <div
                      className={cn(
                        "rounded-full border border-white/8 bg-white/4 px-2 py-1 text-[11px]",
                        feed.badgeTone === "positive" && "text-emerald-200",
                        feed.badgeTone === "warning" && "text-amber-200",
                        feed.badgeTone === "negative" && "text-rose-200",
                        feed.badgeTone === "neutral" && "text-muted-foreground",
                      )}
                    >
                      <Radar
                        className={cn(
                          "mr-1 inline h-3.25 w-3.25",
                          feed.badgeTone === "positive" && "text-emerald-300",
                          feed.badgeTone === "warning" && "text-amber-300",
                          feed.badgeTone === "negative" && "text-rose-300",
                          feed.badgeTone === "neutral" && "text-muted-foreground",
                        )}
                      />
                      {feed.badgeLabel}
                    </div>
                    <div className="rounded-full border border-white/8 bg-white/4 px-2 py-1 text-[11px] text-muted-foreground">
                      {feed.priceLabel}:{" "}
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
                    <div className="hidden rounded-full border border-white/8 bg-white/4 px-2 py-1 text-[11px] text-muted-foreground lg:inline-flex">
                      Updated:{" "}
                      <span className="ml-1 font-semibold text-foreground">
                        {quote ? formatClock(quote.updatedAt) : "Waiting"}
                      </span>
                    </div>
                  </div>

                  <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
                    {!focusModeView.showFocusRailDrawer ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 px-2.5 text-[11px]"
                        title={focusModeView.railToggleLabel}
                        onClick={toggleFocusRail}
                      >
                        {focusModeView.railToggleLabel}
                      </Button>
                    ) : null}
                    <Button
                      size="sm"
                      variant={isFocusMode ? "default" : "outline"}
                      className="h-7 px-2.5 text-[11px]"
                      aria-keyshortcuts="F,Escape"
                      aria-pressed={isFocusMode}
                      title={`${focusModeView.focusToggleLabel} (F)`}
                      onClick={toggleFocusMode}
                    >
                      {isFocusMode ? (
                        <Minimize2 className="mr-1.5 h-3.5 w-3.5" />
                      ) : (
                        <Maximize2 className="mr-1.5 h-3.5 w-3.5" />
                      )}
                      {focusModeView.focusToggleLabel}
                      <span className="ml-1.5 hidden rounded-md border border-white/12 bg-white/6 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground sm:inline-flex">
                        F
                      </span>
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_280px] xl:items-start">
                  <div className="space-y-2.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge className="bg-primary/12 text-primary hover:bg-primary/12">
                        <CandlestickChart className="mr-1.5 h-3.5 w-3.5" />
                        Market Workspace
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
                        <Radar className="mr-1.5 h-3.5 w-3.5" />
                        {feed.badgeLabel}
                      </Badge>
                    </div>

                    <div>
                      <CardTitle className="text-xl text-foreground sm:text-2xl">
                        Elliott Wave Dashboard
                      </CardTitle>
                      <CardDescription className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
                        Gold, Silver, Platinum, Copper, Uranium, and S&amp;P500
                        charting with explicit feed-state disclosure, manual
                        wave placement, auto-detect scaffolding, live-ready
                        Fibonacci overlays, and a dedicated analysis rail.
                      </CardDescription>
                      <p className="mt-2 text-xs text-muted-foreground">
                        {feed.description}
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <div className="rounded-full border border-white/8 bg-white/4 px-3 py-1.5 text-xs text-muted-foreground">
                        {feed.priceLabel}:{" "}
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
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Waves className="h-4 w-4 text-primary" />
                          <p className="text-sm font-medium text-foreground">
                            Timeframe Controls
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant={isFocusMode ? "default" : "outline"}
                            className="h-8 px-3 text-xs"
                            aria-keyshortcuts="F,Escape"
                            aria-pressed={isFocusMode}
                            title={`${focusModeView.focusToggleLabel} (F)`}
                            onClick={toggleFocusMode}
                          >
                            {isFocusMode ? (
                              <Minimize2 className="mr-1.5 h-3.5 w-3.5" />
                            ) : (
                              <Maximize2 className="mr-1.5 h-3.5 w-3.5" />
                            )}
                            {focusModeView.focusToggleLabel}
                            <span className="ml-2 hidden rounded-md border border-white/12 bg-white/6 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground sm:inline-flex">
                              F
                            </span>
                          </Button>
                        </div>
                      </div>
                      <div className="mt-2.5">
                        <TimeframeSwitcher />
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </CardHeader>

            <CardContent
              className={cn(
                "flex min-h-0 flex-1 flex-col",
                isFocusMode ? "p-1 sm:p-1.5" : "p-2.5 pt-2.5 sm:p-3",
              )}
            >
              {focusModeView.showFocusContext ? (
                <FocusModeContextBar
                  className="mb-1 sticky top-1 z-20"
                  cards={focusModeView.contextCards}
                  summary={focusModeView.summaryLine}
                />
              ) : null}

              <MetalChart
                market={snapshot}
                isLoading={isLoading}
                isFocusMode={isFocusMode}
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

          {focusModeView.showRailColumn ? (
            <WaveAnalysisPanel
              className="min-h-[72vh] xl:h-[86vh] xl:min-h-0 xl:max-h-[960px]"
              waveAnalysis={waveAnalysis}
              wavePoints={wavePoints}
              alternateCount={alternateCount}
              alternateValidation={alternateValidation}
              onClearWaves={clearWaveWorkspace}
              pricePrecision={symbolMeta.precision}
              snapshot={snapshot}
              symbolLabel={`${symbolMeta.label} · ${timeframeLabel}`}
            />
          ) : null}
        </div>

        {isFocusMode ? (
          <FocusModeRailDrawer
            isOpen={focusModeView.showFocusRailDrawer}
            onClose={() => setIsFocusRailVisible(false)}
            title={`${symbolMeta.label} · ${timeframeLabel}`}
          >
            <WaveAnalysisPanel
              className="h-full max-h-none shadow-[0_28px_80px_rgba(0,0,0,0.35)]"
              waveAnalysis={waveAnalysis}
              wavePoints={wavePoints}
              alternateCount={alternateCount}
              alternateValidation={alternateValidation}
              onClearWaves={clearWaveWorkspace}
              pricePrecision={symbolMeta.precision}
              snapshot={snapshot}
              symbolLabel={`${symbolMeta.label} · ${timeframeLabel}`}
            />
          </FocusModeRailDrawer>
        ) : null}
      </main>

      {!isFocusMode ? (
        <footer className="relative z-10 border-t border-white/6 bg-[rgba(5,8,18,0.72)] px-4 py-4 text-center text-xs text-muted-foreground backdrop-blur-xl lg:px-5">
          For educational purposes only. Not financial advice.
        </footer>
      ) : null}
    </div>
  );
}

export default function Home() {
  const [accessCode, setAccessCode] = useState("");
  const [accessError, setAccessError] = useState<string | null>(null);
  const [hasAccess, setHasAccess] = useState<boolean | null>(null);
  const [isDisclaimerAccepted, setIsDisclaimerAccepted] = useState<boolean | null>(null);

  useEffect(() => {
    try {
      setHasAccess(window.localStorage.getItem(ACCESS_STORAGE_KEY) === ACCESS_CODE);
      setIsDisclaimerAccepted(resolveDisclaimerAcceptance(window.localStorage));
    } catch {
      setHasAccess(false);
      setIsDisclaimerAccepted(false);
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

  const handleAcknowledgeDisclaimer = useCallback(() => {
    try {
      persistDisclaimerAcceptance(window.localStorage);
    } catch {}

    setIsDisclaimerAccepted(true);
  }, []);

  if (hasAccess === null || isDisclaimerAccepted === null) {
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

  if (!isDisclaimerAccepted) {
    return <DisclaimerModal onAcknowledge={handleAcknowledgeDisclaimer} />;
  }

  return <DashboardContent />;
}
