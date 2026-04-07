import assert from "node:assert/strict";
import test from "node:test";

const { autoDetectABC, projectWaveCScenarios } = await import(
  new URL("../lib/elliottABCEngine.ts", import.meta.url).href
);

function createSyntheticCandles() {
  return [
    100, 102, 104, 103, 105, 107, 106, 109, 108, 110, 108, 106, 104, 106, 108, 107, 110, 109,
    112, 111, 114, 113,
  ].map((close, index) => ({
    time: index + 1,
    open: close - 0.2,
    high: close + 0.4,
    low: close - 0.4,
    close,
  }));
}

function createManualBullishABCount() {
  return {
    pattern: "corrective" as const,
    direction: "bullish" as const,
    degree: "minor" as const,
    source: "manual" as const,
    anchor: {
      id: "anchor",
      price: 100,
      time: 1,
      kind: "low" as const,
      index: 0,
    },
    points: [
      {
        id: "A",
        label: "A" as const,
        price: 110,
        time: 10,
        degree: "minor" as const,
        source: "manual" as const,
        index: 9,
        kind: "high" as const,
      },
      {
        id: "B",
        label: "B" as const,
        price: 104,
        time: 13,
        degree: "minor" as const,
        source: "manual" as const,
        index: 12,
        kind: "low" as const,
      },
    ],
  };
}

test("projectWaveCScenarios returns a bullish AB scenario with Wave C targets", () => {
  const candles = createSyntheticCandles();
  const scenarios = projectWaveCScenarios(createManualBullishABCount(), candles, {
    timeframe: "30m",
    limit: 5,
  });

  assert.equal(scenarios.length, 1);
  assert.equal(scenarios[0].kind, "ab");
  assert.equal(scenarios[0].direction, "bullish");
  assert.equal(scenarios[0].hardRulePassed, true);
  assert.ok(scenarios[0].projectionTargets.length >= 4);
  assert.equal(scenarios[0].targetZone?.label, "Wave C Objective");
  assert.equal(scenarios[0].invalidationLevel, 104);
});

test("invalid bullish AB counts with B beyond the A origin are rejected", () => {
  const candles = createSyntheticCandles();
  const scenarios = projectWaveCScenarios(
    {
      ...createManualBullishABCount(),
      points: [
        {
          ...createManualBullishABCount().points[0],
        },
        {
          ...createManualBullishABCount().points[1],
          price: 98,
        },
      ],
    },
    candles,
    {
      timeframe: "30m",
      limit: 5,
    },
  );

  assert.equal(scenarios.length, 0);
});

test("projectWaveCScenarios is deterministic for the same input", () => {
  const candles = createSyntheticCandles();
  const first = projectWaveCScenarios(createManualBullishABCount(), candles, {
    timeframe: "30m",
    limit: 5,
  });
  const second = projectWaveCScenarios(createManualBullishABCount(), candles, {
    timeframe: "30m",
    limit: 5,
  });

  assert.equal(first[0]?.confidence, second[0]?.confidence);
  assert.deepEqual(first[0]?.projectionTargets, second[0]?.projectionTargets);
  assert.deepEqual(first[0]?.scoreBreakdown, second[0]?.scoreBreakdown);
});

test("autoDetectABC returns ranked live scenarios and prefers the freshest complete zigzag", () => {
  const candles = createSyntheticCandles();
  const scenarios = autoDetectABC(candles, {
    timeframe: "30m",
    degree: "minor",
    limit: 5,
  });

  assert.ok(scenarios.length >= 2);
  assert.equal(scenarios[0].kind, "abc");
  assert.equal(scenarios[0].direction, "bullish");
  assert.ok(scenarios[0].selectionScore >= scenarios[1].selectionScore);
  assert.ok(scenarios[0].candlesFromLatest <= scenarios[1].candlesFromLatest);
});
