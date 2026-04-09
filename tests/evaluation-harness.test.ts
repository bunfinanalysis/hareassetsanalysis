import assert from "node:assert/strict";
import test from "node:test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { ABCImprovedDetection, ABCImprovedScenario } from "../lib/elliottABCEngine.ts";
import { autoDetectABCImproved } from "../lib/elliottABCEngine.ts";
import { loadHistoricalDataset } from "../lib/evaluation/dataset-loader.ts";
import { buildReplayMarkdownReport } from "../lib/evaluation/report.ts";
import { runHistoricalEvaluation } from "../lib/evaluation/replay.ts";
import type { ReplayEvaluationContext } from "../lib/evaluation/types.ts";
import { createSyntheticCandles } from "./elliottEngineTestUtils.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = resolve(__dirname, "fixtures", "eval-silver-30m.json");

function createSeedScenario() {
  const detection = autoDetectABCImproved(createSyntheticCandles(), "30m");
  const scenario = detection.primaryScenario;

  assert.ok(scenario, "Expected seed scenario for evaluation harness tests");
  return scenario;
}

function createScenarioVariant(
  seed: ABCImprovedScenario,
  overrides: Partial<ABCImprovedScenario>,
): ABCImprovedScenario {
  const clone = structuredClone(seed);

  return {
    ...clone,
    ...overrides,
    channel: overrides.channel ?? clone.channel,
    targets: overrides.targets ?? clone.targets,
    pivotSequenceUsed: overrides.pivotSequenceUsed ?? clone.pivotSequenceUsed,
    scoreBreakdown: overrides.scoreBreakdown ?? clone.scoreBreakdown,
    scoreComponents: overrides.scoreComponents ?? clone.scoreComponents,
    evidence: overrides.evidence ?? clone.evidence,
    validation: overrides.validation ?? clone.validation,
    legacyScenario: overrides.legacyScenario ?? clone.legacyScenario,
    subWaveLabels: overrides.subWaveLabels ?? clone.subWaveLabels,
    fibRelationships: overrides.fibRelationships ?? clone.fibRelationships,
  };
}

function createEvidenceVariant(
  seed: ABCImprovedScenario,
  overrides: Partial<ABCImprovedScenario["evidence"]>,
): ABCImprovedScenario["evidence"] {
  return {
    ...structuredClone(seed.evidence),
    ...overrides,
  };
}

function buildDetection(
  scenarios: ABCImprovedScenario[],
  priceRange = {
    minPrice: 96,
    maxPrice: 106,
    dataLow: 97,
    dataHigh: 103,
    padding: 1,
  },
): ABCImprovedDetection {
  return {
    analysisStatus: "directional",
    noTradeState: null,
    scenarios,
    primaryScenario:
      scenarios.find((scenario) => scenario.scenarioRole === "primary" || scenario.scenarioRole === "sole") ??
      scenarios[0] ??
      null,
    alternateScenario:
      scenarios.find((scenario) => scenario.scenarioRole === "alternate") ?? null,
    chartOverlays: {
      priceRange,
      channels: scenarios.map((scenario) => ({
        ...scenario.channel,
        scenarioId: scenario.id,
        primary: scenario.primary,
      })),
      labels: scenarios.flatMap((scenario) => scenario.subWaveLabels),
      targetTables: scenarios.map((scenario) => ({
        scenarioId: scenario.id,
        name: scenario.name,
        targets: scenario.targets,
      })),
      invalidations: scenarios.map((scenario) => ({
        scenarioId: scenario.id,
        level: scenario.invalidationLevel,
        explanation: scenario.invalidationReason,
      })),
    },
  };
}

function createScheduledEvaluator() {
  const seed = createSeedScenario();
  const primaryBearish = createScenarioVariant(seed, {
    id: 101,
    name: "Primary Bearish ABC Zigzag",
    structureLabel: "Bearish ABC Zigzag",
    description: "Primary corrective case",
    reason: "Bearish structure remains intact",
    directionBias: "bearish",
    waveCProjection: 98,
    targets: [
      { price: 98, fibRatio: "1.0xA", probability: 62 },
      { price: 96.8, fibRatio: "1.618xA", probability: 28 },
    ],
    invalidationLevel: 105,
    invalidationReason: "Break above 105 invalidates the bearish count.",
    primary: true,
    scenarioRole: "primary",
    relativeStrength: null,
    promotionCondition: null,
    pivotSequenceUsed: [
      { label: "Anchor", price: 103, time: 3 },
      { label: "A", price: 101, time: 5 },
      { label: "B", price: 100, time: 6 },
    ],
    evidence: createEvidenceVariant(seed, {
      validationStatus: "valid",
      setupQuality: "high",
      higherTimeframeAlignment: "aligned",
      riskClassification: "counter-trend",
    }),
  });
  const alternateBullish = createScenarioVariant(seed, {
    id: 202,
    name: "Alternate Bullish ABC Zigzag",
    structureLabel: "Bullish ABC Zigzag",
    description: "Alternate recovery case",
    reason: "Recovery structure becomes relevant above the pivot base",
    directionBias: "bullish",
    waveCProjection: 102,
    targets: [
      { price: 102, fibRatio: "1.0xA", probability: 58 },
      { price: 103.4, fibRatio: "1.618xA", probability: 24 },
    ],
    invalidationLevel: 96.5,
    invalidationReason: "Break below 96.5 invalidates the bullish alternate.",
    primary: false,
    scenarioRole: "alternate",
    relativeStrength: "close",
    promotionCondition: {
      level: 105,
      reason: "Promote if the bearish primary loses its Wave B invalidation.",
    },
    pivotSequenceUsed: [
      { label: "Anchor", price: 97.4, time: 8 },
      { label: "A", price: 98.6, time: 9 },
      { label: "B", price: 100, time: 10 },
    ],
    evidence: createEvidenceVariant(seed, {
      validationStatus: "valid",
      setupQuality: "medium",
      higherTimeframeAlignment: "aligned",
      riskClassification: "trend-aligned",
    }),
  });
  const quickFailureBullish = createScenarioVariant(seed, {
    id: 303,
    name: "Probe Bullish Zigzag",
    structureLabel: "Bullish Probe",
    description: "A weaker bullish probe",
    reason: "Recovery probe lacks confirmation",
    directionBias: "bullish",
    waveCProjection: 102,
    targets: [{ price: 102, fibRatio: "1.0xA", probability: 51 }],
    invalidationLevel: 97.5,
    invalidationReason: "Break below 97.5 invalidates the probe.",
    primary: true,
    scenarioRole: "primary",
    relativeStrength: null,
    promotionCondition: null,
    pivotSequenceUsed: [
      { label: "Anchor", price: 99, time: 7 },
      { label: "A", price: 97.4, time: 8 },
      { label: "B", price: 98.6, time: 9 },
    ],
    evidence: {
      ...createEvidenceVariant(seed, {}),
      validationStatus: "provisional",
      setupQuality: "low",
      higherTimeframeAlignment: "mixed",
      riskClassification: "ambiguous",
    },
  });
  const promotedBullishPrimary = createScenarioVariant(alternateBullish, {
    primary: true,
    scenarioRole: "primary",
    relativeStrength: null,
    promotionCondition: null,
    evidence: createEvidenceVariant(seed, {
      validationStatus: "valid",
      setupQuality: "high",
      higherTimeframeAlignment: "aligned",
      riskClassification: "trend-aligned",
    }),
  });

  return (context: ReplayEvaluationContext) => {
    switch (context.endIndex) {
      case 4:
        return buildDetection([primaryBearish]);
      case 5:
        return buildDetection([primaryBearish, alternateBullish]);
      case 6:
        return buildDetection([quickFailureBullish]);
      case 8:
      case 9:
      case 10:
        return buildDetection([promotedBullishPrimary]);
      default:
        return buildDetection([]);
    }
  };
}

test("loadHistoricalDataset parses JSON fixture datasets", async () => {
  const dataset = await loadHistoricalDataset(FIXTURE_PATH);

  assert.equal(dataset.instrument, "XAGUSD");
  assert.equal(dataset.timeframe, "30m");
  assert.equal(dataset.candles.length, 12);
  assert.equal(dataset.candles[0]?.close, 100);
});

test("historical replay only evaluates bars available at the current step", async () => {
  const dataset = await loadHistoricalDataset(FIXTURE_PATH);
  const seenSlices: Array<{ endIndex: number; sliceLength: number; maxTime: number; higherMaxTime: number }> = [];

  const result = runHistoricalEvaluation(
    dataset,
    {
      warmupBars: 4,
      stepSize: 1,
      lookaheadBars: 4,
      promotionLookaheadBars: 4,
      quickInvalidationBars: 2,
      includeHigherTimeframes: true,
      higherTimeframeOrder: ["1H", "4H"],
    },
    (context) => {
      const higherTimes = Object.values(context.higherTimeframes)
        .flat()
        .map((bar) => bar.time);

      seenSlices.push({
        endIndex: context.endIndex,
        sliceLength: context.slice.length,
        maxTime: Math.max(...context.slice.map((bar) => bar.time)),
        higherMaxTime:
          higherTimes.length > 0 ? Math.max(...higherTimes) : context.slice[context.slice.length - 1]!.time,
      });

      return buildDetection([]);
    },
  );

  assert.equal(result.steps.length, 9);
  assert.ok(seenSlices.every((entry) => entry.sliceLength === entry.endIndex + 1));
  assert.ok(
    seenSlices.every(
      (entry) =>
        entry.maxTime === dataset.candles[entry.endIndex]!.time &&
        entry.higherMaxTime <= entry.maxTime,
    ),
  );
});

test("historical replay logs deterministic outcomes and metrics from fixture data", async () => {
  const dataset = await loadHistoricalDataset(FIXTURE_PATH);
  const result = runHistoricalEvaluation(
    dataset,
    {
      warmupBars: 4,
      stepSize: 1,
      lookaheadBars: 4,
      promotionLookaheadBars: 4,
      quickInvalidationBars: 2,
      includeHigherTimeframes: false,
    },
    createScheduledEvaluator(),
  );

  assert.equal(result.steps.length, 9);
  assert.equal(result.metrics.stepsWithScenario, 6);
  assert.equal(result.metrics.noTradeCount, 3);
  assert.equal(result.metrics.ambiguousOutputCount, 2);
  assert.equal(result.metrics.invalidationHitCount, 1);
  assert.equal(result.metrics.directionalFollowThroughCount, 5);
  assert.equal(result.metrics.primaryToAlternatePromotionCount, 1);
  assert.equal(result.metrics.quickStructuralFailureCount, 1);
  assert.equal(result.metrics.outcomeBreakdown["target-reached"], 5);
  assert.equal(result.metrics.outcomeBreakdown.invalidated, 1);
  assert.equal(result.metrics.outcomeBreakdown["no-scenario"], 3);
  assert.equal(result.steps[3]?.outcome?.invalidatedQuickly, true);
  assert.equal(result.steps[3]?.outcome?.barsToInvalidation, 1);
  assert.equal(result.steps[2]?.outcome?.primaryToAlternatePromotionObserved, true);
  assert.equal(result.steps[2]?.primaryScenario?.name, "Primary Bearish ABC Zigzag");
  assert.equal(result.steps[2]?.alternateScenario?.name, "Alternate Bullish ABC Zigzag");
});

test("Markdown evaluation report summarizes metrics and failure patterns", async () => {
  const dataset = await loadHistoricalDataset(FIXTURE_PATH);
  const result = runHistoricalEvaluation(
    dataset,
    {
      warmupBars: 4,
      stepSize: 1,
      lookaheadBars: 4,
      promotionLookaheadBars: 4,
      quickInvalidationBars: 2,
      includeHigherTimeframes: false,
    },
    createScheduledEvaluator(),
  );
  const report = buildReplayMarkdownReport(result);

  assert.match(report, /# Elliott ABC Evaluation Report/);
  assert.match(report, /## Core Metrics/);
  assert.match(report, /\| Steps evaluated \| 9 \|/);
  assert.match(report, /Primary-to-alternate promotions \| 1/);
  assert.match(report, /## Quick Failure Samples/);
});
