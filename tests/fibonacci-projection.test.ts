import assert from "node:assert/strict";
import test from "node:test";

import {
  buildProjectionTargets,
  buildTargetZone,
  calculateFibConfluenceScore,
} from "../lib/elliott-engine/fibonacci-projection.ts";

test("fibonacci projection returns deterministic Wave C targets and zone data", () => {
  const fibInput = {
    candidate: {
      anchor: {
        id: "anchor",
        index: 0,
        time: 1,
        price: 100,
        kind: "low" as const,
        source: "fractal-zigzag" as const,
      },
      a: {
        id: "a",
        index: 4,
        time: 5,
        price: 110,
        kind: "high" as const,
        source: "fractal-zigzag" as const,
      },
      b: {
        id: "b",
        index: 8,
        time: 9,
        price: 104,
        kind: "low" as const,
        source: "fractal-zigzag" as const,
      },
      c: {
        id: "c",
        index: 12,
        time: 13,
        price: 116,
        kind: "high" as const,
        source: "fractal-zigzag" as const,
      },
      kind: "abc" as const,
      direction: "bullish" as const,
      degree: "minor" as const,
    },
    waveBToARatio: 0.6,
    waveCToARatio: 1.2,
    cStructure: {
      valid: true,
      structure: "impulse" as const,
      sequence: null,
      wave2Retracement: 0.55,
    },
  };

  const fibScore = calculateFibConfluenceScore(fibInput);
  const targets = buildProjectionTargets(fibInput, fibScore, 72);
  const targetZone = buildTargetZone(targets);

  assert.ok(fibScore >= 70);
  assert.equal(targets[0].fibRatio, 1);
  assert.equal(targets[0].level, 114);
  assert.equal(targetZone?.label, "Wave C Objective");
  assert.equal(targetZone?.nextTargetPrice, 114);
});

