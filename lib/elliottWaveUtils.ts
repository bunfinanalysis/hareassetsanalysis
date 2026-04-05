import { type Candle } from "@/lib/market-types";

export const IMPULSE_LABELS = ["1", "2", "3", "4", "5"] as const;
export const CORRECTIVE_LABELS = ["A", "B", "C"] as const;
export const WAVE_LABELS = [...IMPULSE_LABELS, ...CORRECTIVE_LABELS] as const;

export type WaveLabel = (typeof WAVE_LABELS)[number];
export type WaveDegree = "micro" | "minor" | "intermediate" | "primary";
export type WavePointSource = "manual" | "auto";
export type WavePatternType = "impulse" | "corrective";
export type WaveTrend = "bullish" | "bearish";
export type SwingKind = "high" | "low";
export type WaveRuleStatus = "pass" | "warning" | "fail";
export type WaveRuleSeverity = "hard" | "soft";

export type WavePoint = {
  id: string;
  label: WaveLabel;
  price: number;
  time: number;
  degree: WaveDegree;
  source: WavePointSource;
  index?: number;
  kind?: SwingKind;
};

export type WaveAnchor = {
  id: string;
  price: number;
  time: number;
  kind: SwingKind;
  index?: number;
};

export type ZigZagSwing = {
  id: string;
  index: number;
  time: number;
  price: number;
  kind: SwingKind;
  strength: number;
  source: "auto";
};

export type WaveCount = {
  pattern: WavePatternType;
  direction: WaveTrend;
  degree: WaveDegree;
  source: WavePointSource;
  anchor?: WaveAnchor;
  points: WavePoint[];
  confidence?: number;
  futureProjection?: FutureProjection;
};

export type FutureProjection = {
  nextTargetPrice: number;
  nextWaveTarget: number;
  probability: number;
  minTarget: number;
  maxTarget: number;
  label: string;
  scenarioLabel: string;
};

export type WaveValidationRule = {
  id: string;
  label: string;
  detail: string;
  message: string;
  status: WaveRuleStatus;
  severity: WaveRuleSeverity;
  isValid: boolean;
  value?: number;
  target?: string;
};

export type FibonacciLevel = {
  id: string;
  label: string;
  price: number;
  ratio: number;
  type: "retracement" | "extension";
  wave: string;
  isActive: boolean;
};

export type WaveMeasurements = {
  wave1Length?: number;
  wave2Retracement?: number;
  wave3Length?: number;
  wave3ToWave1Ratio?: number;
  wave4Retracement?: number;
  wave5Length?: number;
  wave5ToWave1Ratio?: number;
  waveBToARatio?: number;
  waveCToARatio?: number;
};

export type WaveValidationResult = {
  pattern: WavePatternType;
  direction: WaveTrend;
  isValid: boolean;
  hardRulePassed: boolean;
  score: number;
  rules: WaveValidationRule[];
  fibonacciLevels: FibonacciLevel[];
  measurements: WaveMeasurements;
  messages: string[];
};

export type ZigZagOptions = {
  depth?: number;
  deviationPercent?: number | number[];
  backstep?: number;
  limit?: number;
};

export type AutoDetectWaveOptions = ZigZagOptions & {
  degree?: WaveDegree;
  pattern?: WavePatternType | "either";
};

export type AutoDetectedWaveCandidate = {
  count: WaveCount;
  validation: WaveValidationResult;
  confidence: number;
  futureProjection: FutureProjection | null;
  swings: ZigZagSwing[];
  deviationPercent: number;
  depth: number;
  backstep: number;
};

export type AutoWaveDetection = {
  count: WaveCount | null;
  primaryCount: WaveCount | null;
  primaryValidation: WaveValidationResult | null;
  impulseCount: WaveCount | null;
  impulseValidation: WaveValidationResult | null;
  correctiveCount: WaveCount | null;
  correctiveValidation: WaveValidationResult | null;
  alternate: WaveCount | null;
  alternates: AutoDetectedWaveCandidate[];
  rankedCounts: AutoDetectedWaveCandidate[];
  swings: ZigZagSwing[];
  validation: WaveValidationResult | null;
  futureProjection: FutureProjection | null;
};

export type BuildWaveCountOptions = {
  pattern?: WavePatternType;
  direction?: WaveTrend;
  degree?: WaveDegree;
  source?: WavePointSource;
  anchor?: WaveAnchor;
};

export type ValidateWaveOptions = {
  anchor?: WaveAnchor;
  direction?: WaveTrend;
  degree?: WaveDegree;
  source?: WavePointSource;
};

type ZigZagSwingSet = {
  swings: ZigZagSwing[];
  depth: number;
  deviationPercent: number;
  backstep: number;
  limit: number;
  score: number;
};

const DEFAULT_ZIGZAG_DEVIATION_LEVELS = [0.8, 1.5, 2.5] as const;

const DEFAULT_ZIGZAG_OPTIONS = {
  depth: 5,
  backstep: 3,
  limit: 60,
} as const;

const DEFAULT_AUTO_DETECT_DEPTH_LEVELS = [4, 5, 7] as const;
const DEFAULT_AUTO_DETECT_BACKSTEP_LEVELS = [2, 3] as const;

const WAVE_LABEL_ORDER: Record<WaveLabel, number> = {
  "1": 0,
  "2": 1,
  "3": 2,
  "4": 3,
  "5": 4,
  A: 5,
  B: 6,
  C: 7,
};

let waveIdSequence = 0;

function generateWaveId(prefix: string) {
  waveIdSequence += 1;
  return `${prefix}-${waveIdSequence}`;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}

function sortByTime(leftTime: number, rightTime: number) {
  return leftTime - rightTime;
}

function toLabelOrder(label: WaveLabel) {
  return WAVE_LABEL_ORDER[label];
}

function roundTo(value: number, decimals = 3) {
  return Number(value.toFixed(decimals));
}

function average(values: number[]) {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((total, value) => total + value, 0) / values.length;
}

function standardDeviation(values: number[]) {
  if (values.length === 0) {
    return 0;
  }

  const mean = average(values);
  const variance =
    values.reduce((total, value) => total + (value - mean) ** 2, 0) / values.length;

  return Math.sqrt(variance);
}

function formatRatio(value?: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "n/a";
  }

  return roundTo(value, 3).toFixed(3);
}

function formatPrice(price: number) {
  const decimals = price >= 100 ? 2 : 3;
  return roundTo(price, decimals).toFixed(decimals);
}

function percentMove(fromPrice: number, toPrice: number) {
  if (!Number.isFinite(fromPrice) || fromPrice === 0) {
    return 0;
  }

  return Math.abs((toPrice - fromPrice) / fromPrice) * 100;
}

function isMoreExtreme(
  current: Pick<ZigZagSwing, "kind" | "price">,
  next: Pick<ZigZagSwing, "kind" | "price">,
) {
  if (current.kind !== next.kind) {
    return false;
  }

  return current.kind === "high"
    ? next.price >= current.price
    : next.price <= current.price;
}

function inferDirectionFromAnchor(anchor: WaveAnchor, firstPoint: WavePoint | undefined) {
  if (!firstPoint) {
    return anchor.kind === "low" ? "bullish" : "bearish";
  }

  return firstPoint.price >= anchor.price ? "bullish" : "bearish";
}

function inferDirectionFromPoints(points: WavePoint[]) {
  if (points.length < 2) {
    return "bullish" as WaveTrend;
  }

  return points[1].price >= points[0].price ? "bullish" : "bearish";
}

function inferPatternFromLabels(points: WavePoint[]) {
  return points.some((point) => point.label === "A" || point.label === "B" || point.label === "C")
    ? ("corrective" as WavePatternType)
    : ("impulse" as WavePatternType);
}

function buildRule(
  id: string,
  label: string,
  detail: string,
  message: string,
  status: WaveRuleStatus,
  severity: WaveRuleSeverity,
  value?: number,
  target?: string,
): WaveValidationRule {
  return {
    id,
    label,
    detail,
    message,
    status,
    severity,
    isValid: status !== "fail",
    value,
    target,
  };
}

function scoreRules(rules: WaveValidationRule[]) {
  const hardRules = rules.filter((rule) => rule.severity === "hard");
  const softRules = rules.filter((rule) => rule.severity === "soft");
  const hardRulePassed = hardRules.every((rule) => rule.status !== "fail");
  const hardScore =
    hardRules.length === 0
      ? 70
      : (hardRules.filter((rule) => rule.status !== "fail").length / hardRules.length) * 70;
  const softScore =
    softRules.length === 0
      ? 30
      : (softRules.reduce((total, rule) => {
          if (rule.status === "pass") {
            return total + 1;
          }

          if (rule.status === "warning") {
            return total + 0.5;
          }

          return total;
        }, 0) /
          softRules.length) *
        30;

  return {
    hardRulePassed,
    score: roundTo(hardScore + softScore, 2),
  };
}

function isImpulseLabels(points: WavePoint[]) {
  return points.every((point, index) => point.label === IMPULSE_LABELS[index]);
}

function isCorrectiveLabels(points: WavePoint[]) {
  return points.every((point, index) => point.label === CORRECTIVE_LABELS[index]);
}

function buildRetracementLevels(
  startPrice: number,
  endPrice: number,
  ratios: number[],
  wave: string,
) {
  const move = endPrice - startPrice;

  return ratios.map<FibonacciLevel>((ratio) => ({
    id: `${wave}-retracement-${ratio}`,
    label: `${wave} ${ratio.toFixed(3)} retracement`,
    price: endPrice - move * ratio,
    ratio,
    type: "retracement",
    wave,
    isActive: false,
  }));
}

function buildExtensionLevels(
  originPrice: number,
  ratios: number[],
  baseMove: number,
  wave: string,
) {
  return ratios.map<FibonacciLevel>((ratio) => ({
    id: `${wave}-extension-${ratio}`,
    label: `${wave} ${ratio.toFixed(3)} extension`,
    price: originPrice + baseMove * ratio,
    ratio,
    type: "extension",
    wave,
    isActive: false,
  }));
}

function markNearestFibLevel(levels: FibonacciLevel[], actualPrice: number) {
  if (levels.length === 0) {
    return levels;
  }

  let nearestLevel = levels[0];
  let nearestDistance = Math.abs(actualPrice - levels[0].price);

  for (const level of levels.slice(1)) {
    const distance = Math.abs(actualPrice - level.price);

    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestLevel = level;
    }
  }

  return levels.map((level) => ({
    ...level,
    isActive: level.id === nearestLevel.id,
  }));
}

function normalizeAnchor(anchor?: WaveAnchor) {
  if (!anchor) {
    return undefined;
  }

  return {
    ...anchor,
    id: anchor.id || generateWaveId("wave-anchor"),
  };
}

type ProjectionCandidate = {
  ratio: number;
  price: number;
  probability: number;
};

function uniqueNumbers(values: number[]) {
  return [...new Set(values.map((value) => roundTo(value, 4)))];
}

function normalizeDeviationLevels(
  value?: ZigZagOptions["deviationPercent"],
) {
  if (typeof value === "number") {
    return [value];
  }

  if (Array.isArray(value) && value.length > 0) {
    return uniqueNumbers(value)
      .filter((entry) => entry > 0)
      .sort((left, right) => left - right);
  }

  return [...DEFAULT_ZIGZAG_DEVIATION_LEVELS];
}

function getDepthLevels(depth?: number) {
  if (typeof depth === "number" && depth > 0) {
    return [Math.max(2, Math.round(depth))];
  }

  return [...DEFAULT_AUTO_DETECT_DEPTH_LEVELS];
}

function getBackstepLevels(backstep?: number) {
  if (typeof backstep === "number" && backstep > 0) {
    return [Math.max(1, Math.round(backstep))];
  }

  return [...DEFAULT_AUTO_DETECT_BACKSTEP_LEVELS];
}

function buildCountSignature(count: WaveCount) {
  return JSON.stringify({
    pattern: count.pattern,
    direction: count.direction,
    anchor: count.anchor
      ? {
          time: count.anchor.time,
          price: roundTo(count.anchor.price, 4),
          kind: count.anchor.kind,
        }
      : null,
    points: count.points.map((point) => ({
      label: point.label,
      time: point.time,
      price: roundTo(point.price, 4),
    })),
  });
}

function scoreTargetRatio(
  value: number | undefined,
  target: number,
  idealTolerance: number,
  maxTolerance: number,
) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return 0;
  }

  const distance = Math.abs(value - target);

  if (distance <= idealTolerance) {
    return roundTo(100 - (distance / Math.max(idealTolerance, 0.0001)) * 10, 2);
  }

  if (distance >= maxTolerance) {
    return 0;
  }

  return roundTo(
    ((maxTolerance - distance) / Math.max(maxTolerance - idealTolerance, 0.0001)) * 90,
    2,
  );
}

function scoreAlternativeTargets(
  value: number | undefined,
  alternatives: Array<{
    target: number;
    idealTolerance: number;
    maxTolerance: number;
  }>,
) {
  if (alternatives.length === 0) {
    return 0;
  }

  return Math.max(
    ...alternatives.map((alternative) =>
      scoreTargetRatio(
        value,
        alternative.target,
        alternative.idealTolerance,
        alternative.maxTolerance,
      ),
    ),
  );
}

function scoreRange(
  value: number | undefined,
  idealMin: number,
  idealMax: number,
  softMin: number,
  softMax: number,
) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return 0;
  }

  if (value < softMin || value > softMax) {
    return 0;
  }

  if (value >= idealMin && value <= idealMax) {
    const center = (idealMin + idealMax) / 2;
    const halfRange = Math.max((idealMax - idealMin) / 2, 0.0001);
    const offset = Math.abs(value - center) / halfRange;

    return roundTo(clamp(100 - offset * 12, 85, 100), 2);
  }

  if (value < idealMin) {
    return roundTo(
      60 + ((value - softMin) / Math.max(idealMin - softMin, 0.0001)) * 25,
      2,
    );
  }

  return roundTo(
    60 + ((softMax - value) / Math.max(softMax - idealMax, 0.0001)) * 25,
    2,
  );
}

function scoreSoftRules(validation: WaveValidationResult) {
  const softRules = validation.rules.filter((rule) => rule.severity === "soft");

  if (softRules.length === 0) {
    return 100;
  }

  return roundTo(
    average(
      softRules.map((rule) => {
        if (rule.status === "pass") {
          return 100;
        }

        if (rule.status === "warning") {
          return 62;
        }

        return 0;
      }),
    ),
    2,
  );
}

function scoreLengthBalance(lengths: number[]) {
  const positiveLengths = lengths.filter(
    (length): length is number => typeof length === "number" && Number.isFinite(length) && length > 0,
  );

  if (positiveLengths.length < 2) {
    return 0;
  }

  const maxLength = Math.max(...positiveLengths);
  const minLength = Math.min(...positiveLengths);
  const mean = average(positiveLengths);
  const dispersion = mean > 0 ? standardDeviation(positiveLengths) / mean : 1;
  const ratioScore = clamp(((minLength / maxLength) - 0.2) / 0.6, 0, 1) * 100;
  const dispersionScore = clamp(1 - dispersion / 0.85, 0, 1) * 100;

  return roundTo(average([ratioScore, dispersionScore]), 2);
}

function scoreImpulseAlternation(
  wave2Retracement?: number,
  wave4Retracement?: number,
) {
  if (
    typeof wave2Retracement !== "number" ||
    typeof wave4Retracement !== "number" ||
    !Number.isFinite(wave2Retracement) ||
    !Number.isFinite(wave4Retracement)
  ) {
    return 0;
  }

  const deepShallowPair =
    (wave2Retracement >= 0.5 && wave4Retracement <= 0.382) ||
    (wave4Retracement >= 0.5 && wave2Retracement <= 0.382);

  if (deepShallowPair) {
    return 100;
  }

  const difference = Math.abs(wave2Retracement - wave4Retracement);

  if (difference >= 0.28) {
    return 92;
  }

  if (difference >= 0.18) {
    return 78;
  }

  if (difference >= 0.1) {
    return 62;
  }

  return 40;
}

function scoreCorrectiveSymmetry(
  count: WaveCount,
) {
  if (!count.anchor || count.points.length < 3) {
    return 0;
  }

  const directionMultiplier = count.direction === "bullish" ? 1 : -1;
  const [waveA, waveB, waveC] = sortWavePoints(count.points);
  const waveALength = (waveA.price - count.anchor.price) * directionMultiplier;
  const waveCLength = (waveC.price - waveB.price) * directionMultiplier;
  const waveADuration = Math.max(waveA.time - count.anchor.time, 1);
  const waveCDuration = Math.max(waveC.time - waveB.time, 1);
  const lengthScore = scoreAlternativeTargets(
    waveALength > 0 ? waveCLength / waveALength : undefined,
    [
      { target: 1, idealTolerance: 0.12, maxTolerance: 0.75 },
      { target: 1.618, idealTolerance: 0.2, maxTolerance: 0.95 },
    ],
  );
  const durationScore = scoreAlternativeTargets(waveCDuration / waveADuration, [
    { target: 1, idealTolerance: 0.25, maxTolerance: 1.5 },
    { target: 1.618, idealTolerance: 0.35, maxTolerance: 2.2 },
  ]);

  return roundTo(average([lengthScore, durationScore]), 2);
}

function scoreWave3Prominence(
  wave1Length?: number,
  wave3Length?: number,
  wave5Length?: number,
) {
  if (
    typeof wave1Length !== "number" ||
    typeof wave3Length !== "number" ||
    typeof wave5Length !== "number" ||
    wave1Length <= 0 ||
    wave3Length <= 0 ||
    wave5Length <= 0
  ) {
    return 0;
  }

  if (wave3Length >= Math.max(wave1Length, wave5Length)) {
    return 100;
  }

  const comparisonBase = Math.max(Math.min(wave1Length, wave5Length), 0.0001);
  return roundTo(clamp((wave3Length / comparisonBase - 1) / 0.6, 0, 1) * 90, 2);
}

function buildProjectionFromCandidates(
  label: string,
  baseProbability: number,
  candidates: ProjectionCandidate[],
): FutureProjection | null {
  if (candidates.length === 0) {
    return null;
  }

  const rankedCandidates = [...candidates].sort((left, right) => {
    if (left.probability !== right.probability) {
      return right.probability - left.probability;
    }

    return Math.abs(left.ratio - 1) - Math.abs(right.ratio - 1);
  });
  const primary = rankedCandidates[0];
  const secondary = rankedCandidates[1] ?? primary;

  return {
    nextTargetPrice: roundTo(primary.price, 4),
    nextWaveTarget: roundTo(primary.price, 4),
    probability: roundTo(
      clamp(baseProbability * 0.65 + primary.probability * 0.35, 0, 100),
      2,
    ),
    minTarget: roundTo(Math.min(primary.price, secondary.price), 4),
    maxTarget: roundTo(Math.max(primary.price, secondary.price), 4),
    label,
    scenarioLabel: label,
  };
}

function buildWave5Projection(
  count: WaveCount,
  measurements: WaveMeasurements,
  baseProbability: number,
) {
  if (!count.anchor || count.points.length < 4) {
    return null;
  }

  const [wave1Point, , , wave4Point] = sortWavePoints(count.points);
  const wave1SignedMove = wave1Point.price - count.anchor.price;
  const wave3ToWave1Ratio = measurements.wave3ToWave1Ratio;
  const wave4Retracement = measurements.wave4Retracement;
  const ratios = [0.618, 1, 1.618] as const;

  const candidates = ratios.map<ProjectionCandidate>((ratio) => {
    let ratioProbability = 52;

    if (typeof wave3ToWave1Ratio === "number") {
      if (wave3ToWave1Ratio >= 1.45) {
        if (ratio === 0.618) {
          ratioProbability += 28;
        } else if (ratio === 1) {
          ratioProbability += 20;
        } else if (ratio === 1.618) {
          ratioProbability += 8;
        }
      } else if (wave3ToWave1Ratio >= 1) {
        if (ratio === 1) {
          ratioProbability += 24;
        } else if (ratio === 1.618) {
          ratioProbability += 18;
        } else if (ratio === 0.618) {
          ratioProbability += 10;
        }
      } else {
        if (ratio === 1.618) {
          ratioProbability += 24;
        } else if (ratio === 1) {
          ratioProbability += 8;
        }
      }
    }

    if (typeof wave4Retracement === "number") {
      if (wave4Retracement <= 0.382) {
        if (ratio === 1.618) {
          ratioProbability += 8;
        }
      } else if (wave4Retracement >= 0.45) {
        if (ratio === 0.618 || ratio === 1) {
          ratioProbability += 8;
        }
      }
    }

    return {
      ratio,
      price: wave4Point.price + wave1SignedMove * ratio,
      probability: roundTo(clamp(ratioProbability, 0, 100), 2),
    };
  });

  return buildProjectionFromCandidates("Wave 5 Target Zone", baseProbability, candidates);
}

function buildWave4Projection(
  count: WaveCount,
  measurements: WaveMeasurements,
  baseProbability: number,
) {
  if (count.points.length < 3) {
    return null;
  }

  const [, wave2Point, wave3Point] = sortWavePoints(count.points);
  const wave3SignedMove = wave3Point.price - wave2Point.price;
  const wave3ToWave1Ratio = measurements.wave3ToWave1Ratio;
  const ratios = [0.236, 0.382, 0.5, 0.618] as const;

  const candidates = ratios.map<ProjectionCandidate>((ratio) => {
    let ratioProbability = ratio === 0.382 ? 82 : ratio === 0.5 ? 76 : 68;

    if (typeof wave3ToWave1Ratio === "number" && wave3ToWave1Ratio >= 1.5) {
      if (ratio === 0.236 || ratio === 0.382) {
        ratioProbability += 8;
      }
    }

    return {
      ratio,
      price: wave3Point.price - wave3SignedMove * ratio,
      probability: roundTo(clamp(ratioProbability, 0, 100), 2),
    };
  });

  return buildProjectionFromCandidates("Wave 4 Retracement", baseProbability, candidates);
}

function buildWaveCProjection(
  count: WaveCount,
  measurements: WaveMeasurements,
  baseProbability: number,
) {
  if (!count.anchor || count.points.length < 2) {
    return null;
  }

  const [waveA, waveB] = sortWavePoints(count.points);
  const waveASignedMove = waveA.price - count.anchor.price;
  const waveBToARatio = measurements.waveBToARatio;
  const ratios = [1, 1.618] as const;

  const candidates = ratios.map<ProjectionCandidate>((ratio) => {
    let ratioProbability = ratio === 1 ? 72 : 78;

    if (typeof waveBToARatio === "number") {
      if (waveBToARatio >= 0.618) {
        if (ratio === 1) {
          ratioProbability += 8;
        }
      } else if (ratio === 1.618) {
        ratioProbability += 8;
      }
    }

    return {
      ratio,
      price: waveB.price + waveASignedMove * ratio,
      probability: roundTo(clamp(ratioProbability, 0, 100), 2),
    };
  });

  return buildProjectionFromCandidates("Wave C Objective", baseProbability, candidates);
}

function buildPostImpulseProjection(
  count: WaveCount,
  baseProbability: number,
) {
  if (!count.anchor || count.points.length < 5) {
    return null;
  }

  const points = sortWavePoints(count.points);
  const impulseMove = points[4].price - count.anchor.price;
  const candidates: ProjectionCandidate[] = [
    {
      ratio: 0.236,
      price: points[4].price - impulseMove * 0.236,
      probability: 68,
    },
    {
      ratio: 0.382,
      price: points[4].price - impulseMove * 0.382,
      probability: 82,
    },
  ];

  return buildProjectionFromCandidates("Wave A Objective", baseProbability, candidates);
}

function buildPostCorrectiveProjection(
  validation: WaveValidationResult,
  baseProbability: number,
) {
  const activeLevel =
    validation.fibonacciLevels.find((level) => level.isActive) ??
    validation.fibonacciLevels[0];

  if (!activeLevel) {
    return null;
  }

  return {
    nextTargetPrice: roundTo(activeLevel.price, 4),
    nextWaveTarget: roundTo(activeLevel.price, 4),
    probability: roundTo(clamp(baseProbability * 0.92, 0, 100), 2),
    minTarget: roundTo(activeLevel.price * 0.9985, 4),
    maxTarget: roundTo(activeLevel.price * 1.0015, 4),
    label: "Post-C Reversal Zone",
    scenarioLabel: "Post-C Reversal Zone",
  };
}

function scoreSwingSet(
  swings: ZigZagSwing[],
  candles: Candle[],
  deviationPercent: number,
) {
  if (swings.length < 4) {
    return 0;
  }

  const alternationScore = average(
    swings.slice(1).map((swing, index) =>
      swing.kind !== swings[index].kind ? 100 : 0,
    ),
  );
  const legMoves = swings.slice(1).map((swing, index) =>
    percentMove(swings[index].price, swing.price),
  );
  const averageMove = average(legMoves);
  const moveScore = clamp(averageMove / Math.max(deviationPercent * 2.1, 0.0001), 0, 1) * 100;
  const idealSwingCountScore = clamp(1 - Math.abs(swings.length - 10) / 10, 0, 1) * 100;
  const recencyScore =
    candles.length > 0
      ? clamp((swings[swings.length - 1].index + 1) / candles.length, 0, 1) * 100
      : 0;

  return roundTo(
    average([
      alternationScore * 0.35,
      moveScore * 0.25,
      idealSwingCountScore * 0.25,
      recencyScore * 0.15,
    ]),
    2,
  );
}

function calculateImpulseProbabilityFromValidation(
  count: WaveCount,
  validation: WaveValidationResult,
) {
  if (!validation.hardRulePassed) {
    return 0;
  }

  const {
    wave1Length,
    wave2Retracement,
    wave3Length,
    wave3ToWave1Ratio,
    wave4Retracement,
    wave5Length,
    wave5ToWave1Ratio,
  } = validation.measurements;

  const fibonacciScores: number[] = [];

  if (typeof wave2Retracement === "number") {
    fibonacciScores.push(scoreRange(wave2Retracement, 0.382, 0.786, 0.236, 1));
  }

  if (typeof wave3ToWave1Ratio === "number") {
    fibonacciScores.push(scoreTargetRatio(wave3ToWave1Ratio, 1.618, 0.18, 0.85));
  }

  if (typeof wave4Retracement === "number") {
    fibonacciScores.push(scoreRange(wave4Retracement, 0.236, 0.5, 0.146, 0.786));
  }

  if (typeof wave5ToWave1Ratio === "number") {
    fibonacciScores.push(
      scoreAlternativeTargets(wave5ToWave1Ratio, [
        { target: 0.618, idealTolerance: 0.12, maxTolerance: 0.65 },
        { target: 1, idealTolerance: 0.15, maxTolerance: 0.8 },
        { target: 1.618, idealTolerance: 0.18, maxTolerance: 1.1 },
        { target: 2.618, idealTolerance: 0.28, maxTolerance: 1.6 },
      ]),
    );
  }

  const fibonacciScore = fibonacciScores.length > 0 ? average(fibonacciScores) : 0;
  const balanceInputs = [wave1Length, wave3Length, wave5Length].filter(
    (value): value is number => typeof value === "number" && value > 0,
  );
  const lengthBalanceScore =
    balanceInputs.length >= 2 ? scoreLengthBalance(balanceInputs) : 0;
  const wave3ProminenceScore =
    typeof wave1Length === "number" && typeof wave3Length === "number"
      ? wave5Length
        ? scoreWave3Prominence(wave1Length, wave3Length, wave5Length)
        : wave3Length > wave1Length
          ? 82
          : 56
      : 0;
  const balanceScore = average([lengthBalanceScore, wave3ProminenceScore].filter((score) => score > 0));
  const alternationScore =
    typeof wave2Retracement === "number" && typeof wave4Retracement === "number"
      ? scoreImpulseAlternation(wave2Retracement, wave4Retracement)
      : 0;
  const softRuleScore = scoreSoftRules(validation);

  const probability =
    fibonacciScore * 0.45 +
    balanceScore * 0.25 +
    alternationScore * 0.2 +
    softRuleScore * 0.1;

  const pointCountBonus =
    count.points.length === 5 ? 6 : count.points.length === 4 ? 10 : count.points.length === 3 ? 4 : 0;

  return roundTo(clamp(probability + pointCountBonus, 0, 100), 2);
}

function calculateCorrectiveProbabilityFromValidation(
  count: WaveCount,
  validation: WaveValidationResult,
) {
  if (!validation.hardRulePassed) {
    return 0;
  }

  const { waveBToARatio, waveCToARatio } = validation.measurements;
  const fibonacciScores: number[] = [];

  if (typeof waveBToARatio === "number") {
    fibonacciScores.push(scoreRange(waveBToARatio, 0.382, 0.886, 0.236, 1.236));
  }

  if (typeof waveCToARatio === "number") {
    fibonacciScores.push(
      scoreAlternativeTargets(waveCToARatio, [
        { target: 1, idealTolerance: 0.14, maxTolerance: 0.9 },
        { target: 1.618, idealTolerance: 0.2, maxTolerance: 1.1 },
      ]),
    );
  }

  const fibonacciScore = fibonacciScores.length > 0 ? average(fibonacciScores) : 0;
  const balanceScore = count.points.length >= 3 ? scoreCorrectiveSymmetry(count) : 58;
  const softRuleScore = scoreSoftRules(validation);

  const probability =
    fibonacciScore * 0.5 +
    balanceScore * 0.25 +
    softRuleScore * 0.25;

  const pointCountBonus = count.points.length >= 3 ? 4 : 0;

  return roundTo(clamp(probability + pointCountBonus, 0, 100), 2);
}

function detectZigZagSwingsForSetting(
  candles: Candle[],
  depth: number,
  deviationPercent: number,
  backstep: number,
  limit: number,
) {
  if (candles.length < depth * 2 + 1) {
    return [] as ZigZagSwing[];
  }

  const candidates = buildZigZagCandidates(candles, depth);
  const swings: ZigZagSwing[] = [];

  for (const candidate of candidates) {
    const previous = swings[swings.length - 1];

    if (!previous) {
      swings.push(candidate);
      continue;
    }

    if (previous.kind === candidate.kind) {
      if (isMoreExtreme(previous, candidate)) {
        swings[swings.length - 1] = candidate;
      }

      continue;
    }

    const movePercent = percentMove(previous.price, candidate.price);

    if (movePercent < deviationPercent) {
      const previousOpposite = swings[swings.length - 2];

      if (
        previousOpposite &&
        previousOpposite.kind === candidate.kind &&
        candidate.index - previous.index <= backstep &&
        isMoreExtreme(previousOpposite, candidate)
      ) {
        swings[swings.length - 2] = candidate;
      }

      continue;
    }

    if (candidate.index - previous.index <= backstep && isMoreExtreme(previous, candidate)) {
      swings[swings.length - 1] = candidate;
      continue;
    }

    swings.push(candidate);
  }

  return swings.slice(-limit);
}

function collectZigZagSwingSets(candles: Candle[], options: ZigZagOptions = {}) {
  const limit = options.limit ?? DEFAULT_ZIGZAG_OPTIONS.limit;
  const deviationLevels = normalizeDeviationLevels(options.deviationPercent);
  const depthLevels = getDepthLevels(options.depth);
  const backstepLevels = getBackstepLevels(options.backstep);
  const swingSets: ZigZagSwingSet[] = [];
  const seenSignatures = new Set<string>();

  for (const depth of depthLevels) {
    for (const backstep of backstepLevels) {
      for (const deviationPercent of deviationLevels) {
        const swings = detectZigZagSwingsForSetting(
          candles,
          depth,
          deviationPercent,
          backstep,
          limit,
        );

        if (swings.length === 0) {
          continue;
        }

        const signature = JSON.stringify({
          deviationPercent,
          depth,
          backstep,
          swings: swings.map((swing) => [swing.time, roundTo(swing.price, 4), swing.kind]),
        });

        if (seenSignatures.has(signature)) {
          continue;
        }

        seenSignatures.add(signature);
        swingSets.push({
          swings,
          depth,
          deviationPercent,
          backstep,
          limit,
          score: scoreSwingSet(swings, candles, deviationPercent),
        });
      }
    }
  }

  return swingSets.sort((left, right) => {
    if (left.score !== right.score) {
      return right.score - left.score;
    }

    if (left.swings.length !== right.swings.length) {
      return right.swings.length - left.swings.length;
    }

    return right.deviationPercent - left.deviationPercent;
  });
}

function buildZigZagCandidates(candles: Candle[], depth: number) {
  const candidates: ZigZagSwing[] = [];

  for (let index = depth; index < candles.length - depth; index += 1) {
    const candle = candles[index];
    const strength = percentMove(candle.low, candle.high);

    if (isPivotHigh(candles, index, depth)) {
      candidates.push({
        id: `zigzag-high-${candle.time}`,
        index,
        time: candle.time,
        price: candle.high,
        kind: "high",
        strength,
        source: "auto",
      });
    }

    if (isPivotLow(candles, index, depth)) {
      candidates.push({
        id: `zigzag-low-${candle.time}`,
        index,
        time: candle.time,
        price: candle.low,
        kind: "low",
        strength,
        source: "auto",
      });
    }
  }

  return candidates.sort((left, right) => left.index - right.index);
}

export function sortWavePoints(points: WavePoint[]) {
  return [...points].sort((left, right) => {
    const timeDifference = sortByTime(left.time, right.time);

    if (timeDifference !== 0) {
      return timeDifference;
    }

    return toLabelOrder(left.label) - toLabelOrder(right.label);
  });
}

export function createWavePoint(
  point: Pick<WavePoint, "label" | "price" | "time"> &
    Partial<Omit<WavePoint, "label" | "price" | "time">>,
): WavePoint {
  return {
    id: point.id ?? generateWaveId("wave-point"),
    label: point.label,
    price: point.price,
    time: point.time,
    degree: point.degree ?? "minor",
    source: point.source ?? "manual",
    index: point.index,
    kind: point.kind,
  };
}

export function normalizeWavePoints(points: WavePoint[]) {
  const deduped = new Map<string, WavePoint>();

  for (const point of points) {
    deduped.set(point.id, createWavePoint(point));
  }

  return sortWavePoints(Array.from(deduped.values()));
}

export function upsertWavePoint(points: WavePoint[], nextPoint: WavePoint) {
  const existingIndex = points.findIndex((point) => point.id === nextPoint.id);

  if (existingIndex === -1) {
    return normalizeWavePoints([...points, nextPoint]);
  }

  const nextPoints = [...points];
  nextPoints[existingIndex] = createWavePoint(nextPoint);

  return normalizeWavePoints(nextPoints);
}

export function moveWavePoint(
  points: WavePoint[],
  pointId: string,
  patch: Partial<Pick<WavePoint, "price" | "time" | "label" | "degree" | "kind">>,
) {
  return normalizeWavePoints(
    points.map((point) =>
      point.id === pointId
        ? {
            ...point,
            ...patch,
          }
        : point,
    ),
  );
}

export function removeWavePoint(points: WavePoint[], pointId: string) {
  return normalizeWavePoints(points.filter((point) => point.id !== pointId));
}

export function relabelWavePoints(
  points: WavePoint[],
  pattern: WavePatternType,
  degree?: WaveDegree,
) {
  const labels = pattern === "impulse" ? IMPULSE_LABELS : CORRECTIVE_LABELS;

  return sortWavePoints(points).slice(0, labels.length).map((point, index) => ({
    ...point,
    label: labels[index],
    degree: degree ?? point.degree,
  }));
}

export function buildWaveCount(points: WavePoint[], options: BuildWaveCountOptions = {}): WaveCount {
  const sortedPoints = sortWavePoints(points);
  const pattern = options.pattern ?? inferPatternFromLabels(sortedPoints);
  const anchor = normalizeAnchor(options.anchor);
  const direction =
    options.direction ??
    (anchor
      ? inferDirectionFromAnchor(anchor, sortedPoints[0])
      : inferDirectionFromPoints(sortedPoints));

  return {
    pattern,
    direction,
    degree: options.degree ?? sortedPoints[0]?.degree ?? "minor",
    source: options.source ?? sortedPoints[0]?.source ?? "manual",
    anchor,
    points: sortedPoints,
  };
}

function isPivotHigh(candles: Candle[], index: number, depth: number) {
  const candle = candles[index];

  for (let offset = 1; offset <= depth; offset += 1) {
    const left = candles[index - offset];
    const right = candles[index + offset];

    if (!left || !right) {
      return false;
    }

    if (candle.high < left.high || candle.high < right.high) {
      return false;
    }
  }

  return true;
}

function isPivotLow(candles: Candle[], index: number, depth: number) {
  const candle = candles[index];

  for (let offset = 1; offset <= depth; offset += 1) {
    const left = candles[index - offset];
    const right = candles[index + offset];

    if (!left || !right) {
      return false;
    }

    if (candle.low > left.low || candle.low > right.low) {
      return false;
    }
  }

  return true;
}

export function detectZigZagSwings(candles: Candle[], options: ZigZagOptions = {}) {
  return collectZigZagSwingSets(candles, options)[0]?.swings ?? [];
}

function buildAutoImpulseCount(sequence: ZigZagSwing[], degree: WaveDegree): WaveCount | null {
  if (sequence.length < 5 || sequence.length > 6) {
    return null;
  }

  const [anchorSwing, ...waveSwings] = sequence;
  const direction: WaveTrend =
    waveSwings[0].price >= anchorSwing.price ? "bullish" : "bearish";
  const expectedKinds =
    direction === "bullish"
      ? (["low", "high", "low", "high", "low", "high"] as const)
      : (["high", "low", "high", "low", "high", "low"] as const);

  if (!sequence.every((swing, index) => swing.kind === expectedKinds[index])) {
    return null;
  }

  const points = waveSwings.map<WavePoint>((swing, index) => ({
    id: `wave-${IMPULSE_LABELS[index]}-${swing.time}`,
    label: IMPULSE_LABELS[index],
    price: swing.price,
    time: swing.time,
    degree,
    source: "auto",
    index: swing.index,
    kind: swing.kind,
  }));

  return {
    pattern: "impulse",
    direction,
    degree,
    source: "auto",
    anchor: {
      id: `wave-origin-${anchorSwing.time}`,
      price: anchorSwing.price,
      time: anchorSwing.time,
      kind: anchorSwing.kind,
      index: anchorSwing.index,
    },
    points,
  };
}

function buildAutoCorrectiveCount(sequence: ZigZagSwing[], degree: WaveDegree): WaveCount | null {
  if (sequence.length < 3 || sequence.length > 4) {
    return null;
  }

  const [anchorSwing, ...waveSwings] = sequence;
  const direction: WaveTrend =
    waveSwings[0].price >= anchorSwing.price ? "bullish" : "bearish";
  const expectedKinds =
    direction === "bullish"
      ? (["low", "high", "low", "high"] as const)
      : (["high", "low", "high", "low"] as const);

  if (!sequence.every((swing, index) => swing.kind === expectedKinds[index])) {
    return null;
  }

  const points = waveSwings.map<WavePoint>((swing, index) => ({
    id: `wave-${CORRECTIVE_LABELS[index]}-${swing.time}`,
    label: CORRECTIVE_LABELS[index],
    price: swing.price,
    time: swing.time,
    degree,
    source: "auto",
    index: swing.index,
    kind: swing.kind,
  }));

  return {
    pattern: "corrective",
    direction,
    degree,
    source: "auto",
    anchor: {
      id: `wave-origin-${anchorSwing.time}`,
      price: anchorSwing.price,
      time: anchorSwing.time,
      kind: anchorSwing.kind,
      index: anchorSwing.index,
    },
    points,
  };
}

function validatePartialImpulseCount(count: WaveCount): WaveValidationResult {
  const points = sortWavePoints(count.points);
  const direction = count.direction;
  const directionMultiplier = direction === "bullish" ? 1 : -1;
  const rules: WaveValidationRule[] = [];

  if (!count.anchor) {
    rules.push(
      buildRule(
        "impulse-origin-required",
        "Impulse origin required",
        "Partial impulse validation still needs the Wave 1 origin pivot.",
        "Add or infer an origin before validating this impulse count.",
        "fail",
        "hard",
      ),
    );

    return {
      pattern: "impulse",
      direction,
      isValid: false,
      hardRulePassed: false,
      score: 0,
      rules,
      fibonacciLevels: [],
      measurements: {},
      messages: rules.map((rule) => rule.message),
    };
  }

  if (points.length < 3 || points.length > 4) {
    rules.push(
      buildRule(
        "impulse-partial-length",
        "Partial impulse needs 3 or 4 waves",
        "Predictive impulse scoring works best after Waves 1-3 or Waves 1-4 are visible.",
        "Select at least Waves 1-2-3 before running predictive impulse validation.",
        "fail",
        "hard",
      ),
    );

    return {
      pattern: "impulse",
      direction,
      isValid: false,
      hardRulePassed: false,
      score: 0,
      rules,
      fibonacciLevels: [],
      measurements: {},
      messages: rules.map((rule) => rule.message),
    };
  }

  if (!points.every((point, index) => point.label === IMPULSE_LABELS[index])) {
    rules.push(
      buildRule(
        "impulse-label-order",
        "Impulse labels must be sequential",
        "Expected labels 1-2-3 or 1-2-3-4 in chronological order.",
        "Re-label the selected pivots sequentially before running predictive validation.",
        "fail",
        "hard",
      ),
    );

    return {
      pattern: "impulse",
      direction,
      isValid: false,
      hardRulePassed: false,
      score: 0,
      rules,
      fibonacciLevels: [],
      measurements: {},
      messages: rules.map((rule) => rule.message),
    };
  }

  const origin = count.anchor;
  const wave1Point = points[0];
  const wave2Point = points[1];
  const wave3Point = points[2];
  const wave4Point = points[3];
  const wave1Length = (wave1Point.price - origin.price) * directionMultiplier;
  const wave2Pullback = (wave1Point.price - wave2Point.price) * directionMultiplier;
  const wave3Length = (wave3Point.price - wave2Point.price) * directionMultiplier;
  const wave2Retracement = wave1Length > 0 ? wave2Pullback / wave1Length : undefined;
  const wave3ToWave1Ratio = wave1Length > 0 ? wave3Length / wave1Length : undefined;
  const wave4Pullback =
    wave4Point ? (wave3Point.price - wave4Point.price) * directionMultiplier : undefined;
  const wave4Retracement =
    typeof wave4Pullback === "number" && wave3Length > 0
      ? wave4Pullback / wave3Length
      : undefined;

  rules.push(
    buildRule(
      "impulse-direction",
      "Wave 1 must move in the dominant direction",
      "The first impulse leg must extend away from the anchor pivot.",
      wave1Length > 0
        ? `Wave 1 is advancing ${direction} as expected.`
        : "Wave 1 does not advance away from the origin in the chosen direction.",
      wave1Length > 0 ? "pass" : "fail",
      "hard",
      wave1Length,
    ),
  );

  rules.push(
    buildRule(
      "wave-2-retrace",
      "Wave 2 cannot retrace more than 100% of Wave 1",
      "Wave 2 must stay beyond the Wave 1 origin.",
      typeof wave2Retracement === "number" && wave2Retracement <= 1
        ? `Wave 2 retracement is ${formatRatio(wave2Retracement)} of Wave 1.`
        : "Wave 2 has retraced beyond the Wave 1 origin.",
      typeof wave2Retracement === "number" && wave2Retracement <= 1 ? "pass" : "fail",
      "hard",
      wave2Retracement,
      "<= 1.000",
    ),
  );

  rules.push(
    buildRule(
      "wave-3-extends",
      "Wave 3 should extend beyond Wave 1",
      "A valid impulse should push Wave 3 beyond the Wave 1 endpoint.",
      (wave3Point.price - wave1Point.price) * directionMultiplier > 0
        ? "Wave 3 has extended beyond the Wave 1 endpoint."
        : "Wave 3 has not moved beyond the Wave 1 endpoint.",
      (wave3Point.price - wave1Point.price) * directionMultiplier > 0 ? "pass" : "fail",
      "hard",
    ),
  );

  if (wave4Point) {
    const wave4NoOverlap =
      direction === "bullish"
        ? wave4Point.price > wave1Point.price
        : wave4Point.price < wave1Point.price;

    rules.push(
      buildRule(
        "wave-4-overlap",
        "Wave 4 cannot overlap Wave 1 price territory",
        "In a standard impulse, Wave 4 should stay outside the Wave 1 terminal price.",
        wave4NoOverlap
          ? "Wave 4 remains outside the Wave 1 territory."
          : "Wave 4 has overlapped the Wave 1 price territory.",
        wave4NoOverlap ? "pass" : "fail",
        "hard",
      ),
    );
  }

  if (typeof wave2Retracement === "number") {
    rules.push(
      buildRule(
        "wave-2-fib",
        "Wave 2 Fibonacci retracement",
        "Wave 2 commonly retraces 38.2% to 78.6% of Wave 1.",
        `Wave 2 retracement of ${formatRatio(wave2Retracement)} is being compared against the 0.382 to 0.786 zone.`,
        wave2Retracement >= 0.382 && wave2Retracement <= 0.786
          ? "pass"
          : wave2Retracement <= 1
            ? "warning"
            : "fail",
        "soft",
        wave2Retracement,
        "0.382 - 0.786",
      ),
    );
  }

  if (typeof wave3ToWave1Ratio === "number") {
    rules.push(
      buildRule(
        "wave-3-fib",
        "Wave 3 Fibonacci extension",
        "Wave 3 often measures about 1.618 times Wave 1.",
        `Wave 3 extension ratio of ${formatRatio(wave3ToWave1Ratio)} is being compared with 1.618.`,
        Math.abs(wave3ToWave1Ratio - 1.618) <= 0.2
          ? "pass"
          : wave3ToWave1Ratio >= 1
            ? "warning"
            : "fail",
        "soft",
        wave3ToWave1Ratio,
        "1.618",
      ),
    );
  }

  if (typeof wave4Retracement === "number") {
    rules.push(
      buildRule(
        "wave-4-fib",
        "Wave 4 Fibonacci retracement",
        "Wave 4 commonly retraces 23.6% to 50.0% of Wave 3.",
        `Wave 4 retracement of ${formatRatio(wave4Retracement)} is being compared against the 0.236 to 0.500 zone.`,
        wave4Retracement >= 0.236 && wave4Retracement <= 0.5
          ? "pass"
          : wave4Retracement <= 0.786
            ? "warning"
            : "fail",
        "soft",
        wave4Retracement,
        "0.236 - 0.500",
      ),
    );
  }

  const fibonacciLevels = [
    ...markNearestFibLevel(
      buildRetracementLevels(origin.price, wave1Point.price, [0.382, 0.5, 0.618, 0.786, 1], "Wave 2"),
      wave2Point.price,
    ),
    ...markNearestFibLevel(
      buildExtensionLevels(
        wave2Point.price,
        [1, 1.272, 1.618, 2.618],
        wave1Point.price - origin.price,
        "Wave 3",
      ),
      wave3Point.price,
    ),
    ...(wave4Point && typeof wave4Retracement === "number"
      ? markNearestFibLevel(
          buildRetracementLevels(
            wave2Point.price,
            wave3Point.price,
            [0.236, 0.382, 0.5, 0.618],
            "Wave 4",
          ),
          wave4Point.price,
        )
      : []),
    ...(wave4Point
      ? buildExtensionLevels(
          wave4Point.price,
          [0.618, 1, 1.618, 2.618],
          wave1Point.price - origin.price,
          "Wave 5",
        )
      : []),
  ];

  const { hardRulePassed } = scoreRules(rules);
  const messages = rules
    .filter((rule) => rule.status !== "pass")
    .map((rule) => rule.message);

  return {
    pattern: "impulse",
    direction,
    isValid: hardRulePassed,
    hardRulePassed,
    score: 0,
    rules,
    fibonacciLevels,
    measurements: {
      wave1Length,
      wave2Retracement,
      wave3Length,
      wave3ToWave1Ratio,
      wave4Retracement,
    },
    messages,
  };
}

function validatePartialCorrectiveCount(count: WaveCount): WaveValidationResult {
  const points = sortWavePoints(count.points);
  const direction = count.direction;
  const directionMultiplier = direction === "bullish" ? 1 : -1;
  const rules: WaveValidationRule[] = [];

  if (!count.anchor) {
    rules.push(
      buildRule(
        "corrective-origin-required",
        "Corrective origin required",
        "Predictive ABC validation needs the pivot before Wave A begins.",
        "Add or infer a corrective origin before validating this ABC setup.",
        "fail",
        "hard",
      ),
    );

    return {
      pattern: "corrective",
      direction,
      isValid: false,
      hardRulePassed: false,
      score: 0,
      rules,
      fibonacciLevels: [],
      measurements: {},
      messages: rules.map((rule) => rule.message),
    };
  }

  if (points.length !== 2 || !points.every((point, index) => point.label === CORRECTIVE_LABELS[index])) {
    rules.push(
      buildRule(
        "corrective-partial-length",
        "Corrective setup needs Waves A and B",
        "Predictive ABC scoring works best once Wave A and Wave B are visible.",
        "Select a clean A-B corrective structure before projecting Wave C.",
        "fail",
        "hard",
      ),
    );

    return {
      pattern: "corrective",
      direction,
      isValid: false,
      hardRulePassed: false,
      score: 0,
      rules,
      fibonacciLevels: [],
      measurements: {},
      messages: rules.map((rule) => rule.message),
    };
  }

  const [waveA, waveB] = points;
  const waveALength = (waveA.price - count.anchor.price) * directionMultiplier;
  const waveBPullback = (waveA.price - waveB.price) * directionMultiplier;
  const waveBToARatio = waveALength > 0 ? waveBPullback / waveALength : undefined;

  rules.push(
    buildRule(
      "corrective-direction",
      "Wave A must break away from the prior pivot",
      "Wave A should clearly move away from the origin pivot.",
      waveALength > 0
        ? `Wave A is moving ${direction} away from the origin.`
        : "Wave A does not break away from the origin in the selected direction.",
      waveALength > 0 ? "pass" : "fail",
      "hard",
      waveALength,
    ),
  );

  rules.push(
    buildRule(
      "wave-b-retracement",
      "Wave B should retrace part of Wave A",
      "Wave B normally retraces a portion of Wave A before Wave C continues.",
      typeof waveBToARatio === "number" && waveBToARatio > 0
        ? `Wave B retracement is ${formatRatio(waveBToARatio)} of Wave A.`
        : "Wave B is not retracing Wave A in the expected direction.",
      typeof waveBToARatio === "number" && waveBToARatio > 0 ? "pass" : "fail",
      "hard",
      waveBToARatio,
    ),
  );

  if (typeof waveBToARatio === "number") {
    rules.push(
      buildRule(
        "wave-b-fib",
        "Wave B Fibonacci retracement",
        "Wave B often retraces 38.2% to 88.6% of Wave A.",
        `Wave B retracement of ${formatRatio(waveBToARatio)} is being compared against the preferred 0.382 to 0.886 band.`,
        waveBToARatio >= 0.382 && waveBToARatio <= 0.886
          ? "pass"
          : waveBToARatio > 0 && waveBToARatio <= 1.236
            ? "warning"
            : "fail",
        "soft",
        waveBToARatio,
        "0.382 - 0.886",
      ),
    );
  }

  const fibonacciLevels = markNearestFibLevel(
    buildRetracementLevels(
      count.anchor.price,
      waveA.price,
      [0.382, 0.5, 0.618, 0.786, 0.886],
      "Wave B",
    ),
    waveB.price,
  );

  const { hardRulePassed } = scoreRules(rules);
  const messages = rules
    .filter((rule) => rule.status !== "pass")
    .map((rule) => rule.message);

  return {
    pattern: "corrective",
    direction,
    isValid: hardRulePassed,
    hardRulePassed,
    score: 0,
    rules,
    fibonacciLevels,
    measurements: {
      waveBToARatio,
    },
    messages,
  };
}

function validateImpulseCount(count: WaveCount): WaveValidationResult {
  const points = sortWavePoints(count.points);

  if (points.length < 5) {
    return validatePartialImpulseCount(count);
  }

  const direction = count.direction;
  const directionMultiplier = direction === "bullish" ? 1 : -1;
  const rules: WaveValidationRule[] = [];

  if (!count.anchor) {
    rules.push(
      buildRule(
        "impulse-origin-required",
        "Impulse origin required",
        "Hard Elliott Wave rules need the Wave 1 starting pivot.",
        "Add or infer an origin before validating this impulse count.",
        "fail",
        "hard",
      ),
    );

    return {
      pattern: "impulse",
      direction,
      isValid: false,
      hardRulePassed: false,
      score: 0,
      rules,
      fibonacciLevels: [],
      measurements: {},
      messages: rules.map((rule) => rule.message),
    };
  }

  if (points.length !== 5 || !isImpulseLabels(points)) {
    rules.push(
      buildRule(
        "impulse-label-order",
        "Impulse labels must be sequential",
        "Expected labels 1-2-3-4-5 in chronological order.",
        "Re-label the selected pivots as 1, 2, 3, 4, 5 before running validation.",
        "fail",
        "hard",
      ),
    );

    return {
      pattern: "impulse",
      direction,
      isValid: false,
      hardRulePassed: false,
      score: 0,
      rules,
      fibonacciLevels: [],
      measurements: {},
      messages: rules.map((rule) => rule.message),
    };
  }

  const [wave1Point, wave2Point, wave3Point, wave4Point, wave5Point] = points;
  const origin = count.anchor;
  const wave1Length = (wave1Point.price - origin.price) * directionMultiplier;
  const wave2Pullback = (wave1Point.price - wave2Point.price) * directionMultiplier;
  const wave3Length = (wave3Point.price - wave2Point.price) * directionMultiplier;
  const wave4Pullback = (wave3Point.price - wave4Point.price) * directionMultiplier;
  const wave5Length = (wave5Point.price - wave4Point.price) * directionMultiplier;
  const wave2Retracement = wave1Length > 0 ? wave2Pullback / wave1Length : undefined;
  const wave3ToWave1Ratio = wave1Length > 0 ? wave3Length / wave1Length : undefined;
  const wave4Retracement = wave3Length > 0 ? wave4Pullback / wave3Length : undefined;
  const wave5ToWave1Ratio = wave1Length > 0 ? wave5Length / wave1Length : undefined;

  rules.push(
    buildRule(
      "impulse-direction",
      "Wave 1 must move in the dominant direction",
      "The first impulse leg must extend away from the origin.",
      wave1Length > 0
        ? `Wave 1 is advancing ${direction} as expected.`
        : "Wave 1 does not advance away from the origin in the chosen direction.",
      wave1Length > 0 ? "pass" : "fail",
      "hard",
      wave1Length,
    ),
  );

  rules.push(
    buildRule(
      "wave-2-retrace",
      "Wave 2 cannot retrace more than 100% of Wave 1",
      "Wave 2 must stay beyond the Wave 1 origin.",
      typeof wave2Retracement === "number" && wave2Retracement <= 1
        ? `Wave 2 retracement is ${formatRatio(wave2Retracement)} of Wave 1.`
        : "Wave 2 has retraced beyond the Wave 1 origin.",
      typeof wave2Retracement === "number" && wave2Retracement <= 1 ? "pass" : "fail",
      "hard",
      wave2Retracement,
      "<= 1.000",
    ),
  );

  rules.push(
    buildRule(
      "wave-3-extends",
      "Wave 3 should extend beyond Wave 1",
      "A valid impulse normally has Wave 3 exceeding the Wave 1 termination.",
      (wave3Point.price - wave1Point.price) * directionMultiplier > 0
        ? "Wave 3 has extended beyond the Wave 1 endpoint."
        : "Wave 3 has not moved beyond the Wave 1 endpoint.",
      (wave3Point.price - wave1Point.price) * directionMultiplier > 0 ? "pass" : "fail",
      "hard",
    ),
  );

  rules.push(
    buildRule(
      "wave-3-shortest",
      "Wave 3 cannot be the shortest impulse wave",
      "Compare the net lengths of Waves 1, 3, and 5.",
      wave3Length >= Math.min(wave1Length, wave5Length)
        ? `Wave 3 length (${formatPrice(wave3Length)}) is not the shortest impulse leg.`
        : "Wave 3 is the shortest of Waves 1, 3, and 5.",
      wave3Length >= Math.min(wave1Length, wave5Length) ? "pass" : "fail",
      "hard",
      wave3Length,
    ),
  );

  const wave4NoOverlap =
    direction === "bullish"
      ? wave4Point.price > wave1Point.price
      : wave4Point.price < wave1Point.price;

  rules.push(
    buildRule(
      "wave-4-overlap",
      "Wave 4 cannot overlap Wave 1 price territory",
      "In a standard impulse, Wave 4 should stay outside the Wave 1 terminal price.",
      wave4NoOverlap
        ? "Wave 4 remains outside the Wave 1 territory."
        : "Wave 4 has overlapped the Wave 1 price territory.",
      wave4NoOverlap ? "pass" : "fail",
      "hard",
    ),
  );

  if (typeof wave2Retracement === "number") {
    const wave2Status =
      wave2Retracement >= 0.382 && wave2Retracement <= 0.786
        ? "pass"
        : wave2Retracement <= 1
          ? "warning"
          : "fail";

    rules.push(
      buildRule(
        "wave-2-fib",
        "Wave 2 Fibonacci retracement",
        "Wave 2 commonly retraces 38.2% to 78.6% of Wave 1.",
        wave2Status === "pass"
          ? `Wave 2 retracement of ${formatRatio(wave2Retracement)} is within the common Fibonacci zone.`
          : `Wave 2 retracement of ${formatRatio(wave2Retracement)} is outside the ideal 0.382 to 0.786 band.`,
        wave2Status,
        "soft",
        wave2Retracement,
        "0.382 - 0.786",
      ),
    );
  }

  if (typeof wave3ToWave1Ratio === "number") {
    const distanceToPreferred = Math.abs(wave3ToWave1Ratio - 1.618);
    const wave3Status =
      distanceToPreferred <= 0.2
        ? "pass"
        : wave3ToWave1Ratio >= 1
          ? "warning"
          : "fail";

    rules.push(
      buildRule(
        "wave-3-fib",
        "Wave 3 Fibonacci extension",
        "Wave 3 often measures about 1.618 times Wave 1.",
        wave3Status === "pass"
          ? `Wave 3 extension ratio of ${formatRatio(wave3ToWave1Ratio)} is close to the classic 1.618 projection.`
          : `Wave 3 extension ratio of ${formatRatio(wave3ToWave1Ratio)} is not close to 1.618.`,
        wave3Status,
        "soft",
        wave3ToWave1Ratio,
        "1.618",
      ),
    );
  }

  if (typeof wave4Retracement === "number") {
    const wave4Status =
      wave4Retracement >= 0.236 && wave4Retracement <= 0.5
        ? "pass"
        : wave4Retracement <= 0.786
          ? "warning"
          : "fail";

    rules.push(
      buildRule(
        "wave-4-fib",
        "Wave 4 Fibonacci retracement",
        "Wave 4 commonly retraces 23.6% to 50.0% of Wave 3.",
        wave4Status === "pass"
          ? `Wave 4 retracement of ${formatRatio(wave4Retracement)} sits inside the typical Elliott zone.`
          : `Wave 4 retracement of ${formatRatio(wave4Retracement)} is outside the ideal 0.236 to 0.500 band.`,
        wave4Status,
        "soft",
        wave4Retracement,
        "0.236 - 0.500",
      ),
    );
  }

  if (typeof wave5ToWave1Ratio === "number") {
    const wave5Near618 = Math.abs(wave5ToWave1Ratio - 0.618);
    const wave5Near100 = Math.abs(wave5ToWave1Ratio - 1);
    const wave5Status =
      wave5Near618 <= 0.15 || wave5Near100 <= 0.15
        ? "pass"
        : wave5ToWave1Ratio >= 0.382 && wave5ToWave1Ratio <= 1.618
          ? "warning"
          : "fail";

    rules.push(
      buildRule(
        "wave-5-fib",
        "Wave 5 Fibonacci projection",
        "Wave 5 often relates to Wave 1 by 0.618x or 1.000x.",
        wave5Status === "pass"
          ? `Wave 5 ratio of ${formatRatio(wave5ToWave1Ratio)} lines up with a common Fibonacci projection.`
          : `Wave 5 ratio of ${formatRatio(wave5ToWave1Ratio)} is not close to the common 0.618x or 1.000x relationships.`,
        wave5Status,
        "soft",
        wave5ToWave1Ratio,
        "0.618 or 1.000",
      ),
    );
  }

  const fibonacciLevels = [
    ...markNearestFibLevel(
      buildRetracementLevels(origin.price, wave1Point.price, [0.382, 0.5, 0.618, 0.786, 1], "Wave 2"),
      wave2Point.price,
    ),
    ...markNearestFibLevel(
      buildExtensionLevels(
        wave2Point.price,
        [1, 1.272, 1.618, 2.618],
        wave1Point.price - origin.price,
        "Wave 3",
      ),
      wave3Point.price,
    ),
    ...markNearestFibLevel(
      buildRetracementLevels(wave2Point.price, wave3Point.price, [0.236, 0.382, 0.5, 0.618], "Wave 4"),
      wave4Point.price,
    ),
    ...markNearestFibLevel(
      buildExtensionLevels(
        wave4Point.price,
        [0.618, 1, 1.272, 1.618],
        wave1Point.price - origin.price,
        "Wave 5",
      ),
      wave5Point.price,
    ),
  ];

  const { hardRulePassed, score } = scoreRules(rules);
  const messages = rules
    .filter((rule) => rule.status !== "pass")
    .map((rule) => rule.message);

  return {
    pattern: "impulse",
    direction,
    isValid: hardRulePassed,
    hardRulePassed,
    score,
    rules,
    fibonacciLevels,
    measurements: {
      wave1Length,
      wave2Retracement,
      wave3Length,
      wave3ToWave1Ratio,
      wave4Retracement,
      wave5Length,
      wave5ToWave1Ratio,
    },
    messages,
  };
}

function validateCorrectiveCount(count: WaveCount): WaveValidationResult {
  const points = sortWavePoints(count.points);

  if (points.length < 3) {
    return validatePartialCorrectiveCount(count);
  }

  const direction = count.direction;
  const directionMultiplier = direction === "bullish" ? 1 : -1;
  const rules: WaveValidationRule[] = [];

  if (!count.anchor) {
    rules.push(
      buildRule(
        "corrective-origin-required",
        "Corrective origin required",
        "ABC validation needs the pivot before Wave A begins.",
        "Add or infer a corrective origin before validating the ABC count.",
        "fail",
        "hard",
      ),
    );

    return {
      pattern: "corrective",
      direction,
      isValid: false,
      hardRulePassed: false,
      score: 0,
      rules,
      fibonacciLevels: [],
      measurements: {},
      messages: rules.map((rule) => rule.message),
    };
  }

  if (points.length !== 3 || !isCorrectiveLabels(points)) {
    rules.push(
      buildRule(
        "corrective-label-order",
        "Corrective labels must be sequential",
        "Expected labels A-B-C in chronological order.",
        "Re-label the selected pivots as A, B, C before running validation.",
        "fail",
        "hard",
      ),
    );

    return {
      pattern: "corrective",
      direction,
      isValid: false,
      hardRulePassed: false,
      score: 0,
      rules,
      fibonacciLevels: [],
      measurements: {},
      messages: rules.map((rule) => rule.message),
    };
  }

  const origin = count.anchor;
  const [waveA, waveB, waveC] = points;
  const waveALength = (waveA.price - origin.price) * directionMultiplier;
  const waveBPullback = (waveA.price - waveB.price) * directionMultiplier;
  const waveCLength = (waveC.price - waveB.price) * directionMultiplier;
  const waveBToARatio = waveALength > 0 ? waveBPullback / waveALength : undefined;
  const waveCToARatio = waveALength > 0 ? waveCLength / waveALength : undefined;
  const waveCExtends =
    direction === "bullish" ? waveC.price > waveA.price : waveC.price < waveA.price;

  rules.push(
    buildRule(
      "corrective-direction",
      "Wave A must break away from the prior pivot",
      "ABC corrections start with a clear move away from the origin pivot.",
      waveALength > 0
        ? `Wave A is moving ${direction} away from the origin.`
        : "Wave A does not break away from the origin in the selected direction.",
      waveALength > 0 ? "pass" : "fail",
      "hard",
      waveALength,
    ),
  );

  rules.push(
    buildRule(
      "wave-b-retracement",
      "Wave B should retrace part of Wave A",
      "Wave B normally retraces a portion of Wave A before Wave C continues.",
      typeof waveBToARatio === "number" && waveBToARatio > 0
        ? `Wave B retracement is ${formatRatio(waveBToARatio)} of Wave A.`
        : "Wave B is not retracing Wave A in the expected direction.",
      typeof waveBToARatio === "number" && waveBToARatio > 0 ? "pass" : "fail",
      "hard",
      waveBToARatio,
    ),
  );

  rules.push(
    buildRule(
      "wave-c-completes",
      "Wave C should continue past the Wave A endpoint",
      "Standard zigzags and sharp corrections usually end with Wave C pushing beyond Wave A.",
      waveCExtends
        ? "Wave C has extended beyond the Wave A termination."
        : "Wave C has not moved beyond the Wave A endpoint yet.",
      waveCExtends ? "pass" : "warning",
      "soft",
    ),
  );

  if (typeof waveBToARatio === "number") {
    const waveBStatus =
      waveBToARatio >= 0.382 && waveBToARatio <= 0.886
        ? "pass"
        : waveBToARatio > 0 && waveBToARatio <= 1.236
          ? "warning"
          : "fail";

    rules.push(
      buildRule(
        "wave-b-fib",
        "Wave B Fibonacci retracement",
        "Wave B often retraces 38.2% to 88.6% of Wave A.",
        waveBStatus === "pass"
          ? `Wave B retracement of ${formatRatio(waveBToARatio)} is inside the normal Fibonacci band.`
          : `Wave B retracement of ${formatRatio(waveBToARatio)} is outside the preferred 0.382 to 0.886 band.`,
        waveBStatus,
        "soft",
        waveBToARatio,
        "0.382 - 0.886",
      ),
    );
  }

  if (typeof waveCToARatio === "number") {
    const nearOneToOne = Math.abs(waveCToARatio - 1);
    const nearExtended = Math.abs(waveCToARatio - 1.618);
    const waveCStatus =
      nearOneToOne <= 0.15 || nearExtended <= 0.2
        ? "pass"
        : waveCToARatio >= 0.786 && waveCToARatio <= 2
          ? "warning"
          : "fail";

    rules.push(
      buildRule(
        "wave-c-fib",
        "Wave C Fibonacci relationship",
        "Wave C often equals Wave A or reaches 1.618 times Wave A.",
        waveCStatus === "pass"
          ? `Wave C ratio of ${formatRatio(waveCToARatio)} matches a common ABC relationship.`
          : `Wave C ratio of ${formatRatio(waveCToARatio)} is not close to 1.000x or 1.618x Wave A.`,
        waveCStatus,
        "soft",
        waveCToARatio,
        "1.000 or 1.618",
      ),
    );
  }

  const fibonacciLevels = [
    ...markNearestFibLevel(
      buildRetracementLevels(origin.price, waveA.price, [0.382, 0.5, 0.618, 0.786, 0.886], "Wave B"),
      waveB.price,
    ),
    ...markNearestFibLevel(
      buildExtensionLevels(waveB.price, [1, 1.272, 1.618], waveA.price - origin.price, "Wave C"),
      waveC.price,
    ),
  ];

  const { hardRulePassed, score } = scoreRules(rules);
  const messages = rules
    .filter((rule) => rule.status !== "pass")
    .map((rule) => rule.message);

  return {
    pattern: "corrective",
    direction,
    isValid: hardRulePassed,
    hardRulePassed,
    score,
    rules,
    fibonacciLevels,
    measurements: {
      waveBToARatio,
      waveCToARatio,
    },
    messages,
  };
}

function validateWaveCountBase(count: WaveCount) {
  return count.pattern === "impulse"
    ? validateImpulseCount(count)
    : validateCorrectiveCount(count);
}

function buildFutureProjection(
  count: WaveCount,
  validation: WaveValidationResult,
  probability: number,
) {
  if (count.pattern === "impulse") {
    if (count.points.length >= 3 && count.points.length < 4) {
      return buildWave4Projection(count, validation.measurements, probability);
    }

    if (count.points.length >= 4 && count.points.length < 5) {
      return buildWave5Projection(count, validation.measurements, probability);
    }

    if (count.points.length >= 5) {
      return buildPostImpulseProjection(count, probability);
    }

    return null;
  }

  if (count.points.length >= 2 && count.points.length < 3) {
    return buildWaveCProjection(count, validation.measurements, probability);
  }

  if (count.points.length >= 3) {
    return buildPostCorrectiveProjection(validation, probability);
  }

  return null;
}

function calculateWaveProbabilityInternal(
  count: WaveCount,
  validation?: WaveValidationResult,
) {
  const baseValidation = validation ?? validateWaveCountBase(count);

  if (!baseValidation.hardRulePassed) {
    return 0;
  }

  return count.pattern === "impulse"
    ? calculateImpulseProbabilityFromValidation(count, baseValidation)
    : calculateCorrectiveProbabilityFromValidation(count, baseValidation);
}

export function calculateWaveProbability(count: WaveCount): number {
  return calculateWaveProbabilityInternal(count);
}

export function validateWaveCount(count: WaveCount) {
  const baseValidation = validateWaveCountBase(count);
  const probability = calculateWaveProbabilityInternal(count, baseValidation);

  return {
    ...baseValidation,
    isValid: probability > 0 && baseValidation.hardRulePassed,
    score: probability,
  };
}

export function validateImpulseWave(points: WavePoint[], options: ValidateWaveOptions = {}) {
  const count = buildWaveCount(points, {
    pattern: "impulse",
    degree: options.degree,
    direction: options.direction,
    source: options.source,
    anchor: options.anchor,
  });

  return validateImpulseCount(count).rules;
}

export function validateCorrectiveWave(points: WavePoint[], options: ValidateWaveOptions = {}) {
  const count = buildWaveCount(points, {
    pattern: "corrective",
    degree: options.degree,
    direction: options.direction,
    source: options.source,
    anchor: options.anchor,
  });

  return validateCorrectiveCount(count).rules;
}

function compareDetectedCandidates(
  left: AutoDetectedWaveCandidate,
  right: AutoDetectedWaveCandidate,
) {
  if (left.confidence !== right.confidence) {
    return right.confidence - left.confidence;
  }

  const leftProjectionProbability = left.futureProjection?.probability ?? 0;
  const rightProjectionProbability = right.futureProjection?.probability ?? 0;

  if (leftProjectionProbability !== rightProjectionProbability) {
    return rightProjectionProbability - leftProjectionProbability;
  }

  if (left.count.pattern !== right.count.pattern) {
    return left.count.pattern === "impulse" ? -1 : 1;
  }

  if (left.count.points.length !== right.count.points.length) {
    return right.count.points.length - left.count.points.length;
  }

  const leftTime = left.count.points[left.count.points.length - 1]?.time ?? 0;
  const rightTime = right.count.points[right.count.points.length - 1]?.time ?? 0;

  return rightTime - leftTime;
}

function pickPatternCandidate(
  candidates: AutoDetectedWaveCandidate[],
  pattern: WavePatternType,
) {
  const patternCandidates = candidates.filter(
    (candidate) => candidate.count.pattern === pattern,
  );

  if (pattern === "impulse") {
    const predictiveWave5Candidate = patternCandidates.find(
      (candidate) =>
        candidate.count.points.length >= 4 &&
        candidate.futureProjection?.label === "Wave 5 Target Zone",
    );

    return predictiveWave5Candidate ?? patternCandidates[0] ?? null;
  }

  const predictiveWaveCCandidate = patternCandidates.find(
    (candidate) =>
      candidate.count.points.length >= 2 &&
      candidate.futureProjection?.label === "Wave C Objective",
  );

  return predictiveWaveCCandidate ?? patternCandidates[0] ?? null;
}

function buildDetectedCandidate(
  count: WaveCount,
  swingSet: ZigZagSwingSet,
) {
  const validation = validateWaveCount(count);
  const confidence = calculateWaveProbabilityInternal(count, validation);

  if (confidence <= 0) {
    return null;
  }

  const futureProjection = buildFutureProjection(count, validation, confidence);
  const scoredCount: WaveCount = {
    ...count,
    confidence,
    futureProjection: futureProjection ?? undefined,
  };

  return {
    count: scoredCount,
    validation: {
      ...validation,
      score: confidence,
    },
    confidence,
    futureProjection,
    swings: swingSet.swings,
    deviationPercent: swingSet.deviationPercent,
    depth: swingSet.depth,
    backstep: swingSet.backstep,
  } satisfies AutoDetectedWaveCandidate;
}

export function autoDetectWaveCount(
  candles: Candle[],
  options: AutoDetectWaveOptions = {},
): AutoWaveDetection {
  const degree = options.degree ?? "minor";
  const patternPreference = options.pattern ?? "either";
  const swingSets = collectZigZagSwingSets(candles, options);
  const rankedBySignature = new Map<string, AutoDetectedWaveCandidate>();

  for (const swingSet of swingSets) {
    if (patternPreference === "either" || patternPreference === "impulse") {
      for (const sequenceLength of [6, 5, 4] as const) {
        for (let index = 0; index <= swingSet.swings.length - sequenceLength; index += 1) {
          const impulse = buildAutoImpulseCount(
            swingSet.swings.slice(index, index + sequenceLength),
            degree,
          );

          if (!impulse) {
            continue;
          }

          const candidate = buildDetectedCandidate(impulse, swingSet);

          if (!candidate) {
            continue;
          }

          const signature = buildCountSignature(candidate.count);
          const existing = rankedBySignature.get(signature);

          if (!existing || candidate.confidence > existing.confidence) {
            rankedBySignature.set(signature, candidate);
          }
        }
      }
    }

    if (patternPreference === "either" || patternPreference === "corrective") {
      for (const sequenceLength of [4, 3] as const) {
        for (let index = 0; index <= swingSet.swings.length - sequenceLength; index += 1) {
          const corrective = buildAutoCorrectiveCount(
            swingSet.swings.slice(index, index + sequenceLength),
            degree,
          );

          if (!corrective) {
            continue;
          }

          const candidate = buildDetectedCandidate(corrective, swingSet);

          if (!candidate) {
            continue;
          }

          const signature = buildCountSignature(candidate.count);
          const existing = rankedBySignature.get(signature);

          if (!existing || candidate.confidence > existing.confidence) {
            rankedBySignature.set(signature, candidate);
          }
        }
      }
    }
  }

  const allRankedCandidates = Array.from(rankedBySignature.values()).sort(
    compareDetectedCandidates,
  );
  const rankedCounts = allRankedCandidates.slice(0, 3);
  const primary = allRankedCandidates[0] ?? null;
  const impulseCandidate = pickPatternCandidate(allRankedCandidates, "impulse");
  const correctiveCandidate = pickPatternCandidate(allRankedCandidates, "corrective");
  const alternates = rankedCounts.slice(1);
  const fallbackSwings = detectZigZagSwings(candles, options);

  return {
    count: primary?.count ?? null,
    primaryCount: primary?.count ?? null,
    primaryValidation: primary?.validation ?? null,
    impulseCount: impulseCandidate?.count ?? null,
    impulseValidation: impulseCandidate?.validation ?? null,
    correctiveCount: correctiveCandidate?.count ?? null,
    correctiveValidation: correctiveCandidate?.validation ?? null,
    alternate: alternates[0]?.count ?? null,
    alternates,
    rankedCounts,
    swings: primary?.swings ?? fallbackSwings,
    validation: primary?.validation ?? null,
    futureProjection: primary?.futureProjection ?? null,
  };
}
