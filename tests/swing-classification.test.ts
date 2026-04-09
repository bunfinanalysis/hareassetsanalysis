import assert from "node:assert/strict";
import test from "node:test";

import { buildSwingLegs } from "../lib/elliott-engine/swing-classification.ts";

test("swing construction measures direction, duration, momentum, and overlap", () => {
  const swings = [
    {
      id: "s-1",
      index: 0,
      time: 1,
      price: 100,
      kind: "low" as const,
      source: "fractal-zigzag" as const,
    },
    {
      id: "s-2",
      index: 4,
      time: 5,
      price: 110,
      kind: "high" as const,
      source: "fractal-zigzag" as const,
    },
    {
      id: "s-3",
      index: 8,
      time: 9,
      price: 104,
      kind: "low" as const,
      source: "fractal-zigzag" as const,
    },
  ];

  const legs = buildSwingLegs(swings);

  assert.equal(legs.length, 2);
  assert.equal(legs[0].direction, "bullish");
  assert.equal(legs[0].priceChange, 10);
  assert.equal(legs[0].durationBars, 4);
  assert.equal(legs[0].durationSeconds, 4);
  assert.ok(legs[0].momentumProxy > 0);

  assert.equal(legs[1].direction, "bearish");
  assert.equal(legs[1].overlapWithPrevious, false);
  assert.equal(Math.round(legs[1].percentChange), -5);
});
