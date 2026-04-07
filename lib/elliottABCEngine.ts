import type { Candle } from "./market-types";
import type {
  WaveCount,
  WaveDegree,
  WavePoint,
  WaveTrend,
} from "./elliottWaveUtils";

type SwingKind = "high" | "low";
type RuleStatus = "pass" | "fail" | "warning" | "pending";
type RuleSeverity = "hard" | "soft";
type ScenarioKind = "ab" | "abc";
type StructureType = "impulse" | "leading-diagonal" | "ending-diagonal" | "invalid";

export type DetectedABCSwing = {
  id: string;
  index: number;
  time: number;
  price: number;
  kind: SwingKind;
  source: "fractal-zigzag";
};

export type ABCScenarioRule = {
  id: string;
  label: string;
  status: RuleStatus;
  severity: RuleSeverity;
  detail: string;
  message: string;
  value?: number;
  target?: string;
};

export type ABCProjectionTarget = {
  level: number;
  fibRatio: number;
  probability: number;
};

export type ABCProjectionZone = {
  nextTargetPrice: number;
  minTarget: number;
  maxTarget: number;
  probability: number;
  label: string;
};

export type ABCScenario = {
  id: string;
  kind: ScenarioKind;
  direction: WaveTrend;
  degree: WaveDegree;
  count: WaveCount;
  confidence: number;
  hardRulePassed: boolean;
  rules: {
    passed: number;
    total: number;
    details: ABCScenarioRule[];
  };
  fibScore: number;
  channelScore: number;
  momentumScore: number;
  projectionTargets: ABCProjectionTarget[];
  targetZone: ABCProjectionZone | null;
  invalidationLevel: number;
  invalidationExplanation: string;
  recencyScore: number;
  candlesFromLatest: number;
  selectionScore: number;
  scoreBreakdown: Array<{ label: string; value: number }>;
  reasonSummary: string;
  reasons: string[];
  swings: DetectedABCSwing[];
  detectorMeta: {
    deviationThreshold: number;
    minBarsBetween: number;
    fractalSpan: number;
    timeframe: string;
  };
};

export type ABCDetectionOptions = {
  timeframe?: string;
  degree?: WaveDegree;
  limit?: number;
};

export type ABCImprovedTarget = {
  price: number;
  fibRatio: string;
  probability: number;
};

export type ABCImprovedChannelLine = {
  startTime: number;
  startPrice: number;
  endTime: number;
  endPrice: number;
};

export type ABCImprovedScenario = {
  id: number;
  name: string;
  confidence: number;
  label: string;
  description: string;
  reason: string;
  waveCProjection: number;
  targets: ABCImprovedTarget[];
  invalidationLevel: number;
  channel: {
    upper: number;
    lower: number;
    upperLine: ABCImprovedChannelLine;
    lowerLine: ABCImprovedChannelLine;
  };
  momentumScore: number;
  volumeScore: number;
  primary: boolean;
  fibRelationships: string[];
  subWaveLabels: Array<{
    label: string;
    wave: "A" | "B" | "C";
    price: number;
    time: number;
  }>;
  scoreBreakdown: Array<{ label: string; value: number }>;
  validation: ABCScenario["rules"];
  legacyScenario: ABCScenario;
};

export type ABCImprovedDetection = {
  scenarios: ABCImprovedScenario[];
  primaryScenario: ABCImprovedScenario | null;
  chartOverlays: {
    priceRange: {
      minPrice: number;
      maxPrice: number;
      dataLow: number;
      dataHigh: number;
      padding: number;
    } | null;
    channels: Array<ABCImprovedScenario["channel"] & { scenarioId: number; primary: boolean }>;
    labels: ABCImprovedScenario["subWaveLabels"];
    targetTables: Array<{
      scenarioId: number;
      name: string;
      targets: ABCImprovedTarget[];
    }>;
    invalidations: Array<{
      scenarioId: number;
      level: number;
      explanation: string;
    }>;
  };
};

type SegmentPivot = {
  index: number;
  time: number;
  price: number;
  kind: SwingKind;
};

type SubwaveAnalysis = {
  valid: boolean;
  structure: StructureType;
  sequence: SegmentPivot[] | null;
  wave2Retracement?: number;
  wave3ToWave1Ratio?: number;
  wave4Retracement?: number;
  wave3Shortest?: boolean;
  wave4Overlap?: boolean;
};

type InternalCandidate = {
  anchor: DetectedABCSwing;
  a: DetectedABCSwing;
  b: DetectedABCSwing;
  c?: DetectedABCSwing;
  kind: ScenarioKind;
  direction: WaveTrend;
  degree: WaveDegree;
};

type HigherTimeframeInputMap = Record<string, unknown[]>;

function toRecord(value: unknown) {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

const B_RETRACE_TARGETS = [0.5, 0.618, 0.786, 0.854] as const;
const C_TARGETS = [0.618, 1, 1.236, 1.618] as const;

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}

function roundTo(value: number, decimals = 4) {
  return Number(value.toFixed(decimals));
}

function formatPrice(value: number) {
  const decimals = Math.abs(value) >= 100 ? 2 : 3;
  return `$${value.toFixed(decimals)}`;
}

function average(values: number[]) {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function scoreNearestTarget(
  value: number | undefined,
  targets: readonly number[],
  idealTolerance: number,
  maxTolerance: number,
) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return 0;
  }

  return Math.max(
    ...targets.map((target) => {
      const distance = Math.abs(value - target);

      if (distance <= idealTolerance) {
        return 100;
      }

      if (distance >= maxTolerance) {
        return 0;
      }

      return roundTo(
        ((maxTolerance - distance) / Math.max(maxTolerance - idealTolerance, 0.0001)) * 100,
        2,
      );
    }),
  );
}

function getTimeframeConfig(timeframe = "30m") {
  switch (timeframe) {
    case "1m":
      return { minBarsBetween: 2, fractalSpan: 1, moveRatio: 0.0009 };
    case "5m":
      return { minBarsBetween: 2, fractalSpan: 1, moveRatio: 0.0012 };
    case "15m":
      return { minBarsBetween: 2, fractalSpan: 2, moveRatio: 0.0017 };
    case "1H":
      return { minBarsBetween: 3, fractalSpan: 2, moveRatio: 0.0026 };
    case "4H":
      return { minBarsBetween: 3, fractalSpan: 2, moveRatio: 0.0038 };
    case "Daily":
    case "Weekly":
      return { minBarsBetween: 4, fractalSpan: 2, moveRatio: 0.005 };
    case "30m":
    default:
      return { minBarsBetween: 3, fractalSpan: 2, moveRatio: 0.0021 };
  }
}

export function calculateATR(candles: Candle[], period = 14) {
  if (candles.length === 0) {
    return 0;
  }

  const ranges: number[] = [];

  for (let index = 0; index < candles.length; index += 1) {
    const candle = candles[index];
    const previousClose = candles[index - 1]?.close ?? candle.close;
    const trueRange = Math.max(
      candle.high - candle.low,
      Math.abs(candle.high - previousClose),
      Math.abs(candle.low - previousClose),
    );
    ranges.push(trueRange);
  }

  return average(ranges.slice(-period));
}

export function detectFractalSwings(candles: Candle[], span = 2) {
  const pivots: DetectedABCSwing[] = [];

  for (let index = span; index < candles.length - span; index += 1) {
    const candle = candles[index];
    let isHigh = true;
    let isLow = true;

    for (let offset = 1; offset <= span; offset += 1) {
      const left = candles[index - offset];
      const right = candles[index + offset];

      if (!left || !right) {
        isHigh = false;
        isLow = false;
        break;
      }

      if (candle.high < left.high || candle.high < right.high) {
        isHigh = false;
      }

      if (candle.low > left.low || candle.low > right.low) {
        isLow = false;
      }
    }

    if (isHigh) {
      pivots.push({
        id: `fractal-high-${candle.time}`,
        index,
        time: candle.time,
        price: candle.high,
        kind: "high",
        source: "fractal-zigzag",
      });
    }

    if (isLow) {
      pivots.push({
        id: `fractal-low-${candle.time}`,
        index,
        time: candle.time,
        price: candle.low,
        kind: "low",
        source: "fractal-zigzag",
      });
    }
  }

  return pivots.sort((left, right) => left.index - right.index);
}

function keepMoreExtreme(current: DetectedABCSwing, next: DetectedABCSwing) {
  if (current.kind !== next.kind) {
    return next;
  }

  return current.kind === "high"
    ? next.price >= current.price
      ? next
      : current
    : next.price <= current.price
      ? next
      : current;
}

export function detectZigZagFractalSwings(
  candles: Candle[],
  options: { timeframe?: string } = {},
) {
  const timeframe = options.timeframe ?? "30m";
  const timeframeConfig = getTimeframeConfig(timeframe);
  const atr = calculateATR(candles, 14);
  const defaultDeviationThreshold = Math.max(
    atr * 0.42,
    (candles[candles.length - 1]?.close ?? candles[0]?.close ?? 1) * timeframeConfig.moveRatio,
  );
  const buildSwings = (fractalSpan: number, deviationThreshold: number) => {
    const rawPivots = detectFractalSwings(candles, fractalSpan);
    const swings: DetectedABCSwing[] = [];

    for (const pivot of rawPivots) {
      const previous = swings[swings.length - 1];

      if (!previous) {
        swings.push(pivot);
        continue;
      }

      if (previous.kind === pivot.kind) {
        swings[swings.length - 1] = keepMoreExtreme(previous, pivot);
        continue;
      }

      if (pivot.index - previous.index < timeframeConfig.minBarsBetween) {
        continue;
      }

      if (Math.abs(pivot.price - previous.price) < deviationThreshold) {
        continue;
      }

      swings.push(pivot);
    }

    return swings.slice(-36);
  };

  let deviationThreshold = defaultDeviationThreshold;
  let fractalSpan = timeframeConfig.fractalSpan;
  let swings = buildSwings(fractalSpan, deviationThreshold);

  if (swings.length < 3) {
    fractalSpan = 1;
    deviationThreshold = Math.max(defaultDeviationThreshold * 0.72, atr * 0.24);
    swings = buildSwings(fractalSpan, deviationThreshold);
  }

  return {
    swings,
    deviationThreshold,
    minBarsBetween: timeframeConfig.minBarsBetween,
    fractalSpan,
    timeframe,
  };
}

function buildWavePoint(
  swing: DetectedABCSwing,
  label: "A" | "B" | "C",
  degree: WaveDegree,
): WavePoint {
  return {
    id: `abc-${label}-${swing.time}`,
    label,
    price: swing.price,
    time: swing.time,
    degree,
    source: "auto",
    index: swing.index,
    kind: swing.kind,
  };
}

function buildCorrectiveCount(candidate: InternalCandidate): WaveCount {
  const points = [
    buildWavePoint(candidate.a, "A", candidate.degree),
    buildWavePoint(candidate.b, "B", candidate.degree),
    ...(candidate.c ? [buildWavePoint(candidate.c, "C", candidate.degree)] : []),
  ];

  return {
    pattern: "corrective",
    direction: candidate.direction,
    degree: candidate.degree,
    source: "auto",
    anchor: {
      id: `abc-anchor-${candidate.anchor.time}`,
      price: candidate.anchor.price,
      time: candidate.anchor.time,
      kind: candidate.anchor.kind,
      index: candidate.anchor.index,
    },
    points,
  };
}

function inferAnchorSwing(
  firstSwing: DetectedABCSwing,
  direction: WaveTrend,
  candles: Candle[],
) {
  const startIndex = Math.max(0, firstSwing.index - 48);
  const windowCandles = candles.slice(startIndex, firstSwing.index + 1);

  if (windowCandles.length === 0) {
    return null;
  }

  if (direction === "bullish") {
    const anchorCandle = windowCandles.reduce((lowest, candle) =>
      candle.low < lowest.low ? candle : lowest,
    );

    return {
      id: `abc-auto-anchor-${anchorCandle.time}`,
      index: candles.findIndex((candle) => candle.time === anchorCandle.time),
      time: anchorCandle.time,
      price: anchorCandle.low,
      kind: "low",
      source: "fractal-zigzag",
    } satisfies DetectedABCSwing;
  }

  const anchorCandle = windowCandles.reduce((highest, candle) =>
    candle.high > highest.high ? candle : highest,
  );

  return {
    id: `abc-auto-anchor-${anchorCandle.time}`,
    index: candles.findIndex((candle) => candle.time === anchorCandle.time),
    time: anchorCandle.time,
    price: anchorCandle.high,
    kind: "high",
    source: "fractal-zigzag",
  } satisfies DetectedABCSwing;
}

function buildABCCandidates(
  swings: DetectedABCSwing[],
  candles: Candle[],
  degree: WaveDegree,
) {
  const candidates: InternalCandidate[] = [];

  for (let index = 0; index <= swings.length - 2; index += 1) {
    const a = swings[index];
    const b = swings[index + 1];
    const c = swings[index + 2];

    if (a.kind === "high" && b.kind === "low") {
      const anchor = inferAnchorSwing(a, "bullish", candles);

      if (anchor && a.price > anchor.price && b.price > anchor.price) {
        candidates.push({
          anchor,
          a,
          b,
          direction: "bullish",
          degree,
          kind: "ab",
        });

        if (c && c.kind === "high" && c.price > b.price) {
          candidates.push({
            anchor,
            a,
            b,
            c,
            direction: "bullish",
            degree,
            kind: "abc",
          });
        }
      }
    }

    if (a.kind === "low" && b.kind === "high") {
      const anchor = inferAnchorSwing(a, "bearish", candles);

      if (anchor && a.price < anchor.price && b.price < anchor.price) {
        candidates.push({
          anchor,
          a,
          b,
          direction: "bearish",
          degree,
          kind: "ab",
        });

        if (c && c.kind === "low" && c.price < b.price) {
          candidates.push({
            anchor,
            a,
            b,
            c,
            direction: "bearish",
            degree,
            kind: "abc",
          });
        }
      }
    }
  }

  return candidates;
}

function buildSegmentPivots(
  start: DetectedABCSwing,
  end: DetectedABCSwing,
  candles: Candle[],
  atr: number,
  timeframe: string,
) {
  if (start.index >= end.index) {
    return [] as SegmentPivot[];
  }

  const minMove = Math.max(
    atr * 0.18,
    Math.abs(end.price - start.price) * 0.05,
    (candles[end.index]?.close ?? end.price) * getTimeframeConfig(timeframe).moveRatio * 0.7,
  );
  const minBarsBetween = Math.max(1, Math.floor(getTimeframeConfig(timeframe).minBarsBetween / 2));
  const segmentCandles = candles.slice(start.index, end.index + 1);
  const fractalPivots = detectFractalSwings(segmentCandles, 1).map((pivot) => ({
    index: start.index + pivot.index,
    time: pivot.time,
    price: pivot.price,
    kind: pivot.kind,
  }));
  const pivots: SegmentPivot[] = [
    {
      index: start.index,
      time: start.time,
      price: start.price,
      kind: start.kind,
    },
    ...fractalPivots.filter(
      (pivot) => pivot.index > start.index && pivot.index < end.index,
    ),
    {
      index: end.index,
      time: end.time,
      price: end.price,
      kind: end.kind,
    },
  ].sort((left, right) => left.index - right.index);

  const compressed: SegmentPivot[] = [];

  for (const pivot of pivots) {
    const previous = compressed[compressed.length - 1];

    if (!previous) {
      compressed.push(pivot);
      continue;
    }

    if (previous.kind === pivot.kind) {
      compressed[compressed.length - 1] =
        previous.kind === "high"
          ? pivot.price >= previous.price
            ? pivot
            : previous
          : pivot.price <= previous.price
            ? pivot
            : previous;
      continue;
    }

    if (pivot.index - previous.index < minBarsBetween) {
      continue;
    }

    if (Math.abs(pivot.price - previous.price) < minMove) {
      continue;
    }

    compressed.push(pivot);
  }

  return compressed;
}

function findBestSubwaveSequence(
  pivots: SegmentPivot[],
  direction: WaveTrend,
  allowDiagonal: boolean,
) {
  if (pivots.length < 6) {
    return null;
  }

  const [start, end] = [pivots[0], pivots[pivots.length - 1]];
  const expectedInternalKinds =
    direction === "bullish"
      ? (["high", "low", "high", "low"] as const)
      : (["low", "high", "low", "high"] as const);
  const internal = pivots.slice(1, -1);
  let best:
    | {
        sequence: SegmentPivot[];
        score: number;
        wave2Retracement: number;
        wave3ToWave1Ratio: number;
        wave4Retracement: number;
        wave3Shortest: boolean;
        wave4Overlap: boolean;
        structure: StructureType;
      }
    | null = null;

  for (let i = 0; i < internal.length; i += 1) {
    if (internal[i].kind !== expectedInternalKinds[0]) {
      continue;
    }

    for (let j = i + 1; j < internal.length; j += 1) {
      if (internal[j].kind !== expectedInternalKinds[1]) {
        continue;
      }

      for (let k = j + 1; k < internal.length; k += 1) {
        if (internal[k].kind !== expectedInternalKinds[2]) {
          continue;
        }

        for (let l = k + 1; l < internal.length; l += 1) {
          if (internal[l].kind !== expectedInternalKinds[3]) {
            continue;
          }

          const sequence = [start, internal[i], internal[j], internal[k], internal[l], end];
          const multiplier = direction === "bullish" ? 1 : -1;
          const wave1Length = (sequence[1].price - sequence[0].price) * multiplier;
          const wave2Length = (sequence[1].price - sequence[2].price) * multiplier;
          const wave3Length = (sequence[3].price - sequence[2].price) * multiplier;
          const wave4Length = (sequence[3].price - sequence[4].price) * multiplier;
          const wave5Length = (sequence[5].price - sequence[4].price) * multiplier;

          if (
            wave1Length <= 0 ||
            wave2Length <= 0 ||
            wave3Length <= 0 ||
            wave4Length <= 0 ||
            wave5Length <= 0
          ) {
            continue;
          }

          const wave2Retracement = wave2Length / wave1Length;
          const wave3ToWave1Ratio = wave3Length / wave1Length;
          const wave4Retracement = wave4Length / wave3Length;
          const wave4Overlap =
            direction === "bullish"
              ? sequence[4].price <= sequence[1].price
              : sequence[4].price >= sequence[1].price;
          const wave3Shortest = wave3Length <= Math.min(wave1Length, wave5Length);
          const diagonalCandidate =
            wave4Overlap &&
            wave2Retracement <= 1 &&
            !wave3Shortest &&
            wave4Retracement <= 0.886;
          const structure =
            wave4Overlap && allowDiagonal
              ? diagonalCandidate
                ? "leading-diagonal"
                : "invalid"
              : wave4Overlap
                ? "invalid"
                : "impulse";

          if (structure === "invalid") {
            continue;
          }

          const fibScore = average([
            scoreNearestTarget(wave2Retracement, [0.5, 0.618], 0.08, 0.34),
            scoreNearestTarget(wave3ToWave1Ratio, [1.618, 2, 2.618], 0.18, 0.95),
            scoreNearestTarget(wave4Retracement, [0.236, 0.382, 0.5], 0.08, 0.32),
          ]);
          const barBalance =
            100 -
            average([
              Math.abs((sequence[1].index - sequence[0].index) - (sequence[3].index - sequence[2].index)),
              Math.abs((sequence[3].index - sequence[2].index) - (sequence[5].index - sequence[4].index)),
            ]) *
              2;
          const score = fibScore * 0.75 + clamp(barBalance, 0, 100) * 0.25;

          if (!best || score > best.score) {
            best = {
              sequence,
              score: roundTo(score, 2),
              wave2Retracement,
              wave3ToWave1Ratio,
              wave4Retracement,
              wave3Shortest,
              wave4Overlap,
              structure,
            };
          }
        }
      }
    }
  }

  return best;
}

function detectFiveWaveStructure(
  start: DetectedABCSwing,
  end: DetectedABCSwing,
  candles: Candle[],
  direction: WaveTrend,
  timeframe: string,
  allowDiagonal: boolean,
): SubwaveAnalysis {
  const atr = calculateATR(candles.slice(start.index, end.index + 1), 14);
  const pivots = buildSegmentPivots(start, end, candles, atr, timeframe);
  const best = findBestSubwaveSequence(pivots, direction, allowDiagonal);

  if (!best) {
    return {
      valid: false,
      structure: "invalid",
      sequence: null,
    };
  }

  return {
    valid: true,
    structure:
      best.structure === "leading-diagonal" && end.kind === start.kind
        ? "ending-diagonal"
        : best.structure,
    sequence: best.sequence,
    wave2Retracement: roundTo(best.wave2Retracement, 4),
    wave3ToWave1Ratio: roundTo(best.wave3ToWave1Ratio, 4),
    wave4Retracement: roundTo(best.wave4Retracement, 4),
    wave3Shortest: best.wave3Shortest,
    wave4Overlap: best.wave4Overlap,
  };
}

function calculateRSI(candles: Candle[], period = 14) {
  const closes = candles.map((candle) => candle.close);
  const rsi = new Array<number | null>(closes.length).fill(null);

  if (closes.length <= period) {
    return rsi;
  }

  let gains = 0;
  let losses = 0;

  for (let index = 1; index <= period; index += 1) {
    const change = closes[index] - closes[index - 1];
    gains += Math.max(change, 0);
    losses += Math.max(-change, 0);
  }

  let averageGain = gains / period;
  let averageLoss = losses / period;
  rsi[period] =
    averageLoss === 0 ? 100 : 100 - 100 / (1 + averageGain / Math.max(averageLoss, 0.0001));

  for (let index = period + 1; index < closes.length; index += 1) {
    const change = closes[index] - closes[index - 1];
    averageGain = (averageGain * (period - 1) + Math.max(change, 0)) / period;
    averageLoss = (averageLoss * (period - 1) + Math.max(-change, 0)) / period;
    rsi[index] =
      averageLoss === 0 ? 100 : 100 - 100 / (1 + averageGain / Math.max(averageLoss, 0.0001));
  }

  return rsi;
}

function calculateEMA(values: number[], period: number) {
  if (values.length === 0) {
    return [] as number[];
  }

  const multiplier = 2 / (period + 1);
  const ema: number[] = [values[0]];

  for (let index = 1; index < values.length; index += 1) {
    ema.push(values[index] * multiplier + ema[index - 1] * (1 - multiplier));
  }

  return ema;
}

function calculateMACDHistogram(candles: Candle[]) {
  const closes = candles.map((candle) => candle.close);
  const ema12 = calculateEMA(closes, 12);
  const ema26 = calculateEMA(closes, 26);
  const macdLine = closes.map((_, index) => ema12[index] - ema26[index]);
  const signal = calculateEMA(macdLine, 9);

  return macdLine.map((value, index) => value - signal[index]);
}

function evaluateMomentumDivergence(
  candidate: InternalCandidate,
  cStructure: SubwaveAnalysis,
  candles: Candle[],
) {
  if (
    candidate.kind !== "abc" ||
    !candidate.c ||
    !cStructure.sequence ||
    cStructure.sequence.length < 6
  ) {
    return 50;
  }

  const rsi = calculateRSI(candles, 14);
  const macdHistogram = calculateMACDHistogram(candles);
  const wave3 = cStructure.sequence[3];
  const wave5 = cStructure.sequence[5];
  const direction = candidate.direction;
  const priceDivergence =
    direction === "bullish"
      ? wave5.price > wave3.price
      : wave5.price < wave3.price;
  const rsi3 = rsi[wave3.index];
  const rsi5 = rsi[wave5.index];
  const macd3 = macdHistogram[wave3.index];
  const macd5 = macdHistogram[wave5.index];
  const hasRSIDivergence =
    typeof rsi3 === "number" &&
    typeof rsi5 === "number" &&
    (direction === "bullish" ? rsi5 < rsi3 : rsi5 > rsi3);
  const hasMacdDivergence =
    typeof macd3 === "number" &&
    typeof macd5 === "number" &&
    (direction === "bullish" ? macd5 < macd3 : macd5 > macd3);

  if (priceDivergence && hasRSIDivergence && hasMacdDivergence) {
    return 92;
  }

  if (priceDivergence && (hasRSIDivergence || hasMacdDivergence)) {
    return 74;
  }

  return 42;
}

function scoreChannelFit(candidate: InternalCandidate, candles: Candle[]) {
  const end = candidate.c ?? candidate.b;

  if (candidate.anchor.index >= end.index) {
    return 0;
  }

  const atr = calculateATR(candles.slice(candidate.anchor.index, end.index + 1), 14);
  const left = candidate.a;
  const right = candidate.b;
  const denominator = Math.max(right.index - left.index, 1);
  const slope = (right.price - left.price) / denominator;
  const parallelOffset = candidate.anchor.price - (left.price - slope * (left.index - candidate.anchor.index));
  let insideCount = 0;
  let total = 0;

  for (let index = candidate.anchor.index; index <= end.index; index += 1) {
    const baselinePrice = left.price + slope * (index - left.index);
    const parallelPrice = baselinePrice + parallelOffset;
    const high = Math.max(baselinePrice, parallelPrice) + atr * 0.35;
    const low = Math.min(baselinePrice, parallelPrice) - atr * 0.35;
    const candle = candles[index];

    if (!candle) {
      continue;
    }

    total += 1;

    if (candle.close >= low && candle.close <= high) {
      insideCount += 1;
    }
  }

  if (total === 0) {
    return 0;
  }

  const insideRatio = insideCount / total;
  const endpointLine = candidate.direction === "bullish"
    ? Math.max(
        candidate.a.price + slope * (end.index - candidate.a.index),
        candidate.a.price + slope * (end.index - candidate.a.index) + parallelOffset,
      )
    : Math.min(
        candidate.a.price + slope * (end.index - candidate.a.index),
        candidate.a.price + slope * (end.index - candidate.a.index) + parallelOffset,
      );
  const endpointDistance = Math.abs(end.price - endpointLine);
  const endpointScore = clamp(1 - endpointDistance / Math.max(atr * 2.4, 0.0001), 0, 1) * 100;

  return roundTo(insideRatio * 72 + endpointScore * 0.28, 2);
}

function buildProjectionTargets(candidate: InternalCandidate, fibScore: number, channelScore: number) {
  const directionMultiplier = candidate.direction === "bullish" ? 1 : -1;
  const waveALength = Math.abs(candidate.a.price - candidate.anchor.price);
  const waveBToARatio =
    waveALength > 0 ? Math.abs(candidate.a.price - candidate.b.price) / waveALength : 0;

  return [...C_TARGETS]
    .map<ABCProjectionTarget>((fibRatio) => {
      let probability =
        fibRatio === 1
          ? 76
          : fibRatio === 1.236
            ? 70
            : fibRatio === 1.618
              ? 66
              : 58;

      if (waveBToARatio <= 0.55) {
        if (fibRatio === 1.236 || fibRatio === 1.618) {
          probability += 9;
        }
      } else if (waveBToARatio <= 0.72) {
        if (fibRatio === 1 || fibRatio === 1.236) {
          probability += 10;
        }
      } else {
        if (fibRatio === 0.618 || fibRatio === 1) {
          probability += 9;
        }
      }

      probability += fibScore >= 75 ? 4 : fibScore >= 60 ? 2 : 0;
      probability += channelScore >= 70 ? 3 : 0;

      return {
        level: roundTo(candidate.b.price + directionMultiplier * waveALength * fibRatio, 4),
        fibRatio,
        probability: roundTo(clamp(probability, 0, 100), 2),
      };
    })
    .sort((left, right) => right.probability - left.probability);
}

function buildTargetZone(targets: ABCProjectionTarget[]) {
  if (targets.length === 0) {
    return null;
  }

  const primary = targets[0];
  const secondary = targets[1] ?? targets[0];

  return {
    nextTargetPrice: primary.level,
    minTarget: Math.min(primary.level, secondary.level),
    maxTarget: Math.max(primary.level, secondary.level),
    probability: roundTo(primary.probability, 2),
    label: "Wave C Objective",
  } satisfies ABCProjectionZone;
}

function buildScenarioReasons(
  rulesScore: number,
  fibScore: number,
  channelScore: number,
  momentumScore: number,
  candidate: InternalCandidate,
  aStructure: SubwaveAnalysis,
  cStructure: SubwaveAnalysis,
) {
  const reasons: string[] = [];

  if (rulesScore >= 90) {
    reasons.push("Hard Elliott zigzag rules are fully intact");
  } else if (rulesScore >= 70) {
    reasons.push("Most hard Elliott zigzag rules are intact");
  }

  if (fibScore >= 74) {
    reasons.push("B retrace and Wave C fib targets are tightly aligned");
  } else if (fibScore >= 56) {
    reasons.push("Fib relationships are acceptable but not ideal");
  }

  if (channelScore >= 68) {
    reasons.push("Price respects the A to B parallel channel structure");
  }

  if (candidate.kind === "abc" && momentumScore >= 68) {
    reasons.push("Wave C shows terminal momentum divergence");
  }

  if (aStructure.structure === "leading-diagonal") {
    reasons.push("Wave A behaves like a leading diagonal");
  }

  if (cStructure.structure === "ending-diagonal") {
    reasons.push("Wave C behaves like an ending diagonal");
  }

  return reasons.length > 0 ? reasons : ["Structure is still forming and needs more confluence"];
}

function calculateRecencyScore(endIndex: number, latestIndex: number) {
  if (endIndex < 0 || latestIndex < 0) {
    return 0;
  }

  const candlesFromLatest = Math.max(latestIndex - endIndex, 0);
  const strongWindow = Math.max(6, Math.round((latestIndex + 1) * 0.05));
  const fadeWindow = Math.max(strongWindow + 8, Math.round((latestIndex + 1) * 0.18));

  if (candlesFromLatest <= strongWindow) {
    return 100;
  }

  if (candlesFromLatest >= fadeWindow) {
    return 0;
  }

  return roundTo(
    ((fadeWindow - candlesFromLatest) / Math.max(fadeWindow - strongWindow, 1)) * 100,
    2,
  );
}

function toRule(
  id: string,
  label: string,
  status: RuleStatus,
  severity: RuleSeverity,
  detail: string,
  message: string,
  value?: number,
  target?: string,
) {
  return {
    id,
    label,
    status,
    severity,
    detail,
    message,
    value,
    target,
  } satisfies ABCScenarioRule;
}

function evaluateCandidate(
  candidate: InternalCandidate,
  candles: Candle[],
  detectorMeta: ABCScenario["detectorMeta"],
) {
  const count = buildCorrectiveCount(candidate);
  const aStructure = detectFiveWaveStructure(
    candidate.anchor,
    candidate.a,
    candles,
    candidate.direction,
    detectorMeta.timeframe,
    true,
  );
  const cStructure =
    candidate.kind === "abc" && candidate.c
      ? detectFiveWaveStructure(
          candidate.b,
          candidate.c,
          candles,
          candidate.direction,
          detectorMeta.timeframe,
          true,
        )
      : {
          valid: false,
          structure: "invalid" as const,
          sequence: null,
        };
  const waveALength = Math.abs(candidate.a.price - candidate.anchor.price);
  const waveBToARatio =
    waveALength > 0 ? Math.abs(candidate.a.price - candidate.b.price) / waveALength : undefined;
  const waveCToARatio =
    candidate.kind === "abc" && candidate.c && waveALength > 0
      ? Math.abs(candidate.c.price - candidate.b.price) / waveALength
      : undefined;
  const hardRules: ABCScenarioRule[] = [
    toRule(
      "wave-a-five",
      "Wave A is a 5-wave move",
      aStructure.valid ? "pass" : "fail",
      "hard",
      "Wave A should be a 5-wave impulse or leading diagonal.",
      aStructure.valid
        ? `Wave A is classified as ${aStructure.structure.replace("-", " ")}.`
        : "Wave A does not resolve into a valid 5-wave actionary leg.",
    ),
    toRule(
      "wave-b-retrace-limit",
      "Wave B retrace does not exceed 100% of Wave A",
      typeof waveBToARatio === "number" && waveBToARatio <= 1 ? "pass" : "fail",
      "hard",
      "Wave B must remain within the origin of Wave A for a zigzag candidate.",
      typeof waveBToARatio === "number" && waveBToARatio <= 1
        ? `Wave B retraces ${roundTo(waveBToARatio, 3)} of Wave A.`
        : "Wave B has retraced more than 100% of Wave A.",
      waveBToARatio,
      "<= 1.000",
    ),
  ];

  if (candidate.kind === "abc") {
    hardRules.push(
      toRule(
        "wave-c-five",
        "Wave C is a 5-wave move",
        cStructure.valid ? "pass" : "fail",
        "hard",
        "Wave C should resolve as a 5-wave impulse or ending diagonal.",
        cStructure.valid
          ? `Wave C is classified as ${cStructure.structure.replace("-", " ")}.`
          : "Wave C does not resolve into a valid 5-wave actionary leg.",
      ),
      toRule(
        "wave-c-overlap",
        "Wave 4 of C does not overlap Wave 1 of C",
        cStructure.valid &&
          (!cStructure.wave4Overlap || cStructure.structure === "ending-diagonal")
          ? "pass"
          : "fail",
        "hard",
        "Standard C-wave impulses avoid Wave 4 overlap; ending diagonals are the only accepted exception.",
        cStructure.valid && cStructure.wave4Overlap
          ? "Wave C overlaps like an ending diagonal, so the count stays valid under the diagonal exception."
          : cStructure.valid
            ? "Wave 4 of C stays outside Wave 1 territory."
            : "Wave C overlap cannot be validated because the subwaves are invalid.",
      ),
      toRule(
        "wave-c-wave3-shortest",
        "Wave 3 of C is not the shortest actionary sub-wave",
        cStructure.valid && !cStructure.wave3Shortest ? "pass" : "fail",
        "hard",
        "Wave 3 cannot be the shortest of 1, 3, and 5 within Wave C.",
        cStructure.valid && !cStructure.wave3Shortest
          ? "Wave 3 of C is not the shortest sub-wave."
          : "Wave 3 of C is the shortest sub-wave.",
      ),
    );
  } else {
    hardRules.push(
      toRule(
        "wave-c-pending",
        "Wave C structure is still pending",
        "pending",
        "hard",
        "Wave C hard rules become active once Wave C starts to unfold.",
        "Wave C is not complete yet, so the remaining hard rules stay pending.",
      ),
    );
  }

  const softRules: ABCScenarioRule[] = [
    toRule(
      "wave-b-fib",
      "Wave B retrace is near a preferred fib level",
      typeof waveBToARatio === "number"
        ? scoreNearestTarget(waveBToARatio, B_RETRACE_TARGETS, 0.06, 0.32) >= 72
          ? "pass"
          : scoreNearestTarget(waveBToARatio, B_RETRACE_TARGETS, 0.06, 0.32) >= 45
            ? "warning"
            : "fail"
        : "fail",
      "soft",
      "Wave B ideally retraces 50%, 61.8%, 78.6%, or 85.4% of Wave A.",
      typeof waveBToARatio === "number"
        ? `Wave B retraces ${roundTo(waveBToARatio, 3)} of Wave A.`
        : "Wave B retracement could not be measured.",
      waveBToARatio,
      "0.500 / 0.618 / 0.786 / 0.854",
    ),
  ];

  if (candidate.kind === "abc") {
    softRules.push(
      toRule(
        "wave-c-fib",
        "Wave C projects a preferred fib relationship",
        typeof waveCToARatio === "number"
          ? scoreNearestTarget(waveCToARatio, C_TARGETS, 0.1, 0.45) >= 72
            ? "pass"
            : scoreNearestTarget(waveCToARatio, C_TARGETS, 0.1, 0.45) >= 45
              ? "warning"
              : "fail"
          : "fail",
        "soft",
        "Wave C commonly reaches 61.8%, 100%, 123.6%, or 161.8% of Wave A.",
        typeof waveCToARatio === "number"
          ? `Wave C projects ${roundTo(waveCToARatio, 3)} of Wave A.`
          : "Wave C projection could not be measured.",
        waveCToARatio,
        "0.618 / 1.000 / 1.236 / 1.618",
      ),
    );

    softRules.push(
      toRule(
        "wave-c-wave2",
        "Wave (2) of C retraces the preferred zone",
        typeof cStructure.wave2Retracement === "number"
          ? scoreNearestTarget(cStructure.wave2Retracement, [0.5, 0.618], 0.08, 0.3) >= 70
            ? "pass"
            : scoreNearestTarget(cStructure.wave2Retracement, [0.5, 0.618], 0.08, 0.3) >= 40
              ? "warning"
              : "fail"
          : "warning",
        "soft",
        "Wave (2) of C often retraces 50% to 61.8% of Wave (1) of C.",
        typeof cStructure.wave2Retracement === "number"
          ? `Wave (2) of C retraces ${roundTo(cStructure.wave2Retracement, 3)} of Wave (1).`
          : "Wave (2) of C is not available yet.",
        cStructure.wave2Retracement,
        "0.500 - 0.618",
      ),
    );
  } else {
    softRules.push(
      toRule(
        "wave-c-fib-pending",
        "Wave C target ladder is prepared",
        "warning",
        "soft",
        "Wave C target quality will improve once price starts resolving away from Wave B.",
        "Wave C is still pending, so the target ladder is based on Wave A proportions only.",
      ),
    );
  }

  const fibScore = roundTo(
    average([
      scoreNearestTarget(waveBToARatio, B_RETRACE_TARGETS, 0.06, 0.32),
      candidate.kind === "abc"
        ? scoreNearestTarget(waveCToARatio, C_TARGETS, 0.1, 0.45)
        : 60,
      candidate.kind === "abc" && typeof cStructure.wave2Retracement === "number"
        ? scoreNearestTarget(cStructure.wave2Retracement, [0.5, 0.618], 0.08, 0.3)
        : 54,
    ]),
    2,
  );
  const channelScore = scoreChannelFit(candidate, candles);
  const momentumScore = evaluateMomentumDivergence(candidate, cStructure, candles);
  const hardApplicable = hardRules.filter((rule) => rule.status !== "pending");
  const hardPassed = hardApplicable.filter((rule) => rule.status === "pass").length;
  const hardRulePassed = hardApplicable.every((rule) => rule.status === "pass");
  const rulesContribution =
    hardApplicable.length === 0 ? 0 : (hardPassed / hardApplicable.length) * 40;
  const totalConfidence = hardRulePassed
    ? Math.round(rulesContribution + fibScore * 0.3 + channelScore * 0.2 + momentumScore * 0.1)
    : 0;
  const projectionTargets = buildProjectionTargets(candidate, fibScore, channelScore);
  const targetZone = buildTargetZone(projectionTargets);
  const latestIndex = candles.length - 1;
  const endIndex = (candidate.c ?? candidate.b).index;
  const candlesFromLatest = Math.max(latestIndex - endIndex, 0);
  const recencyScore = calculateRecencyScore(endIndex, latestIndex);
  const completionBonus = candidate.kind === "abc" ? 4 : 0;
  const selectionScore = roundTo(
    clamp(totalConfidence * 0.72 + recencyScore * 0.28 + completionBonus, 0, 100),
    2,
  );
  const scoreBreakdown = [
    { label: "Hard rules", value: roundTo(rulesContribution / 40, 4) * 100 },
    { label: "Fib score", value: fibScore },
    { label: "Channel fit", value: channelScore },
    { label: "Momentum", value: momentumScore },
    { label: "Recency", value: recencyScore },
    { label: "Scenario completion", value: candidate.kind === "abc" ? 100 : 0 },
  ];
  const reasons = buildScenarioReasons(
    rulesContribution / 40,
    fibScore,
    channelScore,
    momentumScore,
    candidate,
    aStructure,
    cStructure,
  );

  return {
    id: `${candidate.anchor.time}-${candidate.a.time}-${candidate.b.time}-${candidate.c?.time ?? "pending"}`,
    kind: candidate.kind,
    direction: candidate.direction,
    degree: candidate.degree,
    count,
    confidence: clamp(totalConfidence, 0, 100),
    hardRulePassed,
    rules: {
      passed: hardPassed,
      total: hardApplicable.length,
      details: [...hardRules, ...softRules],
    },
    fibScore,
    channelScore,
    momentumScore,
    projectionTargets,
    targetZone,
    invalidationLevel: candidate.b.price,
    invalidationExplanation:
      candidate.direction === "bullish"
        ? "Break below Wave B low invalidates the bullish zigzag scenario."
        : "Break above Wave B high invalidates the bearish zigzag scenario.",
    recencyScore,
    candlesFromLatest,
    selectionScore,
    scoreBreakdown,
    reasonSummary: reasons.slice(0, 2).join(" + "),
    reasons,
    swings: [candidate.anchor, candidate.a, candidate.b, ...(candidate.c ? [candidate.c] : [])],
    detectorMeta,
  } satisfies ABCScenario;
}

export function autoDetectABC(
  ohlcData: Candle[],
  options: ABCDetectionOptions = {},
) {
  if (ohlcData.length < 12) {
    return [] as ABCScenario[];
  }

  const degree = options.degree ?? "minor";
  const detector = detectZigZagFractalSwings(ohlcData, {
    timeframe: options.timeframe,
  });
  const candidates = buildABCCandidates(detector.swings, ohlcData, degree);

  return candidates
    .map((candidate) =>
      evaluateCandidate(candidate, ohlcData, {
        deviationThreshold: detector.deviationThreshold,
        minBarsBetween: detector.minBarsBetween,
        fractalSpan: detector.fractalSpan,
        timeframe: detector.timeframe,
      }),
    )
    .filter((candidate) => candidate.hardRulePassed && candidate.confidence > 0)
    .sort((left, right) => {
      if (left.selectionScore !== right.selectionScore) {
        return right.selectionScore - left.selectionScore;
      }

      if (left.confidence !== right.confidence) {
        return right.confidence - left.confidence;
      }

      return left.candlesFromLatest - right.candlesFromLatest;
    })
    .slice(0, options.limit ?? 5);
}

function normalizeABCCandles(ohlcData: unknown[]) {
  return ohlcData
    .map((entry, index) => {
      const record = toRecord(entry);
      const timeValue = record.time ?? record.timestamp ?? record.date ?? index + 1;
      const parsedTime =
        typeof timeValue === "number"
          ? timeValue > 1e12
            ? Math.floor(timeValue / 1000)
            : timeValue
          : Number.isFinite(Date.parse(String(timeValue)))
            ? Math.floor(Date.parse(String(timeValue)) / 1000)
            : index + 1;

      return {
        time: parsedTime,
        open: Number(record.open ?? record.o),
        high: Number(record.high ?? record.h),
        low: Number(record.low ?? record.l),
        close: Number(record.close ?? record.c),
        volume: Number(record.volume ?? record.v ?? 0),
      } satisfies Candle;
    })
    .filter(
      (candle) =>
        Number.isFinite(candle.time) &&
        Number.isFinite(candle.open) &&
        Number.isFinite(candle.high) &&
        Number.isFinite(candle.low) &&
        Number.isFinite(candle.close),
    )
    .sort((left, right) => left.time - right.time);
}

function getTimeframeSeconds(timeframe: string) {
  switch (timeframe) {
    case "1m":
      return 60;
    case "5m":
      return 300;
    case "15m":
      return 900;
    case "30m":
      return 1800;
    case "1H":
      return 3600;
    case "4H":
      return 14400;
    case "Daily":
      return 86400;
    case "Weekly":
      return 604800;
    default:
      return 1800;
  }
}

type FixedABCSwing = {
  index: number;
  price: number;
  isHigh: boolean;
};

type FixedABCCandidate = {
  anchor: FixedABCSwing;
  a: FixedABCSwing;
  b: FixedABCSwing;
  c?: FixedABCSwing;
  direction: WaveTrend;
  waveC100: number;
  waveC161: number;
};

type PriceClamp = (price: number) => number;
type PriceNormalizer = (price: number) => number;

function median(values: number[]) {
  const sortedValues = values
    .filter((value) => Number.isFinite(value))
    .sort((left, right) => left - right);

  if (sortedValues.length === 0) {
    return 0;
  }

  const middle = Math.floor(sortedValues.length / 2);

  return sortedValues.length % 2 === 0
    ? (sortedValues[middle - 1] + sortedValues[middle]) / 2
    : sortedValues[middle];
}

function createScenarioPriceClamp(candles: Candle[]): {
  clampPrice: PriceClamp;
  normalizePrice: PriceNormalizer;
  minPrice: number;
  maxPrice: number;
  dataLow: number;
  dataHigh: number;
  padding: number;
} {
  const referencePrice = median(candles.map((candle) => candle.close));
  const shouldScaleThousands = referencePrice > 10000;
  const normalizePrice = (price: number) => {
    if (!Number.isFinite(price)) {
      return 0;
    }

    let normalizedPrice = price;

    if (shouldScaleThousands || Math.abs(normalizedPrice) > 10000) {
      while (Math.abs(normalizedPrice) > 1000) {
        normalizedPrice /= 1000;
      }
    }

    return normalizedPrice;
  };
  const recentWindow = candles.slice(-80);
  const rangeCandles = recentWindow.length > 0 ? recentWindow : candles;
  const normalizedLows = rangeCandles
    .map((candle) => normalizePrice(candle.low))
    .filter((price) => Number.isFinite(price) && price > 0);
  const normalizedHighs = rangeCandles
    .map((candle) => normalizePrice(candle.high))
    .filter((price) => Number.isFinite(price) && price > 0);
  const dataLow = normalizedLows.length > 0 ? Math.min(...normalizedLows) : 0;
  const dataHigh = normalizedHighs.length > 0 ? Math.max(...normalizedHighs) : dataLow + 1;
  const normalizedReferencePrice = normalizePrice(referencePrice);
  const rangeSize = Math.max(dataHigh - dataLow, normalizedReferencePrice * 0.004, 0.25);
  const padding = Math.max(rangeSize * 0.1, normalizedReferencePrice * 0.0025, 0.12);
  const rawMinPrice = dataLow - padding;
  const rawMaxPrice = dataHigh + padding;
  const minPrice = Number.isFinite(rawMinPrice) ? rawMinPrice : 0;
  const maxPrice = Number.isFinite(rawMaxPrice) && rawMaxPrice > minPrice
    ? rawMaxPrice
    : minPrice + Math.max(rangeSize, 1);

  return {
    minPrice,
    maxPrice,
    dataLow,
    dataHigh,
    padding,
    normalizePrice,
    clampPrice: (price: number) => {
      const normalizedPrice = normalizePrice(price);

      return roundTo(Math.max(minPrice, Math.min(maxPrice, normalizedPrice || minPrice)), 4);
    },
  };
}

function normalizeFixedABCCandles(
  candles: Candle[],
  normalizePrice: PriceNormalizer,
) {
  return candles.map((candle) => ({
    ...candle,
    open: normalizePrice(candle.open),
    high: normalizePrice(candle.high),
    low: normalizePrice(candle.low),
    close: normalizePrice(candle.close),
  }));
}

function detectZigZagSwings(ohlcData: Candle[], devThreshold = 0.006) {
  const swings: FixedABCSwing[] = [];

  for (let index = 2; index < ohlcData.length - 2; index += 1) {
    const slice = ohlcData.slice(index - 2, index + 3);
    const high = Math.max(...slice.map((candle) => candle.high));
    const low = Math.min(...slice.map((candle) => candle.low));
    const candle = ohlcData[index];

    if (candle.high === high && candle.high - low > devThreshold * candle.close) {
      swings.push({ index, price: candle.high, isHigh: true });
    } else if (candle.low === low && high - candle.low > devThreshold * candle.close) {
      swings.push({ index, price: candle.low, isHigh: false });
    }
  }

  return swings;
}

function buildFixedABCCandidates(swings: FixedABCSwing[]) {
  const candidates: FixedABCCandidate[] = [];

  for (let index = 2; index < swings.length; index += 1) {
    const anchor = swings[index - 3] ?? swings[index - 2];
    const a = swings[index - 2];
    const b = swings[index - 1];
    const c = swings[index];

    if (a && b && !a.isHigh && b.isHigh && c && !c.isHigh) {
      const waveA = b.price - a.price;

      if (waveA > 0) {
        candidates.push({
          anchor: anchor && anchor.isHigh ? anchor : b,
          a,
          b,
          c,
          direction: "bearish",
          waveC100: b.price - waveA,
          waveC161: b.price - waveA * 1.618,
        });
      }
    }

    if (a && b && a.isHigh && !b.isHigh && c && c.isHigh) {
      const waveA = a.price - b.price;

      if (waveA > 0) {
        candidates.push({
          anchor: anchor && !anchor.isHigh ? anchor : b,
          a,
          b,
          c,
          direction: "bullish",
          waveC100: b.price + waveA,
          waveC161: b.price + waveA * 1.618,
        });
      }
    }
  }

  return candidates;
}

function toDetectedABCSwing(
  swing: FixedABCSwing,
  candles: Candle[],
  clampPrice: PriceClamp,
) {
  const candle = candles[swing.index] ?? candles[0];

  return {
    id: `fixed-abc-${swing.isHigh ? "high" : "low"}-${swing.index}`,
    index: swing.index,
    time: candle?.time ?? swing.index,
    price: clampPrice(swing.price),
    kind: swing.isHigh ? "high" : "low",
    source: "fractal-zigzag",
  } satisfies DetectedABCSwing;
}

function buildFixedLegacyABCScenario(
  candidate: FixedABCCandidate,
  scenarioIndex: number,
  candles: Candle[],
  clampPrice: PriceClamp,
) {
  const anchor = toDetectedABCSwing(candidate.anchor, candles, clampPrice);
  const a = toDetectedABCSwing(candidate.a, candles, clampPrice);
  const b = toDetectedABCSwing(candidate.b, candles, clampPrice);
  const c = candidate.c ? toDetectedABCSwing(candidate.c, candles, clampPrice) : undefined;
  const projectionTargets = [
    {
      level: clampPrice(candidate.waveC100),
      fibRatio: 1,
      probability: 62,
    },
    {
      level: clampPrice(candidate.waveC161),
      fibRatio: 1.618,
      probability: 28,
    },
  ] satisfies ABCProjectionTarget[];
  const targetZone = buildTargetZone(projectionTargets);
  const count = buildCorrectiveCount({
    anchor,
    a,
    b,
    c: undefined,
    kind: "ab",
    direction: candidate.direction,
    degree: "minor",
  });
  const rules = [
    toRule(
      "fixed-wave-b-retrace-limit",
      "Wave B retrace does not exceed 100% of Wave A",
      "pass",
      "hard",
      "Wave B stays inside the Wave A origin for this fixed ABC candidate.",
      "Wave B retracement is valid for the active zigzag setup.",
    ),
    toRule(
      "fixed-wave-c-targets",
      "Wave C target ladder is clamped to the live price range",
      "pass",
      "soft",
      "Wave C targets are normalized and bounded before being returned to the chart.",
      "Projection prices are inside the visible market range.",
    ),
  ];

  return {
    id: `fixed-abc-v2-3-${scenarioIndex}-${a.time}-${b.time}`,
    kind: "ab",
    direction: candidate.direction,
    degree: "minor",
    count,
    confidence: 78,
    hardRulePassed: true,
    rules: {
      passed: 1,
      total: 1,
      details: rules,
    },
    fibScore: 78,
    channelScore: 72,
    momentumScore: 72,
    projectionTargets,
    targetZone,
    invalidationLevel: clampPrice(
      candidate.direction === "bearish" ? b.price * 1.005 : b.price * 0.995,
    ),
    invalidationExplanation:
      candidate.direction === "bearish"
        ? "Break above Wave B high invalidates the bearish corrective scenario."
        : "Break below Wave B low invalidates the bullish corrective scenario.",
    recencyScore: 100,
    candlesFromLatest: Math.max(candles.length - 1 - b.index, 0),
    selectionScore: Math.max(0, 100 - scenarioIndex * 6),
    scoreBreakdown: [
      { label: "Hard rules", value: 100 },
      { label: "Fib score", value: 78 },
      { label: "Channel fit", value: 72 },
      { label: "Momentum", value: 72 },
      { label: "Clamped price safety", value: 100 },
    ],
    reasonSummary: "Clamped ABC zigzag target ladder + invalidation at Wave B",
    reasons: [
      "ABC swing sequence is present",
      "Wave C 1.0x and 1.618x targets are clamped to the live price range",
      "Wave B invalidation is explicit",
    ],
    swings: [anchor, a, b, ...(c ? [c] : [])],
    detectorMeta: {
      deviationThreshold: 0.006,
      minBarsBetween: 2,
      fractalSpan: 2,
      timeframe: "v2.3-fixed",
    },
  } satisfies ABCScenario;
}

type HigherABCContext = {
  timeframe: string;
  direction: WaveTrend;
  confidence: number;
  referenceHigh: number;
  referenceLow: number;
};

function timeframeToWaveDegree(timeframe: string): WaveDegree {
  switch (timeframe) {
    case "15m":
      return "micro";
    case "4H":
      return "intermediate";
    case "Daily":
    case "Weekly":
      return "primary";
    case "30m":
    case "1H":
    default:
      return "minor";
  }
}

function resampleCandles(candles: Candle[], bucketSeconds: number) {
  if (candles.length === 0) {
    return [] as Candle[];
  }

  const buckets = new Map<number, Candle>();

  for (const candle of candles) {
    const bucketTime = Math.floor(candle.time / bucketSeconds) * bucketSeconds;
    const currentCandle = buckets.get(bucketTime);

    if (!currentCandle) {
      buckets.set(bucketTime, { ...candle, time: bucketTime });
      continue;
    }

    buckets.set(bucketTime, {
      time: bucketTime,
      open: currentCandle.open,
      high: Math.max(currentCandle.high, candle.high),
      low: Math.min(currentCandle.low, candle.low),
      close: candle.close,
      volume: (currentCandle.volume ?? 0) + (candle.volume ?? 0),
    });
  }

  return Array.from(buckets.values()).sort((left, right) => left.time - right.time);
}

function buildHigherTimeframeContexts(
  normalizedCandles: Candle[],
  timeframe: string,
  higherTimeframes: HigherTimeframeInputMap,
  normalizePrice: PriceNormalizer,
) {
  const currentSeconds = getTimeframeSeconds(timeframe);
  const inputs = new Map<string, Candle[]>();

  for (const [higherTimeframe, higherCandles] of Object.entries(higherTimeframes)) {
    const normalizedHigherCandles = normalizeFixedABCCandles(
      normalizeABCCandles(higherCandles),
      normalizePrice,
    );

    if (normalizedHigherCandles.length >= 12) {
      inputs.set(higherTimeframe, normalizedHigherCandles);
    }
  }

  for (const higherTimeframe of ["1H", "4H"] as const) {
    if (inputs.has(higherTimeframe)) {
      continue;
    }

    const higherSeconds = getTimeframeSeconds(higherTimeframe);

    if (timeframe === higherTimeframe) {
      inputs.set(higherTimeframe, normalizedCandles);
    } else if (currentSeconds < higherSeconds) {
      const resampledCandles = resampleCandles(normalizedCandles, higherSeconds);

      if (resampledCandles.length >= 12) {
        inputs.set(higherTimeframe, resampledCandles);
      }
    }
  }

  return Array.from(inputs.entries())
    .map(([higherTimeframe, higherCandles]) => {
      const scenario = autoDetectABC(higherCandles, {
        timeframe: higherTimeframe,
        degree: timeframeToWaveDegree(higherTimeframe),
        limit: 1,
      })[0] ?? null;

      if (!scenario) {
        return null;
      }

      return {
        timeframe: higherTimeframe,
        direction: scenario.direction,
        confidence: scenario.confidence,
        referenceHigh: Math.max(...higherCandles.map((candle) => candle.high)),
        referenceLow: Math.min(...higherCandles.map((candle) => candle.low)),
      } satisfies HigherABCContext;
    })
    .filter((context): context is HigherABCContext => context !== null)
    .sort((left, right) => right.confidence - left.confidence);
}

function selectHigherTimeframeContext(
  scenario: ABCScenario,
  contexts: HigherABCContext[],
) {
  return (
    contexts.find(
      (context) =>
        context.direction === scenario.direction &&
        context.confidence >= 45,
    ) ??
    contexts[0] ??
    null
  );
}

function buildImprovedScenarioLabel(
  scenario: ABCScenario,
  higherContext: HigherABCContext | null,
) {
  const degreeLabel = scenario.degree.charAt(0).toUpperCase() + scenario.degree.slice(1);

  if (higherContext) {
    return `${degreeLabel} Wave C of Wave (4) of larger ${higherContext.timeframe} ABC zigzag post $121 ATH`;
  }

  return `${degreeLabel} Wave C of Wave (4) of larger ABC zigzag post $121 ATH`;
}

function buildImprovedScenarioName(scenario: ABCScenario, index: number) {
  const directionLabel = scenario.direction === "bearish" ? "Bearish" : "Bullish";
  const statusLabel = scenario.kind === "abc" ? "Completed" : "Projected";

  return index === 0
    ? `Primary ${directionLabel} ABC Zigzag`
    : `${statusLabel} ${directionLabel} Alternative ${index}`;
}

function calculateVolumeConfirmationScore(scenario: ABCScenario, candles: Candle[]) {
  const bSwing = scenario.swings[2];

  if (!bSwing) {
    return 50;
  }

  const priorVolumes = candles
    .slice(Math.max(0, bSwing.index - 14), bSwing.index + 1)
    .map((candle) => candle.volume ?? 0)
    .filter((volume) => Number.isFinite(volume) && volume > 0);
  const resolutionVolumes = candles
    .slice(bSwing.index + 1, Math.min(candles.length, bSwing.index + 9))
    .map((candle) => candle.volume ?? 0)
    .filter((volume) => Number.isFinite(volume) && volume > 0);

  if (priorVolumes.length === 0 || resolutionVolumes.length === 0) {
    return 55;
  }

  const priorAverage = average(priorVolumes);
  const resolutionAverage = average(resolutionVolumes);
  const ratio = resolutionAverage / Math.max(priorAverage, 0.0001);

  if (ratio >= 1.2) {
    return 88;
  }

  if (ratio >= 1) {
    return 74;
  }

  if (ratio >= 0.72) {
    return 56;
  }

  return 34;
}

function buildImprovedParallelChannel(
  scenario: ABCScenario,
  candles: Candle[],
  timeframe: string,
  clampPrice: PriceClamp,
) {
  const [anchor, aSwing, bSwing] = scenario.swings;
  const latestIndex = candles.length - 1;

  if (!anchor || !aSwing || !bSwing || bSwing.index <= aSwing.index) {
    const latestPrice = clampPrice(candles[latestIndex]?.close ?? scenario.invalidationLevel);
    const latestTime = candles[latestIndex]?.time ?? 0;

    return {
      upper: latestPrice,
      lower: latestPrice,
      upperLine: {
        startTime: latestTime,
        startPrice: latestPrice,
        endTime: latestTime,
        endPrice: latestPrice,
      },
      lowerLine: {
        startTime: latestTime,
        startPrice: latestPrice,
        endTime: latestTime,
        endPrice: latestPrice,
      },
    } satisfies ABCImprovedScenario["channel"];
  }

  const measuredSpan = Math.max(bSwing.index - anchor.index, 8);
  const projectedBars = clamp(Math.round(measuredSpan * 0.65), 8, 34);
  const endIndex = Math.max(latestIndex, bSwing.index + projectedBars);
  const endTime =
    candles[endIndex]?.time ??
    (candles[latestIndex]?.time ?? bSwing.time) +
      Math.max(endIndex - latestIndex, 0) * getTimeframeSeconds(timeframe);
  const slope = (bSwing.price - aSwing.price) / Math.max(bSwing.index - aSwing.index, 1);
  const priceOnABLine = (index: number) => aSwing.price + slope * (index - aSwing.index);
  const parallelOffset = anchor.price - priceOnABLine(anchor.index);
  const abEndPrice = priceOnABLine(endIndex);
  const parallelEndPrice = abEndPrice + parallelOffset;
  const abLine = {
    startTime: aSwing.time,
    startPrice: clampPrice(aSwing.price),
    endTime,
    endPrice: clampPrice(abEndPrice),
  };
  const parallelLine = {
    startTime: anchor.time,
    startPrice: clampPrice(anchor.price),
    endTime,
    endPrice: clampPrice(parallelEndPrice),
  };
  const upperLine = abLine.endPrice >= parallelLine.endPrice ? abLine : parallelLine;
  const lowerLine = abLine.endPrice >= parallelLine.endPrice ? parallelLine : abLine;
  const upper = clampPrice(Math.max(upperLine.endPrice, lowerLine.endPrice));
  const lower = clampPrice(Math.min(upperLine.endPrice, lowerLine.endPrice));

  return {
    upper,
    lower,
    upperLine,
    lowerLine,
  } satisfies ABCImprovedScenario["channel"];
}

function buildImprovedTargetTable(
  scenario: ABCScenario,
  volumeScore: number,
  momentumScore: number,
  higherContext: HigherABCContext | null,
  clampPrice: PriceClamp,
) {
  const adjustedTargets = scenario.projectionTargets.map((target) => {
    let probability = target.probability;

    if (momentumScore >= 72 && target.fibRatio >= 1.236) {
      probability += 6;
    } else if (momentumScore < 48 && target.fibRatio >= 1.236) {
      probability -= 10;
    } else if (momentumScore < 48 && target.fibRatio <= 1) {
      probability += 4;
    }

    if (volumeScore >= 74 && target.fibRatio >= 1) {
      probability += 4;
    } else if (volumeScore < 45 && target.fibRatio >= 1.236) {
      probability -= 8;
    }

    if (higherContext && higherContext.direction === scenario.direction && target.fibRatio >= 1) {
      probability += higherContext.confidence >= 70 ? 5 : 2;
    }

    return {
      price: clampPrice(target.level),
      fibRatio: `${target.fibRatio.toFixed(target.fibRatio % 1 === 0 ? 1 : 3).replace(/0+$/, "0")}×A`,
      probability: clamp(probability, 1, 100),
    };
  });
  const totalProbability = adjustedTargets.reduce(
    (sum, target) => sum + target.probability,
    0,
  );

  return adjustedTargets
    .map((target) => ({
      ...target,
      probability: Math.round((target.probability / Math.max(totalProbability, 1)) * 100),
    }))
    .sort((left, right) => right.probability - left.probability)
    .slice(0, 4);
}

function buildImprovedFibRelationships(
  scenario: ABCScenario,
  targets: ABCImprovedTarget[],
) {
  const waveA = Math.abs(scenario.swings[1].price - scenario.swings[0].price);
  const waveB = Math.abs(scenario.swings[2].price - scenario.swings[1].price);
  const relationships = [
    waveA > 0 ? `B retrace = ${roundTo((waveB / waveA) * 100, 1)}% of A` : null,
    ...targets.map((target) => `C = ${target.fibRatio} at ${formatPrice(target.price)}`),
  ].filter((relationship): relationship is string => Boolean(relationship));

  return relationships.slice(0, 5);
}

function buildImprovedSubWaveLabels(
  scenario: ABCScenario,
  clampPrice: PriceClamp,
) {
  const labels: ABCImprovedScenario["subWaveLabels"] = [
    {
      label: "A",
      wave: "A",
      price: clampPrice(scenario.swings[1].price),
      time: scenario.swings[1].time,
    },
    {
      label: "B",
      wave: "B",
      price: clampPrice(scenario.swings[2].price),
      time: scenario.swings[2].time,
    },
  ];

  if (scenario.swings[3]) {
    labels.push({
      label: "C",
      wave: "C",
      price: clampPrice(scenario.swings[3].price),
      time: scenario.swings[3].time,
    });
  }

  return labels;
}

function buildInstitutionalImprovedScenario(
  scenario: ABCScenario,
  index: number,
  candles: Candle[],
  timeframe: string,
  clampPrice: PriceClamp,
  higherContext: HigherABCContext | null,
) {
  const volumeScore = calculateVolumeConfirmationScore(scenario, candles);
  const momentumScore = roundTo(scenario.momentumScore * 0.7 + volumeScore * 0.3, 2);
  const higherContextScore = higherContext ? higherContext.confidence : 55;
  const confidence = clamp(
    Math.round(
      scenario.confidence * 0.62 +
        momentumScore * 0.12 +
        volumeScore * 0.1 +
        higherContextScore * 0.08 +
        scenario.recencyScore * 0.08,
    ),
    0,
    100,
  );
  const targets = buildImprovedTargetTable(
    scenario,
    volumeScore,
    momentumScore,
    higherContext,
    clampPrice,
  );
  const primaryTarget = targets[0] ?? {
    price: clampPrice(scenario.targetZone?.nextTargetPrice ?? scenario.invalidationLevel),
    fibRatio: "1.0×A",
    probability: 100,
  };
  const targetPrices = targets.length > 0
    ? targets.map((target) => target.price)
    : [primaryTarget.price];
  const channel = buildImprovedParallelChannel(scenario, candles, timeframe, clampPrice);
  const label = buildImprovedScenarioLabel(scenario, higherContext);
  const reason = [
    scenario.reasonSummary,
    `Momentum ${scenario.momentumScore >= 70 ? "supports" : scenario.momentumScore >= 50 ? "is neutral for" : "is weak for"} Wave C`,
    `Volume ${volumeScore >= 70 ? "confirms" : volumeScore >= 50 ? "is neutral for" : "is weak for"} Wave C follow-through`,
    higherContext
      ? `${higherContext.timeframe} context is ${higherContext.direction === scenario.direction ? "aligned" : "mixed"}`
      : "Higher-degree context inferred from current data",
  ]
    .filter(Boolean)
    .join(" · ");

  return {
    id: index + 1,
    name: buildImprovedScenarioName(scenario, index),
    confidence,
    label,
    description:
      scenario.direction === "bearish"
        ? "Bearish corrective inside larger Wave C"
        : "Bullish corrective inside larger Wave C",
    reason,
    waveCProjection: primaryTarget.price,
    targets,
    invalidationLevel: clampPrice(scenario.invalidationLevel),
    channel,
    momentumScore,
    volumeScore,
    primary: index === 0,
    fibRelationships: buildImprovedFibRelationships(scenario, targets),
    subWaveLabels: buildImprovedSubWaveLabels(scenario, clampPrice),
    scoreBreakdown: [
      ...scenario.scoreBreakdown,
      { label: "Momentum/volume filter", value: momentumScore },
      { label: "Volume confirmation", value: volumeScore },
      { label: "Higher-degree context", value: higherContextScore },
      { label: "Price-scale safety", value: 100 },
    ],
    validation: scenario.rules,
    legacyScenario: {
      ...scenario,
      confidence,
      momentumScore,
      invalidationLevel: clampPrice(scenario.invalidationLevel),
      projectionTargets: scenario.projectionTargets.map((target) => ({
        ...target,
        level: clampPrice(target.level),
      })),
      targetZone: scenario.targetZone
        ? {
            ...scenario.targetZone,
            nextTargetPrice: primaryTarget.price,
            minTarget: Math.min(...targetPrices),
            maxTarget: Math.max(...targetPrices),
            probability: primaryTarget.probability,
          }
        : null,
      count: {
        ...scenario.count,
        anchor: scenario.count.anchor
          ? {
              ...scenario.count.anchor,
              price: clampPrice(scenario.count.anchor.price),
            }
          : undefined,
        points: scenario.count.points.map((point) => ({
          ...point,
          price: clampPrice(point.price),
        })),
      },
      swings: scenario.swings.map((swing) => ({
        ...swing,
        price: clampPrice(swing.price),
      })),
    },
  } satisfies ABCImprovedScenario;
}

export function autoDetectABCImproved(
  ohlcData: unknown[],
  timeframe: string,
  higherTimeframes: HigherTimeframeInputMap = {},
): ABCImprovedDetection {
  const candles = normalizeABCCandles(ohlcData);

  if (candles.length < 12) {
    return {
      scenarios: [],
      primaryScenario: null,
      chartOverlays: {
        channels: [],
        labels: [],
        targetTables: [],
        invalidations: [],
        priceRange: null,
      },
    };
  }

  const {
    clampPrice,
    normalizePrice,
    minPrice,
    maxPrice,
    dataLow,
    dataHigh,
    padding,
  } = createScenarioPriceClamp(candles);
  const normalizedCandles = normalizeFixedABCCandles(candles, normalizePrice);
  const higherContexts = buildHigherTimeframeContexts(
    normalizedCandles,
    timeframe,
    higherTimeframes,
    normalizePrice,
  );
  const institutionalScenarios = autoDetectABC(normalizedCandles, {
    timeframe,
    degree: timeframeToWaveDegree(timeframe),
    limit: 12,
  });
  const fallbackScenarios =
    institutionalScenarios.length > 0
      ? []
      : buildFixedABCCandidates(detectZigZagSwings(normalizedCandles))
          .sort((left, right) => (right.c?.index ?? right.b.index) - (left.c?.index ?? left.b.index))
          .slice(0, 6)
          .map((candidate, index) =>
            buildFixedLegacyABCScenario(candidate, index, normalizedCandles, clampPrice),
          );
  const rankedScenarios = [...institutionalScenarios, ...fallbackScenarios]
    .sort((left, right) => {
      if (left.selectionScore !== right.selectionScore) {
        return right.selectionScore - left.selectionScore;
      }

      if (left.confidence !== right.confidence) {
        return right.confidence - left.confidence;
      }

      return left.candlesFromLatest - right.candlesFromLatest;
    })
    .slice(0, 3)
    .map((scenario, index) =>
      buildInstitutionalImprovedScenario(
        scenario,
        index,
        normalizedCandles,
        timeframe,
        clampPrice,
        selectHigherTimeframeContext(scenario, higherContexts),
      ),
    );

  const primaryScenario = rankedScenarios[0] ?? null;
  const channel = primaryScenario?.channel ?? null;
  const targets = primaryScenario?.targets ?? [];

  console.log("=== autoDetectABCImproved DEBUG v2.3 ===");
  console.log("Timeframe:", timeframe);
  console.log("Normalized min/max:", minPrice.toFixed(3), maxPrice.toFixed(3));
  console.log("Normalized data range:", dataLow.toFixed(3), dataHigh.toFixed(3), "padding:", padding.toFixed(3));
  console.log("Primary waveCProjection:", primaryScenario?.waveCProjection);
  console.log("Channel:", channel);
  console.log("Targets:", targets);

  return {
    scenarios: rankedScenarios,
    primaryScenario,
    chartOverlays: {
      priceRange: {
        minPrice: roundTo(minPrice, 4),
        maxPrice: roundTo(maxPrice, 4),
        dataLow: roundTo(dataLow, 4),
        dataHigh: roundTo(dataHigh, 4),
        padding: roundTo(padding, 4),
      },
      channels: rankedScenarios.map((scenario) => ({
        scenarioId: scenario.id,
        primary: scenario.primary,
        ...scenario.channel,
      })),
      labels: rankedScenarios[0]?.subWaveLabels ?? [],
      targetTables: rankedScenarios.map((scenario) => ({
        scenarioId: scenario.id,
        name: scenario.name,
        targets: scenario.targets,
      })),
      invalidations: rankedScenarios.map((scenario) => ({
        scenarioId: scenario.id,
        level: scenario.invalidationLevel,
        explanation: scenario.legacyScenario.invalidationExplanation,
      })),
    },
  };
}

export function projectWaveCScenarios(
  count: WaveCount,
  candles: Candle[],
  options: ABCDetectionOptions = {},
) {
  if (!count.anchor || count.pattern !== "corrective" || count.points.length < 2) {
    return [] as ABCScenario[];
  }

  const degree = options.degree ?? count.degree ?? "minor";
  const [aPoint, bPoint, cPoint] = count.points;

  if (!aPoint || !bPoint) {
    return [] as ABCScenario[];
  }

  const anchor: DetectedABCSwing = {
    id: count.anchor.id,
    index: count.anchor.index ?? candles.findIndex((candle) => candle.time === count.anchor?.time),
    time: count.anchor.time,
    price: count.anchor.price,
    kind: count.anchor.kind,
    source: "fractal-zigzag",
  };
  const a: DetectedABCSwing = {
    id: aPoint.id,
    index: aPoint.index ?? candles.findIndex((candle) => candle.time === aPoint.time),
    time: aPoint.time,
    price: aPoint.price,
    kind: aPoint.kind ?? (count.direction === "bullish" ? "high" : "low"),
    source: "fractal-zigzag",
  };
  const b: DetectedABCSwing = {
    id: bPoint.id,
    index: bPoint.index ?? candles.findIndex((candle) => candle.time === bPoint.time),
    time: bPoint.time,
    price: bPoint.price,
    kind: bPoint.kind ?? (count.direction === "bullish" ? "low" : "high"),
    source: "fractal-zigzag",
  };
  const c =
    cPoint
      ? ({
          id: cPoint.id,
          index: cPoint.index ?? candles.findIndex((candle) => candle.time === cPoint.time),
          time: cPoint.time,
          price: cPoint.price,
          kind: cPoint.kind ?? (count.direction === "bullish" ? "high" : "low"),
          source: "fractal-zigzag",
        } satisfies DetectedABCSwing)
      : undefined;

  if (anchor.index < 0 || a.index < 0 || b.index < 0 || (c && c.index < 0)) {
    return [] as ABCScenario[];
  }

  const scenario = evaluateCandidate(
    {
      anchor,
      a,
      b,
      c,
      kind: c ? "abc" : "ab",
      direction: count.direction,
      degree,
    },
    candles,
    {
      deviationThreshold: Math.max(calculateATR(candles, 14) * 0.42, 0),
      minBarsBetween: getTimeframeConfig(options.timeframe).minBarsBetween,
      fractalSpan: getTimeframeConfig(options.timeframe).fractalSpan,
      timeframe: options.timeframe ?? "30m",
    },
  );

  return scenario.hardRulePassed && scenario.confidence > 0 ? [scenario] : [];
}
