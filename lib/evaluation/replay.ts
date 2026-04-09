import type { Candle } from "../market-types";
import { autoDetectABCImproved } from "../elliottABCEngine.ts";
import {
  getTimeframeSeconds,
  median as calculateMedian,
  resampleCandles,
  roundTo,
} from "../elliott-engine/shared.ts";

import type {
  HistoricalEvalDataset,
  LoggedScenarioSnapshot,
  ReplayEvaluationContext,
  ReplayEvaluationFn,
  ReplayEvaluationOptions,
  ReplayEvaluationResult,
  ReplayMetrics,
  ReplayStepLog,
  ReplayStepOutcome,
  StepOutcomeStatus,
} from "./types.ts";

const DEFAULT_REPLAY_OPTIONS: Required<ReplayEvaluationOptions> = {
  warmupBars: 48,
  stepSize: 1,
  lookaheadBars: 24,
  promotionLookaheadBars: 24,
  quickInvalidationBars: 6,
  includeHigherTimeframes: true,
  higherTimeframeOrder: ["1H", "4H"],
};

function resolveReplayOptions(
  options: ReplayEvaluationOptions,
): Required<ReplayEvaluationOptions> {
  return {
    warmupBars: options.warmupBars ?? DEFAULT_REPLAY_OPTIONS.warmupBars,
    stepSize: options.stepSize ?? DEFAULT_REPLAY_OPTIONS.stepSize,
    lookaheadBars: options.lookaheadBars ?? DEFAULT_REPLAY_OPTIONS.lookaheadBars,
    promotionLookaheadBars:
      options.promotionLookaheadBars ??
      DEFAULT_REPLAY_OPTIONS.promotionLookaheadBars,
    quickInvalidationBars:
      options.quickInvalidationBars ??
      DEFAULT_REPLAY_OPTIONS.quickInvalidationBars,
    includeHigherTimeframes:
      options.includeHigherTimeframes ??
      DEFAULT_REPLAY_OPTIONS.includeHigherTimeframes,
    higherTimeframeOrder:
      options.higherTimeframeOrder ??
      DEFAULT_REPLAY_OPTIONS.higherTimeframeOrder,
  };
}

function buildScenarioSignature(
  snapshot: Omit<LoggedScenarioSnapshot, "signature">,
) {
  return JSON.stringify({
    directionBias: snapshot.directionBias,
    degree: snapshot.degree,
    structureLabel: snapshot.structureLabel,
    pivots: snapshot.pivotSequenceUsed.map((pivot) => ({
      label: pivot.label,
      time: pivot.time,
      price: roundTo(pivot.price, 4),
    })),
  });
}

function toLoggedScenarioSnapshot(
  scenario: NonNullable<ReturnType<typeof autoDetectABCImproved>["primaryScenario"]>,
): LoggedScenarioSnapshot {
  const provisionalSnapshot = {
    id: scenario.id,
    name: scenario.name,
    role: scenario.scenarioRole,
    structureLabel: scenario.structureLabel,
    directionBias: scenario.directionBias,
    degree: scenario.degree,
    label: scenario.label,
    description: scenario.description,
    reason: scenario.reason,
    invalidationLevel: scenario.invalidationLevel,
    invalidationReason: scenario.invalidationReason,
    promotionCondition: scenario.promotionCondition,
    evidence: scenario.evidence,
    scoreComponents: scenario.scoreComponents,
    trendContext: scenario.trendContext,
    pivotSequenceUsed: scenario.pivotSequenceUsed,
    targets: scenario.targets,
    waveCProjection: scenario.waveCProjection,
    primary: scenario.primary,
    relativeStrength: scenario.relativeStrength,
    currentlyInvalidated: scenario.currentlyInvalidated,
  } satisfies Omit<LoggedScenarioSnapshot, "signature">;

  return {
    ...provisionalSnapshot,
    signature: buildScenarioSignature(provisionalSnapshot),
  };
}

function deriveHigherTimeframes(
  candles: Candle[],
  timeframe: string,
  options: Required<ReplayEvaluationOptions>,
) {
  if (!options.includeHigherTimeframes) {
    return {} as Record<string, Candle[]>;
  }

  const currentSeconds = getTimeframeSeconds(timeframe);
  const higherSlices: Record<string, Candle[]> = {};

  for (const higherTimeframe of options.higherTimeframeOrder) {
    const higherSeconds = getTimeframeSeconds(higherTimeframe);

    if (higherSeconds < currentSeconds) {
      continue;
    }

    if (higherSeconds === currentSeconds) {
      higherSlices[higherTimeframe] = candles;
      continue;
    }

    const resampled = resampleCandles(candles, higherSeconds);

    if (resampled.length >= 12) {
      higherSlices[higherTimeframe] = resampled;
    }
  }

  return higherSlices;
}

function defaultReplayEvaluator(context: ReplayEvaluationContext) {
  return autoDetectABCImproved(
    context.slice,
    context.dataset.timeframe,
    context.higherTimeframes,
  );
}

function isAmbiguousOutput(log: Pick<ReplayStepLog, "primaryScenario" | "alternateScenario" | "scenarioCount">) {
  if (!log.primaryScenario) {
    return false;
  }

  if (
    log.primaryScenario.evidence.validationStatus === "provisional" ||
    log.primaryScenario.evidence.validationStatus === "weak"
  ) {
    return true;
  }

  if (
    log.primaryScenario.evidence.higherTimeframeAlignment === "mixed" ||
    log.primaryScenario.evidence.riskClassification === "ambiguous"
  ) {
    return true;
  }

  return (
    Boolean(log.alternateScenario) &&
    (log.alternateScenario?.relativeStrength === "close" || log.scenarioCount > 1)
  );
}

function findPreferredTargetPrice(snapshot: LoggedScenarioSnapshot | null) {
  if (!snapshot) {
    return null;
  }

  if (snapshot.targets.length === 0) {
    return snapshot.waveCProjection;
  }

  const bestTarget = snapshot.targets.reduce((best, next) =>
    next.probability > best.probability ? next : best,
  );

  return bestTarget.price;
}

function isInvalidatedByBar(snapshot: LoggedScenarioSnapshot, bar: Candle) {
  return snapshot.directionBias === "bullish"
    ? bar.low <= snapshot.invalidationLevel
    : bar.high >= snapshot.invalidationLevel;
}

function isTargetReachedByBar(
  snapshot: LoggedScenarioSnapshot,
  targetPrice: number,
  bar: Candle,
) {
  return snapshot.directionBias === "bullish"
    ? bar.high >= targetPrice
    : bar.low <= targetPrice;
}

function annotateOutcome(
  step: ReplayStepLog,
  dataset: HistoricalEvalDataset,
  options: Required<ReplayEvaluationOptions>,
  allSteps: ReplayStepLog[],
) {
  if (!step.primaryScenario) {
    return {
      status: "no-scenario",
      invalidationHit: false,
      targetReached: false,
      survivedBeyondHorizon: false,
      barsToOutcome: null,
      barsToInvalidation: null,
      barsToTarget: null,
      invalidatedQuickly: false,
      primaryToAlternatePromotionObserved: false,
      promotedScenarioSignature: null,
      outcomeKnownAtTime: null,
      horizonBarsEvaluated: 0,
      lookaheadWindowComplete: false,
    } satisfies ReplayStepOutcome;
  }

  const futureBars = dataset.candles.slice(step.endIndex + 1);
  const horizonBars = futureBars.slice(0, options.lookaheadBars);
  const targetPrice = findPreferredTargetPrice(step.primaryScenario);
  let barsToInvalidation: number | null = null;
  let barsToTarget: number | null = null;

  for (let index = 0; index < horizonBars.length; index += 1) {
    const bar = horizonBars[index];
    const offsetBars = index + 1;

    if (
      barsToInvalidation === null &&
      isInvalidatedByBar(step.primaryScenario, bar)
    ) {
      barsToInvalidation = offsetBars;
    }

    if (
      targetPrice !== null &&
      barsToTarget === null &&
      isTargetReachedByBar(step.primaryScenario, targetPrice, bar)
    ) {
      barsToTarget = offsetBars;
    }

    if (barsToInvalidation !== null || barsToTarget !== null) {
      break;
    }
  }

  let status: StepOutcomeStatus = "unresolved";
  let barsToOutcome: number | null = null;
  let outcomeKnownAtTime: number | null = null;

  // Conservative tie-break: if a bar can both invalidate and hit target intrabar,
  // we treat invalidation as the first known adverse outcome because intrabar order
  // is unknowable from OHLC alone.
  if (barsToInvalidation !== null && (barsToTarget === null || barsToInvalidation <= barsToTarget)) {
    status = "invalidated";
    barsToOutcome = barsToInvalidation;
    outcomeKnownAtTime = dataset.candles[step.endIndex + barsToInvalidation]?.time ?? null;
  } else if (barsToTarget !== null) {
    status = "target-reached";
    barsToOutcome = barsToTarget;
    outcomeKnownAtTime = dataset.candles[step.endIndex + barsToTarget]?.time ?? null;
  } else if (futureBars.length >= options.lookaheadBars) {
    status = "survived-horizon";
  }

  let promotedScenarioSignature: string | null = null;

  if (step.alternateScenario) {
    const promotionWindow = allSteps.slice(
      step.stepIndex + 1,
      step.stepIndex + 1 + options.promotionLookaheadBars,
    );

    const promotionStep = promotionWindow.find(
      (nextStep) =>
        nextStep.primaryScenario?.signature === step.alternateScenario?.signature,
    );

    promotedScenarioSignature = promotionStep?.primaryScenario?.signature ?? null;
  }

  return {
    status,
    invalidationHit: status === "invalidated",
    targetReached: status === "target-reached",
    survivedBeyondHorizon: status === "survived-horizon",
    barsToOutcome,
    barsToInvalidation,
    barsToTarget,
    invalidatedQuickly:
      barsToInvalidation !== null &&
      barsToInvalidation <= options.quickInvalidationBars,
    primaryToAlternatePromotionObserved: promotedScenarioSignature !== null,
    promotedScenarioSignature,
    outcomeKnownAtTime,
    horizonBarsEvaluated: horizonBars.length,
    lookaheadWindowComplete: futureBars.length >= options.lookaheadBars,
  } satisfies ReplayStepOutcome;
}

function buildReplayMetrics(
  steps: ReplayStepLog[],
  dataset: HistoricalEvalDataset,
): ReplayMetrics {
  const scenarioSteps = steps.filter((step) => step.primaryScenario !== null);
  const invalidationBars = steps
    .map((step) => step.outcome?.barsToInvalidation ?? null)
    .filter((value): value is number => typeof value === "number");
  const promotionCount = steps.filter(
    (step) => step.outcome?.primaryToAlternatePromotionObserved,
  ).length;
  const stableTransitions: number[] = [];
  let countChurnEvents = 0;
  let totalComparableTransitions = 0;

  for (let index = 1; index < steps.length; index += 1) {
    const previous = steps[index - 1];
    const current = steps[index];

    if (!previous.primaryScenario) {
      continue;
    }

    totalComparableTransitions += 1;

    const signaturesMatch =
      previous.primaryScenario.signature === current.primaryScenario?.signature;

    stableTransitions.push(signaturesMatch ? 1 : 0);

    if (signaturesMatch) {
      continue;
    }

    const currentBar = dataset.candles[current.endIndex];

    if (currentBar && !isInvalidatedByBar(previous.primaryScenario, currentBar)) {
      countChurnEvents += 1;
    }
  }

  const outcomeBreakdown: ReplayMetrics["outcomeBreakdown"] = {
    "no-scenario": 0,
    invalidated: 0,
    "target-reached": 0,
    "survived-horizon": 0,
    unresolved: 0,
  };

  for (const step of steps) {
    outcomeBreakdown[step.outcome?.status ?? "unresolved"] += 1;
  }

  const noTradeCount = steps.filter((step) => step.noTrade).length;
  const ambiguousCount = steps.filter((step) => step.ambiguous).length;
  const alternateAvailabilityCount = steps.filter(
    (step) => step.alternateScenario !== null,
  ).length;
  const invalidationHitCount = steps.filter(
    (step) => step.outcome?.invalidationHit,
  ).length;
  const quickStructuralFailureCount = steps.filter(
    (step) => step.outcome?.invalidatedQuickly,
  ).length;
  const directionalFollowThroughCount = steps.filter(
    (step) => step.outcome?.targetReached,
  ).length;

  return {
    totalEvaluationSteps: steps.length,
    stepsWithScenario: scenarioSteps.length,
    averageScenarioCount:
      steps.length > 0
        ? roundTo(
            steps.reduce((sum, step) => sum + step.scenarioCount, 0) / steps.length,
            4,
          )
        : 0,
    alternateAvailabilityCount,
    alternateAvailabilityRate:
      steps.length > 0 ? roundTo(alternateAvailabilityCount / steps.length, 4) : 0,
    noTradeCount,
    noTradeRate: steps.length > 0 ? roundTo(noTradeCount / steps.length, 4) : 0,
    ambiguousOutputCount: ambiguousCount,
    ambiguousOutputRate:
      steps.length > 0 ? roundTo(ambiguousCount / steps.length, 4) : 0,
    invalidationHitCount,
    invalidationHitRate:
      scenarioSteps.length > 0
        ? roundTo(invalidationHitCount / scenarioSteps.length, 4)
        : 0,
    averageBarsToInvalidation:
      invalidationBars.length > 0 ? roundTo(mean(invalidationBars), 4) : null,
    medianBarsToInvalidation:
      invalidationBars.length > 0 ? roundTo(median(invalidationBars), 4) : null,
    primaryToAlternatePromotionCount: promotionCount,
    primaryToAlternatePromotionFrequency:
      alternateAvailabilityCount > 0
        ? roundTo(promotionCount / alternateAvailabilityCount, 4)
        : 0,
    stableTransitionCount: stableTransitions.reduce((sum, value) => sum + value, 0),
    totalComparableTransitions,
    scenarioStabilityRate:
      totalComparableTransitions > 0
        ? roundTo(mean(stableTransitions), 4)
        : 0,
    directionalFollowThroughCount,
    directionalFollowThroughRate:
      scenarioSteps.length > 0
        ? roundTo(directionalFollowThroughCount / scenarioSteps.length, 4)
        : 0,
    quickStructuralFailureCount,
    quickStructuralFailureRate:
      scenarioSteps.length > 0
        ? roundTo(quickStructuralFailureCount / scenarioSteps.length, 4)
        : 0,
    countChurnEvents,
    countChurnRate:
      totalComparableTransitions > 0
        ? roundTo(countChurnEvents / totalComparableTransitions, 4)
        : 0,
    structurallyInvalidVeryQuicklyRate:
      scenarioSteps.length > 0
        ? roundTo(quickStructuralFailureCount / scenarioSteps.length, 4)
        : 0,
    outcomeBreakdown,
  };
}

function mean(values: number[]) {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function runHistoricalEvaluation(
  dataset: HistoricalEvalDataset,
  options: ReplayEvaluationOptions = {},
  evaluator: ReplayEvaluationFn = defaultReplayEvaluator,
): ReplayEvaluationResult {
  const resolvedOptions = resolveReplayOptions(options);
  const warmupBars = Math.min(
    dataset.candles.length,
    Math.max(1, resolvedOptions.warmupBars),
  );
  const steps: ReplayStepLog[] = [];

  for (
    let endIndex = warmupBars - 1;
    endIndex < dataset.candles.length;
    endIndex += Math.max(resolvedOptions.stepSize, 1)
  ) {
    // Leakage guard: every engine call receives only bars up to endIndex.
    const slice = dataset.candles.slice(0, endIndex + 1);
    const higherTimeframes = deriveHigherTimeframes(
      slice,
      dataset.timeframe,
      resolvedOptions,
    );
    const context: ReplayEvaluationContext = {
      dataset,
      slice,
      stepIndex: steps.length,
      endIndex,
      higherTimeframes,
    };
    const detection = evaluator(context);
    const scenarios = detection.scenarios.map(toLoggedScenarioSnapshot);
    const primaryScenario =
      scenarios.find((scenario) => scenario.role === "primary" || scenario.role === "sole") ??
      scenarios[0] ??
      null;
    const alternateScenario =
      scenarios.find((scenario) => scenario.role === "alternate") ?? null;
    const currentBar = slice[slice.length - 1];
    const stepLog: ReplayStepLog = {
      stepIndex: steps.length,
      endIndex,
      timestamp: currentBar.time,
      instrument: dataset.instrument,
      timeframe: dataset.timeframe,
      barCount: slice.length,
      currentBar,
      scenarioCount: scenarios.length,
      noTrade: detection.analysisStatus === "no-trade" || scenarios.length === 0,
      ambiguous: false,
      primaryScenario,
      alternateScenario,
      scenarios,
      outcome: null,
    };

    stepLog.ambiguous = isAmbiguousOutput(stepLog);
    steps.push(stepLog);
  }

  for (const step of steps) {
    step.outcome = annotateOutcome(step, dataset, resolvedOptions, steps);
  }

  return {
    dataset: {
      instrument: dataset.instrument,
      timeframe: dataset.timeframe,
      candleCount: dataset.candles.length,
      source: dataset.source,
      sourcePath: dataset.sourcePath,
    },
    options: resolvedOptions,
    steps,
    metrics: buildReplayMetrics(steps, dataset),
  };
}

function median(values: number[]) {
  if (values.length === 0) {
    return 0;
  }

  return calculateMedian(values);
}
