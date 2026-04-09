import assert from "node:assert/strict";
import test from "node:test";

import { autoDetectABCImproved, type ABCImprovedScenario } from "../lib/elliottABCEngine.ts";
import { buildAnalysisRailSections } from "../lib/elliott-engine/analysis-rail-presentation.ts";
import { evaluateNoTradeState } from "../lib/elliott-engine/no-trade-state.ts";
import { createSyntheticCandles } from "./elliottEngineTestUtils.ts";

function createSeedScenario() {
  const detection = autoDetectABCImproved(createSyntheticCandles(), "30m");
  const scenario = detection.primaryScenario;

  assert.ok(scenario, "expected primary ABC scenario fixture");
  return scenario;
}

function cloneScenario(
  scenario: ABCImprovedScenario,
  overrides: Partial<ABCImprovedScenario> = {},
) {
  const cloned = structuredClone(scenario);

  return {
    ...cloned,
    ...overrides,
    evidence: overrides.evidence ?? cloned.evidence,
    scoreComponents: overrides.scoreComponents ?? cloned.scoreComponents,
    validation: overrides.validation ?? cloned.validation,
    legacyScenario: overrides.legacyScenario ?? cloned.legacyScenario,
    pivotSequenceUsed: overrides.pivotSequenceUsed ?? cloned.pivotSequenceUsed,
    targets: overrides.targets ?? cloned.targets,
    channel: overrides.channel ?? cloned.channel,
    fibRelationships: overrides.fibRelationships ?? cloned.fibRelationships,
    subWaveLabels: overrides.subWaveLabels ?? cloned.subWaveLabels,
    scoreBreakdown: overrides.scoreBreakdown ?? cloned.scoreBreakdown,
  } satisfies ABCImprovedScenario;
}

test("analysis rail sections follow the required order for clear directional states", () => {
  const scenario = createSeedScenario();
  const sections = buildAnalysisRailSections({
    activeCount: scenario.legacyScenario.count,
    reactionAnalysis: null,
    primaryScenario: cloneScenario(scenario, {
      evidence: {
        ...scenario.evidence,
        validationStatus: "valid",
        setupQuality: "high",
        higherTimeframeAlignment: "aligned",
        riskClassification: "trend-aligned",
      },
    }),
    alternateScenario: null,
    noTradeState: null,
    pricePrecision: 2,
  });

  assert.deepEqual(
    sections.map((section) => section.key),
    [
      "market-status",
      "edge-status",
      "confirmation",
      "invalidation",
      "primary-scenario",
      "risk-notes",
    ],
  );
  assert.equal(sections[0]?.label, "Current setup");
  assert.equal(sections[1]?.label, "Can I act yet?");
  assert.equal(sections[2]?.label, "What needs to happen?");
  assert.equal(sections[3]?.label, "Wrong if");
  assert.equal(sections[1]?.title, "Yes, if confirmed");
});

test("analysis rail shows no clear edge for ambiguity states", () => {
  const seed = createSeedScenario();
  const candles = createSyntheticCandles();
  const primary = cloneScenario(seed, {
    id: 1,
    primary: true,
    scenarioRole: "primary",
    confidence: 70,
    relativeStrength: "close",
  });
  const alternate = cloneScenario(seed, {
    id: 2,
    primary: false,
    scenarioRole: "alternate",
    confidence: 68,
    relativeStrength: "close",
    directionBias: primary.directionBias === "bullish" ? "bearish" : "bullish",
  });
  const noTradeState = evaluateNoTradeState(
    [primary, alternate],
    candles[candles.length - 1]!.close,
    candles,
  );

  assert.ok(noTradeState);

  const sections = buildAnalysisRailSections({
    activeCount: primary.legacyScenario.count,
    reactionAnalysis: null,
    primaryScenario: primary,
    alternateScenario: alternate,
    noTradeState,
    pricePrecision: 2,
  });

  assert.equal(sections[0]?.title, noTradeState.title);
  assert.equal(sections[1]?.title, "Not yet");
  assert.ok(sections.some((section) => section.key === "alternate-scenario"));
});

test("analysis rail keeps alternate scenario visible when present", () => {
  const seed = createSeedScenario();
  const alternate = cloneScenario(seed, {
    id: 2,
    primary: false,
    scenarioRole: "alternate",
    promotionCondition: {
      level: seed.invalidationLevel,
      reason: "Promotes if the leading count loses structural validity.",
    },
  });

  const sections = buildAnalysisRailSections({
    activeCount: seed.legacyScenario.count,
    reactionAnalysis: null,
    primaryScenario: seed,
    alternateScenario: alternate,
    noTradeState: null,
    pricePrecision: 2,
  });

  const alternateSection = sections.find(
    (section) => section.key === "alternate-scenario",
  );

  assert.ok(alternateSection);
  assert.match(alternateSection.detail, /promotes|primary/i);
});

test("analysis rail omits alternate section when no alternate is relevant", () => {
  const seed = createSeedScenario();
  const sections = buildAnalysisRailSections({
    activeCount: seed.legacyScenario.count,
    reactionAnalysis: null,
    primaryScenario: seed,
    alternateScenario: null,
    noTradeState: null,
    pricePrecision: 2,
  });

  assert.equal(
    sections.some((section) => section.key === "alternate-scenario"),
    false,
  );
});
