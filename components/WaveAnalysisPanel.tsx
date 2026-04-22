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
  buildWaveReactionAnalysis,
  type ConfidenceLabel,
  type ReactionValidationItem,
  type WaveReactionAnalysis,
} from "@/lib/elliottReactionEngine";
import type { ABCImprovedScenario } from "@/lib/elliottABCEngine";
import {
  buildNoTradeBadge,
  buildNoTradeEvidenceSummary,
  buildNoTradeSummary,
  buildScenarioEvidenceBadge,
  buildScenarioEvidenceSummary,
  buildScenarioRoleLabel,
  buildTargetLadderRows,
  formatHigherTimeframeAlignmentLabel,
  formatRiskClassificationLabel,
  formatSetupQualityLabel,
  formatValidationStatusShortLabel,
  formatValidationStatusLabel,
} from "@/lib/elliott-engine/evidence-presentation";
import { buildAnalysisRailSections } from "@/lib/elliott-engine/analysis-rail-presentation";
import type { NoTradeState } from "@/lib/elliott-engine/types";
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
import { getMarketFeedPresentation } from "@/lib/market-data/feed-status";
import type { MarketSnapshot } from "@/lib/market-types";
import { cn, formatPrice } from "@/lib/utils";

type TabKey = "analysis" | "fibonacci" | "projection";

type WaveAnalysisPanelData = {
  activePattern: WavePatternType | null;
  activeCount: WaveCount | null;
  activeDirection: WaveTrend;
  validation: WaveValidationResult | null;
  impulseValidation?: WaveValidationResult | null;
  correctiveValidation?: WaveValidationResult | null;
  abcScenarios?: ABCImprovedScenario[];
  abcNoTradeState?: NoTradeState | null;
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
  snapshot?: Pick<MarketSnapshot, "provider" | "source"> | null;
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

function formatReactionWaveLabel(
  currentWave: WaveReactionAnalysis["currentWave"] | null | undefined,
) {
  if (typeof currentWave === "number") {
    return `Wave ${currentWave}`;
  }

  if (currentWave) {
    return `Wave ${currentWave}`;
  }

  return "Wave Pending";
}

function formatAlternateCountAvailability(exists: boolean) {
  return exists ? "Available" : "Not available";
}

function formatScenarioComponentStrength(value: number) {
  if (value >= 75) {
    return "Strong";
  }

  if (value >= 50) {
    return "Moderate";
  }

  return "Weak";
}

function buildHeadline(count: WaveCount | null) {
  if (!count || count.points.length === 0) {
    return "Awaiting wave placement";
  }

  const latestPoint = count.points[count.points.length - 1];

  return `Wave ${latestPoint.label} - ${capitalize(count.direction)} ${capitalize(count.pattern)}`;
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
    type:
      projection.label.includes("Wave 2") ||
      projection.label.includes("Wave 4") ||
      projection.label.includes("Wave A") ||
      projection.label.includes("Wave B")
        ? "retracement"
        : "extension",
    wave: projection.label,
    isActive: projection.emphasis === "primary",
  }));
}

function getConfidenceTone(confidenceLabel?: ConfidenceLabel | null) {
  if (confidenceLabel === "High") {
    return "text-emerald-300 border-emerald-400/20 bg-emerald-400/10";
  }

  if (confidenceLabel === "Medium") {
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

function getValidationTone(status: WaveRuleStatus | "pending") {
  if (status === "pass") {
    return "text-emerald-300";
  }

  if (status === "warning" || status === "pending") {
    return "text-amber-200";
  }

  return "text-rose-200";
}

function summarizeChecklist(items: ReactionValidationItem[]) {
  if (items.length === 0) {
    return "No checks yet";
  }

  const passCount = items.filter((item) => item.status === "pass").length;
  const warningCount = items.filter((item) => item.status === "warning").length;
  const failCount = items.filter((item) => item.status === "fail").length;

  if (failCount > 0) {
    return `${passCount} pass · ${warningCount} warning · ${failCount} fail`;
  }

  return `${passCount} pass${warningCount > 0 ? ` · ${warningCount} warning` : ""}`;
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
  snapshot,
}: WaveAnalysisPanelProps) {
  const feed = getMarketFeedPresentation(snapshot);
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

    if (!activeCount || !waveAnalysis) {
      return null;
    }

    if (activeCount.pattern === "impulse") {
      return waveAnalysis.impulseValidation ?? waveAnalysis.validation ?? null;
    }

    return waveAnalysis.correctiveValidation ?? waveAnalysis.validation ?? null;
  }, [activeCount, alternateCount, alternateValidation, useAlternateCount, waveAnalysis]);

  const reactionAnalysis = useMemo(
    () => buildWaveReactionAnalysis(activeCount, activeValidation),
    [activeCount, activeValidation],
  );
  const primaryZone = reactionAnalysis?.primaryZone ?? null;
  const alternateZone = reactionAnalysis?.alternateZones[0] ?? null;
  const abcScenarios = waveAnalysis?.abcScenarios ?? [];
  const abcNoTradeState = waveAnalysis?.abcNoTradeState ?? null;
  const primaryABCScenario = abcScenarios[0] ?? null;
  const alternateABCScenario =
    abcScenarios.find((scenario) => scenario.scenarioRole === "alternate") ?? null;
  const sortedWavePoints = useMemo(() => sortWavePoints(wavePoints), [wavePoints]);
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
  const alternatePatternLabel = alternateCount ? capitalize(alternateCount.pattern) : "Alternate";
  const isPatternComparison =
    Boolean(activeCount && alternateCount) && activeCount?.pattern !== alternateCount?.pattern;
  const hardRules = reactionAnalysis?.validation.hardRules ?? [];
  const guidelines = reactionAnalysis?.validation.guidelines ?? [];
  const ruleCount = hardRules.length + guidelines.length;
  const currentWaveLabel = formatReactionWaveLabel(reactionAnalysis?.currentWave);
  const reactionLabel = reactionAnalysis
    ? `${currentWaveLabel} ${capitalize(reactionAnalysis.reactionType)} Cluster`
    : "Reaction zone pending";
  const analysisRailSections = useMemo(
    () =>
      buildAnalysisRailSections({
        activeCount,
        reactionAnalysis,
        primaryScenario: primaryABCScenario,
        alternateScenario: alternateABCScenario,
        noTradeState: abcNoTradeState,
        pricePrecision,
      }),
    [
      abcNoTradeState,
      activeCount,
      alternateABCScenario,
      pricePrecision,
      primaryABCScenario,
      reactionAnalysis,
    ],
  );
  const confirmationSection = analysisRailSections.find(
    (section) => section.key === "confirmation",
  );
  const handleAlternateToggle = () => {
    const nextValue = !useAlternateCount;
    setUseAlternateCount(nextValue);
    onToggleAlternateCount?.(nextValue);
  };

  return (
    <Card
      className={cn(
        "flex h-full min-h-[540px] flex-col overflow-hidden border-white/8 bg-[linear-gradient(180deg,rgba(11,17,30,0.98),rgba(7,11,21,0.98))]",
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
              Reaction-zone scoring, Elliott rule validation, and deterministic
              invalidation built from the current plotted pivots.
            </CardDescription>
          </div>

          <div className="flex flex-col items-end gap-2">
            <div
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-semibold tracking-[0.08em]",
                abcNoTradeState
                  ? "border-rose-300/25 bg-rose-300/10 text-rose-100"
                  : primaryABCScenario
                  ? "border-amber-300/25 bg-amber-300/10 text-amber-100"
                  : getConfidenceTone(primaryZone?.confidenceLabel ?? null),
              )}
            >
              {abcNoTradeState
                ? buildNoTradeBadge(abcNoTradeState)
                : primaryABCScenario
                ? buildScenarioEvidenceBadge(primaryABCScenario)
                : primaryZone
                ? `${primaryZone.confidenceLabel} setup quality`
                : "Awaiting scored zone"}
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
          <div className="flex flex-col gap-3">
            <div>
              <p className="text-[11px] uppercase tracking-[0.3em] text-primary/80">
                Current Count
              </p>
              <h3 className="mt-2 text-base font-semibold text-foreground">
                {abcNoTradeState
                  ? abcNoTradeState.title
                  : primaryABCScenario
                    ? primaryABCScenario.name
                    : buildHeadline(activeCount)}
              </h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {abcNoTradeState
                  ? buildNoTradeSummary(abcNoTradeState)
                  : primaryABCScenario
                    ? primaryABCScenario.label
                    : buildSubheadline(activeCount)}
              </p>
            </div>

            <div className="space-y-2">
              {analysisRailSections.map((section, index) => (
                <div
                  key={section.key}
                  className={cn(
                    "rounded-2xl border px-3 py-3",
                    index === 0
                      ? "border-primary/18 bg-primary/8"
                      : section.key === "edge-status" && abcNoTradeState
                        ? "border-rose-300/16 bg-rose-300/7"
                        : "border-white/8 bg-black/20",
                  )}
                >
                  <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
                    {section.label}
                  </p>
                  <p className="mt-2 text-sm font-semibold leading-6 text-foreground">
                    {section.title}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    {section.detail}
                  </p>
                </div>
              ))}
            </div>

            {abcNoTradeState ? (
              <div className="rounded-2xl border border-rose-300/18 bg-rose-300/8 p-3">
                <p className="text-[11px] uppercase tracking-[0.24em] text-rose-100/80">
                  Stand Aside Detail
                </p>
                <p className="mt-2 text-sm font-semibold text-foreground">
                  {abcNoTradeState.title}
                </p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  {buildNoTradeEvidenceSummary(abcNoTradeState)}
                </p>
                <div className="mt-3 space-y-2">
                  {abcNoTradeState.reasonDetails.slice(0, 3).map((reason) => (
                    <div
                      key={`no-trade-${reason.code}`}
                      className="rounded-xl border border-white/8 bg-black/15 px-3 py-2"
                    >
                      <p className="text-sm font-medium text-foreground">{reason.label}</p>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">
                        {reason.detail}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          {abcScenarios.length > 0 ? (
            <div className="mt-4 rounded-2xl border border-amber-300/18 bg-amber-300/8 p-3">
              <p className="text-[11px] uppercase tracking-[0.24em] text-amber-100/80">
                Scenario Stack
              </p>
              <div className="mt-3 space-y-2">
                {abcScenarios.slice(0, 3).map((scenario) => (
                  <div
                    key={`summary-${scenario.id}`}
                    className="rounded-xl border border-white/8 bg-black/15 px-3 py-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium leading-5 text-foreground">
                          {buildScenarioRoleLabel(scenario)} · {scenario.name}
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {scenario.structureLabel} ·{" "}
                          {formatValidationStatusShortLabel(
                            scenario.evidence.validationStatus,
                          )}
                        </p>
                      </div>
                      <span className="shrink-0 text-xs font-semibold text-amber-100">
                        {formatSetupQualityLabel(scenario.evidence.setupQuality)}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span className="rounded-full border border-white/8 bg-white/5 px-2 py-1">
                        Invalidation: ${formatPrice(scenario.invalidationLevel, pricePrecision)}
                      </span>
                      <span className="rounded-full border border-white/8 bg-white/5 px-2 py-1">
                        {formatRiskClassificationLabel(scenario.evidence.riskClassification)}
                      </span>
                      {scenario.relativeStrength ? (
                        <span className="rounded-full border border-white/8 bg-white/5 px-2 py-1">
                          {scenario.relativeStrength === "close"
                            ? "Close challenger"
                            : scenario.relativeStrength === "weaker"
                              ? "Weaker alternate"
                              : "Clearly weaker"}
                        </span>
                      ) : null}
                    </div>
                    {scenario.promotionCondition ? (
                      <p className="mt-2 text-xs leading-5 text-muted-foreground/85">
                        Promotion: {scenario.promotionCondition.reason}
                      </p>
                    ) : abcScenarios.length === 1 ? (
                      <p className="mt-2 text-xs leading-5 text-muted-foreground/85">
                        Only one valid corrective scenario is currently supported by the active pivot sequence.
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>
              {primaryABCScenario?.targets.length ? (
                <div className="mt-3 rounded-xl border border-white/8 bg-black/15 p-3">
                  <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                    Wave C Target Ladder
                  </p>
                  <div className="mt-2 space-y-1.5">
                    {buildTargetLadderRows(primaryABCScenario)
                      .slice(0, 4)
                      .map((target) => (
                      <div
                        key={`summary-target-${target.fibRatio}-${target.price}`}
                        className="flex items-center justify-between gap-3 text-xs"
                      >
                        <span className="font-medium text-foreground">{target.fibRatio}</span>
                        <span className="text-muted-foreground">
                          ${formatPrice(target.price, pricePrecision)}
                        </span>
                        <span className="font-semibold text-amber-100">
                          {target.emphasis}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          {alternateCount ? (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary/12 bg-primary/6 px-3 py-3">
              <div className="flex items-start gap-3">
                <Layers3 className="mt-0.5 h-4 w-4 text-primary" />
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {isPatternComparison
                      ? `${alternatePatternLabel} count detected`
                      : "Alternate wave count available"}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {isPatternComparison
                      ? "Switch between the detected impulse and corrective structures to compare their rule checks and reaction zones."
                      : "Toggle between the primary and alternate count to compare scenarios."}
                  </p>
                </div>
              </div>
              <Button
                size="sm"
                variant={useAlternateCount ? "default" : "outline"}
                className="h-8 px-3 text-xs"
                onClick={handleAlternateToggle}
              >
                {useAlternateCount
                  ? `Showing ${alternatePatternLabel}`
                  : `Show ${alternatePatternLabel}`}
              </Button>
            </div>
          ) : null}
        </div>

        {activeTab === "analysis" ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3">
              <div className="min-w-0 rounded-2xl border border-white/8 bg-white/4 p-4">
                <div className="flex items-center gap-2">
                  {abcNoTradeState ? (
                    <Radar className="h-4 w-4 text-amber-200" />
                  ) : activeCount?.direction === "bearish" ? (
                    <TrendingDown className="h-4 w-4 text-rose-300" />
                  ) : (
                    <TrendingUp className="h-4 w-4 text-emerald-300" />
                  )}
                  <p className="text-sm font-medium text-foreground">Trend Bias</p>
                </div>
                <p className="mt-3 break-words text-lg font-semibold leading-tight text-foreground">
                  {abcNoTradeState
                    ? "No clear edge"
                    : activeCount
                      ? capitalize(activeCount.direction)
                      : "Neutral"}
                </p>
                <p className="mt-1 break-words text-sm leading-6 text-muted-foreground">
                  {abcNoTradeState
                    ? buildNoTradeSummary(abcNoTradeState)
                    : activeCount
                      ? `${capitalize(activeCount.pattern)} structure with ${DEGREE_LABELS[activeCount.degree].toLowerCase()}-degree pivots`
                      : "Waiting for enough wave points to define structure."}
                </p>
              </div>

              <div className="min-w-0 rounded-2xl border border-white/8 bg-white/4 p-4">
                <div className="flex items-center gap-2">
                  <Target className="h-4 w-4 text-primary" />
                  <p className="text-sm font-medium text-foreground">Next Confirmation</p>
                </div>
                <p className="mt-3 break-words text-lg font-semibold leading-tight text-foreground">
                  {abcNoTradeState
                    ? confirmationSection?.title ?? "Awaiting confirmation"
                    : primaryABCScenario
                      ? confirmationSection?.title ?? "Awaiting confirmation"
                      : reactionAnalysis
                        ? capitalize(reactionAnalysis.reactionType)
                        : "Pending"}
                </p>
                <p className="mt-1 break-words text-sm leading-6 text-muted-foreground">
                  {abcNoTradeState
                    ? confirmationSection?.detail ??
                      "Wait for a cleaner break or stronger structural confirmation."
                    : primaryABCScenario
                      ? confirmationSection?.detail ??
                        "The active scenario still needs a cleaner confirmation trigger."
                      : reactionAnalysis
                        ? `${currentWaveLabel} is being scored as a ${reactionAnalysis.reactionType} zone.`
                        : "Add more pivots to identify the next actionable reaction cluster."}
                </p>
              </div>

              <div className="min-w-0 rounded-2xl border border-white/8 bg-white/4 p-4">
                <div className="flex items-center gap-2">
                  <Radar className="h-4 w-4 text-primary" />
                  <p className="text-sm font-medium text-foreground">Rule Validation</p>
                </div>
                <p className="mt-3 break-words text-lg font-semibold leading-tight text-foreground">
                  {ruleCount ? `${ruleCount} checks` : "No checks yet"}
                </p>
                <p className="mt-1 break-words text-sm leading-6 text-muted-foreground">
                  {reactionAnalysis
                    ? summarizeChecklist(hardRules)
                    : "Complete more of the sequence to unlock the full Elliott checklist."}
                </p>
              </div>
            </div>

            <div className="rounded-2xl border border-white/8 bg-white/4 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <Target className="h-4 w-4 text-primary" />
                    <p className="text-sm font-medium text-foreground">Primary Zone</p>
                  </div>
                  <p className="mt-2 text-base font-semibold text-foreground">
                    {primaryZone ? reactionLabel : "Reaction zone pending"}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {primaryZone
                      ? primaryZone.reasonSummary
                      : "The zone engine turns on once there is enough wave structure to score confluence."}
                  </p>
                </div>
                {primaryZone ? (
                  <Badge className={cn("border px-3 py-1 text-xs font-semibold", getConfidenceTone(primaryZone.confidenceLabel))}>
                    {`${primaryZone.confidenceLabel} setup`}
                  </Badge>
                ) : null}
              </div>

              {primaryZone ? (
                <>
                  <div className="mt-4 grid grid-cols-1 gap-3">
                    <div className="rounded-2xl border border-white/8 bg-[rgba(255,255,255,0.03)] p-3">
                      <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
                        Zone Range
                      </p>
                      <p className="mt-2 text-base font-semibold text-foreground">
                        ${formatPrice(primaryZone.low, pricePrecision)} - ${formatPrice(primaryZone.high, pricePrecision)}
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {`${primaryZone.confidenceLabel} setup quality`}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-white/8 bg-[rgba(255,255,255,0.03)] p-3">
                      <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
                        Invalidation
                      </p>
                      <p className="mt-2 text-base font-semibold text-foreground">
                        {reactionAnalysis?.invalidation
                          ? `$${formatPrice(reactionAnalysis.invalidation.level, pricePrecision)}`
                          : "Pending"}
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {reactionAnalysis?.invalidation?.rule ?? "Waiting for enough structure to lock the invalidation rule."}
                      </p>
                    </div>
                  </div>

                  {primaryZone.reasons.length > 0 ? (
                    <div className="mt-4 rounded-2xl border border-white/8 bg-[rgba(255,255,255,0.03)] p-3">
                      <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
                        Why This Zone Matters
                      </p>
                      <div className="mt-3 space-y-2">
                        {primaryZone.reasons.map((reason) => (
                          <div key={reason} className="flex items-start gap-2 text-sm text-muted-foreground">
                            <ChevronRight className="mt-0.5 h-3.5 w-3.5 text-primary" />
                            <span>{reason}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  <details className="mt-4 rounded-2xl border border-white/8 bg-[rgba(255,255,255,0.03)] p-3">
                    <summary className="cursor-pointer list-none text-sm font-medium text-foreground">
                      Confluence Breakdown
                    </summary>
                    <div className="mt-3 space-y-2">
                      {primaryZone.scoreBreakdown.map((entry) => (
                        <div
                          key={entry.label}
                          className="flex items-center justify-between gap-3 rounded-xl border border-white/6 bg-black/10 px-3 py-2"
                        >
                          <span className="text-sm text-muted-foreground">{entry.label}</span>
                          <span className="text-sm font-semibold text-foreground">
                            {entry.value >= 0.75
                              ? "Strong"
                              : entry.value >= 0.5
                                ? "Moderate"
                                : "Weak"}
                          </span>
                        </div>
                      ))}
                    </div>
                  </details>
                </>
              ) : null}
            </div>

            <div className="grid grid-cols-1 gap-3">
              <div className="rounded-2xl border border-white/8 bg-white/4 p-4">
                <div className="flex items-center gap-2">
                  <Layers3 className="h-4 w-4 text-primary" />
                  <p className="text-sm font-medium text-foreground">Alternate Scenario</p>
                </div>
                {alternateZone ? (
                  <>
                    <p className="mt-3 text-base font-semibold text-foreground">
                      {alternateZone.label}
                    </p>
                    <p className="mt-2 text-sm text-muted-foreground">
                      ${formatPrice(alternateZone.low, pricePrecision)} - ${formatPrice(alternateZone.high, pricePrecision)}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {alternateZone.confidenceLabel} setup quality
                    </p>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {alternateZone.reasonSummary}
                    </p>
                    <p className="mt-2 text-xs leading-5 text-muted-foreground/80">
                      {alternateZone.invalidation?.explanation ?? "Use the same invalidation as the primary scenario until the count evolves."}
                    </p>
                  </>
                ) : (
                  <p className="mt-3 text-sm leading-6 text-muted-foreground">
                    The alternate scenario appears once the current count has at least one secondary confluence cluster worth tracking.
                  </p>
                )}
              </div>

              <div className="rounded-2xl border border-white/8 bg-white/4 p-4">
                <div className="flex items-center gap-2">
                  <RefreshCw className="h-4 w-4 text-primary" />
                  <p className="text-sm font-medium text-foreground">Invalidation</p>
                </div>
                {reactionAnalysis?.invalidation ? (
                  <>
                    <p className="mt-3 text-base font-semibold text-foreground">
                      ${formatPrice(reactionAnalysis.invalidation.level, pricePrecision)}
                    </p>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {reactionAnalysis.invalidation.rule}
                    </p>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground/80">
                      {reactionAnalysis.invalidation.explanation}
                    </p>
                  </>
                ) : (
                  <p className="mt-3 text-sm leading-6 text-muted-foreground">
                    Invalidation becomes explicit once the next projected wave has enough context.
                  </p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4">
              <div className="space-y-3">
                <div className="rounded-2xl border border-white/8 bg-white/4 p-4">
                  <p className="text-sm font-medium text-foreground">Hard Rules</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    These are the non-negotiable Elliott rules for the active count.
                  </p>
                </div>

                {hardRules.length > 0 ? (
                  hardRules.map((rule) => (
                    <div
                      key={rule.label}
                      className={cn(
                        "rounded-2xl border p-4 transition-colors",
                        getRuleRowTone(rule.status),
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <div className="text-lg leading-none">{STATUS_ICON[rule.status]}</div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-semibold text-foreground">{rule.label}</p>
                            <Badge
                              variant="outline"
                              className={cn(
                                "border-white/10 text-[10px] uppercase tracking-[0.16em]",
                                getValidationTone(rule.status),
                              )}
                            >
                              {rule.status}
                            </Badge>
                          </div>
                          {rule.detail ? (
                            <p className="mt-2 text-sm leading-6 text-muted-foreground">
                              {rule.detail}
                            </p>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-2xl border border-dashed border-white/10 bg-white/3 p-5 text-sm leading-6 text-muted-foreground">
                    Place more pivots to unlock the hard-rule checklist.
                  </div>
                )}
              </div>

              <div className="space-y-3">
                <div className="rounded-2xl border border-white/8 bg-white/4 p-4">
                  <p className="text-sm font-medium text-foreground">Guidelines</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    These checks capture alternation, Fibonacci quality, and reaction-zone confluence.
                  </p>
                </div>

                {guidelines.length > 0 ? (
                  guidelines.map((rule) => (
                    <div
                      key={rule.label}
                      className={cn(
                        "rounded-2xl border p-4 transition-colors",
                        getRuleRowTone(rule.status),
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <div className="text-lg leading-none">{STATUS_ICON[rule.status]}</div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-semibold text-foreground">{rule.label}</p>
                            <Badge
                              variant="outline"
                              className={cn(
                                "border-white/10 text-[10px] uppercase tracking-[0.16em]",
                                getValidationTone(rule.status),
                              )}
                            >
                              {rule.status}
                            </Badge>
                          </div>
                          {rule.detail ? (
                            <p className="mt-2 text-sm leading-6 text-muted-foreground">
                              {rule.detail}
                            </p>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-2xl border border-dashed border-white/10 bg-white/3 p-5 text-sm leading-6 text-muted-foreground">
                    Guideline checks appear once the count has enough structure to score fib and confluence quality.
                  </div>
                )}
              </div>
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
              {primaryZone ? (
                <p className="mt-2 text-xs leading-5 text-muted-foreground/80">
                  Primary reaction zone: ${formatPrice(primaryZone.low, pricePrecision)} - ${formatPrice(primaryZone.high, pricePrecision)} · {primaryZone.reasonSummary}
                </p>
              ) : null}
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
                Fibonacci targets will populate here after the current count has enough pivots to define a measurable retracement or extension.
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
                {primaryZone
                  ? `${reactionLabel} is currently the preferred scenario. Setup quality is derived from fib confluence, prior structure, channel alignment, round-number proximity, and rule quality.`
                  : "Add more pivots to unlock the next-wave reaction zone."}
              </p>
            </div>

            {primaryZone ? (
              <div className="rounded-2xl border border-primary/20 bg-primary/10 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-foreground">{reactionLabel}</p>
                    <p className="mt-2 text-sm text-muted-foreground">
                      ${formatPrice(primaryZone.low, pricePrecision)} - ${formatPrice(primaryZone.high, pricePrecision)}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {primaryZone.reasonSummary}
                    </p>
                  </div>
                  <Badge className={cn("border px-3 py-1 text-xs font-semibold", getConfidenceTone(primaryZone.confidenceLabel))}>
                    {`${primaryZone.confidenceLabel} setup`}
                  </Badge>
                </div>
              </div>
            ) : null}

            {alternateZone ? (
              <div className="rounded-2xl border border-white/8 bg-white/4 p-4">
                <p className="text-sm font-semibold text-foreground">Alternate Scenario</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  {alternateZone.label} · ${formatPrice(alternateZone.low, pricePrecision)} - ${formatPrice(alternateZone.high, pricePrecision)}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {alternateZone.confidenceLabel} setup · {alternateZone.reasonSummary}
                </p>
              </div>
            ) : null}

            {reactionAnalysis?.invalidation ? (
              <div className="rounded-2xl border border-white/8 bg-white/4 p-4">
                <p className="text-sm font-semibold text-foreground">Invalidation</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  ${formatPrice(reactionAnalysis.invalidation.level, pricePrecision)}
                </p>
                <p className="mt-1 text-sm leading-6 text-muted-foreground/80">
                  {reactionAnalysis.invalidation.explanation}
                </p>
              </div>
            ) : null}

            {primaryABCScenario ? (
              <div className="rounded-2xl border border-amber-300/18 bg-amber-300/8 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      Evidence Breakdown
                    </p>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                      {primaryABCScenario.label}
                    </p>
                  </div>
                  <Badge className="border border-amber-300/20 bg-amber-300/10 text-amber-100 hover:bg-amber-300/10">
                    {formatSetupQualityLabel(primaryABCScenario.evidence.setupQuality)}
                  </Badge>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-2">
                  <div className="rounded-xl border border-white/8 bg-black/15 px-3 py-2 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-muted-foreground">Validation</span>
                      <span className="font-semibold text-foreground">
                        {formatValidationStatusLabel(primaryABCScenario.evidence.validationStatus)}
                      </span>
                    </div>
                  </div>
                  <div className="rounded-xl border border-white/8 bg-black/15 px-3 py-2 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-muted-foreground">Higher timeframe</span>
                      <span className="font-semibold text-foreground">
                        {formatHigherTimeframeAlignmentLabel(primaryABCScenario.evidence.higherTimeframeAlignment)}
                      </span>
                    </div>
                  </div>
                  <div className="rounded-xl border border-white/8 bg-black/15 px-3 py-2 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-muted-foreground">Risk type</span>
                      <span className="font-semibold text-foreground">
                        {formatRiskClassificationLabel(primaryABCScenario.evidence.riskClassification)}
                      </span>
                    </div>
                  </div>
                  <div className="rounded-xl border border-white/8 bg-black/15 px-3 py-2 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-muted-foreground">Evidence summary</span>
                      <span className="font-semibold text-foreground">
                        {buildScenarioEvidenceSummary(primaryABCScenario)}
                      </span>
                    </div>
                  </div>
                  <div className="rounded-xl border border-white/8 bg-black/15 px-3 py-2 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-muted-foreground">Alternate count</span>
                      <span className="font-semibold text-foreground">
                        {formatAlternateCountAvailability(
                          primaryABCScenario.evidence.alternateCountExists,
                        )}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="mt-4 rounded-xl border border-white/8 bg-black/15 p-3">
                  <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                    Evidence Checks
                  </p>
                  <div className="mt-3 space-y-2">
                    {primaryABCScenario.evidence.evidenceChecks
                      .slice(0, 5)
                      .map((check) => (
                        <div
                          key={`${check.label}-${check.status}`}
                          className="rounded-xl border border-white/8 bg-white/4 px-3 py-2"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-sm font-medium text-foreground">
                              {check.label}
                            </span>
                            <Badge
                              variant="outline"
                              className={cn(
                                "border-white/10 text-[10px] uppercase tracking-[0.16em]",
                                getValidationTone(check.status),
                              )}
                            >
                              {check.status}
                            </Badge>
                          </div>
                          <p className="mt-1 text-xs leading-5 text-muted-foreground">
                            {check.detail}
                          </p>
                        </div>
                      ))}
                  </div>
                </div>

                <div className="mt-4 rounded-xl border border-white/8 bg-black/15 p-3">
                  <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                    Scenario Components
                  </p>
                  <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {primaryABCScenario.scoreComponents.map((component) => (
                      <div
                        key={`component-${component.key}`}
                        className="rounded-xl border border-white/8 bg-white/4 px-3 py-2"
                      >
                        <p className="text-xs text-muted-foreground">{component.label}</p>
                        <p className="mt-1 text-sm font-semibold text-foreground">
                          {formatScenarioComponentStrength(component.value)}
                        </p>
                      </div>
                    ))}
                  </div>
                  {primaryABCScenario.promotionCondition ? (
                    <p className="mt-3 text-xs leading-5 text-muted-foreground/85">
                      Promotion: {primaryABCScenario.promotionCondition.reason}
                    </p>
                  ) : null}
                </div>

                <div className="mt-4 space-y-2">
                  {buildTargetLadderRows(primaryABCScenario).map((target) => (
                    <div
                      key={`${target.fibRatio}-${target.price}`}
                      className="flex items-center justify-between gap-3 rounded-xl border border-white/8 bg-black/15 px-3 py-2"
                    >
                      <div>
                        <p className="text-sm font-medium text-foreground">
                          {target.fibRatio}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {target.emphasis}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold text-foreground">
                          ${formatPrice(target.price, pricePrecision)}
                        </p>
                        <p className="text-xs text-amber-100">{target.emphasis}</p>
                      </div>
                    </div>
                  ))}
                </div>

                <p className="mt-3 text-xs leading-5 text-muted-foreground">
                  Invalidation: ${formatPrice(primaryABCScenario.invalidationLevel, pricePrecision)}
                </p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  {formatHigherTimeframeAlignmentLabel(primaryABCScenario.evidence.higherTimeframeAlignment)} · {formatRiskClassificationLabel(primaryABCScenario.evidence.riskClassification)}
                </p>
              </div>
            ) : null}

            {abcNoTradeState ? (
              <div className="rounded-2xl border border-rose-300/18 bg-rose-300/8 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      No Validated Directional Edge
                    </p>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                      {buildNoTradeSummary(abcNoTradeState)}
                    </p>
                  </div>
                  <Badge className="border border-rose-300/20 bg-rose-300/10 text-rose-100 hover:bg-rose-300/10">
                    {abcNoTradeState.expectedToResolveWithMoreData
                      ? "Awaiting confirmation"
                      : "Stand aside"}
                  </Badge>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-2">
                  <div className="rounded-xl border border-white/8 bg-black/15 px-3 py-2 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-muted-foreground">Evidence summary</span>
                      <span className="font-semibold text-foreground">
                        {buildNoTradeEvidenceSummary(abcNoTradeState)}
                      </span>
                    </div>
                  </div>
                  <div className="rounded-xl border border-white/8 bg-black/15 px-3 py-2 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-muted-foreground">Expected to resolve</span>
                      <span className="font-semibold text-foreground">
                        {abcNoTradeState.expectedToResolveWithMoreData ? "Yes" : "Not yet"}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="mt-4 rounded-xl border border-white/8 bg-black/15 p-3">
                  <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                    Why The Engine Is Standing Aside
                  </p>
                  <div className="mt-3 space-y-2">
                    {abcNoTradeState.reasonDetails.map((reason) => (
                      <div
                        key={`analysis-no-trade-${reason.code}`}
                        className="rounded-xl border border-white/8 bg-white/4 px-3 py-2"
                      >
                        <p className="text-sm font-medium text-foreground">{reason.label}</p>
                        <p className="mt-1 text-xs leading-5 text-muted-foreground">
                          {reason.detail}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                {abcNoTradeState.confirmationNeeded.length > 0 ? (
                  <div className="mt-4 rounded-xl border border-white/8 bg-black/15 p-3">
                    <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                      What Would Improve The Read
                    </p>
                    <div className="mt-3 space-y-2">
                      {abcNoTradeState.confirmationNeeded.map((item) => (
                        <div
                          key={`confirmation-${item.label}-${item.level ?? "na"}`}
                          className="rounded-xl border border-white/8 bg-white/4 px-3 py-2"
                        >
                          <p className="text-sm font-medium text-foreground">{item.label}</p>
                          <p className="mt-1 text-xs leading-5 text-muted-foreground">
                            {item.detail}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}

            {abcScenarios.length > 0 ? (
              <div className="rounded-2xl border border-white/8 bg-white/4 p-4">
                <p className="text-sm font-semibold text-foreground">
                  Scenario Comparison
                </p>
                <div className="mt-3 space-y-2">
                  {abcScenarios.slice(0, 3).map((scenario) => (
                    <div
                      key={scenario.id}
                      className="rounded-xl border border-white/8 bg-black/15 px-3 py-2"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-medium text-foreground">
                          {buildScenarioRoleLabel(scenario)} · {scenario.name}
                        </p>
                        <span className="text-xs font-semibold text-amber-100">
                          {formatSetupQualityLabel(scenario.evidence.setupQuality)}
                        </span>
                      </div>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">
                        {scenario.reason}
                      </p>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground/80">
                        {scenario.label}
                      </p>
                      {scenario.promotionCondition ? (
                        <p className="mt-1 text-xs leading-5 text-muted-foreground/80">
                          Promotion: {scenario.promotionCondition.reason}
                        </p>
                      ) : null}
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span className="rounded-full border border-white/8 bg-white/5 px-2 py-1">
                          Invalidation: ${formatPrice(scenario.invalidationLevel, pricePrecision)}
                        </span>
                        <span className="rounded-full border border-white/8 bg-white/5 px-2 py-1">
                          {formatValidationStatusLabel(scenario.evidence.validationStatus)}
                        </span>
                        <span className="rounded-full border border-white/8 bg-white/5 px-2 py-1">
                          {formatRiskClassificationLabel(scenario.evidence.riskClassification)}
                        </span>
                      </div>
                      <div className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                        {scenario.scoreComponents.slice(0, 4).map((component) => (
                          <div
                            key={`${scenario.id}-${component.key}`}
                            className="rounded-lg border border-white/8 bg-white/4 px-2 py-1.5 text-xs"
                          >
                            <p className="text-muted-foreground">{component.label}</p>
                            <p className="mt-1 font-semibold text-foreground">
                              {formatScenarioComponentStrength(component.value)}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

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
                The projection engine uses the current anchor, completed swings, and classic Elliott ratios such as 0.618, 1.000, and 1.618 to build the next-wave target ladder.
              </div>
            )}
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
            {feed.description} Wave overlays, reaction zones, and validation are
            computed locally inside HareAssets.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
