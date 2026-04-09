import assert from "node:assert/strict";
import test from "node:test";

import { createScenarioPriceClamp } from "../lib/elliott-engine/shared.ts";
import {
  rankInstitutionalScenario,
  rankValidatedScenario,
} from "../lib/elliott-engine/scenario-ranking.ts";
import { evaluateCorrectiveCandidate } from "../lib/elliott-engine/wave-validation.ts";
import { getFirstABCCandidate } from "./elliottEngineTestUtils.ts";

test("scenario ranking returns explicit score components for a validated candidate", () => {
  const { candles, detector, candidate } = getFirstABCCandidate();

  assert.ok(candidate, "expected at least one ABC candidate");

  const evaluation = evaluateCorrectiveCandidate(candidate, candles, "30m");
  const ranked = rankValidatedScenario(evaluation, candles, {
    deviationThreshold: detector.deviationThreshold,
    minBarsBetween: detector.minBarsBetween,
    fractalSpan: detector.fractalSpan,
    timeframe: detector.timeframe,
  });

  assert.ok(ranked.confidence >= 0);
  assert.ok(ranked.selectionScore >= 0);
  assert.ok(ranked.scoreBreakdown.length >= 4);
  assert.ok(ranked.reasonSummary.length > 0);
});

test("institutional ranking decorates scenarios with channel and target-table data", () => {
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

  assert.ok(institutional.targets.length > 0);
  assert.ok(institutional.channel.upper >= institutional.channel.lower);
  assert.ok(
    institutional.scoreBreakdown.some(
      (entry) => entry.label === "Momentum/volume filter",
    ),
  );
});

