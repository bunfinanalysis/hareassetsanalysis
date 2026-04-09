import type { Candle } from "../market-types";

import {
  buildFibRelationships,
  buildProjectionTargets,
  calculateFibConfluenceScore,
} from "./fibonacci-projection.ts";
import { calculateATR } from "./pivot-detection.ts";
import { clamp, average, formatPrice, getTimeframeSeconds, roundTo } from "./shared.ts";
import type {
  ABCImprovedChannel,
  ABCScenario,
  CorrectiveCandidateEvaluation,
  HigherABCContext,
  PriceClamp,
  RankedABCScenarioData,
  RankedTargetCandidate,
  ScenarioDisplayPlan,
  ScenarioScoreComponent,
  TrendContext,
} from "./types.ts";

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
    averageLoss === 0
      ? 100
      : 100 - 100 / (1 + averageGain / Math.max(averageLoss, 0.0001));

  for (let index = period + 1; index < closes.length; index += 1) {
    const change = closes[index] - closes[index - 1];
    averageGain = (averageGain * (period - 1) + Math.max(change, 0)) / period;
    averageLoss = (averageLoss * (period - 1) + Math.max(-change, 0)) / period;
    rsi[index] =
      averageLoss === 0
        ? 100
        : 100 - 100 / (1 + averageGain / Math.max(averageLoss, 0.0001));
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

export function evaluateMomentumDivergence(
  evaluation: CorrectiveCandidateEvaluation,
  candles: Candle[],
) {
  if (
    evaluation.candidate.kind !== "abc" ||
    !evaluation.candidate.c ||
    !evaluation.cStructure.sequence ||
    evaluation.cStructure.sequence.length < 6
  ) {
    return 50;
  }

  const rsi = calculateRSI(candles, 14);
  const macdHistogram = calculateMACDHistogram(candles);
  const wave3 = evaluation.cStructure.sequence[3];
  const wave5 = evaluation.cStructure.sequence[5];
  const direction = evaluation.candidate.direction;
  const priceDivergence =
    direction === "bullish" ? wave5.price > wave3.price : wave5.price < wave3.price;
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

export function scoreChannelFit(
  candidate: CorrectiveCandidateEvaluation["candidate"],
  candles: Candle[],
) {
  const end = candidate.c ?? candidate.b;

  if (candidate.anchor.index >= end.index) {
    return 0;
  }

  const atr = calculateATR(candles.slice(candidate.anchor.index, end.index + 1), 14);
  const left = candidate.a;
  const right = candidate.b;
  const denominator = Math.max(right.index - left.index, 1);
  const slope = (right.price - left.price) / denominator;
  const parallelOffset =
    candidate.anchor.price -
    (left.price - slope * (left.index - candidate.anchor.index));
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
  const endpointLine =
    candidate.direction === "bullish"
      ? Math.max(
          candidate.a.price + slope * (end.index - candidate.a.index),
          candidate.a.price +
            slope * (end.index - candidate.a.index) +
            parallelOffset,
        )
      : Math.min(
          candidate.a.price + slope * (end.index - candidate.a.index),
          candidate.a.price +
            slope * (end.index - candidate.a.index) +
            parallelOffset,
        );
  const endpointDistance = Math.abs(end.price - endpointLine);
  const endpointScore =
    clamp(1 - endpointDistance / Math.max(atr * 2.4, 0.0001), 0, 1) * 100;

  return roundTo(insideRatio * 72 + endpointScore * 0.28, 2);
}

export function calculateRecencyScore(endIndex: number, latestIndex: number) {
  if (endIndex < 0 || latestIndex < 0) {
    return 0;
  }

  const candlesFromLatest = Math.max(latestIndex - endIndex, 0);
  const strongWindow = Math.max(6, Math.round((latestIndex + 1) * 0.05));
  const fadeWindow = Math.max(
    strongWindow + 8,
    Math.round((latestIndex + 1) * 0.18),
  );

  if (candlesFromLatest <= strongWindow) {
    return 100;
  }

  if (candlesFromLatest >= fadeWindow) {
    return 0;
  }

  return roundTo(
    ((fadeWindow - candlesFromLatest) /
      Math.max(fadeWindow - strongWindow, 1)) *
      100,
    2,
  );
}

function ruleStatusToComponentScore(status: ABCScenario["rules"]["details"][number]["status"]) {
  if (status === "pass") {
    return 100;
  }

  if (status === "warning" || status === "pending") {
    return 55;
  }

  return 0;
}

function buildPivotQualityScore(scenario: ABCScenario) {
  const swings = scenario.swings;

  if (swings.length < 3) {
    return 35;
  }

  const spans = swings
    .slice(1)
    .map((swing, index) => Math.max(swing.index - swings[index].index, 1));
  const minSpan = Math.min(...spans);
  const maxSpan = Math.max(...spans);
  const balanceScore =
    maxSpan > 0 ? clamp((minSpan / maxSpan) * 100, 0, 100) : 0;
  const developmentScore = scenario.kind === "abc" ? 88 : 62;

  return roundTo(average([balanceScore, developmentScore, scenario.recencyScore]), 2);
}

function buildRetracementQualityScore(scenario: ABCScenario) {
  const retraceRule = scenario.rules.details.find(
    (rule) => rule.id === "wave-b-fib" || rule.id === "fixed-wave-b-retrace-limit",
  );

  if (!retraceRule) {
    return 50;
  }

  return roundTo(
    average([
      scenario.fibScore,
      ruleStatusToComponentScore(retraceRule.status),
    ]),
    2,
  );
}

function buildSubdivisionQualityScore(scenario: ABCScenario) {
  const subdivisionRules = scenario.rules.details.filter((rule) =>
    [
      "wave-a-five",
      "wave-c-five",
      "wave-c-overlap",
      "wave-c-wave3-shortest",
      "wave-c-pending",
    ].includes(rule.id),
  );

  if (subdivisionRules.length === 0) {
    return scenario.kind === "abc" ? 55 : 48;
  }

  return roundTo(
    average(subdivisionRules.map((rule) => ruleStatusToComponentScore(rule.status))),
    2,
  );
}

function buildHigherTimeframeAlignmentScore(
  scenario: ABCScenario,
  higherContext: HigherABCContext | null,
) {
  if (!higherContext) {
    return 50;
  }

  if (higherContext.direction === scenario.direction) {
    return roundTo(clamp(higherContext.confidence, 0, 100), 2);
  }

  return roundTo(clamp(100 - higherContext.confidence, 0, 100), 2);
}

function buildStructuralCleanlinessScore(scenario: ABCScenario) {
  const rulesRatio =
    scenario.rules.total > 0
      ? (scenario.rules.passed / Math.max(scenario.rules.total, 1)) * 100
      : 0;
  const hardRuleIntegrity = scenario.hardRulePassed ? 100 : 25;

  return roundTo(
    average([scenario.channelScore, rulesRatio, hardRuleIntegrity]),
    2,
  );
}

function buildScenarioScoreComponents(
  scenario: ABCScenario,
  higherContext: HigherABCContext | null,
) {
  const components: ScenarioScoreComponent[] = [
    {
      key: "pivot-quality",
      label: "Pivot quality",
      value: buildPivotQualityScore(scenario),
    },
    {
      key: "retracement-quality",
      label: "Retracement quality",
      value: buildRetracementQualityScore(scenario),
    },
    {
      key: "subdivision-quality",
      label: "Subdivision quality",
      value: buildSubdivisionQualityScore(scenario),
    },
    {
      key: "fib-confluence",
      label: "Fib confluence",
      value: roundTo(scenario.fibScore, 2),
    },
    {
      key: "higher-timeframe-alignment",
      label: "Higher timeframe alignment",
      value: buildHigherTimeframeAlignmentScore(scenario, higherContext),
    },
    {
      key: "structural-cleanliness",
      label: "Structural cleanliness",
      value: buildStructuralCleanlinessScore(scenario),
    },
  ];

  return components;
}

function getTrendContext(
  scenario: ABCScenario,
  higherContext: HigherABCContext | null,
): TrendContext {
  if (!higherContext) {
    return "ambiguous";
  }

  return higherContext.direction === scenario.direction
    ? "trend-aligned"
    : "counter-trend";
}

function isScenarioInvalidatedByPrice(
  scenario: RankedABCScenarioData,
  latestPrice: number,
) {
  return scenario.baseScenario.direction === "bullish"
    ? latestPrice < scenario.baseScenario.invalidationLevel
    : latestPrice > scenario.baseScenario.invalidationLevel;
}

function compareScenarioStrength(
  primaryScenario: RankedABCScenarioData,
  alternateScenario: RankedABCScenarioData,
) {
  const confidenceGap = Math.abs(
    primaryScenario.confidence - alternateScenario.confidence,
  );
  const selectionGap = Math.abs(
    primaryScenario.baseScenario.selectionScore -
      alternateScenario.baseScenario.selectionScore,
  );
  const combinedGap = average([confidenceGap, selectionGap]);

  if (combinedGap <= 8) {
    return "close" as const;
  }

  if (combinedGap <= 18) {
    return "weaker" as const;
  }

  return "clearly-weaker" as const;
}

function buildPromotionCondition(
  primaryScenario: RankedABCScenarioData,
  scenario: RankedABCScenarioData,
  role: ScenarioDisplayPlan["scenarioRole"],
) {
  if (role === "primary" || role === "sole") {
    return null;
  }

  const level = primaryScenario.baseScenario.invalidationLevel;
  const breakDirection =
    primaryScenario.baseScenario.direction === "bullish" ? "below" : "above";

  return {
    level,
    reason: `Promote this count if price breaks ${breakDirection} ${formatPrice(level)} and invalidates the current primary count while this scenario remains structurally intact.`,
  };
}

export function buildCorrectiveScenarioDisplayPlans(
  rankedScenarios: readonly RankedABCScenarioData[],
  latestPrice: number,
) {
  if (rankedScenarios.length === 0) {
    return [] as Array<{
      rankedScenario: RankedABCScenarioData;
      displayPlan: ScenarioDisplayPlan;
    }>;
  }

  const reorderedScenarios = [...rankedScenarios];
  const promotedPrimaryIndex = reorderedScenarios.findIndex(
    (scenario) => !isScenarioInvalidatedByPrice(scenario, latestPrice),
  );

  if (promotedPrimaryIndex > 0) {
    const [promotedScenario] = reorderedScenarios.splice(promotedPrimaryIndex, 1);
    reorderedScenarios.unshift(promotedScenario);
  }

  const activePrimary = reorderedScenarios[0];

  return reorderedScenarios.map((rankedScenario, index) => {
    const scenarioRole: ScenarioDisplayPlan["scenarioRole"] =
      reorderedScenarios.length === 1
        ? "sole"
        : index === 0
          ? "primary"
          : index === 1
            ? "alternate"
            : "reserve";

    return {
      rankedScenario,
      displayPlan: {
        scenarioRole,
        relativeStrength:
          index === 0 ? null : compareScenarioStrength(activePrimary, rankedScenario),
        promotionCondition: buildPromotionCondition(
          activePrimary,
          rankedScenario,
          scenarioRole,
        ),
        trendContext: getTrendContext(
          rankedScenario.baseScenario,
          rankedScenario.higherContext,
        ),
        scoreComponents: buildScenarioScoreComponents(
          rankedScenario.baseScenario,
          rankedScenario.higherContext,
        ),
        currentlyInvalidated: isScenarioInvalidatedByPrice(
          rankedScenario,
          latestPrice,
        ),
      },
    };
  });
}

export function buildScenarioReasons(
  scenario: ABCScenario,
  evaluation: CorrectiveCandidateEvaluation,
) {
  const reasons: string[] = [];
  const rulesScore =
    scenario.rules.total === 0 ? 0 : scenario.rules.passed / scenario.rules.total;

  if (rulesScore >= 0.9) {
    reasons.push("Hard Elliott zigzag rules are fully intact");
  } else if (rulesScore >= 0.7) {
    reasons.push("Most hard Elliott zigzag rules are intact");
  }

  if (scenario.fibScore >= 74) {
    reasons.push("B retrace and Wave C fib targets are tightly aligned");
  } else if (scenario.fibScore >= 56) {
    reasons.push("Fib relationships are acceptable but not ideal");
  }

  if (scenario.channelScore >= 68) {
    reasons.push("Price respects the A to B parallel channel structure");
  }

  if (scenario.kind === "abc" && scenario.momentumScore >= 68) {
    reasons.push("Wave C shows terminal momentum divergence");
  }

  if (evaluation.aStructure.structure === "leading-diagonal") {
    reasons.push("Wave A behaves like a leading diagonal");
  }

  if (evaluation.cStructure.structure === "ending-diagonal") {
    reasons.push("Wave C behaves like an ending diagonal");
  }

  return reasons.length > 0
    ? reasons
    : ["Structure is still forming and needs more confluence"];
}

function buildRankedScenarioFromValidation(
  evaluation: CorrectiveCandidateEvaluation,
  channelScore: number,
  momentumScore: number,
  recencyScore: number,
  candlesFromLatest: number,
  detectorMeta: ABCScenario["detectorMeta"],
) {
  const hardApplicable = evaluation.hardRules.filter(
    (rule) => rule.status !== "pending",
  );
  const hardPassed = hardApplicable.filter((rule) => rule.status === "pass").length;
  const hardRulePassed = hardApplicable.every((rule) => rule.status === "pass");
  const rulesContribution =
    hardApplicable.length === 0 ? 0 : (hardPassed / hardApplicable.length) * 40;
  const fibScore = calculateFibConfluenceScore({
    candidate: evaluation.candidate,
    waveBToARatio: evaluation.waveBToARatio,
    waveCToARatio: evaluation.waveCToARatio,
    cStructure: evaluation.cStructure,
  });
  const totalConfidence = hardRulePassed
    ? Math.round(
        rulesContribution + fibScore * 0.3 + channelScore * 0.2 + momentumScore * 0.1,
      )
    : 0;
  const completionBonus = evaluation.candidate.kind === "abc" ? 4 : 0;
  const selectionScore = roundTo(
    clamp(totalConfidence * 0.72 + recencyScore * 0.28 + completionBonus, 0, 100),
    2,
  );
  const projectionTargets = buildProjectionTargets(
    {
      candidate: evaluation.candidate,
      waveBToARatio: evaluation.waveBToARatio,
      waveCToARatio: evaluation.waveCToARatio,
      cStructure: evaluation.cStructure,
    },
    fibScore,
    channelScore,
  );

  return {
    id: `${evaluation.candidate.anchor.time}-${evaluation.candidate.a.time}-${evaluation.candidate.b.time}-${evaluation.candidate.c?.time ?? "pending"}`,
    kind: evaluation.candidate.kind,
    direction: evaluation.candidate.direction,
    degree: evaluation.candidate.degree,
    count: evaluation.count,
    confidence: clamp(totalConfidence, 0, 100),
    hardRulePassed,
    rules: {
      passed: hardPassed,
      total: hardApplicable.length,
      details: [...evaluation.hardRules, ...evaluation.softRules],
    },
    fibScore,
    channelScore,
    momentumScore,
    projectionTargets,
    targetZone:
      projectionTargets.length > 0
        ? {
            nextTargetPrice: projectionTargets[0].level,
            minTarget: Math.min(
              projectionTargets[0].level,
              (projectionTargets[1] ?? projectionTargets[0]).level,
            ),
            maxTarget: Math.max(
              projectionTargets[0].level,
              (projectionTargets[1] ?? projectionTargets[0]).level,
            ),
            probability: roundTo(projectionTargets[0].probability, 2),
            label: "Wave C Objective",
          }
        : null,
    invalidationLevel: evaluation.candidate.b.price,
    invalidationExplanation:
      evaluation.candidate.direction === "bullish"
        ? "Break below Wave B low invalidates the bullish zigzag scenario."
        : "Break above Wave B high invalidates the bearish zigzag scenario.",
    recencyScore,
    candlesFromLatest,
    selectionScore,
    scoreBreakdown: [
      { label: "Hard rules", value: roundTo(rulesContribution / 40, 4) * 100 },
      { label: "Fib score", value: fibScore },
      { label: "Channel fit", value: channelScore },
      { label: "Momentum", value: momentumScore },
      { label: "Recency", value: recencyScore },
      {
        label: "Scenario completion",
        value: evaluation.candidate.kind === "abc" ? 100 : 0,
      },
    ],
    reasonSummary: "",
    reasons: [],
    swings: [
      evaluation.candidate.anchor,
      evaluation.candidate.a,
      evaluation.candidate.b,
      ...(evaluation.candidate.c ? [evaluation.candidate.c] : []),
    ],
    detectorMeta,
  } satisfies ABCScenario;
}

export function rankValidatedScenario(
  evaluation: CorrectiveCandidateEvaluation,
  candles: Candle[],
  detectorMeta: ABCScenario["detectorMeta"],
) {
  const channelScore = scoreChannelFit(evaluation.candidate, candles);
  const momentumScore = evaluateMomentumDivergence(evaluation, candles);
  const latestIndex = candles.length - 1;
  const endIndex = (evaluation.candidate.c ?? evaluation.candidate.b).index;
  const candlesFromLatest = Math.max(latestIndex - endIndex, 0);
  const recencyScore = calculateRecencyScore(endIndex, latestIndex);
  const scenario = buildRankedScenarioFromValidation(
    evaluation,
    channelScore,
    momentumScore,
    recencyScore,
    candlesFromLatest,
    detectorMeta,
  );
  const reasons = buildScenarioReasons(scenario, evaluation);

  return {
    ...scenario,
    reasonSummary: reasons.slice(0, 2).join(" + "),
    reasons,
  } satisfies ABCScenario;
}

export function timeframeToWaveDegree(timeframe: string) {
  switch (timeframe) {
    case "15m":
      return "micro" as const;
    case "4H":
      return "intermediate" as const;
    case "Daily":
    case "Weekly":
      return "primary" as const;
    case "30m":
    case "1H":
    default:
      return "minor" as const;
  }
}

export function calculateVolumeConfirmationScore(
  scenario: ABCScenario,
  candles: Candle[],
) {
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

export function selectHigherTimeframeContext(
  scenario: ABCScenario,
  contexts: HigherABCContext[],
) {
  return (
    contexts.find(
      (context) =>
        context.direction === scenario.direction && context.confidence >= 45,
    ) ??
    contexts[0] ??
    null
  );
}

export function buildImprovedParallelChannel(
  scenario: ABCScenario,
  candles: Candle[],
  timeframe: string,
  clampPrice: PriceClamp,
) {
  const [anchor, aSwing, bSwing] = scenario.swings;
  const latestIndex = candles.length - 1;

  if (!anchor || !aSwing || !bSwing || bSwing.index <= aSwing.index) {
    const latestPrice = clampPrice(
      candles[latestIndex]?.close ?? scenario.invalidationLevel,
    );
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
    } satisfies ABCImprovedChannel;
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

  return {
    upper: clampPrice(Math.max(upperLine.endPrice, lowerLine.endPrice)),
    lower: clampPrice(Math.min(upperLine.endPrice, lowerLine.endPrice)),
    upperLine,
    lowerLine,
  } satisfies ABCImprovedChannel;
}

export function buildAdjustedTargetTable(
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

    if (
      higherContext &&
      higherContext.direction === scenario.direction &&
      target.fibRatio >= 1
    ) {
      probability += higherContext.confidence >= 70 ? 5 : 2;
    }

    return {
      price: clampPrice(target.level),
      fibRatio: target.fibRatio,
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
      probability: Math.round(
        (target.probability / Math.max(totalProbability, 1)) * 100,
      ),
    }))
    .sort((left, right) => right.probability - left.probability)
    .slice(0, 4) satisfies RankedTargetCandidate[];
}

export function rankInstitutionalScenario(
  scenario: ABCScenario,
  candles: Candle[],
  timeframe: string,
  clampPrice: PriceClamp,
  higherContext: HigherABCContext | null,
): RankedABCScenarioData {
  const volumeScore = calculateVolumeConfirmationScore(scenario, candles);
  const momentumScore = roundTo(
    scenario.momentumScore * 0.7 + volumeScore * 0.3,
    2,
  );
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
  const targets = buildAdjustedTargetTable(
    scenario,
    volumeScore,
    momentumScore,
    higherContext,
    clampPrice,
  );

  return {
    baseScenario: {
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
            nextTargetPrice: targets[0]?.price ?? clampPrice(scenario.targetZone.nextTargetPrice),
            minTarget: Math.min(
              ...(targets.length > 0
                ? targets.map((target) => target.price)
                : [clampPrice(scenario.targetZone.minTarget)]),
            ),
            maxTarget: Math.max(
              ...(targets.length > 0
                ? targets.map((target) => target.price)
                : [clampPrice(scenario.targetZone.maxTarget)]),
            ),
            probability: targets[0]?.probability ?? scenario.targetZone.probability,
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
    confidence,
    volumeScore,
    momentumScore,
    higherContext,
    targets,
    channel: buildImprovedParallelChannel(scenario, candles, timeframe, clampPrice),
    fibRelationships: buildFibRelationships(
      scenario.swings[0] && scenario.swings[1] && scenario.swings[2]
        ? Math.abs(scenario.swings[1].price - scenario.swings[2].price) /
          Math.max(Math.abs(scenario.swings[1].price - scenario.swings[0].price), 0.0001)
        : undefined,
      targets,
    ),
    subWaveLabels: [
      {
        label: "A",
        wave: "A",
        price: clampPrice(scenario.swings[1]?.price ?? scenario.swings[0]?.price ?? 0),
        time: scenario.swings[1]?.time ?? scenario.swings[0]?.time ?? 0,
      },
      {
        label: "B",
        wave: "B",
        price: clampPrice(scenario.swings[2]?.price ?? scenario.swings[1]?.price ?? 0),
        time: scenario.swings[2]?.time ?? scenario.swings[1]?.time ?? 0,
      },
      ...(scenario.swings[3]
        ? [
            {
              label: "C",
              wave: "C" as const,
              price: clampPrice(scenario.swings[3].price),
              time: scenario.swings[3].time,
            },
          ]
        : []),
    ],
    scoreBreakdown: [
      ...scenario.scoreBreakdown,
      { label: "Momentum/volume filter", value: momentumScore },
      { label: "Volume confirmation", value: volumeScore },
      { label: "Higher-degree context", value: higherContextScore },
      { label: "Price-scale safety", value: 100 },
    ],
  };
}
