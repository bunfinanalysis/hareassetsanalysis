"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  LineStyle,
  createChart,
  type AutoscaleInfo,
  type CandlestickData,
  type IChartApi,
  type ISeriesApi,
  type MouseEventParams,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  autoDetectWaveCount,
  buildWaveCount,
  CORRECTIVE_LABELS,
  createWavePoint,
  getWaveFutureProjection,
  IMPULSE_LABELS,
  sortWavePoints,
  validateWaveCount,
  type FibonacciLevel,
  type WaveCount,
  type WaveLabel,
  type WavePatternType,
  type WavePoint,
  type WaveTrend,
} from "@/lib/elliottWaveUtils";
import {
  buildWaveReactionAnalysis,
  type ConfidenceLabel,
  type ReactionType,
} from "@/lib/elliottReactionEngine";
import { cn } from "@/lib/utils";
import { METAL_SYMBOLS, type Candle, type MetalSymbolCode } from "@/lib/market-types";

type MetalChartProps = {
  candles: Candle[];
  isLoading: boolean;
  symbol: MetalSymbolCode;
  timeframeLabel: string;
  wavePoints?: WavePoint[];
  onWavePointsChange?: (wavePoints: WavePoint[]) => void;
  interactionMode?: InteractionMode;
  onInteractionModeChange?: (mode: InteractionMode) => void;
  onWaveAnalysisChange?: (waveAnalysis: WaveAnalysis) => void;
  onAlternateCountChange?: (
    alternateCount: WaveCount | null,
    alternateValidation: ReturnType<typeof validateWaveCount> | null,
  ) => void;
};

type InteractionMode = "manual" | "auto";
type ManualWaveMode = "impulse" | "corrective";

type OverlayWavePoint = {
  id: string;
  label: WaveLabel;
  displayLabel: string;
  price: number;
  time: number;
  x: number;
  y: number;
  color: string;
  labelOffsetY: number;
  labelWidth: number;
  labelHeight: number;
};

type OverlayGeometry = {
  width: number;
  height: number;
  impulsePoints: OverlayWavePoint[];
  correctivePoints: OverlayWavePoint[];
  fibonacciLevels: Array<FibonacciLevel & { y: number }>;
  probabilityZones: OverlayProbabilityZone[];
  correctivePrediction: OverlayCorrectivePrediction | null;
  retracementBarrier: OverlayRetracementBarrier | null;
};

type WaveAnalysis = {
  impulsePoints: WavePoint[];
  correctivePoints: WavePoint[];
  impulseCount: WaveCount | null;
  impulseValidation: ReturnType<typeof validateWaveCount> | null;
  correctiveCount: WaveCount | null;
  correctiveValidation: ReturnType<typeof validateWaveCount> | null;
  activePattern: WavePatternType | null;
  activeCount: WaveCount | null;
  activeDirection: WaveTrend;
  validation: ReturnType<typeof validateWaveCount> | null;
};

export type MetalChartInteractionMode = InteractionMode;
export type MetalChartWaveAnalysis = WaveAnalysis;

type ProbabilityZoneTarget = {
  id: string;
  pattern: WavePatternType;
  label: string;
  priceLow: number;
  priceHigh: number;
  centerPrice: number;
  confidence: number;
  confidenceLabel: ConfidenceLabel;
  reactionType: ReactionType;
  reasonSummary: string;
  reasons: string[];
  invalidationLevel?: number;
};

type OverlayProbabilityZone = ProbabilityZoneTarget & {
  topY: number;
  bottomY: number;
  centerY: number;
};

type CorrectivePredictionTarget = {
  id: string;
  label: string;
  startTime: number;
  startPrice: number;
  targetPrice: number;
  zoneLow: number;
  zoneHigh: number;
  confidence: number;
  confidenceLabel: ConfidenceLabel;
  reasonSummary: string;
  reasons: string[];
  invalidationLevel?: number;
};

type OverlayCorrectivePrediction = CorrectivePredictionTarget & {
  startX: number;
  startY: number;
  targetX: number;
  targetY: number;
};

type RetracementBarrierLevel = {
  id: string;
  ratio: number;
  price: number;
  label: string;
  emphasis?: "primary" | "secondary";
};

type RetracementBarrierTarget = {
  id: string;
  kind: "resistance" | "support";
  wave: string;
  label: string;
  priceLow: number;
  priceHigh: number;
  centerPrice: number;
  confidence: number;
  levels: RetracementBarrierLevel[];
};

type OverlayRetracementBarrier = Omit<RetracementBarrierTarget, "levels"> & {
  topY: number;
  bottomY: number;
  centerY: number;
  levels: Array<RetracementBarrierLevel & { y: number }>;
};

type OverlayPriceExtents = {
  min: number;
  max: number;
};

const IMPULSE_COLOR = "#3b82f6";
const CORRECTIVE_COLOR = "#f59e0b";
const FIB_LINE_COLOR = "rgba(216, 168, 77, 0.6)";
const LABEL_BACKGROUND_FILL = "rgba(6, 17, 31, 0.9)";
const LABEL_BACKGROUND_STROKE = "rgba(255, 255, 255, 0.08)";
const EMPTY_OVERLAY: OverlayGeometry = {
  width: 0,
  height: 0,
  impulsePoints: [],
  correctivePoints: [],
  fibonacciLevels: [],
  probabilityZones: [],
  correctivePrediction: null,
  retracementBarrier: null,
};

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}

function isImpulseLabel(label: WaveLabel) {
  return (
    label === "1" ||
    label === "2" ||
    label === "3" ||
    label === "4" ||
    label === "5"
  );
}

function isCorrectiveLabel(label: WaveLabel) {
  return label === "A" || label === "B" || label === "C";
}

function inferDirectionFromSequence(points: WavePoint[]): WaveTrend {
  if (points.length < 2) {
    return "bullish";
  }

  return points[1].price < points[0].price ? "bullish" : "bearish";
}

function findNearestCandleIndexByTime(candles: Candle[], time: number) {
  if (candles.length === 0) {
    return -1;
  }

  let closestIndex = 0;
  let smallestDistance = Math.abs(candles[0].time - time);

  for (let index = 1; index < candles.length; index += 1) {
    const distance = Math.abs(candles[index].time - time);

    if (distance < smallestDistance) {
      smallestDistance = distance;
      closestIndex = index;
    }
  }

  return closestIndex;
}

function inferAnchorFromCandles(
  points: WavePoint[],
  candles: Candle[],
  direction: WaveTrend,
) {
  if (points.length === 0 || candles.length === 0) {
    return undefined;
  }

  const firstPoint = points[0];
  const firstPointIndex = findNearestCandleIndexByTime(candles, firstPoint.time);

  if (firstPointIndex === -1) {
    return undefined;
  }

  const startIndex = Math.max(0, firstPointIndex - 48);
  const windowCandles = candles.slice(startIndex, firstPointIndex + 1);

  if (windowCandles.length === 0) {
    return undefined;
  }

  if (direction === "bullish") {
    const anchorCandle = windowCandles.reduce((lowest, candle) =>
      candle.low < lowest.low ? candle : lowest,
    );

    return {
      id: `wave-anchor-${anchorCandle.time}`,
      price: anchorCandle.low,
      time: anchorCandle.time,
      kind: "low" as const,
    };
  }

  const anchorCandle = windowCandles.reduce((highest, candle) =>
    candle.high > highest.high ? candle : highest,
  );

  return {
    id: `wave-anchor-${anchorCandle.time}`,
    price: anchorCandle.high,
    time: anchorCandle.time,
    kind: "high" as const,
  };
}

function getNextManualLabel(
  points: WavePoint[],
  manualWaveMode: ManualWaveMode,
): WaveLabel {
  const sortedPoints = sortWavePoints(points);
  const labels = manualWaveMode === "corrective" ? CORRECTIVE_LABELS : IMPULSE_LABELS;
  const patternPoints = sortedPoints.filter((point) =>
    manualWaveMode === "corrective"
      ? isCorrectiveLabel(point.label)
      : isImpulseLabel(point.label),
  );

  return patternPoints.length < labels.length ? labels[patternPoints.length] : labels[0];
}

function getNearestCandleByX(
  chart: IChartApi,
  candles: Candle[],
  x: number,
) {
  if (candles.length === 0) {
    return null;
  }

  let nearestCandle = candles[0];
  let smallestDistance = Number.POSITIVE_INFINITY;

  for (const candle of candles) {
    const coordinate = chart.timeScale().timeToCoordinate(candle.time as UTCTimestamp);

    if (coordinate === null) {
      continue;
    }

    const distance = Math.abs(coordinate - x);

    if (distance < smallestDistance) {
      smallestDistance = distance;
      nearestCandle = candle;
    }
  }

  return nearestCandle;
}

function formatDegreeLabel(
  label: WaveLabel,
  degree: WavePoint["degree"],
  pattern: WavePatternType,
) {
  if (degree === "micro") {
    return label;
  }

  if (degree === "minor") {
    return `(${label})`;
  }

  if (degree === "intermediate") {
    return `[${label}]`;
  }

  return pattern === "corrective" ? `((${label}))` : `[[${label}]]`;
}

function inferLabelPlacement(
  points: WavePoint[],
  index: number,
  pattern: WavePatternType,
  direction: WaveTrend,
) {
  const point = points[index];
  const previousPoint = points[index - 1];
  const nextPoint = points[index + 1];

  if (point.kind === "high") {
    return "above" as const;
  }

  if (point.kind === "low") {
    return "below" as const;
  }

  if (previousPoint && nextPoint) {
    if (point.price >= Math.max(previousPoint.price, nextPoint.price)) {
      return "above" as const;
    }

    if (point.price <= Math.min(previousPoint.price, nextPoint.price)) {
      return "below" as const;
    }
  }

  if (pattern === "impulse") {
    const isHighLabel =
      direction === "bullish"
        ? point.label === "1" || point.label === "3" || point.label === "5"
        : point.label === "2" || point.label === "4";

    return isHighLabel ? ("above" as const) : ("below" as const);
  }

  const isHighLabel =
    direction === "bullish"
      ? point.label === "A" || point.label === "C"
      : point.label === "B";

  return isHighLabel ? ("above" as const) : ("below" as const);
}

function getSmartLabelOffsetY(
  placement: "above" | "below",
  y: number,
  chartHeight: number,
  displayLabel: string,
) {
  const baseOffset = displayLabel.length >= 5 ? 28 : 24;
  let nextOffset = placement === "above" ? -baseOffset : baseOffset;
  const labelHalfHeight = 11;
  const projectedTop = y + nextOffset - labelHalfHeight;
  const projectedBottom = y + nextOffset + labelHalfHeight;

  if (projectedTop < 14) {
    nextOffset = Math.abs(baseOffset) + 6;
  } else if (projectedBottom > chartHeight - 14) {
    nextOffset = -(Math.abs(baseOffset) + 6);
  }

  return nextOffset;
}

function getLabelWidth(displayLabel: string) {
  return Math.max(28, displayLabel.length * 7 + 12);
}

function buildWaveAnalysis(
  wavePoints: WavePoint[],
  candles: Candle[],
  interactionMode: InteractionMode,
): WaveAnalysis {
  const sortedPoints = sortWavePoints(wavePoints);
  const impulsePoints = sortedPoints.filter((point) => isImpulseLabel(point.label));
  const correctivePoints = sortedPoints.filter((point) => isCorrectiveLabel(point.label));
  const latestImpulsePoint = impulsePoints[impulsePoints.length - 1];
  const latestCorrectivePoint = correctivePoints[correctivePoints.length - 1];
  const activePattern: WavePatternType | null = (() => {
    if (!latestImpulsePoint && !latestCorrectivePoint) {
      return null;
    }

    if (!latestCorrectivePoint) {
      return "impulse";
    }

    if (!latestImpulsePoint) {
      return "corrective";
    }

    if (latestCorrectivePoint.time !== latestImpulsePoint.time) {
      return latestCorrectivePoint.time > latestImpulsePoint.time
        ? "corrective"
        : "impulse";
    }

    return correctivePoints.length > impulsePoints.length ? "corrective" : "impulse";
  })();

  if (!activePattern) {
    return {
      impulsePoints,
      correctivePoints,
      impulseCount: null,
      impulseValidation: null,
      correctiveCount: null,
      correctiveValidation: null,
      activePattern: null,
      activeCount: null,
      activeDirection: "bullish",
      validation: null,
    };
  }

  const impulseDirection = inferDirectionFromSequence(impulsePoints);
  const impulseAnchor =
    impulsePoints.length > 0
      ? inferAnchorFromCandles(impulsePoints, candles, impulseDirection)
      : undefined;
  const impulseCount =
    impulsePoints.length > 0
      ? buildWaveCount(impulsePoints, {
          pattern: "impulse",
          direction: impulseDirection,
          degree: impulsePoints[0]?.degree ?? "minor",
          source: impulsePoints[0]?.source ?? interactionMode,
          anchor: impulseAnchor,
        })
      : null;
  const impulseValidation =
    impulseCount && impulsePoints.length >= 3 ? validateWaveCount(impulseCount) : null;

  const correctiveDirection = inferDirectionFromSequence(correctivePoints);
  const correctiveAnchor =
    correctivePoints.length === CORRECTIVE_LABELS.length &&
    impulsePoints.length === IMPULSE_LABELS.length
      ? {
          id: `carry-over-anchor-${impulsePoints[impulsePoints.length - 1].id}`,
          price: impulsePoints[impulsePoints.length - 1].price,
          time: impulsePoints[impulsePoints.length - 1].time,
          kind: correctiveDirection === "bullish" ? ("low" as const) : ("high" as const),
        }
      : correctivePoints.length > 0
        ? inferAnchorFromCandles(correctivePoints, candles, correctiveDirection)
        : undefined;
  const correctiveCount =
    correctivePoints.length > 0
      ? buildWaveCount(correctivePoints, {
          pattern: "corrective",
          direction: correctiveDirection,
          degree: correctivePoints[0]?.degree ?? "minor",
          source: correctivePoints[0]?.source ?? interactionMode,
          anchor: correctiveAnchor,
        })
      : null;
  const correctiveValidation =
    correctiveCount && correctivePoints.length >= 2 ? validateWaveCount(correctiveCount) : null;

  const activePoints = activePattern === "corrective" ? correctivePoints : impulsePoints;
  const activeDirection = inferDirectionFromSequence(activePoints);
  const anchor =
    activePattern === "corrective" && impulsePoints.length === IMPULSE_LABELS.length
      ? {
          id: `carry-over-anchor-${impulsePoints[impulsePoints.length - 1].id}`,
          price: impulsePoints[impulsePoints.length - 1].price,
          time: impulsePoints[impulsePoints.length - 1].time,
          kind: activeDirection === "bullish" ? ("low" as const) : ("high" as const),
        }
      : inferAnchorFromCandles(activePoints, candles, activeDirection);

  const activeCount = buildWaveCount(activePoints, {
    pattern: activePattern,
    direction: activeDirection,
    degree: activePoints[0]?.degree ?? "minor",
    source: activePoints[0]?.source ?? interactionMode,
    anchor,
  });
  const isComplete =
    (activePattern === "impulse" && activePoints.length === IMPULSE_LABELS.length) ||
    (activePattern === "corrective" && activePoints.length === CORRECTIVE_LABELS.length);

  return {
    impulsePoints,
    correctivePoints,
    impulseCount,
    impulseValidation,
    correctiveCount,
    correctiveValidation,
    activePattern,
    activeCount,
    activeDirection,
    validation: isComplete ? validateWaveCount(activeCount) : null,
  };
}

function buildOverlayPoints(
  points: WavePoint[],
  pattern: WavePatternType,
  direction: WaveTrend,
  chart: IChartApi,
  series: ISeriesApi<"Candlestick", Time>,
  color: string,
  chartHeight: number,
) {
  return points
    .map<OverlayWavePoint | null>((point, index) => {
      const x = chart.timeScale().timeToCoordinate(point.time as UTCTimestamp);
      const y = series.priceToCoordinate(point.price);

      if (x === null || y === null) {
        return null;
      }

      const displayLabel = formatDegreeLabel(point.label, point.degree, pattern);
      const labelOffsetY = getSmartLabelOffsetY(
        inferLabelPlacement(points, index, pattern, direction),
        Number(y),
        chartHeight,
        displayLabel,
      );

      return {
        id: point.id,
        label: point.label,
        displayLabel,
        price: point.price,
        time: point.time,
        x: Number(x),
        y: Number(y),
        color,
        labelOffsetY,
        labelWidth: getLabelWidth(displayLabel),
        labelHeight: 18,
      };
    })
    .filter((point): point is OverlayWavePoint => point !== null);
}

function selectRelevantFibonacciLevels(levels: Array<FibonacciLevel & { y: number }>) {
  if (levels.length <= 4) {
    return levels;
  }

  const activeLevels = levels.filter((level) => level.isActive);
  const inactiveLevels = levels.filter((level) => !level.isActive);
  const selectedLevels: Array<FibonacciLevel & { y: number }> = [];

  for (const level of [...activeLevels, ...inactiveLevels]) {
    const isTooClose = selectedLevels.some(
      (selectedLevel) => Math.abs(selectedLevel.y - level.y) < 18,
    );

    if (isTooClose) {
      continue;
    }

    selectedLevels.push(level);

    if (selectedLevels.length === 4) {
      break;
    }
  }

  return selectedLevels.sort((left, right) => left.y - right.y);
}

function toConfidenceScore(
  count: WaveCount | null,
  validation: ReturnType<typeof validateWaveCount> | null,
) {
  if (validation) {
    return validation.score;
  }

  if (typeof count?.confidence === "number") {
    return count.confidence > 1 ? count.confidence : count.confidence * 100;
  }

  return count ? clamp(38 + count.points.length * 11, 40, 78) : 0;
}

function createProbabilityZoneTarget(
  id: string,
  pattern: WavePatternType,
  label: string,
  values: [number, number],
  confidence: number,
  metadata?: Partial<
    Pick<
      ProbabilityZoneTarget,
      "confidenceLabel" | "reactionType" | "reasonSummary" | "reasons" | "invalidationLevel"
    >
  >,
): ProbabilityZoneTarget | null {
  const [firstValue, secondValue] = values;

  if (!Number.isFinite(firstValue) || !Number.isFinite(secondValue)) {
    return null;
  }

  const priceLow = Math.min(firstValue, secondValue);
  const priceHigh = Math.max(firstValue, secondValue);

  return {
    id,
    pattern,
    label,
    priceLow,
    priceHigh,
    centerPrice: (priceLow + priceHigh) / 2,
    confidence,
    confidenceLabel: metadata?.confidenceLabel ?? "Low",
    reactionType: metadata?.reactionType ?? "resistance",
    reasonSummary: metadata?.reasonSummary ?? "Measured projection",
    reasons: metadata?.reasons ?? [],
    invalidationLevel: metadata?.invalidationLevel,
  };
}

function formatOverlayPrice(price: number) {
  const decimals = price >= 100 ? 2 : 3;
  return price.toFixed(decimals);
}

function truncateOverlayText(value: string, maxLength: number) {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value;
}

function buildReactionZoneTarget(
  count: WaveCount | null,
  validation: ReturnType<typeof validateWaveCount> | null,
) {
  const reactionAnalysis = buildWaveReactionAnalysis(count, validation);

  if (!count || !reactionAnalysis?.primaryZone) {
    return null;
  }

  const currentWaveLabel =
    typeof reactionAnalysis.currentWave === "number"
      ? `Wave ${reactionAnalysis.currentWave}`
      : `Wave ${reactionAnalysis.currentWave}`;
  const zoneLabel = `${currentWaveLabel} ${reactionAnalysis.reactionType === "support" ? "Support Cluster" : "Resistance Cluster"}`;

  return createProbabilityZoneTarget(
    `${count.anchor?.id ?? count.points[0]?.id ?? count.pattern}-${String(reactionAnalysis.currentWave)}-reaction-zone`,
    count.pattern,
    zoneLabel,
    [reactionAnalysis.primaryZone.low, reactionAnalysis.primaryZone.high],
    reactionAnalysis.primaryZone.confidence * 100,
    {
      confidenceLabel: reactionAnalysis.primaryZone.confidenceLabel,
      reactionType: reactionAnalysis.reactionType,
      reasonSummary: reactionAnalysis.primaryZone.reasonSummary,
      reasons: reactionAnalysis.primaryZone.reasons,
      invalidationLevel: reactionAnalysis.invalidation?.level,
    },
  );
}

function getConfidenceLabelFromProbability(probability: number): ConfidenceLabel {
  if (probability >= 74) {
    return "High";
  }

  if (probability >= 52) {
    return "Medium";
  }

  return "Low";
}

function buildCorrectivePredictionTarget(
  count: WaveCount | null,
  validation: ReturnType<typeof validateWaveCount> | null,
) {
  if (!count || count.pattern !== "corrective" || count.points.length !== 2) {
    return null;
  }

  const points = sortWavePoints(count.points);
  const waveBPoint = points[1];
  const futureProjection = getWaveFutureProjection(count);

  if (!waveBPoint || !futureProjection) {
    return null;
  }

  const reactionAnalysis = buildWaveReactionAnalysis(count, validation);
  const probability = futureProjection.probability;

  return {
    id: `${count.anchor?.id ?? waveBPoint.id}-wave-c-prediction`,
    label: "Predicted Wave C",
    startTime: waveBPoint.time,
    startPrice: waveBPoint.price,
    targetPrice: futureProjection.nextTargetPrice,
    zoneLow: futureProjection.minTarget,
    zoneHigh: futureProjection.maxTarget,
    confidence: probability,
    confidenceLabel:
      reactionAnalysis?.primaryZone?.confidenceLabel ??
      getConfidenceLabelFromProbability(probability),
    reasonSummary:
      reactionAnalysis?.primaryZone?.reasonSummary ?? "Wave C objective confluence",
    reasons: reactionAnalysis?.primaryZone?.reasons ?? [],
    invalidationLevel: reactionAnalysis?.invalidation?.level,
  } satisfies CorrectivePredictionTarget;
}

function getProbabilityZoneColors(pattern: WavePatternType) {
  return pattern === "impulse"
    ? {
        fill: "rgba(59, 130, 246, 0.12)",
        stroke: "rgba(96, 165, 250, 0.34)",
        line: "rgba(147, 197, 253, 0.58)",
        labelText: "#93c5fd",
        valueText: "#bfdbfe",
        labelStroke: "rgba(96, 165, 250, 0.32)",
        valueStroke: "rgba(96, 165, 250, 0.26)",
      }
    : {
        fill: "rgba(234, 179, 8, 0.12)",
        stroke: "rgba(250, 204, 21, 0.34)",
        line: "rgba(253, 224, 71, 0.56)",
        labelText: "#fde047",
        valueText: "#fef08a",
        labelStroke: "rgba(250, 204, 21, 0.32)",
        valueStroke: "rgba(250, 204, 21, 0.26)",
      };
}

function buildOverlayPriceExtents(
  wavePoints: WavePoint[],
  probabilityZoneTargets: ProbabilityZoneTarget[],
  correctivePredictionTarget: CorrectivePredictionTarget | null,
  retracementBarrierTarget: RetracementBarrierTarget | null,
  validations: Array<ReturnType<typeof validateWaveCount> | null>,
): OverlayPriceExtents | null {
  const prices = [
    ...wavePoints.map((point) => point.price),
    ...probabilityZoneTargets.flatMap((zone) => [zone.priceLow, zone.priceHigh]),
    ...(correctivePredictionTarget
      ? [
          correctivePredictionTarget.startPrice,
          correctivePredictionTarget.targetPrice,
          correctivePredictionTarget.zoneLow,
          correctivePredictionTarget.zoneHigh,
          ...(typeof correctivePredictionTarget.invalidationLevel === "number"
            ? [correctivePredictionTarget.invalidationLevel]
            : []),
        ]
      : []),
    ...(retracementBarrierTarget
      ? [
          retracementBarrierTarget.priceLow,
          retracementBarrierTarget.priceHigh,
          ...retracementBarrierTarget.levels.map((level) => level.price),
        ]
      : []),
    ...validations.flatMap((validation) =>
      validation?.fibonacciLevels.map((level) => level.price) ?? [],
    ),
  ].filter((price): price is number => Number.isFinite(price));

  if (prices.length === 0) {
    return null;
  }

  return {
    min: Math.min(...prices),
    max: Math.max(...prices),
  };
}

function buildRetracementBarrierLevels(
  startPrice: number,
  endPrice: number,
  ratios: number[],
  wave: string,
) {
  const move = endPrice - startPrice;

  return ratios.map<RetracementBarrierLevel>((ratio, index) => ({
    id: `${wave}-barrier-${ratio}`,
    ratio,
    price: endPrice - move * ratio,
    label: `${(ratio * 100).toFixed(1)}% (${formatOverlayPrice(endPrice - move * ratio)})`,
    emphasis:
      Math.abs(ratio - 0.618) < 0.001 || Math.abs(ratio - 0.786) < 0.001
        ? "primary"
        : index === ratios.length - 1
          ? "primary"
          : "secondary",
  }));
}

function createRetracementBarrierTarget(
  id: string,
  kind: "resistance" | "support",
  wave: string,
  label: string,
  levels: RetracementBarrierLevel[],
  bandRatios: [number, number],
  confidence: number,
): RetracementBarrierTarget | null {
  const lowerLevel = levels.find((level) => Math.abs(level.ratio - bandRatios[0]) < 0.001);
  const upperLevel = levels.find((level) => Math.abs(level.ratio - bandRatios[1]) < 0.001);

  if (!lowerLevel || !upperLevel) {
    return null;
  }

  const priceLow = Math.min(lowerLevel.price, upperLevel.price);
  const priceHigh = Math.max(lowerLevel.price, upperLevel.price);

  return {
    id,
    kind,
    wave,
    label,
    priceLow,
    priceHigh,
    centerPrice: (priceLow + priceHigh) / 2,
    confidence,
    levels,
  };
}

function getRetracementBarrierConfig(
  count: WaveCount,
  pointLength: number,
): {
  levels: number[];
  bandRatios: [number, number];
  label: string;
} | null {
  if (count.pattern === "impulse" && pointLength <= 2) {
    return count.direction === "bearish"
      ? {
          levels: [0.382, 0.5, 0.618, 0.786, 0.854],
          bandRatios: [0.618, 0.786],
          label: "Wave 2 Resistance Cluster",
        }
      : {
          levels: [0.382, 0.5, 0.618, 0.786],
          bandRatios: [0.382, 0.618],
          label: "Wave 2 Support Cluster",
        };
  }

  if (count.pattern === "impulse" && pointLength <= 4) {
    return count.direction === "bearish"
      ? {
          levels: [0.146, 0.236, 0.382, 0.5],
          bandRatios: [0.236, 0.382],
          label: "Wave 4 Resistance Cluster",
        }
      : {
          levels: [0.146, 0.236, 0.382],
          bandRatios: [0.146, 0.382],
          label: "Wave 4 Support Cluster",
        };
  }

  if (count.pattern === "corrective" && pointLength <= 2) {
    return count.direction === "bearish"
      ? {
          levels: [0.382, 0.5, 0.618, 0.786, 0.886],
          bandRatios: [0.618, 0.786],
          label: "Wave B Resistance Cluster",
        }
      : {
          levels: [0.382, 0.5, 0.618, 0.786, 0.886],
          bandRatios: [0.5, 0.618],
          label: "Wave B Support Cluster",
        };
  }

  return null;
}

function buildRetracementBarrierTarget(
  count: WaveCount | null,
  validation: ReturnType<typeof validateWaveCount> | null,
) {
  if (!count || !count.anchor || count.points.length === 0) {
    return null;
  }

  const points = sortWavePoints(count.points);
  const confidence = toConfidenceScore(count, validation);
  const barrierConfig = getRetracementBarrierConfig(count, points.length);

  if (!barrierConfig) {
    return null;
  }

  if (count.pattern === "impulse") {
    if (points.length <= 2) {
      const levels = buildRetracementBarrierLevels(
        count.anchor.price,
        points[0].price,
        barrierConfig.levels,
        "Wave 2",
      );

      return createRetracementBarrierTarget(
        `${count.anchor.id}-wave2-${count.direction}-barrier`,
        count.direction === "bearish" ? "resistance" : "support",
        "Wave 2",
        barrierConfig.label,
        levels,
        barrierConfig.bandRatios,
        confidence,
      );
    }

    if (points.length <= 4) {
      const levels = buildRetracementBarrierLevels(
        points[1].price,
        points[2].price,
        barrierConfig.levels,
        "Wave 4",
      );

      return createRetracementBarrierTarget(
        `${count.anchor.id}-wave4-${count.direction}-barrier`,
        count.direction === "bearish" ? "resistance" : "support",
        "Wave 4",
        barrierConfig.label,
        levels,
        barrierConfig.bandRatios,
        confidence,
      );
    }
  }

  if (count.pattern === "corrective" && points.length <= 2) {
    const levels = buildRetracementBarrierLevels(
      count.anchor.price,
      points[0].price,
      barrierConfig.levels,
      "Wave B",
    );

    return createRetracementBarrierTarget(
      `${count.anchor.id}-waveb-${count.direction}-barrier`,
      count.direction === "bearish" ? "resistance" : "support",
      "Wave B",
      barrierConfig.label,
      levels,
      barrierConfig.bandRatios,
      confidence,
    );
  }

  return null;
}

function buildOverlayGeometry(
  chart: IChartApi,
  series: ISeriesApi<"Candlestick", Time>,
  container: HTMLDivElement,
  analysis: WaveAnalysis,
  probabilityZoneTargets: ProbabilityZoneTarget[],
  correctivePredictionTarget: CorrectivePredictionTarget | null,
  retracementBarrierTarget: RetracementBarrierTarget | null,
) {
  const chartHeight = container.clientHeight;
  const impulseDirection = inferDirectionFromSequence(analysis.impulsePoints);
  const correctiveDirection = inferDirectionFromSequence(analysis.correctivePoints);
  const impulsePoints = buildOverlayPoints(
    analysis.impulsePoints,
    "impulse",
    impulseDirection,
    chart,
    series,
    IMPULSE_COLOR,
    chartHeight,
  );
  const correctivePoints = buildOverlayPoints(
    analysis.correctivePoints,
    "corrective",
    correctiveDirection,
    chart,
    series,
    CORRECTIVE_COLOR,
    chartHeight,
  );
  const fibonacciLevels = selectRelevantFibonacciLevels(
    (analysis.validation?.fibonacciLevels ?? [])
    .map((level) => {
      const y = series.priceToCoordinate(level.price);

      if (y === null) {
        return null;
      }

      return {
        ...level,
        y: Number(y),
      };
    })
    .filter((level): level is FibonacciLevel & { y: number } => level !== null),
  );
  const probabilityZones = probabilityZoneTargets
    .map<OverlayProbabilityZone | null>((probabilityZoneTarget) => {
      const upperCoordinate = series.priceToCoordinate(probabilityZoneTarget.priceHigh);
      const lowerCoordinate = series.priceToCoordinate(probabilityZoneTarget.priceLow);
      const centerCoordinate = series.priceToCoordinate(probabilityZoneTarget.centerPrice);

      if (
        upperCoordinate === null ||
        lowerCoordinate === null ||
        centerCoordinate === null
      ) {
        return null;
      }

      const topY = Math.min(Number(upperCoordinate), Number(lowerCoordinate));
      const bottomY = Math.max(Number(upperCoordinate), Number(lowerCoordinate));
      const minBandHeight = 18;
      const centerY = Number(centerCoordinate);

      return {
        ...probabilityZoneTarget,
        topY:
          bottomY - topY < minBandHeight ? centerY - minBandHeight / 2 : topY,
        bottomY:
          bottomY - topY < minBandHeight ? centerY + minBandHeight / 2 : bottomY,
        centerY,
      };
    })
    .filter((zone): zone is OverlayProbabilityZone => zone !== null)
    .sort((left, right) => {
      if (left.pattern !== right.pattern) {
        return left.pattern === "impulse" ? -1 : 1;
      }

      return right.confidence - left.confidence;
    });
  const correctivePrediction = (() => {
    if (!correctivePredictionTarget) {
      return null;
    }

    const startX = chart.timeScale().timeToCoordinate(
      correctivePredictionTarget.startTime as UTCTimestamp,
    );
    const startY = series.priceToCoordinate(correctivePredictionTarget.startPrice);
    const targetY = series.priceToCoordinate(correctivePredictionTarget.targetPrice);

    if (startX === null || startY === null || targetY === null) {
      return null;
    }

    const width = container.clientWidth;
    const resolvedStartX = Number(startX);
    const targetX = clamp(
      Math.max(resolvedStartX + 96, width - 92),
      resolvedStartX + 48,
      Math.max(width - 26, resolvedStartX + 48),
    );

    return {
      ...correctivePredictionTarget,
      startX: resolvedStartX,
      startY: Number(startY),
      targetX,
      targetY: Number(targetY),
    };
  })();
  const retracementBarrier = (() => {
    if (!retracementBarrierTarget) {
      return null;
    }

    const upperCoordinate = series.priceToCoordinate(retracementBarrierTarget.priceHigh);
    const lowerCoordinate = series.priceToCoordinate(retracementBarrierTarget.priceLow);
    const centerCoordinate = series.priceToCoordinate(retracementBarrierTarget.centerPrice);

    if (
      upperCoordinate === null ||
      lowerCoordinate === null ||
      centerCoordinate === null
    ) {
      return null;
    }

    const levels = retracementBarrierTarget.levels
      .map((level) => {
        const y = series.priceToCoordinate(level.price);

        if (y === null) {
          return null;
        }

        return {
          ...level,
          y: Number(y),
        };
      })
      .filter((level): level is RetracementBarrierLevel & { y: number } => level !== null);

    const topY = Math.min(Number(upperCoordinate), Number(lowerCoordinate));
    const bottomY = Math.max(Number(upperCoordinate), Number(lowerCoordinate));
    const minBandHeight = 18;
    const centerY = Number(centerCoordinate);

    return {
      ...retracementBarrierTarget,
      topY:
        bottomY - topY < minBandHeight ? centerY - minBandHeight / 2 : topY,
      bottomY:
        bottomY - topY < minBandHeight ? centerY + minBandHeight / 2 : bottomY,
      centerY,
      levels,
    };
  })();

  return {
    width: container.clientWidth,
    height: container.clientHeight,
    impulsePoints,
    correctivePoints,
    fibonacciLevels,
    probabilityZones,
    correctivePrediction,
    retracementBarrier,
  };
}

function buildGeometryFingerprint(geometry: OverlayGeometry) {
  return JSON.stringify({
    width: Math.round(geometry.width),
    height: Math.round(geometry.height),
    impulse: geometry.impulsePoints.map((point) => [
      point.id,
      point.displayLabel,
      Math.round(point.x),
      Math.round(point.y),
    ]),
    corrective: geometry.correctivePoints.map((point) => [
      point.id,
      point.displayLabel,
      Math.round(point.x),
      Math.round(point.y),
    ]),
    fibs: geometry.fibonacciLevels.map((level) => [
      level.id,
      level.label,
      Math.round(level.y),
      level.isActive ? 1 : 0,
    ]),
    probabilityZones: geometry.probabilityZones.map((zone) => [
      zone.id,
      zone.pattern,
      zone.label,
      Math.round(zone.topY),
      Math.round(zone.bottomY),
    ]),
    correctivePrediction: geometry.correctivePrediction
      ? [
          geometry.correctivePrediction.id,
          Math.round(geometry.correctivePrediction.startX),
          Math.round(geometry.correctivePrediction.startY),
          Math.round(geometry.correctivePrediction.targetX),
          Math.round(geometry.correctivePrediction.targetY),
        ]
      : null,
    retracementBarrier: geometry.retracementBarrier
      ? [
          geometry.retracementBarrier.id,
          geometry.retracementBarrier.kind,
          geometry.retracementBarrier.wave,
          Math.round(geometry.retracementBarrier.topY),
          Math.round(geometry.retracementBarrier.bottomY),
          ...geometry.retracementBarrier.levels.map((level) => Math.round(level.y)),
        ]
      : null,
  });
}

function buildLineSegments(points: OverlayWavePoint[]) {
  const segments: Array<{
    id: string;
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    color: string;
  }> = [];

  for (let index = 1; index < points.length; index += 1) {
    segments.push({
      id: `${points[index - 1].id}-${points[index].id}`,
      x1: points[index - 1].x,
      y1: points[index - 1].y,
      x2: points[index].x,
      y2: points[index].y,
      color: points[index].color,
    });
  }

  return segments;
}

function buildWaveAnalysisSignature(analysis: WaveAnalysis) {
  const serializeCount = (count: WaveCount | null) =>
    count
      ? {
          pattern: count.pattern,
          direction: count.direction,
          degree: count.degree,
          source: count.source,
          confidence: count.confidence,
          anchor: count.anchor
            ? {
                time: count.anchor.time,
                price: count.anchor.price,
                kind: count.anchor.kind,
              }
            : null,
          points: count.points.map((point) => ({
            id: point.id,
            label: point.label,
            time: point.time,
            price: point.price,
            source: point.source,
          })),
        }
      : null;
  const serializeValidation = (validation: ReturnType<typeof validateWaveCount> | null) =>
    validation
      ? {
          pattern: validation.pattern,
          direction: validation.direction,
          isValid: validation.isValid,
          hardRulePassed: validation.hardRulePassed,
          score: validation.score,
          rules: validation.rules.map((rule) => ({
            id: rule.id,
            status: rule.status,
            message: rule.message,
          })),
          fibonacciLevels: validation.fibonacciLevels.map((level) => ({
            id: level.id,
            price: level.price,
            isActive: level.isActive,
          })),
        }
      : null;

  return JSON.stringify({
    activePattern: analysis.activePattern,
    activeDirection: analysis.activeDirection,
    activeCount: serializeCount(analysis.activeCount),
    impulseCount: serializeCount(analysis.impulseCount),
    correctiveCount: serializeCount(analysis.correctiveCount),
    validation: serializeValidation(analysis.validation),
    impulseValidation: serializeValidation(analysis.impulseValidation),
    correctiveValidation: serializeValidation(analysis.correctiveValidation),
  });
}

function buildAutoDetectedWavePoints(detection: ReturnType<typeof autoDetectWaveCount>) {
  const detectedCounts = [detection.impulseCount, detection.correctiveCount].filter(
    (count): count is WaveCount => count !== null,
  );
  const selectedCounts = detectedCounts.length > 0 ? detectedCounts : detection.count ? [detection.count] : [];

  return sortWavePoints(
    selectedCounts.flatMap((count) =>
      count.points.map((point) =>
        createWavePoint({
          ...point,
          source: "auto",
        }),
      ),
    ),
  );
}

function pickCompanionDetectedCandidate(
  detection: ReturnType<typeof autoDetectWaveCount>,
): {
  count: WaveCount | null;
  validation: ReturnType<typeof validateWaveCount> | null;
} {
  if (detection.correctiveCount && detection.impulseCount) {
    return {
      count: detection.impulseCount,
      validation: detection.impulseValidation ?? validateWaveCount(detection.impulseCount),
    };
  }

  const activePattern = detection.correctiveCount
    ? "corrective"
    : detection.impulseCount
      ? "impulse"
      : detection.count?.pattern ?? null;
  const companionCandidate =
    detection.rankedCounts.find((candidate) => candidate.count.pattern !== activePattern) ??
    detection.rankedCounts[1] ??
    null;

  return {
    count: companionCandidate?.count ?? null,
    validation: companionCandidate?.validation ?? null,
  };
}

export function MetalChart({
  candles,
  isLoading,
  symbol,
  timeframeLabel,
  wavePoints: controlledWavePoints,
  onWavePointsChange,
  interactionMode: controlledInteractionMode,
  onInteractionModeChange,
  onWaveAnalysisChange,
  onAlternateCountChange,
}: MetalChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick", Time> | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const lastResetKeyRef = useRef<string | null>(null);
  const dragPointIdRef = useRef<string | null>(null);
  const overlayAnimationFrameRef = useRef<number | null>(null);
  const overlayFingerprintRef = useRef<string>("");
  const candlesRef = useRef(candles);
  const initialSymbolRef = useRef(symbol);
  const [internalInteractionMode, setInternalInteractionMode] = useState<InteractionMode>("manual");
  const [manualWaveMode, setManualWaveMode] = useState<ManualWaveMode>("impulse");
  const [showCorrectivePrediction, setShowCorrectivePrediction] = useState(false);
  const [internalWavePoints, setInternalWavePoints] = useState<WavePoint[]>([]);
  const [alternateWaveCount, setAlternateWaveCount] = useState<WaveCount | null>(null);
  const [alternateWaveValidation, setAlternateWaveValidation] =
    useState<ReturnType<typeof validateWaveCount> | null>(null);
  const [draggingPointId, setDraggingPointId] = useState<string | null>(null);
  const [overlayGeometry, setOverlayGeometry] = useState<OverlayGeometry>(EMPTY_OVERLAY);
  const interactionMode = controlledInteractionMode ?? internalInteractionMode;
  const wavePoints = controlledWavePoints ?? internalWavePoints;
  const interactionModeRef = useRef(interactionMode);
  const wavePointsRef = useRef(wavePoints);
  const onWavePointsChangeRef = useRef(onWavePointsChange);
  const onInteractionModeChangeRef = useRef(onInteractionModeChange);
  const onWaveAnalysisChangeRef = useRef(onWaveAnalysisChange);
  const onAlternateCountChangeRef = useRef(onAlternateCountChange);
  const handleChartClickRef = useRef<
    ((param: MouseEventParams<Time>) => void) | null
  >(null);
  const publishedWaveAnalysisSignatureRef = useRef<string | null>(null);
  const isWavePointsControlled = controlledWavePoints !== undefined;
  const isInteractionModeControlled = controlledInteractionMode !== undefined;

  useEffect(() => {
    candlesRef.current = candles;
  }, [candles]);

  useEffect(() => {
    onWavePointsChangeRef.current = onWavePointsChange;
  }, [onWavePointsChange]);

  useEffect(() => {
    onInteractionModeChangeRef.current = onInteractionModeChange;
  }, [onInteractionModeChange]);

  useEffect(() => {
    onWaveAnalysisChangeRef.current = onWaveAnalysisChange;
  }, [onWaveAnalysisChange]);

  useEffect(() => {
    onAlternateCountChangeRef.current = onAlternateCountChange;
  }, [onAlternateCountChange]);

  useEffect(() => {
    interactionModeRef.current = interactionMode;
  }, [interactionMode]);

  useEffect(() => {
    wavePointsRef.current = wavePoints;
  }, [wavePoints]);

  const updateInteractionMode = useCallback(
    (mode: InteractionMode) => {
      interactionModeRef.current = mode;

      if (!isInteractionModeControlled) {
        setInternalInteractionMode(mode);
      }

      onInteractionModeChangeRef.current?.(mode);
    },
    [isInteractionModeControlled],
  );

  const updateWavePoints = useCallback(
    (next:
      | WavePoint[]
      | ((currentWavePoints: WavePoint[]) => WavePoint[])) => {
      const resolvedNextWavePoints =
        typeof next === "function" ? next(wavePointsRef.current) : next;

      wavePointsRef.current = resolvedNextWavePoints;

      if (!isWavePointsControlled) {
        setInternalWavePoints(resolvedNextWavePoints);
      }

      onWavePointsChangeRef.current?.(resolvedNextWavePoints);
    },
    [isWavePointsControlled],
  );

  const publishAlternateCount = useCallback(
    (
      alternateCount: WaveCount | null,
      alternateValidation: ReturnType<typeof validateWaveCount> | null,
    ) => {
      onAlternateCountChangeRef.current?.(alternateCount, alternateValidation);
    },
    [],
  );

  const resetAlternateCount = useCallback(() => {
    setAlternateWaveCount(null);
    setAlternateWaveValidation(null);
    publishAlternateCount(null, null);
  }, [publishAlternateCount]);

  const waveAnalysis = useMemo(
    () => buildWaveAnalysis(wavePoints, candles, interactionMode),
    [candles, interactionMode, wavePoints],
  );
  const probabilityZoneTargets = useMemo(() => {
    if (interactionMode !== "manual") {
      return [];
    }

    const activeManualCount =
      manualWaveMode === "impulse"
        ? waveAnalysis.impulseCount
        : waveAnalysis.correctiveCount;
    const activeManualValidation =
      manualWaveMode === "impulse"
        ? waveAnalysis.impulseValidation
        : waveAnalysis.correctiveValidation;
    const zones = [
      buildReactionZoneTarget(activeManualCount, activeManualValidation),
    ].filter((zone): zone is ProbabilityZoneTarget => zone !== null);

    return Array.from(
      new Map(
        zones.map((zone) => [`${zone.pattern}-${Math.round(zone.priceLow * 1000)}-${Math.round(zone.priceHigh * 1000)}`, zone]),
      ).values(),
    );
  }, [
    interactionMode,
    manualWaveMode,
    waveAnalysis.correctiveCount,
    waveAnalysis.correctiveValidation,
    waveAnalysis.impulseCount,
    waveAnalysis.impulseValidation,
  ]);
  const availableCorrectivePredictionTarget = useMemo(
    () =>
      buildCorrectivePredictionTarget(
        waveAnalysis.correctiveCount,
        waveAnalysis.correctiveValidation,
      ),
    [waveAnalysis.correctiveCount, waveAnalysis.correctiveValidation],
  );
  const correctivePredictionTarget = useMemo(() => {
    if (
      !showCorrectivePrediction ||
      interactionMode !== "manual" ||
      manualWaveMode !== "corrective"
    ) {
      return null;
    }

    return availableCorrectivePredictionTarget;
  }, [
    availableCorrectivePredictionTarget,
    interactionMode,
    manualWaveMode,
    showCorrectivePrediction,
  ]);
  const retracementBarrierTarget = useMemo(() => {
    if (interactionMode === "manual") {
      return null;
    }

    const currentPrice =
      candles[candles.length - 1]?.close ??
      waveAnalysis.activeCount?.points[waveAnalysis.activeCount.points.length - 1]?.price ??
      null;
    const candidates = [
      buildRetracementBarrierTarget(
        waveAnalysis.impulseCount,
        waveAnalysis.impulseValidation,
      ),
      buildRetracementBarrierTarget(
        waveAnalysis.correctiveCount,
        waveAnalysis.correctiveValidation,
      ),
      buildRetracementBarrierTarget(
        alternateWaveCount,
        alternateWaveValidation,
      ),
    ].filter((target): target is RetracementBarrierTarget => target !== null);

    if (candidates.length === 0) {
      return null;
    }

    const resistanceCandidates = candidates.filter(
      (candidate) =>
        candidate.kind === "resistance" &&
        (typeof currentPrice !== "number" || candidate.centerPrice >= currentPrice * 0.995),
    );
    const rankedCandidates =
      resistanceCandidates.length > 0 ? resistanceCandidates : candidates;

    return rankedCandidates.sort((left, right) => {
      const leftDistance =
        typeof currentPrice === "number" ? Math.abs(left.centerPrice - currentPrice) : 0;
      const rightDistance =
        typeof currentPrice === "number" ? Math.abs(right.centerPrice - currentPrice) : 0;

      if (left.kind !== right.kind) {
        return left.kind === "resistance" ? -1 : 1;
      }

      if (leftDistance !== rightDistance) {
        return leftDistance - rightDistance;
      }

      return right.confidence - left.confidence;
    })[0] ?? null;
  }, [
    alternateWaveCount,
    alternateWaveValidation,
    candles,
    interactionMode,
    waveAnalysis.activeCount,
    waveAnalysis.correctiveCount,
    waveAnalysis.correctiveValidation,
    waveAnalysis.impulseCount,
    waveAnalysis.impulseValidation,
  ]);
  const overlayPriceExtents = useMemo(
    () =>
      buildOverlayPriceExtents(
        wavePoints,
        probabilityZoneTargets,
        correctivePredictionTarget,
        retracementBarrierTarget,
        [
          waveAnalysis.validation,
          waveAnalysis.impulseValidation,
          waveAnalysis.correctiveValidation,
          alternateWaveValidation,
        ],
      ),
    [
      alternateWaveValidation,
      correctivePredictionTarget,
      probabilityZoneTargets,
      retracementBarrierTarget,
      waveAnalysis.correctiveValidation,
      waveAnalysis.impulseValidation,
      waveAnalysis.validation,
      wavePoints,
    ],
  );

  useEffect(() => {
    const nextSignature = buildWaveAnalysisSignature(waveAnalysis);

    if (publishedWaveAnalysisSignatureRef.current === nextSignature) {
      return;
    }

    publishedWaveAnalysisSignatureRef.current = nextSignature;
    onWaveAnalysisChangeRef.current?.(waveAnalysis);
  }, [waveAnalysis]);

  const projectInteractionPoint = useCallback(
    (x: number, y: number) => {
      const latestCandles = candlesRef.current;

      if (!chartRef.current || !candleSeriesRef.current || latestCandles.length === 0) {
        return null;
      }

      const price = candleSeriesRef.current.coordinateToPrice(y);
      const nearestCandle = getNearestCandleByX(chartRef.current, latestCandles, x);

      if (price === null || !nearestCandle) {
        return null;
      }

      return {
        time: nearestCandle.time,
        price: Number(price),
      };
    },
    [],
  );

  const handleAutoDetectWaves = useCallback(() => {
    const detection = autoDetectWaveCount(candlesRef.current, {
      degree: "minor",
      pattern: "either",
    });

    const nextWavePoints = buildAutoDetectedWavePoints(detection);

    if (nextWavePoints.length === 0) {
      return;
    }

    updateInteractionMode("auto");
    setShowCorrectivePrediction(false);
    updateWavePoints(nextWavePoints);

    const companionCandidate = pickCompanionDetectedCandidate(detection);

    setAlternateWaveCount(companionCandidate.count);
    setAlternateWaveValidation(companionCandidate.validation);
    publishAlternateCount(companionCandidate.count, companionCandidate.validation);
  }, [publishAlternateCount, updateInteractionMode, updateWavePoints]);

  const handleClearWaves = useCallback(() => {
    updateWavePoints([]);
    updateInteractionMode("manual");
    setShowCorrectivePrediction(false);
    setDraggingPointId(null);
    dragPointIdRef.current = null;
    resetAlternateCount();
  }, [resetAlternateCount, updateInteractionMode, updateWavePoints]);

  const handleChartClick = useCallback(
    (param: MouseEventParams<Time>) => {
      if (interactionModeRef.current !== "manual" || dragPointIdRef.current) {
        return;
      }

      if (!param.point) {
        return;
      }

      const nextPoint = projectInteractionPoint(param.point.x, param.point.y);

      if (!nextPoint) {
        return;
      }

      resetAlternateCount();
      updateWavePoints((currentPoints) => {
        const nextLabel = getNextManualLabel(currentPoints, manualWaveMode);
        const selectedPatternIsCorrective = manualWaveMode === "corrective";
        const selectedPatternPoints = currentPoints.filter((point) =>
          selectedPatternIsCorrective
            ? isCorrectiveLabel(point.label)
            : isImpulseLabel(point.label),
        );
        const shouldReset =
          selectedPatternPoints.length >=
          (selectedPatternIsCorrective ? CORRECTIVE_LABELS.length : IMPULSE_LABELS.length);
        const basePoints = shouldReset
          ? currentPoints.filter((point) =>
              selectedPatternIsCorrective
                ? !isCorrectiveLabel(point.label)
                : !isImpulseLabel(point.label),
            )
          : currentPoints;

        return sortWavePoints([
          ...basePoints,
          createWavePoint({
            label: nextLabel,
            price: nextPoint.price,
            time: nextPoint.time,
            degree: "minor",
            source: "manual",
          }),
        ]);
      });
    },
    [manualWaveMode, projectInteractionPoint, resetAlternateCount, updateWavePoints],
  );

  useEffect(() => {
    handleChartClickRef.current = handleChartClick;
  }, [handleChartClick]);

  const handleChartClickProxy = useCallback((param: MouseEventParams<Time>) => {
    handleChartClickRef.current?.(param);
  }, []);

  const handlePointerMove = useCallback(
    (event: PointerEvent) => {
      if (!dragPointIdRef.current || !containerRef.current) {
        return;
      }

      const bounds = containerRef.current.getBoundingClientRect();
      const localX = event.clientX - bounds.left;
      const localY = event.clientY - bounds.top;
      const nextPoint = projectInteractionPoint(localX, localY);

      if (!nextPoint) {
        return;
      }

      resetAlternateCount();
      updateWavePoints((currentPoints) =>
        sortWavePoints(
          currentPoints.map((point) =>
            point.id === dragPointIdRef.current
              ? {
                  ...point,
                  time: nextPoint.time,
                  price: nextPoint.price,
                }
              : point,
          ),
        ),
      );
    },
    [projectInteractionPoint, resetAlternateCount, updateWavePoints],
  );

  const stopDragging = useCallback(() => {
    dragPointIdRef.current = null;
    setDraggingPointId(null);
    window.removeEventListener("pointermove", handlePointerMove);
    window.removeEventListener("pointerup", stopDragging);
  }, [handlePointerMove]);

  const startDraggingPoint = useCallback(
    (pointId: string) => (event: React.PointerEvent<SVGCircleElement>) => {
      if (interactionModeRef.current !== "manual") {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      dragPointIdRef.current = pointId;
      setDraggingPointId(pointId);
      window.addEventListener("pointermove", handlePointerMove);
      window.addEventListener("pointerup", stopDragging);
    },
    [handlePointerMove, stopDragging],
  );

  useEffect(() => {
    updateWavePoints([]);
    setOverlayGeometry(EMPTY_OVERLAY);
    updateInteractionMode("manual");
    setShowCorrectivePrediction(false);
    resetAlternateCount();
    dragPointIdRef.current = null;
    setDraggingPointId(null);
  }, [resetAlternateCount, symbol, timeframeLabel, updateInteractionMode, updateWavePoints]);

  useEffect(() => {
    if (
      interactionMode !== "manual" ||
      manualWaveMode !== "corrective" ||
      !availableCorrectivePredictionTarget
    ) {
      setShowCorrectivePrediction(false);
    }
  }, [
    availableCorrectivePredictionTarget,
    interactionMode,
    manualWaveMode,
  ]);

  useEffect(() => {
    if (!containerRef.current) {
      return;
    }

    const chart = createChart(containerRef.current, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#8ea2c1",
        fontFamily: "var(--font-ibm-sans)",
      },
      grid: {
        vertLines: { color: "rgba(148, 163, 184, 0.08)", style: LineStyle.Solid },
        horzLines: { color: "rgba(148, 163, 184, 0.08)", style: LineStyle.Solid },
      },
      crosshair: {
        mode: CrosshairMode.Magnet,
        vertLine: {
          color: "rgba(216, 168, 77, 0.35)",
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: "#10233d",
        },
        horzLine: {
          color: "rgba(216, 168, 77, 0.22)",
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: "#10233d",
        },
      },
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: false,
      },
      handleScale: {
        axisPressedMouseMove: true,
        mouseWheel: true,
        pinch: true,
      },
      rightPriceScale: {
        borderColor: "rgba(148, 163, 184, 0.12)",
        autoScale: true,
        entireTextOnly: true,
        scaleMargins: {
          top: 0.12,
          bottom: 0.14,
        },
      },
      timeScale: {
        borderColor: "rgba(148, 163, 184, 0.12)",
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 10,
        barSpacing: 11,
        minBarSpacing: 6,
        fixLeftEdge: false,
        fixRightEdge: false,
      },
      localization: {
        locale: "en-US",
      },
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#10b981",
      downColor: "#f87171",
      wickUpColor: "#10b981",
      wickDownColor: "#f87171",
      borderUpColor: "#10b981",
      borderDownColor: "#f87171",
      priceFormat: {
        type: "price",
        precision: METAL_SYMBOLS[initialSymbolRef.current].precision,
        minMove: METAL_SYMBOLS[initialSymbolRef.current].minMove,
      },
      priceLineVisible: true,
      lastValueVisible: true,
    });

    chart.subscribeClick(handleChartClickProxy);

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;

    resizeObserverRef.current = new ResizeObserver((entries) => {
      const entry = entries[0];

      if (!entry || !chartRef.current) {
        return;
      }

      chartRef.current.applyOptions({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      });
    });

    resizeObserverRef.current.observe(containerRef.current);

    return () => {
      chart.unsubscribeClick(handleChartClickProxy);
      resizeObserverRef.current?.disconnect();
      resizeObserverRef.current = null;
      candleSeriesRef.current = null;
      chart.remove();
      chartRef.current = null;
    };
  }, [handleChartClickProxy]);

  useEffect(() => {
    if (!candleSeriesRef.current || candles.length === 0) {
      return;
    }

    const candleData: CandlestickData<Time>[] = candles.map((candle) => ({
      time: candle.time as UTCTimestamp,
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
    }));

    candleSeriesRef.current.applyOptions({
      priceFormat: {
        type: "price",
        precision: METAL_SYMBOLS[symbol].precision,
        minMove: METAL_SYMBOLS[symbol].minMove,
      },
    });

    candleSeriesRef.current.setData(candleData);

    const resetKey = `${symbol}-${timeframeLabel}`;

    if (lastResetKeyRef.current !== resetKey) {
      chartRef.current?.timeScale().fitContent();
      lastResetKeyRef.current = resetKey;
    }
  }, [candles, symbol, timeframeLabel]);

  useEffect(() => {
    if (!candleSeriesRef.current) {
      return;
    }

    const minMove = METAL_SYMBOLS[symbol].minMove;

    candleSeriesRef.current.applyOptions({
      autoscaleInfoProvider: (original: () => AutoscaleInfo | null) => {
        const base = original();

        if (!overlayPriceExtents) {
          return base;
        }

        const baseRange = base?.priceRange;

        if (
          baseRange &&
          overlayPriceExtents.min >= baseRange.minValue &&
          overlayPriceExtents.max <= baseRange.maxValue
        ) {
          return base;
        }

        const nextMin = Math.min(
          baseRange?.minValue ?? overlayPriceExtents.min,
          overlayPriceExtents.min,
        );
        const nextMax = Math.max(
          baseRange?.maxValue ?? overlayPriceExtents.max,
          overlayPriceExtents.max,
        );
        const rangeSize = Math.max(nextMax - nextMin, minMove * 8);
        const padding = Math.max(rangeSize * 0.06, minMove * 24);

        return {
          priceRange: {
            minValue: nextMin - padding,
            maxValue: nextMax + padding,
          },
          margins: base?.margins,
        };
      },
    });
  }, [overlayPriceExtents, symbol]);

  useEffect(() => {
    if (!chartRef.current || !candleSeriesRef.current || !containerRef.current) {
      return;
    }

    if (
      wavePoints.length === 0 &&
      (waveAnalysis.validation?.fibonacciLevels.length ?? 0) === 0 &&
      probabilityZoneTargets.length === 0 &&
      !correctivePredictionTarget &&
      !retracementBarrierTarget
    ) {
      setOverlayGeometry((currentGeometry) =>
        currentGeometry.impulsePoints.length === 0 &&
        currentGeometry.correctivePoints.length === 0 &&
        currentGeometry.fibonacciLevels.length === 0 &&
        currentGeometry.probabilityZones.length === 0 &&
        currentGeometry.correctivePrediction === null &&
        currentGeometry.retracementBarrier === null
          ? currentGeometry
          : EMPTY_OVERLAY,
      );
      overlayFingerprintRef.current = "";

      return;
    }

    const syncOverlay = () => {
      if (!chartRef.current || !candleSeriesRef.current || !containerRef.current) {
        return;
      }

      const nextGeometry = buildOverlayGeometry(
        chartRef.current,
        candleSeriesRef.current,
        containerRef.current,
        waveAnalysis,
        probabilityZoneTargets,
        correctivePredictionTarget,
        retracementBarrierTarget,
      );
      const nextFingerprint = buildGeometryFingerprint(nextGeometry);

      if (nextFingerprint !== overlayFingerprintRef.current) {
        overlayFingerprintRef.current = nextFingerprint;
        setOverlayGeometry(nextGeometry);
      }
    };

    const scheduleSync = () => {
      if (overlayAnimationFrameRef.current !== null) {
        return;
      }

      overlayAnimationFrameRef.current = window.requestAnimationFrame(() => {
        overlayAnimationFrameRef.current = null;
        syncOverlay();
      });
    };

    const chart = chartRef.current;
    const timeScale = chart.timeScale();
    const resizeObserver = new ResizeObserver(() => {
      scheduleSync();
    });

    resizeObserver.observe(containerRef.current);
    timeScale.subscribeVisibleLogicalRangeChange(scheduleSync);
    scheduleSync();
    const settleAnimationFrameId = window.requestAnimationFrame(() => {
      scheduleSync();
    });

    return () => {
      resizeObserver.disconnect();
      timeScale.unsubscribeVisibleLogicalRangeChange(scheduleSync);
      window.cancelAnimationFrame(settleAnimationFrameId);

      if (overlayAnimationFrameRef.current !== null) {
        window.cancelAnimationFrame(overlayAnimationFrameRef.current);
        overlayAnimationFrameRef.current = null;
      }
    };
  }, [
    correctivePredictionTarget,
    probabilityZoneTargets,
    retracementBarrierTarget,
    waveAnalysis,
    wavePoints.length,
  ]);

  useEffect(() => {
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", stopDragging);
    };
  }, [handlePointerMove, stopDragging]);

  const impulseSegments = useMemo(
    () => buildLineSegments(overlayGeometry.impulsePoints),
    [overlayGeometry.impulsePoints],
  );
  const correctiveSegments = useMemo(
    () => buildLineSegments(overlayGeometry.correctivePoints),
    [overlayGeometry.correctivePoints],
  );
  const activeWaveLabel =
    waveAnalysis.activePattern === "corrective"
      ? "Corrective"
      : waveAnalysis.activePattern === "impulse"
        ? "Impulse"
        : "No Waves";

  return (
    <div className="relative flex h-full min-h-[460px] max-h-full flex-1 overflow-hidden rounded-[20px] border border-white/6 bg-[linear-gradient(180deg,rgba(9,14,26,0.94),rgba(6,10,19,0.98))] shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] xl:min-h-0">
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-center justify-between px-4 py-2.5">
        <div>
          <p className="text-[11px] uppercase tracking-[0.34em] text-muted-foreground">
            Live Chart
          </p>
          <p className="mt-0.5 text-sm font-medium text-foreground">
            {METAL_SYMBOLS[symbol].displayName} · {timeframeLabel}
          </p>
        </div>
      </div>

      <div className="absolute right-4 top-3 z-30 flex flex-wrap items-center gap-2">
        <div className="flex items-center rounded-xl border border-white/10 bg-[rgba(6,11,21,0.82)] p-1 shadow-[0_14px_36px_rgba(0,0,0,0.2)] backdrop-blur-xl">
          <Button
            size="sm"
            variant={interactionMode === "manual" && manualWaveMode === "impulse" ? "default" : "ghost"}
            className={cn(
              "h-8 px-3 text-xs",
              !(interactionMode === "manual" && manualWaveMode === "impulse") &&
                "text-muted-foreground",
            )}
            onClick={() => {
              setManualWaveMode("impulse");
              updateInteractionMode("manual");
            }}
          >
            Manual 5-Wave
          </Button>
          <Button
            size="sm"
            variant={interactionMode === "manual" && manualWaveMode === "corrective" ? "default" : "ghost"}
            className={cn(
              "h-8 px-3 text-xs",
              !(interactionMode === "manual" && manualWaveMode === "corrective") &&
                "text-muted-foreground",
            )}
            onClick={() => {
              setManualWaveMode("corrective");
              updateInteractionMode("manual");
            }}
          >
            Manual 3-Wave
          </Button>
        </div>

        <Button
          size="sm"
          variant="outline"
          className="h-8 px-3 text-xs"
          onClick={handleAutoDetectWaves}
        >
          Auto-Detect Waves
        </Button>

        {interactionMode === "manual" && manualWaveMode === "corrective" ? (
          <Button
            size="sm"
            variant={showCorrectivePrediction ? "default" : "outline"}
            className={cn(
              "h-8 px-3 text-xs",
              !availableCorrectivePredictionTarget && "opacity-50",
            )}
            disabled={!availableCorrectivePredictionTarget}
            onClick={() =>
              setShowCorrectivePrediction((currentValue) => !currentValue)
            }
          >
            {showCorrectivePrediction ? "Hide Wave C Forecast" : "Predict Wave C"}
          </Button>
        ) : null}

        <Button
          size="sm"
          variant="outline"
          className="h-8 px-3 text-xs"
          onClick={handleClearWaves}
        >
          Clear Waves
        </Button>
      </div>

      <div className="pointer-events-none absolute left-4 top-14 z-20 rounded-xl border border-white/8 bg-[rgba(6,11,21,0.76)] px-3 py-1.5 text-[10px] uppercase tracking-[0.22em] text-muted-foreground shadow-[0_16px_40px_rgba(0,0,0,0.16)] backdrop-blur-xl">
        {activeWaveLabel} ·{" "}
        {interactionMode === "manual"
          ? manualWaveMode === "impulse"
            ? "Click To Plot 5-Wave"
            : "Click To Plot 3-Wave"
          : "Auto Overlay"}
      </div>

      <div className="absolute inset-x-0 bottom-0 top-12 overflow-hidden">
        <div ref={containerRef} className="absolute inset-0 h-full w-full min-h-0" />

        {overlayGeometry.width > 0 || overlayGeometry.height > 0 ? (
          <svg
            className="pointer-events-none absolute inset-0 z-20 h-full w-full"
            width="100%"
            height="100%"
            viewBox={`0 0 ${overlayGeometry.width} ${overlayGeometry.height}`}
            preserveAspectRatio="none"
          >
          {overlayGeometry.probabilityZones.map((zone) => (
            <g key={zone.id}>
              {(() => {
                const colors = getProbabilityZoneColors(zone.pattern);
                const labelBoxY = Math.max(12, zone.topY - 35);
                const labelBoxWidth = 198;
                const labelBoxHeight = 34;
                const labelBoxX = Math.max(12, overlayGeometry.width - labelBoxWidth - 12);
                const tooltipLines = [
                  zone.label,
                  `Confidence: ${zone.confidenceLabel} (${Math.round(zone.confidence)}%)`,
                  zone.reasonSummary,
                  ...zone.reasons,
                  zone.invalidationLevel
                    ? `Invalidation: ${formatOverlayPrice(zone.invalidationLevel)}`
                    : null,
                ]
                  .filter((line): line is string => Boolean(line))
                  .join("\n");

                return (
                  <>
                    <title>{tooltipLines}</title>
                    <rect
                      x={10}
                      y={zone.topY}
                      width={Math.max(overlayGeometry.width - 20, 0)}
                      height={Math.max(zone.bottomY - zone.topY, 14)}
                      rx={8}
                      fill={colors.fill}
                      stroke={colors.stroke}
                      strokeWidth={1.05}
                    />
                    <line
                      x1={16}
                      y1={zone.centerY}
                      x2={overlayGeometry.width - 158}
                      y2={zone.centerY}
                      stroke={colors.line}
                      strokeDasharray="4 5"
                      strokeWidth={1}
                    />
                    <rect
                      x={labelBoxX}
                      y={labelBoxY}
                      width={labelBoxWidth}
                      height={labelBoxHeight}
                      rx={9}
                      fill="rgba(12, 18, 31, 0.92)"
                      stroke={colors.labelStroke}
                    />
                    <text
                      x={labelBoxX + labelBoxWidth / 2}
                      y={labelBoxY + 11}
                      fill={colors.labelText}
                      fontSize="9.1"
                      fontWeight="700"
                      textAnchor="middle"
                    >
                      {truncateOverlayText(zone.label, 28)}
                    </text>
                    <text
                      x={labelBoxX + labelBoxWidth / 2}
                      y={labelBoxY + 21}
                      fill={colors.valueText}
                      fontSize="8.9"
                      fontWeight="600"
                      textAnchor="middle"
                    >
                      {`Confidence: ${zone.confidenceLabel}`}
                    </text>
                    <text
                      x={labelBoxX + labelBoxWidth / 2}
                      y={labelBoxY + 30}
                      fill={colors.valueText}
                      fontSize="8.35"
                      fontWeight="500"
                      textAnchor="middle"
                    >
                      {truncateOverlayText(zone.reasonSummary, 34)}
                    </text>
                  </>
                );
              })()}
            </g>
          ))}

          {overlayGeometry.retracementBarrier ? (
            <g>
              <rect
                x={10}
                y={overlayGeometry.retracementBarrier.topY}
                width={Math.max(overlayGeometry.width - 20, 0)}
                height={Math.max(
                  overlayGeometry.retracementBarrier.bottomY -
                    overlayGeometry.retracementBarrier.topY,
                  12,
                )}
                rx={8}
                fill="rgba(239, 68, 68, 0.1)"
                stroke="rgba(248, 113, 113, 0.24)"
                strokeWidth={1.05}
              />
              {overlayGeometry.retracementBarrier.levels.map((level) => (
                <g key={level.id}>
                  <line
                    x1={16}
                    y1={level.y}
                    x2={overlayGeometry.width - 118}
                    y2={level.y}
                    stroke={
                      level.emphasis === "primary"
                        ? "rgba(252, 165, 165, 0.72)"
                        : "rgba(248, 113, 113, 0.48)"
                    }
                    strokeDasharray={level.emphasis === "primary" ? "4 5" : "3 6"}
                    strokeWidth={level.emphasis === "primary" ? 1.15 : 0.95}
                  />
                  <text
                    x={overlayGeometry.width - 108}
                    y={level.y - 3}
                    fill={level.emphasis === "primary" ? "#fca5a5" : "#fda4af"}
                    fontSize="8.9"
                    fontWeight={level.emphasis === "primary" ? "700" : "600"}
                    textAnchor="start"
                  >
                    {level.label}
                  </text>
                </g>
              ))}
              <rect
                x={Math.max(12, overlayGeometry.width - 174)}
                y={overlayGeometry.retracementBarrier.topY - 11}
                width={162}
                height={18}
                rx={9}
                fill="rgba(12, 18, 31, 0.9)"
                stroke="rgba(248, 113, 113, 0.28)"
              />
              <text
                x={overlayGeometry.width - 93}
                y={overlayGeometry.retracementBarrier.topY + 1}
                fill="#fca5a5"
                fontSize="9.3"
                fontWeight="700"
                textAnchor="middle"
              >
                {overlayGeometry.retracementBarrier.label}
              </text>
            </g>
          ) : null}

          {overlayGeometry.correctivePrediction ? (
            <g>
              {(() => {
                const prediction = overlayGeometry.correctivePrediction;
                const zoneTopY = Math.min(prediction.targetY, prediction.startY) - 20;
                const labelWidth = 188;
                const labelHeight = 42;
                const labelX = clamp(
                  prediction.targetX - labelWidth / 2,
                  12,
                  Math.max(overlayGeometry.width - labelWidth - 12, 12),
                );
                const labelY = clamp(
                  zoneTopY - 50,
                  12,
                  Math.max(overlayGeometry.height - labelHeight - 12, 12),
                );
                const bandTopPrice = Math.max(prediction.zoneLow, prediction.zoneHigh);
                const bandBottomPrice = Math.min(prediction.zoneLow, prediction.zoneHigh);
                const bandTopCoordinate = candleSeriesRef.current?.priceToCoordinate(
                  bandTopPrice,
                );
                const bandBottomCoordinate = candleSeriesRef.current?.priceToCoordinate(
                  bandBottomPrice,
                );
                const bandTopY =
                  bandTopCoordinate === null || bandBottomCoordinate === null
                    ? prediction.targetY - 12
                    : Math.min(Number(bandTopCoordinate), Number(bandBottomCoordinate));
                const bandBottomY =
                  bandTopCoordinate === null || bandBottomCoordinate === null
                    ? prediction.targetY + 12
                    : Math.max(Number(bandTopCoordinate), Number(bandBottomCoordinate));
                const tooltipLines = [
                  prediction.label,
                  `Target: ${formatOverlayPrice(prediction.targetPrice)}`,
                  `Confidence: ${prediction.confidenceLabel} (${Math.round(prediction.confidence)}%)`,
                  prediction.reasonSummary,
                  ...prediction.reasons,
                  prediction.invalidationLevel
                    ? `Invalidation: ${formatOverlayPrice(prediction.invalidationLevel)}`
                    : null,
                ]
                  .filter((line): line is string => Boolean(line))
                  .join("\n");

                return (
                  <>
                    <title>{tooltipLines}</title>
                    <rect
                      x={prediction.startX + 10}
                      y={bandTopY}
                      width={Math.max(prediction.targetX - prediction.startX - 20, 48)}
                      height={Math.max(bandBottomY - bandTopY, 16)}
                      rx={8}
                      fill="rgba(234, 179, 8, 0.1)"
                      stroke="rgba(250, 204, 21, 0.28)"
                      strokeWidth={1}
                    />
                    <line
                      x1={prediction.startX}
                      y1={prediction.startY}
                      x2={prediction.targetX}
                      y2={prediction.targetY}
                      stroke="rgba(250, 204, 21, 0.82)"
                      strokeWidth={1.8}
                      strokeDasharray="5 6"
                      strokeLinecap="round"
                    />
                    <circle
                      cx={prediction.targetX}
                      cy={prediction.targetY}
                      r={5}
                      fill="#06111f"
                      stroke="#fde047"
                      strokeWidth={1.8}
                    />
                    <rect
                      x={labelX}
                      y={labelY}
                      width={labelWidth}
                      height={labelHeight}
                      rx={10}
                      fill="rgba(12, 18, 31, 0.92)"
                      stroke="rgba(250, 204, 21, 0.26)"
                    />
                    <text
                      x={labelX + labelWidth / 2}
                      y={labelY + 13}
                      fill="#fde047"
                      fontSize="9.4"
                      fontWeight="700"
                      textAnchor="middle"
                    >
                      {prediction.label}
                    </text>
                    <text
                      x={labelX + labelWidth / 2}
                      y={labelY + 24}
                      fill="#fef08a"
                      fontSize="8.9"
                      fontWeight="600"
                      textAnchor="middle"
                    >
                      {`Confidence: ${prediction.confidenceLabel} · ${Math.round(prediction.confidence)}%`}
                    </text>
                    <text
                      x={labelX + labelWidth / 2}
                      y={labelY + 35}
                      fill="#fde68a"
                      fontSize="8.25"
                      fontWeight="500"
                      textAnchor="middle"
                    >
                      {truncateOverlayText(prediction.reasonSummary, 34)}
                    </text>
                  </>
                );
              })()}
            </g>
          ) : null}

          {overlayGeometry.fibonacciLevels.map((level) => (
            <g key={level.id}>
              <line
                x1={14}
                y1={level.y}
                x2={overlayGeometry.width - 14}
                y2={level.y}
                stroke={FIB_LINE_COLOR}
                strokeDasharray={level.isActive ? "4 6" : "3 7"}
                strokeWidth={level.isActive ? 1.1 : 1}
              />
              <rect
                x={Math.max(12, overlayGeometry.width - 118)}
                y={level.y - 7}
                width={106}
                height={14}
                rx={7}
                fill={level.isActive ? "rgba(216,168,77,0.08)" : "rgba(14, 20, 33, 0.7)"}
                stroke={level.isActive ? "rgba(216,168,77,0.22)" : "rgba(255,255,255,0.03)"}
              />
              <text
                x={overlayGeometry.width - 65}
                y={level.y + 2.7}
                fill={level.isActive ? "#f2c879" : "#9eb1c9"}
                fontSize="8.75"
                fontWeight="600"
                textAnchor="middle"
              >
                {level.label}
              </text>
            </g>
          ))}

          {impulseSegments.map((segment) => (
            <line
              key={segment.id}
              x1={segment.x1}
              y1={segment.y1}
              x2={segment.x2}
              y2={segment.y2}
              stroke={segment.color}
              strokeWidth={1.8}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}

          {correctiveSegments.map((segment) => (
            <line
              key={segment.id}
              x1={segment.x1}
              y1={segment.y1}
              x2={segment.x2}
              y2={segment.y2}
              stroke={segment.color}
              strokeWidth={1.8}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}

          {[...overlayGeometry.impulsePoints, ...overlayGeometry.correctivePoints].map((point) => (
            <g key={point.id}>
              <circle
                cx={point.x}
                cy={point.y}
                r={draggingPointId === point.id ? 6.5 : 5}
                fill="#06111f"
                stroke={point.color}
                strokeWidth={1.8}
                className={cn(
                  "pointer-events-auto cursor-grab transition-all",
                  interactionMode !== "manual" && "cursor-default",
                )}
                onPointerDown={startDraggingPoint(point.id)}
              />
              <rect
                x={point.x - point.labelWidth / 2}
                y={point.y + point.labelOffsetY - point.labelHeight / 2 - 1}
                width={point.labelWidth}
                height={point.labelHeight}
                rx={9}
                fill={LABEL_BACKGROUND_FILL}
                stroke={LABEL_BACKGROUND_STROKE}
              />
              <text
                x={point.x}
                y={point.y + point.labelOffsetY + 4}
                fill={point.color}
                fontSize="13.25"
                fontWeight="700"
                textAnchor="middle"
              >
                {point.displayLabel}
              </text>
            </g>
          ))}
          </svg>
        ) : null}
      </div>

      {isLoading && candles.length === 0 ? (
        <div className="absolute inset-0 z-40 flex flex-col gap-3 bg-[rgba(5,8,18,0.76)] p-5 backdrop-blur-sm">
          <Skeleton className="h-4 w-36 bg-white/8" />
          <Skeleton className="h-full w-full rounded-[18px] bg-white/6" />
        </div>
      ) : null}
    </div>
  );
}
