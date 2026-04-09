import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { createScenarioPriceClamp } from "../lib/elliott-engine/shared.ts";
import {
  buildScenarioEvidenceBadge,
  buildScenarioEvidenceSummary,
  buildTargetLadderRows,
  formatHigherTimeframeAlignmentLabel,
  formatRiskClassificationLabel,
  formatSetupQualityLabel,
  formatValidationStatusLabel,
} from "../lib/elliott-engine/evidence-presentation.ts";
import {
  buildCorrectiveScenarioDisplayPlans,
  rankInstitutionalScenario,
  rankValidatedScenario,
} from "../lib/elliott-engine/scenario-ranking.ts";
import { buildImprovedScenario } from "../lib/elliott-engine/ui-explanation-layer.ts";
import { evaluateCorrectiveCandidate } from "../lib/elliott-engine/wave-validation.ts";
import { autoDetectABCImproved } from "../lib/elliottABCEngine.ts";
import {
  createSyntheticCandles,
  getFirstABCCandidate,
} from "./elliottEngineTestUtils.ts";

function createImprovedScenarioFixture() {
  const { candles, detector, candidate } = getFirstABCCandidate();

  assert.ok(candidate, "expected at least one ABC candidate");

  const evaluation = evaluateCorrectiveCandidate(candidate, candles, "30m");
  const ranked = rankValidatedScenario(evaluation, candles, {
    deviationThreshold: detector.deviationThreshold,
    minBarsBetween: detector.minBarsBetween,
    fractalSpan: detector.fractalSpan,
    timeframe: detector.timeframe,
  });
  const priceRange = createScenarioPriceClamp(candles);
  const institutional = rankInstitutionalScenario(
    ranked,
    candles,
    "30m",
    priceRange.clampPrice,
    null,
  );
  const displayPlan = buildCorrectiveScenarioDisplayPlans(
    [institutional],
    candles[candles.length - 1]?.close ?? 0,
  )[0]?.displayPlan;

  assert.ok(displayPlan, "expected a display plan");

  return buildImprovedScenario({
    rankedScenario: institutional,
    index: 0,
    alternateCountExists: true,
    displayPlan,
  });
}

test("autoDetectABCImproved returns evidence-based fields on the primary scenario", () => {
  const detection = autoDetectABCImproved(createSyntheticCandles(), "30m");

  assert.ok(detection.primaryScenario, "expected a primary scenario");
  assert.equal(typeof detection.primaryScenario.evidence.validationStatus, "string");
  assert.equal(typeof detection.primaryScenario.evidence.setupQuality, "string");
  assert.equal(
    typeof detection.primaryScenario.evidence.higherTimeframeAlignment,
    "string",
  );
  assert.equal(
    typeof detection.primaryScenario.evidence.invalidation.level,
    "number",
  );
  assert.equal(
    typeof detection.primaryScenario.evidence.alternateCountExists,
    "boolean",
  );
  assert.ok(Array.isArray(detection.primaryScenario.evidence.evidenceChecks));
  assert.equal(
    typeof detection.primaryScenario.evidence.riskClassification,
    "string",
  );
});

test("evidence presentation helpers map engine output into non-percentage labels", () => {
  const scenario = createImprovedScenarioFixture();
  const badge = buildScenarioEvidenceBadge(scenario);
  const summary = buildScenarioEvidenceSummary(scenario);
  const ladderRows = buildTargetLadderRows(scenario);

  assert.match(badge, /setup quality/i);
  assert.doesNotMatch(badge, /\d+%/);
  assert.match(summary, /\d+ pass · \d+ warning · \d+ fail/);
  assert.equal(formatValidationStatusLabel("valid"), "Valid structure");
  assert.equal(formatSetupQualityLabel("high"), "High setup quality");
  assert.equal(
    formatHigherTimeframeAlignmentLabel("aligned"),
    "Higher timeframe aligned",
  );
  assert.equal(formatRiskClassificationLabel("trap-prone"), "Trap-prone");
  assert.ok(ladderRows.length > 0);
  assert.ok(
    ladderRows.every((row) =>
      ["Primary target", "Stretch target", "Extended target"].includes(
        row.emphasis,
      ),
    ),
  );
});

test("affected analysis views do not contain percentage-confidence strings", () => {
  const wavePanelSource = readFileSync(
    new URL("../components/WaveAnalysisPanel.tsx", import.meta.url),
    "utf8",
  );
  const metalChartSource = readFileSync(
    new URL("../components/charts/metal-chart.tsx", import.meta.url),
    "utf8",
  );

  const bannedPatterns = [
    /ABC confidence/i,
    /institutional confidence/i,
    /Confidence:\s+.*%/i,
    /%\s*confidence/i,
  ];

  for (const pattern of bannedPatterns) {
    assert.doesNotMatch(wavePanelSource, pattern);
    assert.doesNotMatch(metalChartSource, pattern);
  }

  assert.match(wavePanelSource, /Scenario Evidence/);
  assert.match(wavePanelSource, /setup quality/i);
  assert.match(metalChartSource, /Setup quality:/);
});
