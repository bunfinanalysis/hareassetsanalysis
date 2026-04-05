"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  LineStyle,
  createChart,
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
  probabilityZone: OverlayProbabilityZone | null;
};

type WaveAnalysis = {
  impulsePoints: WavePoint[];
  correctivePoints: WavePoint[];
  activePattern: WavePatternType | null;
  activeCount: WaveCount | null;
  activeDirection: WaveTrend;
  validation: ReturnType<typeof validateWaveCount> | null;
};

export type MetalChartInteractionMode = InteractionMode;
export type MetalChartWaveAnalysis = WaveAnalysis;

type ProbabilityZoneTarget = {
  id: string;
  label: string;
  priceLow: number;
  priceHigh: number;
  centerPrice: number;
  confidence: number;
};

type OverlayProbabilityZone = ProbabilityZoneTarget & {
  topY: number;
  bottomY: number;
  centerY: number;
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
  probabilityZone: null,
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

function getNextLogicalLabel(points: WavePoint[]): WaveLabel {
  const sortedPoints = sortWavePoints(points);
  const correctivePoints = sortedPoints.filter((point) => isCorrectiveLabel(point.label));

  if (correctivePoints.length > 0) {
    return correctivePoints.length < CORRECTIVE_LABELS.length
      ? CORRECTIVE_LABELS[correctivePoints.length]
      : IMPULSE_LABELS[0];
  }

  const impulsePoints = sortedPoints.filter((point) => isImpulseLabel(point.label));

  if (impulsePoints.length < IMPULSE_LABELS.length) {
    return IMPULSE_LABELS[impulsePoints.length];
  }

  return CORRECTIVE_LABELS[0];
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
  const activePattern: WavePatternType | null =
    correctivePoints.length > 0
      ? "corrective"
      : impulsePoints.length > 0
        ? "impulse"
        : null;

  if (!activePattern) {
    return {
      impulsePoints,
      correctivePoints,
      activePattern: null,
      activeCount: null,
      activeDirection: "bullish",
      validation: null,
    };
  }

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
  label: string,
  values: [number, number],
  confidence: number,
): ProbabilityZoneTarget | null {
  const [firstValue, secondValue] = values;

  if (!Number.isFinite(firstValue) || !Number.isFinite(secondValue)) {
    return null;
  }

  const priceLow = Math.min(firstValue, secondValue);
  const priceHigh = Math.max(firstValue, secondValue);

  return {
    id,
    label,
    priceLow,
    priceHigh,
    centerPrice: (priceLow + priceHigh) / 2,
    confidence,
  };
}

function buildProbabilityZoneTarget(
  count: WaveCount | null,
  validation: ReturnType<typeof validateWaveCount> | null,
) {
  if (!count || !count.anchor || count.points.length === 0) {
    return null;
  }

  const points = sortWavePoints(count.points);
  const confidence = toConfidenceScore(count, validation);

  if (count.pattern === "impulse") {
    if (points.length === 1) {
      const wave1Move = points[0].price - count.anchor.price;

      return createProbabilityZoneTarget(
        `${count.anchor.id}-wave2-zone`,
        "Wave 2 Retracement",
        [
          points[0].price - wave1Move * 0.786,
          points[0].price - wave1Move * 0.382,
        ],
        confidence,
      );
    }

    if (points.length === 2) {
      const wave1Move = points[0].price - count.anchor.price;

      return createProbabilityZoneTarget(
        `${count.anchor.id}-wave3-zone`,
        "Primary Target Zone",
        [
          points[1].price + wave1Move * 1.272,
          points[1].price + wave1Move * 1.618,
        ],
        confidence,
      );
    }

    if (points.length === 3) {
      const wave3Move = points[2].price - points[1].price;

      return createProbabilityZoneTarget(
        `${count.anchor.id}-wave4-zone`,
        "Wave 4 Retracement",
        [
          points[2].price - wave3Move * 0.5,
          points[2].price - wave3Move * 0.236,
        ],
        confidence,
      );
    }

    if (points.length === 4) {
      const wave1Move = points[0].price - count.anchor.price;

      return createProbabilityZoneTarget(
        `${count.anchor.id}-wave5-zone`,
        "Primary Target Zone",
        [
          points[3].price + wave1Move * 0.618,
          points[3].price + wave1Move,
        ],
        confidence,
      );
    }

    const fullImpulseMove = points[4].price - count.anchor.price;

    return createProbabilityZoneTarget(
      `${count.anchor.id}-wavea-zone`,
      "Primary Target Zone",
      [
        points[4].price - fullImpulseMove * 0.382,
        points[4].price - fullImpulseMove * 0.236,
      ],
      confidence,
    );
  }

  if (points.length === 1) {
    const waveAMove = points[0].price - count.anchor.price;

    return createProbabilityZoneTarget(
      `${count.anchor.id}-waveb-zone`,
      "Wave B Retracement",
      [
        points[0].price - waveAMove * 0.886,
        points[0].price - waveAMove * 0.382,
      ],
      confidence,
    );
  }

  if (points.length === 2) {
    const waveAMove = points[0].price - count.anchor.price;

    return createProbabilityZoneTarget(
      `${count.anchor.id}-wavec-zone`,
      "Wave C Objective",
      [
        points[1].price + waveAMove,
        points[1].price + waveAMove * 1.618,
      ],
      confidence,
    );
  }

  if (validation?.fibonacciLevels.length) {
    const activeLevel =
      validation.fibonacciLevels.find((level) => level.isActive) ??
      validation.fibonacciLevels[0];

    return createProbabilityZoneTarget(
      `${count.anchor.id}-postc-zone`,
      "Post-C Reversal Zone",
      [
        activeLevel.price * 0.9985,
        activeLevel.price * 1.0015,
      ],
      confidence,
    );
  }

  return null;
}

function pickProbabilityZoneTarget(
  primary: ProbabilityZoneTarget | null,
  alternate: ProbabilityZoneTarget | null,
) {
  if (!primary) {
    return alternate;
  }

  if (!alternate) {
    return primary;
  }

  if (alternate.confidence > primary.confidence + 4) {
    return alternate;
  }

  return primary;
}

function buildOverlayGeometry(
  chart: IChartApi,
  series: ISeriesApi<"Candlestick", Time>,
  container: HTMLDivElement,
  analysis: WaveAnalysis,
  probabilityZoneTarget: ProbabilityZoneTarget | null,
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
  const probabilityZone = (() => {
    if (!probabilityZoneTarget) {
      return null;
    }

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
  })();

  return {
    width: container.clientWidth,
    height: container.clientHeight,
    impulsePoints,
    correctivePoints,
    fibonacciLevels,
    probabilityZone,
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
    probabilityZone: geometry.probabilityZone
      ? [
          geometry.probabilityZone.id,
          geometry.probabilityZone.label,
          Math.round(geometry.probabilityZone.topY),
          Math.round(geometry.probabilityZone.bottomY),
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
  return JSON.stringify({
    activePattern: analysis.activePattern,
    activeDirection: analysis.activeDirection,
    activeCount: analysis.activeCount
      ? {
          pattern: analysis.activeCount.pattern,
          direction: analysis.activeCount.direction,
          degree: analysis.activeCount.degree,
          source: analysis.activeCount.source,
          confidence: analysis.activeCount.confidence,
          anchor: analysis.activeCount.anchor
            ? {
                time: analysis.activeCount.anchor.time,
                price: analysis.activeCount.anchor.price,
                kind: analysis.activeCount.anchor.kind,
              }
            : null,
          points: analysis.activeCount.points.map((point) => ({
            id: point.id,
            label: point.label,
            time: point.time,
            price: point.price,
            source: point.source,
          })),
        }
      : null,
    validation: analysis.validation
      ? {
          pattern: analysis.validation.pattern,
          direction: analysis.validation.direction,
          isValid: analysis.validation.isValid,
          hardRulePassed: analysis.validation.hardRulePassed,
          score: analysis.validation.score,
          rules: analysis.validation.rules.map((rule) => ({
            id: rule.id,
            status: rule.status,
            message: rule.message,
          })),
          fibonacciLevels: analysis.validation.fibonacciLevels.map((level) => ({
            id: level.id,
            price: level.price,
            isActive: level.isActive,
          })),
        }
      : null,
  });
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
  const probabilityZoneTarget = useMemo(() => {
    const primaryZone = buildProbabilityZoneTarget(
      waveAnalysis.activeCount,
      waveAnalysis.validation,
    );
    const alternateZone = buildProbabilityZoneTarget(
      alternateWaveCount,
      alternateWaveValidation,
    );

    return pickProbabilityZoneTarget(primaryZone, alternateZone);
  }, [
    alternateWaveCount,
    alternateWaveValidation,
    waveAnalysis.activeCount,
    waveAnalysis.validation,
  ]);

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

    if (!detection.count) {
      return;
    }

    updateInteractionMode("auto");
    updateWavePoints(
      sortWavePoints(
        detection.count.points.map((point) =>
          createWavePoint({
            ...point,
            source: "auto",
          }),
        ),
      ),
    );
    const nextAlternateCandidate = detection.rankedCounts[1] ?? null;
    setAlternateWaveCount(nextAlternateCandidate?.count ?? null);
    setAlternateWaveValidation(nextAlternateCandidate?.validation ?? null);
    publishAlternateCount(
      nextAlternateCandidate?.count ?? null,
      nextAlternateCandidate?.validation ?? null,
    );
  }, [publishAlternateCount, updateInteractionMode, updateWavePoints]);

  const handleClearWaves = useCallback(() => {
    updateWavePoints([]);
    updateInteractionMode("manual");
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
        const nextLabel = getNextLogicalLabel(currentPoints);
        const shouldReset = nextLabel === "1";
        const basePoints = shouldReset ? [] : currentPoints;

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
    [projectInteractionPoint, resetAlternateCount, updateWavePoints],
  );

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
    resetAlternateCount();
    dragPointIdRef.current = null;
    setDraggingPointId(null);
  }, [resetAlternateCount, symbol, timeframeLabel, updateInteractionMode, updateWavePoints]);

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

    chart.subscribeClick(handleChartClick);

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
      chart.unsubscribeClick(handleChartClick);
      resizeObserverRef.current?.disconnect();
      resizeObserverRef.current = null;
      candleSeriesRef.current = null;
      chart.remove();
      chartRef.current = null;
    };
  }, [handleChartClick]);

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
    if (!chartRef.current || !candleSeriesRef.current || !containerRef.current) {
      return;
    }

    if (
      wavePoints.length === 0 &&
      (waveAnalysis.validation?.fibonacciLevels.length ?? 0) === 0 &&
      !probabilityZoneTarget
    ) {
      setOverlayGeometry((currentGeometry) =>
        currentGeometry.impulsePoints.length === 0 &&
        currentGeometry.correctivePoints.length === 0 &&
        currentGeometry.fibonacciLevels.length === 0 &&
        currentGeometry.probabilityZone === null
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
        probabilityZoneTarget,
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
  }, [probabilityZoneTarget, waveAnalysis, wavePoints.length]);

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
    <div className="relative flex h-full min-h-[520px] max-h-full flex-1 overflow-hidden rounded-[20px] border border-white/6 bg-[linear-gradient(180deg,rgba(9,14,26,0.94),rgba(6,10,19,0.98))] shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
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
            variant={interactionMode === "manual" ? "default" : "ghost"}
            className={cn("h-8 px-3 text-xs", interactionMode !== "manual" && "text-muted-foreground")}
            onClick={() => updateInteractionMode("manual")}
          >
            Manual
          </Button>
          <Button
            size="sm"
            variant={interactionMode === "auto" ? "default" : "ghost"}
            className={cn("h-8 px-3 text-xs", interactionMode !== "auto" && "text-muted-foreground")}
            onClick={() => updateInteractionMode("auto")}
          >
            Auto
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
        {activeWaveLabel} · {interactionMode === "manual" ? "Click To Plot" : "Auto Overlay"}
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
          {overlayGeometry.probabilityZone ? (
            <g>
              <rect
                x={10}
                y={overlayGeometry.probabilityZone.topY}
                width={Math.max(overlayGeometry.width - 20, 0)}
                height={Math.max(
                  overlayGeometry.probabilityZone.bottomY -
                    overlayGeometry.probabilityZone.topY,
                  12,
                )}
                rx={8}
                fill="rgba(249, 115, 22, 0.18)"
                stroke="rgba(249, 115, 22, 0.34)"
                strokeWidth={1.1}
              />
              <line
                x1={10}
                y1={overlayGeometry.probabilityZone.centerY}
                x2={overlayGeometry.width - 10}
                y2={overlayGeometry.probabilityZone.centerY}
                stroke="rgba(249, 115, 22, 0.58)"
                strokeDasharray="5 7"
                strokeWidth={1.2}
              />
              <rect
                x={Math.max(12, overlayGeometry.width - 156)}
                y={overlayGeometry.probabilityZone.centerY - 9}
                width={144}
                height={18}
                rx={9}
                fill="rgba(12, 18, 31, 0.9)"
                stroke="rgba(249, 115, 22, 0.28)"
              />
              <text
                x={overlayGeometry.width - 84}
                y={overlayGeometry.probabilityZone.centerY + 3}
                fill="#fdba74"
                fontSize="9.5"
                fontWeight="600"
                textAnchor="middle"
              >
                {overlayGeometry.probabilityZone.label}
              </text>
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
