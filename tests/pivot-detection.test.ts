import assert from "node:assert/strict";
import test from "node:test";

import {
  detectFractalSwings,
  detectZigZagFractalSwings,
} from "../lib/elliott-engine/pivot-detection.ts";
import { createSyntheticCandles } from "./elliottEngineTestUtils.ts";

test("pivot detection returns local highs and lows without Elliott labels", () => {
  const candles = createSyntheticCandles();
  const pivots = detectFractalSwings(candles, 2);

  assert.ok(pivots.length >= 2);
  assert.ok(pivots.every((pivot) => pivot.source === "fractal-zigzag"));
  assert.ok(pivots.some((pivot) => pivot.kind === "high"));
  assert.ok(pivots.some((pivot) => pivot.kind === "low"));
});

test("zigzag pivot detection returns alternating swings with detector metadata", () => {
  const candles = createSyntheticCandles();
  const detection = detectZigZagFractalSwings(candles, { timeframe: "30m" });

  assert.ok(detection.swings.length >= 3);
  assert.equal(detection.timeframe, "30m");
  assert.ok(detection.atr > 0);
  assert.ok(detection.deviationThreshold > 0);
  assert.ok(detection.minBarsBetween >= 2);

  for (let index = 1; index < detection.swings.length; index += 1) {
    assert.notEqual(
      detection.swings[index].kind,
      detection.swings[index - 1].kind,
    );
  }
});
