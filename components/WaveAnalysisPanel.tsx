"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ChevronRight,
  Layers3,
  Radar,
  RefreshCw,
  Target,
  TrendingDown,
  TrendingUp,
  Waves,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  CORRECTIVE_LABELS,
  sortWavePoints,
  type FibonacciLevel,
  type WaveCount,
  type WavePatternType,
  type WavePoint,
  type WaveRuleStatus,
  type WaveTrend,
  type WaveValidationResult,
} from "@/lib/elliottWaveUtils";
import { cn, formatPrice } from "@/lib/utils";

type TabKey = "analysis" | "fibonacci" | "projection";

type WaveAnalysisPanelData = {
  activePattern: WavePatternType | null;
  activeCount: WaveCount | null;
  activeDirection: WaveTrend;
  validation: WaveValidationResult | null;
};

export type WaveAnalysisPanelProps = {
  waveAnalysis: WaveAnalysisPanelData | null;
  wavePoints: WavePoint[];
  alternateCount?: WaveCount | null;
  alternateValidation?: WaveValidationResult | null;
  onClearWaves?: () => void;
  onToggleAlternateCount?: (useAlternate: boolean) => void;
  className?: string;
  pricePrecision?: number;
  symbolLabel?: string;
};

type ProjectionTarget = {
  id: string;
  label: string;
  price: number;
  ratio?: number;
  emphasis?: "primary" | "secondary";
  hint: string;
};

const TAB_ITEMS: Array<{ key: TabKey; label: string }> = [
  { key: "analysis", label: "Wave Analysis" },
  { key: "fibonacci", label: "Fibonacci Targets" },
  { key: "projection", label: "Next Projection" },
];

const DEGREE_LABELS: Record<WaveCount["degree"], string> = {
  micro: "Micro",
  minor: "Minor",
  intermediate: "Intermediate",
  primary: "Primary",
};

const STATUS_ICON: Record<WaveRuleStatus, string> = {
  pass: "✅",
  warning: "⚠️",
  fail: "❌",
};

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatRatio(value?: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  return `${value.toFixed(3)}x`;
}

function buildHeadline(count: WaveCount | null) {
  if (!count || count.points.length === 0) {
    return "Awaiting wave placement";
  }

  const latestPoint = count.points[count.points.length - 1];
  const wavePrefix = latestPoint.label === "A" || latestPoint.label === "B" || latestPoint.label === "C"
    ? `Wave ${latestPoint.label}`
    : `Wave ${latestPoint.label}`;

  return `${wavePrefix} - ${capitalize(count.direction)} ${capitalize(count.pattern)}`;
}

function buildSubheadline(count: WaveCount | null) {
  if (!count || count.points.length === 0) {
    return "Plot manual wave points or run Auto-Detect to begin analysis.";
  }

  return `${DEGREE_LABELS[count.degree]} degree · ${capitalize(count.source)} mode · ${count.points.length} pivot${count.points.length === 1 ? "" : "s"}`;
}

function buildTargetLevels(
  startPrice: number,
  endPrice: number,
  ratios: number[],
  label: string,
) {
  const move = endPrice - startPrice;

  return ratios.map<ProjectionTarget>((ratio, index) => ({
    id: `${label}-${ratio}`,
    label,
    price: endPrice - move * ratio,
    ratio,
    emphasis: index === 0 ? "primary" : "secondary",
    hint: `Retracement ${ratio.toFixed(3)} of the prior swing`,
  }));
}

function buildExtensionTargets(
  originPrice: number,
  baseMove: number,
  ratios: number[],
  label: string,
) {
  return ratios.map<ProjectionTarget>((ratio, index) => ({
    id: `${label}-${ratio}`,
    label,
    price: originPrice + baseMove * ratio,
    ratio,
    emphasis: index === 1 ? "primary" : "secondary",
    hint: `Extension ${ratio.toFixed(3)} of the reference swing`,
  }));
}

function buildProjectionTargets(count: WaveCount | null) {
  if (!count || !count.anchor) {
    return [] as ProjectionTarget[];
  }

  const points = sortWavePoints(count.points);

  if (count.pattern === "impulse") {
    if (points.length === 1) {
      return buildTargetLevels(
        count.anchor.price,
        points[0].price,
        [0.382, 0.5, 0.618, 0.786],
        "Wave 2",
      );
    }

    if (points.length === 2) {
      return buildExtensionTargets(
        points[1].price,
        points[0].price - count.anchor.price,
        [1, 1.272, 1.618, 2.618],
        "Wave 3",
      );
    }

    if (points.length === 3) {
      return buildTargetLevels(
        points[1].price,
        points[2].price,
        [0.236, 0.382, 0.5, 0.618],
        "Wave 4",
      );
    }

    if (points.length === 4) {
      return buildExtensionTargets(
        points[3].price,
        points[0].price - count.anchor.price,
        [0.618, 1, 1.272, 1.618],
        "Wave 5",
      );
    }

    if (points.length >= 5) {
      return buildTargetLevels(
        count.anchor.price,
        points[4].price,
        [0.236, 0.382, 0.5],
        "Wave A",
      );
    }
  }

  if (points.length === 1) {
    return buildTargetLevels(
      count.anchor.price,
      points[0].price,
      [0.382, 0.5, 0.618, 0.786, 0.886],
      "Wave B",
    );
  }

  if (points.length === 2) {
    return buildExtensionTargets(
      points[1].price,
      points[0].price - count.anchor.price,
      [1, 1.272, 1.618],
      "Wave C",
    );
  }

  return [];
}

function getVisibleFibLevels(
  validation: WaveValidationResult | null,
  projections: ProjectionTarget[],
) {
  if (validation?.fibonacciLevels.length) {
    return validation.fibonacciLevels;
  }

  return projections.map<FibonacciLevel>((projection) => ({
    id: projection.id,
    label: `${projection.label} ${projection.ratio?.toFixed(3) ?? ""}`.trim(),
    price: projection.price,
    ratio: projection.ratio ?? 0,
    type: projection.label.includes("Wave 2") ||
      projection.label.includes("Wave 4") ||
      projection.label.includes("Wave A") ||
      projection.label.includes("Wave B")
      ? "retracement"
      : "extension",
    wave: projection.label,
    isActive: projection.emphasis === "primary",
  }));
}

function getConfidenceTone(score: number) {
  if (score >= 85) {
    return "text-emerald-300 border-emerald-400/20 bg-emerald-400/10";
  }

  if (score >= 65) {
    return "text-amber-200 border-amber-300/20 bg-amber-300/10";
  }

  return "text-rose-200 border-rose-400/20 bg-rose-400/10";
}

function getRuleRowTone(status: WaveRuleStatus) {
  if (status === "pass") {
    return "border-emerald-400/12 bg-emerald-400/6";
  }

  if (status === "warning") {
    return "border-amber-300/12 bg-amber-300/6";
  }

  return "border-rose-400/12 bg-rose-400/6";
}

function pickNearestLevel(levels: FibonacciLevel[], currentPrice?: number) {
  if (!levels.length) {
    return null;
  }

  if (typeof currentPrice !== "number") {
    return levels.find((level) => level.isActive) ?? levels[0];
  }

  return levels.reduce((closest, level) => {
    const closestDistance = Math.abs(closest.price - currentPrice);
    const nextDistance = Math.abs(level.price - currentPrice);

    return nextDistance < closestDistance ? level : closest;
  });
}

export function WaveAnalysisPanel({
  waveAnalysis,
  wavePoints,
  alternateCount = null,
  alternateValidation = null,
  onClearWaves,
  onToggleAlternateCount,
  className,
  pricePrecision = 2,
  symbolLabel = "Active Market",
}: WaveAnalysisPanelProps) {
  const [activeTab, setActiveTab] = useState<TabKey>("analysis");
  const [useAlternateCount, setUseAlternateCount] = useState(false);

  useEffect(() => {
    if (!alternateCount && useAlternateCount) {
      setUseAlternateCount(false);
      onToggleAlternateCount?.(false);
    }
  }, [alternateCount, onToggleAlternateCount, useAlternateCount]);

  const activeCount = useMemo(() => {
    if (useAlternateCount && alternateCount) {
      return alternateCount;
    }

    return waveAnalysis?.activeCount ?? null;
  }, [alternateCount, useAlternateCount, waveAnalysis?.activeCount]);

  const activeValidation = useMemo(() => {
    if (useAlternateCount && alternateCount) {
      return alternateValidation;
    }

    return waveAnalysis?.validation ?? null;
  }, [alternateCount, alternateValidation, useAlternateCount, waveAnalysis]);

  const sortedWavePoints = useMemo(() => sortWavePoints(wavePoints), [wavePoints]);
  const activeWaveLabel = activeCount?.points[activeCount.points.length - 1]?.label ?? null;
  const projectionTargets = useMemo(
    () => buildProjectionTargets(activeCount),
    [activeCount],
  );
  const fibLevels = useMemo(
    () => getVisibleFibLevels(activeValidation, projectionTargets),
    [activeValidation, projectionTargets],
  );
  const currentPrice = activeCount?.points[activeCount.points.length - 1]?.price;
  const nearestFibLevel = useMemo(
    () => pickNearestLevel(fibLevels, currentPrice),
    [currentPrice, fibLevels],
  );

  const handleAlternateToggle = () => {
    const nextValue = !useAlternateCount;
    setUseAlternateCount(nextValue);
    onToggleAlternateCount?.(nextValue);
  };

  const ruleCount = activeValidation?.rules.length ?? 0;
  const confidenceScore = Math.round(
    activeValidation?.score ??
      (typeof activeCount?.confidence === "number" ? activeCount.confidence * 100 : 0),
  );

  return (
    <Card
      className={cn(
        "flex h-full min-h-[620px] flex-col overflow-hidden border-white/8 bg-[linear-gradient(180deg,rgba(11,17,30,0.98),rgba(7,11,21,0.98))]",
        className,
      )}
    >
      <CardHeader className="border-b border-white/6 pb-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Badge className="bg-primary/12 text-primary hover:bg-primary/12">
                <Waves className="mr-1.5 h-3.5 w-3.5" />
                Elliott Engine
              </Badge>
              <Badge variant="outline" className="border-white/10 text-muted-foreground">
                {symbolLabel}
              </Badge>
            </div>
            <CardTitle className="mt-3 text-lg">HareAssets Analysis Rail</CardTitle>
            <CardDescription className="mt-2 leading-6">
              WaveBasis-style rule validation, Fibonacci confluence, and next-wave
              targeting for Gold and Silver.
            </CardDescription>
          </div>

          <div className="flex flex-col items-end gap-2">
            <div
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-semibold tracking-[0.12em]",
                getConfidenceTone(confidenceScore),
              )}
            >
              {confidenceScore}% confidence
            </div>
            <Button
              size="sm"
              variant="outline"
              className="h-8 px-3 text-xs"
              onClick={onClearWaves}
            >
              Clear Waves
            </Button>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-2 rounded-2xl border border-white/8 bg-[rgba(255,255,255,0.03)] p-2 sm:grid-cols-3">
          {TAB_ITEMS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                "rounded-xl px-3 py-2 text-left text-sm font-medium transition-colors",
                activeTab === tab.key
                  ? "bg-primary text-primary-foreground shadow-[0_12px_28px_rgba(216,168,77,0.16)]"
                  : "text-muted-foreground hover:bg-white/6 hover:text-foreground",
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </CardHeader>

      <CardContent className="flex flex-1 flex-col gap-4 overflow-y-auto pt-5">
        <div className="rounded-[20px] border border-white/8 bg-[linear-gradient(180deg,rgba(20,31,52,0.92),rgba(10,16,29,0.88))] p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] uppercase tracking-[0.3em] text-primary/80">
                Current Count
              </p>
              <h3 className="mt-2 text-base font-semibold text-foreground">
                {buildHeadline(activeCount)}
              </h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {buildSubheadline(activeCount)}
              </p>
            </div>

            <div className="rounded-2xl border border-white/8 bg-black/20 px-3 py-2 text-right">
              <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
                Latest Pivot
              </p>
              <p className="mt-1 text-base font-semibold text-foreground">
                {activeWaveLabel ? `Wave ${activeWaveLabel}` : "Not set"}
              </p>
            </div>
          </div>

          {alternateCount ? (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary/12 bg-primary/6 px-3 py-3">
              <div className="flex items-start gap-3">
                <Layers3 className="mt-0.5 h-4 w-4 text-primary" />
                <div>
                  <p className="text-sm font-medium text-foreground">
                    Alternate wave count available
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Toggle between the primary and alternate count to compare
                    projections.
                  </p>
                </div>
              </div>
              <Button
                size="sm"
                variant={useAlternateCount ? "default" : "outline"}
                className="h-8 px-3 text-xs"
                onClick={handleAlternateToggle}
              >
                {useAlternateCount ? "Using Alternate Count" : "Show Alternate Count"}
              </Button>
            </div>
          ) : null}
        </div>

        {activeTab === "analysis" ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-white/8 bg-white/4 p-4">
                <div className="flex items-center gap-2">
                  {activeCount?.direction === "bearish" ? (
                    <TrendingDown className="h-4 w-4 text-rose-300" />
                  ) : (
                    <TrendingUp className="h-4 w-4 text-emerald-300" />
                  )}
                  <p className="text-sm font-medium text-foreground">Trend Bias</p>
                </div>
                <p className="mt-3 text-xl font-semibold text-foreground">
                  {activeCount ? capitalize(activeCount.direction) : "Neutral"}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {activeCount
                    ? `${capitalize(activeCount.pattern)} structure with ${DEGREE_LABELS[activeCount.degree].toLowerCase()}-degree pivots`
                    : "Waiting for enough wave points to define structure."}
                </p>
              </div>

              <div className="rounded-2xl border border-white/8 bg-white/4 p-4">
                <div className="flex items-center gap-2">
                  <Radar className="h-4 w-4 text-primary" />
                  <p className="text-sm font-medium text-foreground">Rule Coverage</p>
                </div>
                <p className="mt-3 text-xl font-semibold text-foreground">
                  {ruleCount ? `${ruleCount} checks` : "No checks yet"}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {activeValidation
                    ? activeValidation.hardRulePassed
                      ? "Hard Elliott rules currently hold."
                      : "One or more hard Elliott rules are broken."
                    : "Complete a five-wave or ABC structure to lock the checklist."}
                </p>
              </div>
            </div>

            <div className="space-y-3">
              {(activeValidation?.rules ?? []).length > 0 ? (
                activeValidation?.rules.map((rule) => (
                  <div
                    key={rule.id}
                    className={cn(
                      "rounded-2xl border p-4 transition-colors",
                      getRuleRowTone(rule.status),
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <div className="text-lg leading-none">{STATUS_ICON[rule.status]}</div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-semibold text-foreground">
                            {rule.label}
                          </p>
                          <Badge
                            variant="outline"
                            className="border-white/10 text-[10px] uppercase tracking-[0.16em] text-muted-foreground"
                          >
                            {rule.severity}
                          </Badge>
                        </div>
                        <p className="mt-2 text-sm leading-6 text-muted-foreground">
                          {rule.message}
                        </p>
                        <p className="mt-1 text-xs leading-5 text-muted-foreground/80">
                          {rule.detail}
                        </p>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-2xl border border-dashed border-white/10 bg-white/3 p-5 text-sm leading-6 text-muted-foreground">
                  Manual mode lets you place 1-2-3-4-5 and A-B-C pivots directly on
                  the chart. Once a complete count is present, this panel will score
                  it against Elliott Wave hard rules and Fibonacci preferences.
                </div>
              )}
            </div>
          </div>
        ) : null}

        {activeTab === "fibonacci" ? (
          <div className="space-y-3">
            <div className="rounded-2xl border border-primary/12 bg-primary/6 p-4">
              <p className="text-sm font-medium text-foreground">Fibonacci Confluence</p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {nearestFibLevel
                  ? `Nearest active level is ${nearestFibLevel.wave} at $${formatPrice(nearestFibLevel.price, pricePrecision)}.`
                  : "Complete more of the structure to lock in retracement and extension confluence."}
              </p>
            </div>

            {fibLevels.length > 0 ? (
              fibLevels.map((level) => (
                <div
                  key={level.id}
                  className={cn(
                    "rounded-2xl border p-4 transition-colors",
                    level.isActive
                      ? "border-primary/22 bg-primary/10"
                      : "border-white/8 bg-white/4",
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-foreground">{level.wave}</p>
                        <Badge
                          variant="outline"
                          className={cn(
                            "border-white/10 text-[10px] uppercase tracking-[0.16em]",
                            level.isActive ? "text-primary" : "text-muted-foreground",
                          )}
                        >
                          {level.type}
                        </Badge>
                        {level.isActive ? (
                          <Badge className="bg-primary/12 text-primary hover:bg-primary/12">
                            Active
                          </Badge>
                        ) : null}
                      </div>
                      <p className="mt-2 text-sm leading-6 text-muted-foreground">
                        {level.label}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-semibold text-foreground">
                        ${formatPrice(level.price, pricePrecision)}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {formatRatio(level.ratio) ?? "Projected"}
                      </p>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-2xl border border-dashed border-white/10 bg-white/3 p-5 text-sm leading-6 text-muted-foreground">
                Fibonacci targets will populate here after the current count has
                enough pivots to define a measurable retracement or extension.
              </div>
            )}
          </div>
        ) : null}

        {activeTab === "projection" ? (
          <div className="space-y-3">
            <div className="rounded-2xl border border-white/8 bg-white/4 p-4">
              <div className="flex items-center gap-2">
                <Target className="h-4 w-4 text-primary" />
                <p className="text-sm font-medium text-foreground">Projected Next Wave</p>
              </div>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {projectionTargets.length > 0
                  ? "These targets are derived from the current count and classic Elliott Fibonacci relationships."
                  : "Add more pivots to unlock the next-wave target stack."}
              </p>
            </div>

            {projectionTargets.length > 0 ? (
              projectionTargets.map((target) => (
                <div
                  key={target.id}
                  className={cn(
                    "rounded-2xl border p-4",
                    target.emphasis === "primary"
                      ? "border-primary/20 bg-primary/10"
                      : "border-white/8 bg-white/4",
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <ChevronRight className="h-4 w-4 text-primary" />
                        <p className="text-sm font-semibold text-foreground">
                          {target.label} target
                        </p>
                        {target.emphasis === "primary" ? (
                          <Badge className="bg-primary/12 text-primary hover:bg-primary/12">
                            Preferred
                          </Badge>
                        ) : null}
                      </div>
                      <p className="mt-2 text-sm leading-6 text-muted-foreground">
                        {target.hint}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-semibold text-foreground">
                        ${formatPrice(target.price, pricePrecision)}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {formatRatio(target.ratio) ?? "Projected"}
                      </p>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-2xl border border-dashed border-white/10 bg-white/3 p-5 text-sm leading-6 text-muted-foreground">
                The projection engine uses the current anchor, completed swings, and
                classic Elliott ratios such as 0.618, 1.000, and 1.618 to build the
                next-wave target ladder.
              </div>
            )}

            {alternateCount ? (
              <div className="rounded-2xl border border-white/8 bg-white/4 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      Alternate wave count
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Compare the alternate count’s projection ladder before placing
                      the next label.
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant={useAlternateCount ? "default" : "outline"}
                    className="h-8 px-3 text-xs"
                    onClick={handleAlternateToggle}
                  >
                    {useAlternateCount ? (
                      <>
                        <RefreshCw className="h-3.5 w-3.5" />
                        Primary Count
                      </>
                    ) : (
                      <>
                        <Layers3 className="h-3.5 w-3.5" />
                        Alternate Count
                      </>
                    )}
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="mt-auto rounded-2xl border border-white/8 bg-[rgba(7,12,23,0.9)] p-4">
          <p className="text-[11px] uppercase tracking-[0.28em] text-primary/80">
            Plotted Pivots
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {sortedWavePoints.length > 0 ? (
              sortedWavePoints.map((point) => {
                const isCorrective =
                  point.label === CORRECTIVE_LABELS[0] ||
                  point.label === CORRECTIVE_LABELS[1] ||
                  point.label === CORRECTIVE_LABELS[2];

                return (
                  <div
                    key={point.id}
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-xs font-medium",
                      isCorrective
                        ? "border-amber-300/18 bg-amber-300/8 text-amber-100"
                        : "border-sky-300/18 bg-sky-300/8 text-sky-100",
                    )}
                  >
                    {point.label} · ${formatPrice(point.price, pricePrecision)}
                  </div>
                );
              })
            ) : (
              <p className="text-sm text-muted-foreground">
                No wave points placed yet. Click the chart to begin the count.
              </p>
            )}
          </div>
          <p className="mt-3 text-xs leading-5 text-muted-foreground">
            Data from Yahoo Finance. Wave overlays and validation are computed
            locally inside HareAssets.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
