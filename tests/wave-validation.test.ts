import assert from "node:assert/strict";
import test from "node:test";

import { evaluateCorrectiveCandidate } from "../lib/elliott-engine/wave-validation.ts";
import { getFirstABCCandidate } from "./elliottEngineTestUtils.ts";

test("wave validation returns a structured corrective evaluation", () => {
  const { candles, candidate } = getFirstABCCandidate();

  assert.ok(candidate, "expected at least one ABC candidate");

  const evaluation = evaluateCorrectiveCandidate(candidate, candles, "30m");

  assert.equal(evaluation.count.pattern, "corrective");
  assert.equal(evaluation.candidate.direction, candidate.direction);
  assert.ok(Array.isArray(evaluation.hardRules));
  assert.ok(Array.isArray(evaluation.softRules));
  assert.ok(evaluation.hardRules.length >= 2);
  assert.ok(evaluation.softRules.length >= 1);
  assert.ok("waveBToARatio" in evaluation);
});

