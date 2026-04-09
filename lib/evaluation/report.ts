import { formatPrice, roundTo } from "../elliott-engine/shared.ts";

import type {
  ReplayEvaluationArtifacts,
  ReplayEvaluationResult,
  ReplayStepLog,
  StepOutcomeStatus,
} from "./types.ts";

function formatPercent(value: number) {
  return `${roundTo(value * 100, 2).toFixed(2)}%`;
}

function formatNullableNumber(value: number | null) {
  return value === null ? "n/a" : String(roundTo(value, 2));
}

function buildOutcomeRows(result: ReplayEvaluationResult) {
  const entries = Object.entries(result.metrics.outcomeBreakdown) as Array<
    [StepOutcomeStatus, number]
  >;

  return entries
    .map(([status, count]) => `| ${status} | ${count} |`)
    .join("\n");
}

function collectCommonReasons(steps: ReplayStepLog[]) {
  const counts = new Map<string, number>();

  for (const step of steps) {
    const reason = step.primaryScenario?.reason;

    if (!reason) {
      continue;
    }

    counts.set(reason, (counts.get(reason) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .sort((left, right) => right[1] - left[1])
    .slice(0, 5);
}

function collectQuickFailures(steps: ReplayStepLog[]) {
  return steps
    .filter((step) => step.outcome?.invalidatedQuickly && step.primaryScenario)
    .slice(0, 5);
}

export function buildReplayMarkdownReport(result: ReplayEvaluationResult) {
  const { dataset, metrics, options } = result;
  const commonReasons = collectCommonReasons(result.steps);
  const quickFailures = collectQuickFailures(result.steps);

  return [
    `# Elliott ABC Evaluation Report`,
    ``,
    `## Dataset`,
    `- Instrument: ${dataset.instrument}`,
    `- Timeframe: ${dataset.timeframe}`,
    `- Candle count: ${dataset.candleCount}`,
    `- Source: ${dataset.source}${dataset.sourcePath ? ` (${dataset.sourcePath})` : ""}`,
    ``,
    `## Replay Settings`,
    `- Warmup bars: ${options.warmupBars}`,
    `- Step size: ${options.stepSize}`,
    `- Lookahead bars: ${options.lookaheadBars}`,
    `- Promotion lookahead bars: ${options.promotionLookaheadBars}`,
    `- Quick invalidation bars: ${options.quickInvalidationBars}`,
    `- Higher timeframe contexts: ${options.includeHigherTimeframes ? "enabled" : "disabled"}`,
    ``,
    `## Core Metrics`,
    `| Metric | Value |`,
    `| --- | --- |`,
    `| Steps evaluated | ${metrics.totalEvaluationSteps} |`,
    `| Steps with scenario | ${metrics.stepsWithScenario} |`,
    `| Average scenario count | ${roundTo(metrics.averageScenarioCount, 2)} |`,
    `| Alternate availability | ${metrics.alternateAvailabilityCount} (${formatPercent(metrics.alternateAvailabilityRate)}) |`,
    `| No-trade outputs | ${metrics.noTradeCount} (${formatPercent(metrics.noTradeRate)}) |`,
    `| Ambiguous outputs | ${metrics.ambiguousOutputCount} (${formatPercent(metrics.ambiguousOutputRate)}) |`,
    `| Invalidation hit rate | ${metrics.invalidationHitCount} (${formatPercent(metrics.invalidationHitRate)}) |`,
    `| Avg bars to invalidation | ${formatNullableNumber(metrics.averageBarsToInvalidation)} |`,
    `| Median bars to invalidation | ${formatNullableNumber(metrics.medianBarsToInvalidation)} |`,
    `| Primary-to-alternate promotions | ${metrics.primaryToAlternatePromotionCount} (${formatPercent(metrics.primaryToAlternatePromotionFrequency)}) |`,
    `| Scenario stability | ${metrics.stableTransitionCount}/${metrics.totalComparableTransitions} (${formatPercent(metrics.scenarioStabilityRate)}) |`,
    `| Directional follow-through | ${metrics.directionalFollowThroughCount} (${formatPercent(metrics.directionalFollowThroughRate)}) |`,
    `| Quick structural failures | ${metrics.quickStructuralFailureCount} (${formatPercent(metrics.quickStructuralFailureRate)}) |`,
    `| Count churn events | ${metrics.countChurnEvents} (${formatPercent(metrics.countChurnRate)}) |`,
    ``,
    `## Outcome Breakdown`,
    `| Outcome | Count |`,
    `| --- | --- |`,
    buildOutcomeRows(result),
    ``,
    `## Common Scenario Reasons`,
    ...(commonReasons.length > 0
      ? commonReasons.map(
          ([reason, count]) => `- ${reason} (${count} step${count === 1 ? "" : "s"})`,
        )
      : ["- No scenario reasons captured."]),
    ``,
    `## Quick Failure Samples`,
    ...(quickFailures.length > 0
      ? quickFailures.map((step) => {
          const scenario = step.primaryScenario!;
          return `- ${step.timestamp}: ${scenario.name} invalidated in ${step.outcome?.barsToInvalidation} bars at ${formatPrice(scenario.invalidationLevel)}`;
        })
      : ["- No quick invalidations observed in this run."]),
  ].join("\n");
}

export function buildReplayArtifacts(
  result: ReplayEvaluationResult,
): ReplayEvaluationArtifacts {
  return {
    result,
    markdownReport: buildReplayMarkdownReport(result),
  };
}
