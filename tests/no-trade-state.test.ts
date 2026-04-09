import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { autoDetectABCImproved, type ABCImprovedScenario } from "../lib/elliottABCEngine.ts";
import {
  buildNoTradeBadge,
  buildNoTradeEvidenceSummary,
  buildNoTradeSummary,
} from "../lib/elliott-engine/evidence-presentation.ts";
import {
  buildNoTradeStatusLine,
  evaluateNoTradeState,
} from "../lib/elliott-engine/no-trade-state.ts";
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

function setComponent(
  scenario: ABCImprovedScenario,
  key: ABCImprovedScenario["scoreComponents"][number]["key"],
  value: number,
) {
  return cloneScenario(scenario, {
    scoreComponents: scenario.scoreComponents.map((component) =>
      component.key === key ? { ...component, value } : component,
    ),
  });
}

test("no-trade triggers when primary and alternate scores are too close", () => {
  const seed = createSeedScenario();
  const candles = createSyntheticCandles();
  const primary = cloneScenario(seed, {
    id: 1,
    primary: true,
    scenarioRole: "primary",
    relativeStrength: null,
    confidence: 70,
    evidence: {
      ...seed.evidence,
      validationStatus: "valid",
      setupQuality: "medium",
      higherTimeframeAlignment: "aligned",
      riskClassification: "counter-trend",
    },
    legacyScenario: {
      ...seed.legacyScenario,
      kind: "abc",
    },
  });
  const alternate = cloneScenario(seed, {
    id: 2,
    name: "Alternate Bearish ABC Zigzag",
    primary: false,
    scenarioRole: "alternate",
    relativeStrength: "close",
    confidence: 67,
    directionBias: primary.directionBias === "bullish" ? "bearish" : "bullish",
    evidence: {
      ...seed.evidence,
      validationStatus: "valid",
      setupQuality: "medium",
      higherTimeframeAlignment: "aligned",
      riskClassification: "ambiguous",
    },
    legacyScenario: {
      ...seed.legacyScenario,
      kind: "abc",
    },
  });

  const noTrade = evaluateNoTradeState([primary, alternate], candles[candles.length - 1]!.close, candles);

  assert.ok(noTrade);
  assert.ok(noTrade.reasonDetails.some((reason) => reason.code === "close-scenario-scores"));
  assert.match(buildNoTradeSummary(noTrade), /ambiguity|close/i);
});

test("no-trade triggers on higher timeframe conflict", () => {
  const seed = createSeedScenario();
  const candles = createSyntheticCandles();
  const conflicted = cloneScenario(seed, {
    evidence: {
      ...seed.evidence,
      validationStatus: "valid",
      setupQuality: "high",
      higherTimeframeAlignment: "not-aligned",
      riskClassification: "counter-trend",
    },
    legacyScenario: {
      ...seed.legacyScenario,
      kind: "abc",
    },
  });

  const noTrade = evaluateNoTradeState([conflicted], candles[candles.length - 1]!.close, candles);

  assert.ok(noTrade);
  assert.equal(noTrade.title, "Higher timeframe conflict");
  assert.ok(
    noTrade.confirmationNeeded.some((item) =>
      /higher timeframe/i.test(item.label) || /higher timeframe/i.test(item.detail),
    ),
  );
});

test("no-trade triggers when the engine is projecting before sufficient confirmation", () => {
  const seed = createSeedScenario();
  const candles = createSyntheticCandles();
  const incomplete = cloneScenario(seed, {
    evidence: {
      ...seed.evidence,
      validationStatus: "provisional",
      setupQuality: "medium",
      higherTimeframeAlignment: "aligned",
      riskClassification: "ambiguous",
    },
    legacyScenario: {
      ...seed.legacyScenario,
      kind: "ab",
    },
  });

  const noTrade = evaluateNoTradeState([incomplete], candles[candles.length - 1]!.close, candles);

  assert.ok(noTrade);
  assert.ok(
    noTrade.reasonDetails.some((reason) => reason.code === "insufficient-confirmation"),
  );
});

test("no-trade triggers on choppy overlapping structure with weak pivots", () => {
  const seed = createSeedScenario();
  const candles = createSyntheticCandles();
  const choppy = setComponent(
    setComponent(
      cloneScenario(seed, {
        evidence: {
          ...seed.evidence,
          validationStatus: "valid",
          setupQuality: "medium",
          higherTimeframeAlignment: "aligned",
          riskClassification: "ambiguous",
        },
        legacyScenario: {
          ...seed.legacyScenario,
          kind: "abc",
        },
      }),
      "pivot-quality",
      38,
    ),
    "structural-cleanliness",
    41,
  );

  const noTrade = evaluateNoTradeState([choppy], candles[candles.length - 1]!.close, candles);

  assert.ok(noTrade);
  assert.ok(noTrade.reasonDetails.some((reason) => reason.code === "poor-pivot-quality"));
  assert.ok(noTrade.reasonDetails.some((reason) => reason.code === "choppy-overlap"));
});

test("clear validated structure does not trigger no-trade", () => {
  const seed = createSeedScenario();
  const candles = createSyntheticCandles();
  const clear = setComponent(
    setComponent(
      cloneScenario(seed, {
        evidence: {
          ...seed.evidence,
          validationStatus: "valid",
          setupQuality: "high",
          higherTimeframeAlignment: "aligned",
          riskClassification: "trend-aligned",
        },
        confidence: 82,
        legacyScenario: {
          ...seed.legacyScenario,
          kind: "abc",
        },
      }),
      "pivot-quality",
      78,
    ),
    "structural-cleanliness",
    80,
  );

  const noTrade = evaluateNoTradeState([clear], candles[candles.length - 1]!.close, candles);

  assert.equal(noTrade, null);
});

test("no-trade presentation helpers render disciplined user-facing labels", () => {
  const seed = createSeedScenario();
  const candles = createSyntheticCandles();
  const conflicted = cloneScenario(seed, {
    evidence: {
      ...seed.evidence,
      validationStatus: "weak",
      setupQuality: "low",
      higherTimeframeAlignment: "mixed",
      riskClassification: "ambiguous",
    },
    legacyScenario: {
      ...seed.legacyScenario,
      kind: "ab",
    },
  });
  const noTrade = evaluateNoTradeState([conflicted], candles[candles.length - 1]!.close, candles);

  assert.ok(noTrade);
  assert.match(buildNoTradeBadge(noTrade), /edge|conflict|ambiguity/i);
  assert.match(buildNoTradeStatusLine(noTrade), /edge|conflict|ambiguity/i);
  assert.match(buildNoTradeEvidenceSummary(noTrade), /\d+ pass · \d+ warning · \d+ fail/);

  const wavePanelSource = readFileSync(
    new URL("../components/WaveAnalysisPanel.tsx", import.meta.url),
    "utf8",
  );
  const railPresentationSource = readFileSync(
    new URL("../lib/elliott-engine/analysis-rail-presentation.ts", import.meta.url),
    "utf8",
  );
  const metalChartSource = readFileSync(
    new URL("../components/charts/metal-chart.tsx", import.meta.url),
    "utf8",
  );

  assert.match(wavePanelSource, /Stand Aside Detail/);
  assert.match(railPresentationSource, /Current setup|Can I act yet\?/);
  assert.match(metalChartSource, /Auto ABC ·/);
});
