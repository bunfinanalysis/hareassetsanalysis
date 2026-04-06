import type {
  WaveCount,
  WaveLabel,
  WaveTrend,
  WaveValidationResult,
  WaveValidationRule,
  WaveRuleStatus,
} from "./elliottWaveUtils";

export type ReactionType = "support" | "resistance";
export type ConfidenceLabel = "Low" | "Medium" | "High";
export type ReactionStructure = "impulse" | "abc";
export type ReactionWave = 2 | 3 | 4 | 5 | "B" | "C";

export type ReactionScoreBreakdown = {
  label: string;
  value: number;
};

export type ReactionInvalidation = {
  level: number;
  rule: string;
  explanation: string;
};

export type ReactionValidationItem = {
  label: string;
  status: WaveRuleStatus;
  detail?: string;
};

export type ReactionZoneScenario = {
  label: string;
  low: number;
  high: number;
  confidence: number;
  confidenceLabel: ConfidenceLabel;
  scoreBreakdown: ReactionScoreBreakdown[];
  reasons: string[];
  reasonSummary: string;
  invalidation?: ReactionInvalidation;
};

export type WaveReactionAnalysis = {
  valid: boolean;
  structure: ReactionStructure;
  direction: WaveTrend;
  currentWave: ReactionWave;
  reactionType: ReactionType;
  primaryZone: ReactionZoneScenario | null;
  alternateZones: ReactionZoneScenario[];
  invalidation: ReactionInvalidation | null;
  validation: {
    hardRules: ReactionValidationItem[];
    guidelines: ReactionValidationItem[];
  };
};

type ScoreComponent = {
  label: string;
  score: number | null;
  weight: number;
  reason: string;
  summary: string;
};

type CandidateTemplate = {
  id: string;
  label: string;
  waveLabel: string;
  kind: "retracement" | "extension";
  fibSummary: string;
  baseStrength: number;
  prices: [number, number];
};

type CandidateScenario = CandidateTemplate & {
  reactionType: ReactionType;
  score: number;
  scoreBreakdown: ReactionScoreBreakdown[];
  reasons: string[];
  reasonSummary: string;
};

const LABEL_ORDER: Record<WaveLabel, number> = {
  "1": 0,
  "2": 1,
  "3": 2,
  "4": 3,
  "5": 4,
  A: 5,
  B: 6,
  C: 7,
};

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}

function roundTo(value: number, decimals = 4) {
  return Number(value.toFixed(decimals));
}

function average(values: number[]) {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function sortPoints(points: WaveCount["points"]) {
  return [...points].sort((left, right) => {
    if (left.time !== right.time) {
      return left.time - right.time;
    }

    return LABEL_ORDER[left.label] - LABEL_ORDER[right.label];
  });
}

function priceRange(low: number, high: number): [number, number] {
  return [Math.min(low, high), Math.max(low, high)];
}

function getProjectedDirection(
  count: WaveCount,
  currentWave: ReactionWave,
): "up" | "down" {
  const isTrendUp = count.direction === "bullish";

  if (count.pattern === "impulse") {
    const isCorrectiveWave = currentWave === 2 || currentWave === 4;
    const projectedUp = isCorrectiveWave ? !isTrendUp : isTrendUp;

    return projectedUp ? "up" : "down";
  }

  if (currentWave === "B") {
    return isTrendUp ? "down" : "up";
  }

  return isTrendUp ? "up" : "down";
}

function getReactionType(projectedDirection: "up" | "down"): ReactionType {
  return projectedDirection === "up" ? "resistance" : "support";
}

function getConfidenceLabel(confidence: number): ConfidenceLabel {
  if (confidence >= 0.74) {
    return "High";
  }

  if (confidence >= 0.52) {
    return "Medium";
  }

  return "Low";
}

function scoreProximity(distance: number, idealDistance: number, maxDistance: number) {
  if (!Number.isFinite(distance)) {
    return 0;
  }

  if (distance <= idealDistance) {
    return 1;
  }

  if (distance >= maxDistance) {
    return 0;
  }

  return clamp(
    1 - (distance - idealDistance) / Math.max(maxDistance - idealDistance, 0.0001),
    0,
    1,
  );
}

function getRuleScore(rules: WaveValidationRule[]) {
  if (rules.length === 0) {
    return null;
  }

  const hardRules = rules.filter((rule) => rule.severity === "hard");
  const softRules = rules.filter((rule) => rule.severity === "soft");
  const hardScore =
    hardRules.length === 0
      ? 1
      : average(
          hardRules.map((rule) =>
            rule.status === "pass" ? 1 : rule.status === "warning" ? 0.55 : 0,
          ),
        );
  const softScore =
    softRules.length === 0
      ? 1
      : average(
          softRules.map((rule) =>
            rule.status === "pass" ? 1 : rule.status === "warning" ? 0.6 : 0.2,
          ),
        );

  return roundTo(hardScore * 0.72 + softScore * 0.28);
}

function getStructureScore(
  candidate: CandidateTemplate,
  count: WaveCount,
  validation: WaveValidationResult | null,
) {
  const relevantLevels =
    validation?.fibonacciLevels.filter((level) => level.wave.startsWith(candidate.waveLabel)) ?? [];

  if (relevantLevels.length === 0) {
    return candidate.baseStrength;
  }

  const [low, high] = priceRange(candidate.prices[0], candidate.prices[1]);
  const center = (low + high) / 2;
  const width = Math.max(high - low, Math.abs(center) * 0.003);
  const insideCount = relevantLevels.filter(
    (level) => level.price >= low && level.price <= high,
  ).length;
  const nearestDistance = Math.min(
    ...relevantLevels.map((level) => Math.abs(level.price - center)),
  );
  const levelScore =
    scoreProximity(nearestDistance, width * 0.08, width * 0.95) * 0.65 +
    clamp(insideCount / 2, 0, 1) * 0.35;

  return roundTo(clamp(candidate.baseStrength * 0.6 + levelScore * 0.4, 0, 1));
}

function getPriorStructureScore(candidate: CandidateTemplate, count: WaveCount) {
  if (!count.anchor) {
    return null;
  }

  const points = sortPoints(count.points);
  const references = [count.anchor.price, ...points.map((point) => point.price)];

  if (references.length < 2) {
    return null;
  }

  const center = average(candidate.prices);
  const referenceRange = Math.max(...references) - Math.min(...references);
  const nearestDistance = Math.min(
    ...references.map((price) => Math.abs(price - center)),
  );

  return roundTo(
    scoreProximity(
      nearestDistance,
      Math.max(referenceRange * 0.035, Math.abs(center) * 0.0018),
      Math.max(referenceRange * 0.22, Math.abs(center) * 0.018),
    ),
  );
}

function estimateChannelProjection(
  count: WaveCount,
  currentWave: ReactionWave,
) {
  if (!count.anchor) {
    return null;
  }

  const points = sortPoints(count.points);

  if (count.pattern === "impulse") {
    if (currentWave === 3 && points.length >= 2) {
      const duration = Math.max(points[0].time - count.anchor.time, 1);
      const expectedTime = points[1].time + duration;
      const slope = (points[0].price - count.anchor.price) / duration;

      return count.anchor.price + slope * (expectedTime - count.anchor.time);
    }

    if (currentWave === 5 && points.length >= 4) {
      const actionPoints = [points[0], points[2]];
      const duration = Math.max(actionPoints[1].time - actionPoints[0].time, 1);
      const slope = (actionPoints[1].price - actionPoints[0].price) / duration;
      const expectedTime = points[3].time + Math.max(points[2].time - points[1].time, 1);

      return actionPoints[1].price + slope * (expectedTime - actionPoints[1].time);
    }
  }

  if (count.pattern === "corrective" && currentWave === "C" && points.length >= 2) {
    const duration = Math.max(points[0].time - count.anchor.time, 1);
    const slope = (points[0].price - count.anchor.price) / duration;
    const expectedTime = points[1].time + duration;

    return points[0].price + slope * (expectedTime - points[0].time);
  }

  return null;
}

function getChannelScore(
  candidate: CandidateTemplate,
  count: WaveCount,
  currentWave: ReactionWave,
) {
  const projectedChannelPrice = estimateChannelProjection(count, currentWave);

  if (projectedChannelPrice === null || !Number.isFinite(projectedChannelPrice)) {
    return null;
  }

  const center = average(candidate.prices);
  const width = Math.max(Math.abs(candidate.prices[1] - candidate.prices[0]), Math.abs(center) * 0.003);

  return roundTo(
    scoreProximity(
      Math.abs(center - projectedChannelPrice),
      width * 0.12,
      width * 1.35,
    ),
  );
}

function getRoundNumberScore(candidate: CandidateTemplate) {
  const center = average(candidate.prices);
  const step = Math.abs(center) >= 1000 ? 10 : Math.abs(center) >= 100 ? 1 : 0.25;
  const nearestRound = Math.round(center / step) * step;

  return roundTo(
    scoreProximity(Math.abs(center - nearestRound), step * 0.05, step * 0.35),
  );
}

function buildScoreBreakdown(components: ScoreComponent[]) {
  const available = components.filter(
    (component): component is ScoreComponent & { score: number } => component.score !== null,
  );

  if (available.length === 0) {
    return {
      score: 0,
      breakdown: [] as ReactionScoreBreakdown[],
      reasons: [] as string[],
      reasonSummary: "Limited structural evidence",
    };
  }

  const weightedTotal = available.reduce(
    (sum, component) => sum + component.score * component.weight,
    0,
  );
  const totalWeight = available.reduce((sum, component) => sum + component.weight, 0);
  const score = roundTo(clamp(weightedTotal / Math.max(totalWeight, 0.0001), 0, 1));
  const breakdown = available.map((component) => ({
    label: component.label,
    value: roundTo((component.score * component.weight) / Math.max(totalWeight, 0.0001)),
  }));
  const reasons = available
    .filter((component) => component.score >= 0.58)
    .sort((left, right) => right.score - left.score)
    .slice(0, 3)
    .map((component) => component.reason);
  const summaryBits = available
    .filter((component) => component.score >= 0.58)
    .sort((left, right) => right.score - left.score)
    .slice(0, 2)
    .map((component) => component.summary);

  return {
    score,
    breakdown,
    reasons,
    reasonSummary: summaryBits.join(" + ") || "Balanced but unconfirmed confluence",
  };
}

function buildZoneScenario(
  candidate: CandidateTemplate,
  count: WaveCount,
  validation: WaveValidationResult | null,
  currentWave: ReactionWave,
  reactionType: ReactionType,
) {
  const validationScore = getRuleScore(validation?.rules ?? []);
  const structureScore = getStructureScore(candidate, count, validation);
  const priorStructureScore = getPriorStructureScore(candidate, count);
  const channelScore = getChannelScore(candidate, count, currentWave);
  const roundNumberScore = getRoundNumberScore(candidate);

  const primaryFibLabel =
    candidate.kind === "retracement"
      ? "Fibonacci retracement confluence"
      : "Fibonacci extension confluence";
  const components: ScoreComponent[] = [
    {
      label: primaryFibLabel,
      score: structureScore,
      weight: 0.36,
      reason: `${candidate.fibSummary} is the strongest Fibonacci cluster for ${candidate.waveLabel.toLowerCase()}.`,
      summary: candidate.fibSummary,
    },
    {
      label: "Prior swing structure",
      score: priorStructureScore,
      weight: 0.24,
      reason: "The zone aligns with prior swing structure instead of floating in empty price territory.",
      summary: "prior structure",
    },
    {
      label: "Channel boundary alignment",
      score: channelScore,
      weight: 0.16,
      reason: "The zone sits near the projected channel boundary for the active wave sequence.",
      summary: "channel boundary",
    },
    {
      label: "Round-number proximity",
      score: roundNumberScore,
      weight: 0.08,
      reason: "The zone is close to a round-number magnet that traders often watch intraday.",
      summary: "round number",
    },
    {
      label: "Rule validity / guideline quality",
      score: validationScore,
      weight: 0.16,
      reason: "The current count still respects the relevant Elliott hard rules and soft guidelines.",
      summary: "rule quality",
    },
  ];
  const scoreData = buildScoreBreakdown(components);
  const [low, high] = priceRange(candidate.prices[0], candidate.prices[1]);

  return {
    ...candidate,
    reactionType,
    score: scoreData.score,
    scoreBreakdown: scoreData.breakdown,
    reasons: scoreData.reasons,
    reasonSummary: scoreData.reasonSummary,
    low,
    high,
  };
}

function buildValidationBuckets(
  count: WaveCount,
  validation: WaveValidationResult | null,
  primaryZone: CandidateScenario | null,
) {
  if (!validation) {
    const baseLabel = count.pattern === "impulse" ? "Wave 1 structure" : "Wave A structure";

    return {
      hardRules: [
        {
          label: baseLabel,
          status: count.points.length > 0 ? ("pass" as const) : ("warning" as const),
          detail: "The early part of the count is plotted, but more pivots are needed before the full Elliott checklist can activate.",
        },
      ],
      guidelines: [
        {
          label: "Checklist depth",
          status: "warning" as const,
          detail: "Add more pivots to unlock retracement, overlap, and alternation checks.",
        },
      ],
    };
  }

  const hardRules = validation.rules
    .filter((rule) => rule.severity === "hard")
    .map<ReactionValidationItem>((rule) => ({
      label: rule.label,
      status: rule.status,
      detail: rule.message,
    }));
  const guidelines = validation.rules
    .filter((rule) => rule.severity === "soft")
    .map<ReactionValidationItem>((rule) => ({
      label: rule.label,
      status: rule.status,
      detail: rule.message,
    }));

  if (primaryZone) {
    guidelines.push({
      label: "Reaction-zone confluence",
      status:
        primaryZone.score >= 0.74
          ? "pass"
          : primaryZone.score >= 0.52
            ? "warning"
            : "fail",
      detail: `Primary ${primaryZone.reactionType} zone is backed by ${primaryZone.reasonSummary}.`,
    });
  }

  const wave2Rule = validation.rules.find((rule) => rule.id === "wave-2-fib");
  const wave4Rule = validation.rules.find((rule) => rule.id === "wave-4-fib");

  if (wave2Rule && wave4Rule) {
    const alternationStatus =
      wave2Rule.status === "pass" && wave4Rule.status === "pass"
        ? "pass"
        : wave2Rule.status === "fail" || wave4Rule.status === "fail"
          ? "fail"
          : "warning";

    guidelines.push({
      label: "Alternation",
      status: alternationStatus,
      detail: "Wave 2 and Wave 4 retracement profiles are compared to judge whether alternation is strong or weak.",
    });
  }

  return { hardRules, guidelines };
}

function buildImpulseCandidates(
  count: WaveCount,
  currentWave: ReactionWave,
): CandidateTemplate[] {
  if (!count.anchor) {
    return [] as CandidateTemplate[];
  }

  const points = sortPoints(count.points);
  const wave1Move = (points[0]?.price ?? count.anchor.price) - count.anchor.price;

  if (currentWave === 2 && points.length >= 1) {
    return [
      {
        id: "wave2-standard",
        label: "Standard Wave 2 pullback",
        waveLabel: "Wave 2",
        kind: "retracement",
        fibSummary: "50.0%-61.8% retrace",
        baseStrength: 0.9,
        prices: priceRange(
          points[0].price - wave1Move * 0.5,
          points[0].price - wave1Move * 0.618,
        ),
      },
      {
        id: "wave2-deeper",
        label: "Deeper Wave 2 pullback",
        waveLabel: "Wave 2",
        kind: "retracement",
        fibSummary: "61.8%-76.4% retrace",
        baseStrength: 0.78,
        prices: priceRange(
          points[0].price - wave1Move * 0.618,
          points[0].price - wave1Move * 0.764,
        ),
      },
      {
        id: "wave2-deepest",
        label: "Deep Wave 2 pullback",
        waveLabel: "Wave 2",
        kind: "retracement",
        fibSummary: "76.4%-85.4% retrace",
        baseStrength: 0.62,
        prices: priceRange(
          points[0].price - wave1Move * 0.764,
          points[0].price - wave1Move * 0.854,
        ),
      },
    ];
  }

  if (currentWave === 3 && points.length >= 2) {
    return [
      {
        id: "wave3-standard",
        label: "Standard Wave 3 extension",
        waveLabel: "Wave 3",
        kind: "extension",
        fibSummary: "1.618x-2.000x Wave 1",
        baseStrength: 0.92,
        prices: priceRange(
          points[1].price + wave1Move * 1.618,
          points[1].price + wave1Move * 2,
        ),
      },
      {
        id: "wave3-extended",
        label: "Extended Wave 3 thrust",
        waveLabel: "Wave 3",
        kind: "extension",
        fibSummary: "2.000x-2.618x Wave 1",
        baseStrength: 0.8,
        prices: priceRange(
          points[1].price + wave1Move * 2,
          points[1].price + wave1Move * 2.618,
        ),
      },
      {
        id: "wave3-aggressive",
        label: "Aggressive Wave 3 extension",
        waveLabel: "Wave 3",
        kind: "extension",
        fibSummary: "2.618x-3.236x Wave 1",
        baseStrength: 0.64,
        prices: priceRange(
          points[1].price + wave1Move * 2.618,
          points[1].price + wave1Move * 3.236,
        ),
      },
    ];
  }

  if (currentWave === 4 && points.length >= 3) {
    const wave3Move = points[2].price - points[1].price;

    return [
      {
        id: "wave4-standard",
        label: "Standard Wave 4 pullback",
        waveLabel: "Wave 4",
        kind: "retracement",
        fibSummary: "14.6%-23.6% retrace",
        baseStrength: 0.84,
        prices: priceRange(
          points[2].price - wave3Move * 0.146,
          points[2].price - wave3Move * 0.236,
        ),
      },
      {
        id: "wave4-deeper",
        label: "Deeper Wave 4 pullback",
        waveLabel: "Wave 4",
        kind: "retracement",
        fibSummary: "23.6%-38.2% retrace",
        baseStrength: 0.88,
        prices: priceRange(
          points[2].price - wave3Move * 0.236,
          points[2].price - wave3Move * 0.382,
        ),
      },
      {
        id: "wave4-stress",
        label: "Stressed Wave 4 pullback",
        waveLabel: "Wave 4",
        kind: "retracement",
        fibSummary: "38.2%-50.0% retrace",
        baseStrength: 0.58,
        prices: priceRange(
          points[2].price - wave3Move * 0.382,
          points[2].price - wave3Move * 0.5,
        ),
      },
    ];
  }

  if (currentWave === 5 && points.length >= 4) {
    const wave3Move = points[2].price - points[1].price;
    const combinedMove = wave1Move + wave3Move;

    return [
      {
        id: "wave5-standard",
        label: "Standard Wave 5 push",
        waveLabel: "Wave 5",
        kind: "extension",
        fibSummary: "0.618x-1.000x Wave 1",
        baseStrength: 0.88,
        prices: priceRange(
          points[3].price + wave1Move * 0.618,
          points[3].price + wave1Move * 1,
        ),
      },
      {
        id: "wave5-extended",
        label: "Extended Wave 5 push",
        waveLabel: "Wave 5",
        kind: "extension",
        fibSummary: "1.000x-1.618x Wave 1",
        baseStrength: 0.7,
        prices: priceRange(
          points[3].price + wave1Move * 1,
          points[3].price + wave1Move * 1.618,
        ),
      },
      {
        id: "wave5-wave13",
        label: "Wave 1+3 confluence push",
        waveLabel: "Wave 5",
        kind: "extension",
        fibSummary: "0.618x of Waves 1+3",
        baseStrength: 0.76,
        prices: priceRange(
          points[3].price + wave1Move * 1,
          points[3].price + combinedMove * 0.618,
        ),
      },
    ];
  }

  return [] as CandidateTemplate[];
}

function buildCorrectiveCandidates(
  count: WaveCount,
  currentWave: ReactionWave,
  validation: WaveValidationResult | null,
): CandidateTemplate[] {
  if (!count.anchor) {
    return [] as CandidateTemplate[];
  }

  const points = sortPoints(count.points);
  const waveAMove = (points[0]?.price ?? count.anchor.price) - count.anchor.price;
  const waveBToARatio = validation?.measurements.waveBToARatio;

  if (currentWave === "B" && points.length >= 1) {
    return [
      {
        id: "waveb-standard",
        label: "Standard Wave B retrace",
        waveLabel: "Wave B",
        kind: "retracement",
        fibSummary: "50.0%-61.8% retrace",
        baseStrength: 0.82,
        prices: priceRange(
          points[0].price - waveAMove * 0.5,
          points[0].price - waveAMove * 0.618,
        ),
      },
      {
        id: "waveb-deeper",
        label: "Deeper Wave B retrace",
        waveLabel: "Wave B",
        kind: "retracement",
        fibSummary: "61.8%-78.6% retrace",
        baseStrength: 0.76,
        prices: priceRange(
          points[0].price - waveAMove * 0.618,
          points[0].price - waveAMove * 0.786,
        ),
      },
      {
        id: "waveb-flat-style",
        label: "Flat-style Wave B retrace",
        waveLabel: "Wave B",
        kind: "retracement",
        fibSummary: "78.6%-88.6% retrace",
        baseStrength: 0.68,
        prices: priceRange(
          points[0].price - waveAMove * 0.786,
          points[0].price - waveAMove * 0.886,
        ),
      },
    ];
  }

  if (currentWave === "C" && points.length >= 2) {
    const prefersExtended =
      typeof waveBToARatio === "number" && waveBToARatio >= 0.786;

    return [
      {
        id: "wavec-standard",
        label: "Standard Wave C objective",
        waveLabel: "Wave C",
        kind: "extension",
        fibSummary: prefersExtended ? "1.000x-1.236x Wave A" : "0.618x-1.000x Wave A",
        baseStrength: prefersExtended ? 0.86 : 0.8,
        prices: prefersExtended
          ? priceRange(
              points[1].price + waveAMove * 1,
              points[1].price + waveAMove * 1.236,
            )
          : priceRange(
              points[1].price + waveAMove * 0.618,
              points[1].price + waveAMove * 1,
            ),
      },
      {
        id: "wavec-extended",
        label: "Extended Wave C objective",
        waveLabel: "Wave C",
        kind: "extension",
        fibSummary: "1.236x-1.618x Wave A",
        baseStrength: 0.74,
        prices: priceRange(
          points[1].price + waveAMove * 1.236,
          points[1].price + waveAMove * 1.618,
        ),
      },
    ];
  }

  return [] as CandidateTemplate[];
}

function getCurrentWave(count: WaveCount): ReactionWave | null {
  const pointCount = count.points.length;

  if (count.pattern === "impulse") {
    if (pointCount === 0) {
      return null;
    }

    if (pointCount === 1) {
      return 2;
    }

    if (pointCount === 2) {
      return 3;
    }

    if (pointCount === 3) {
      return 4;
    }

    return 5;
  }

  if (pointCount === 0) {
    return null;
  }

  return pointCount === 1 ? "B" : "C";
}

function buildScenarioInvalidation(
  count: WaveCount,
  currentWave: ReactionWave,
  reactionType: ReactionType,
  primaryZone: ReactionZoneScenario | null,
  alternateZones: ReactionZoneScenario[],
): ReactionInvalidation | null {
  if (!count.anchor) {
    return null;
  }

  const points = sortPoints(count.points);
  const label = typeof currentWave === "number" ? `Wave ${currentWave}` : `Wave ${currentWave}`;

  if (count.pattern === "impulse") {
    if (currentWave === 2 && points.length >= 1) {
      return {
        level: count.anchor.price,
        rule: "Wave 2 cannot exceed the start of Wave 1.",
        explanation:
          count.direction === "bullish"
            ? "Break below the Wave 1 origin invalidates the bullish Wave 2 support scenario."
            : "Break above the Wave 1 origin invalidates the bearish Wave 2 resistance scenario.",
      };
    }

    if (currentWave === 3 && points.length >= 2) {
      return {
        level: points[1].price,
        rule: "Wave 3 continuation should hold the Wave 2 extreme.",
        explanation:
          count.direction === "bullish"
            ? "Break below the Wave 2 low invalidates the bullish Wave 3 continuation scenario."
            : "Break above the Wave 2 high invalidates the bearish Wave 3 continuation scenario.",
      };
    }

    if (currentWave === 4 && points.length >= 3) {
      return {
        level: points[0].price,
        rule: "Wave 4 cannot overlap Wave 1 territory in a standard impulse.",
        explanation:
          count.direction === "bullish"
            ? "Break below the Wave 1 high invalidates the bullish Wave 4 support scenario."
            : "Break above the Wave 1 low invalidates the bearish Wave 4 resistance scenario.",
      };
    }

    if (currentWave === 5 && points.length >= 4 && points.length < 5) {
      return {
        level: points[3].price,
        rule: "Wave 5 continuation should hold the Wave 4 extreme.",
        explanation:
          count.direction === "bullish"
            ? "Break below the Wave 4 low invalidates the bullish Wave 5 continuation scenario."
            : "Break above the Wave 4 high invalidates the bearish Wave 5 continuation scenario.",
      };
    }
  }

  if (count.pattern === "corrective") {
    if (currentWave === "B" && points.length >= 1) {
      return {
        level: count.anchor.price,
        rule: "A standard B-wave retrace should respect the Wave A origin.",
        explanation:
          count.direction === "bullish"
            ? "Break below the Wave A origin invalidates the bullish Wave B support scenario."
            : "Break above the Wave A origin invalidates the bearish Wave B resistance scenario.",
      };
    }

    if (currentWave === "C" && points.length >= 2 && points.length < 3) {
      return {
        level: points[1].price,
        rule: "Wave C continuation should hold the Wave B extreme.",
        explanation:
          count.direction === "bullish"
            ? "Break below the Wave B low invalidates the bullish corrective scenario."
            : "Break above the Wave B high invalidates the bearish corrective scenario.",
      };
    }
  }

  const terminalReference = [primaryZone, ...alternateZones].reduce<{
    min: number;
    max: number;
  } | null>((range, zone) => {
    if (!zone) {
      return range;
    }

    if (!range) {
      return { min: zone.low, max: zone.high };
    }

    return {
      min: Math.min(range.min, zone.low),
      max: Math.max(range.max, zone.high),
    };
  }, null);

  if (!terminalReference) {
    return null;
  }

  return {
    level:
      reactionType === "resistance" ? terminalReference.max : terminalReference.min,
    rule: `${label} reaction zone should contain the active scenario.`,
    explanation:
      reactionType === "resistance"
        ? `Sustained trade above the ${label.toLowerCase()} reaction cluster weakens the reversal scenario.`
        : `Sustained trade below the ${label.toLowerCase()} reaction cluster weakens the rebound scenario.`,
  };
}

function attachInvalidation(
  zone: ReactionZoneScenario,
  invalidation: ReactionInvalidation | null,
) {
  return invalidation ? { ...zone, invalidation } : zone;
}

export function buildWaveReactionAnalysis(
  count: WaveCount | null,
  validation: WaveValidationResult | null,
): WaveReactionAnalysis | null {
  if (!count || !count.anchor || count.points.length === 0) {
    return null;
  }

  const currentWave = getCurrentWave(count);

  if (!currentWave) {
    return null;
  }

  const projectedDirection = getProjectedDirection(count, currentWave);
  const reactionType = getReactionType(projectedDirection);
  const structure: ReactionStructure =
    count.pattern === "impulse" ? "impulse" : "abc";
  const valid = validation ? validation.hardRulePassed : true;
  const candidateTemplates =
    count.pattern === "impulse"
      ? buildImpulseCandidates(count, currentWave)
      : buildCorrectiveCandidates(count, currentWave, validation);
  const rankedCandidates = candidateTemplates
    .map((candidate) =>
      buildZoneScenario(candidate, count, validation, currentWave, reactionType),
    )
    .sort((left, right) => right.score - left.score);
  const primaryCandidate = valid ? rankedCandidates[0] ?? null : null;
  const alternateCandidates = valid ? rankedCandidates.slice(1, 3) : [];
  const validationBuckets = buildValidationBuckets(count, validation, primaryCandidate);
  const primaryZone = primaryCandidate
    ? {
        label: primaryCandidate.label,
        low: roundTo(primaryCandidate.low),
        high: roundTo(primaryCandidate.high),
        confidence: primaryCandidate.score,
        confidenceLabel: getConfidenceLabel(primaryCandidate.score),
        scoreBreakdown: primaryCandidate.scoreBreakdown,
        reasons: primaryCandidate.reasons,
        reasonSummary: primaryCandidate.reasonSummary,
      }
    : null;
  const alternateZonesBase = alternateCandidates.map((candidate) => ({
    label: candidate.label,
    low: roundTo(candidate.low),
    high: roundTo(candidate.high),
    confidence: candidate.score,
    confidenceLabel: getConfidenceLabel(candidate.score),
    scoreBreakdown: candidate.scoreBreakdown,
    reasons: candidate.reasons,
    reasonSummary: candidate.reasonSummary,
  }));
  const invalidation = buildScenarioInvalidation(
    count,
    currentWave,
    reactionType,
    primaryZone,
    alternateZonesBase,
  );
  const alternateZones = alternateZonesBase.map((zone) =>
    attachInvalidation(zone, invalidation),
  );

  return {
    valid,
    structure,
    direction: count.direction,
    currentWave,
    reactionType,
    primaryZone: primaryZone ? attachInvalidation(primaryZone, invalidation) : null,
    alternateZones,
    invalidation,
    validation: validationBuckets,
  };
}
