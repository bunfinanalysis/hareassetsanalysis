import assert from "node:assert/strict";
import test from "node:test";

const { buildWaveReactionAnalysis } = await import(
  new URL("../lib/elliottReactionEngine.ts", import.meta.url).href
);

function createImpulseCount(
  direction: "bullish" | "bearish",
  pointPrices: number[],
) {
  return {
    pattern: "impulse" as const,
    direction,
    degree: "minor" as const,
    source: "manual" as const,
    anchor: {
      id: "anchor",
      price: 100,
      time: 1,
      kind: direction === "bullish" ? ("low" as const) : ("high" as const),
    },
    points: pointPrices.map((price, index) => ({
      id: `p-${index + 1}`,
      label: (["1", "2", "3", "4", "5"] as const)[index],
      price,
      time: index + 2,
      degree: "minor" as const,
      source: "manual" as const,
    })),
  };
}

function createCorrectiveCount(
  direction: "bullish" | "bearish",
  pointPrices: number[],
) {
  return {
    pattern: "corrective" as const,
    direction,
    degree: "minor" as const,
    source: "manual" as const,
    anchor: {
      id: "anchor",
      price: 100,
      time: 1,
      kind: direction === "bullish" ? ("low" as const) : ("high" as const),
    },
    points: pointPrices.map((price, index) => ({
      id: `c-${index + 1}`,
      label: (["A", "B", "C"] as const)[index],
      price,
      time: index + 2,
      degree: "minor" as const,
      source: "manual" as const,
    })),
  };
}

function createValidation(
  pattern: "impulse" | "corrective",
  direction: "bullish" | "bearish",
  options: {
    hardRulePassed?: boolean;
    ruleStatuses?: Array<"pass" | "warning" | "fail">;
    waveBToARatio?: number;
  } = {},
) {
  const statuses = options.ruleStatuses ?? ["pass", "pass", "warning"];
  const rules = statuses.map((status, index) => ({
    id: `rule-${index + 1}`,
    label: `Rule ${index + 1}`,
    detail: `Detail ${index + 1}`,
    message: `Message ${index + 1}`,
    status,
    severity: index === 0 ? ("hard" as const) : ("soft" as const),
    isValid: status !== "fail",
  }));

  return {
    pattern,
    direction,
    isValid: options.hardRulePassed ?? true,
    hardRulePassed: options.hardRulePassed ?? true,
    score: 78,
    rules,
    fibonacciLevels: [],
    measurements: {
      waveBToARatio: options.waveBToARatio,
    },
    messages: [],
  };
}

test("bullish impulse wave 5 projects a resistance zone", () => {
  const count = createImpulseCount("bullish", [110, 105, 121, 116]);
  const analysis = buildWaveReactionAnalysis(count, createValidation("impulse", "bullish"));

  assert.ok(analysis);
  assert.equal(analysis.currentWave, 5);
  assert.equal(analysis.reactionType, "resistance");
  assert.ok(analysis.primaryZone);
  assert.ok(analysis.primaryZone.high > count.points[3].price);
});

test("bullish impulse wave 4 projects a support zone", () => {
  const count = createImpulseCount("bullish", [110, 105, 121]);
  const analysis = buildWaveReactionAnalysis(count, createValidation("impulse", "bullish"));

  assert.ok(analysis);
  assert.equal(analysis.currentWave, 4);
  assert.equal(analysis.reactionType, "support");
  assert.ok(analysis.primaryZone);
  assert.ok(analysis.primaryZone.low < count.points[2].price);
});

test("bearish impulse mirrors the reaction logic", () => {
  const count = createImpulseCount("bearish", [90, 95, 80]);
  const analysis = buildWaveReactionAnalysis(count, createValidation("impulse", "bearish"));

  assert.ok(analysis);
  assert.equal(analysis.currentWave, 4);
  assert.equal(analysis.reactionType, "resistance");
  assert.ok(analysis.primaryZone);
  assert.ok(analysis.primaryZone.high > count.points[2].price);
});

test("bullish corrective counts classify Wave B and Wave C by context", () => {
  const waveBCount = createCorrectiveCount("bullish", [110]);
  const waveCCount = createCorrectiveCount("bullish", [110, 104]);
  const waveBAnalysis = buildWaveReactionAnalysis(
    waveBCount,
    createValidation("corrective", "bullish"),
  );
  const waveCAnalysis = buildWaveReactionAnalysis(
    waveCCount,
    createValidation("corrective", "bullish", { waveBToARatio: 0.62 }),
  );

  assert.ok(waveBAnalysis);
  assert.ok(waveCAnalysis);
  assert.equal(waveBAnalysis.currentWave, "B");
  assert.equal(waveBAnalysis.reactionType, "support");
  assert.equal(waveCAnalysis.currentWave, "C");
  assert.equal(waveCAnalysis.reactionType, "resistance");
  assert.match(
    waveCAnalysis.invalidation?.explanation ?? "",
    /Wave B low invalidates the bullish corrective scenario/i,
  );
});

test("hard-rule failures invalidate the primary scenario", () => {
  const count = createImpulseCount("bullish", [110, 105, 121, 116]);
  const analysis = buildWaveReactionAnalysis(
    count,
    createValidation("impulse", "bullish", {
      hardRulePassed: false,
      ruleStatuses: ["fail", "warning", "warning"],
    }),
  );

  assert.ok(analysis);
  assert.equal(analysis.valid, false);
  assert.equal(analysis.primaryZone, null);
  assert.equal(analysis.alternateZones.length, 0);
});

test("confidence generation is deterministic for the same count", () => {
  const count = createImpulseCount("bullish", [110, 105, 121, 116]);
  const validation = createValidation("impulse", "bullish");
  const first = buildWaveReactionAnalysis(count, validation);
  const second = buildWaveReactionAnalysis(count, validation);

  assert.ok(first?.primaryZone);
  assert.ok(second?.primaryZone);
  assert.equal(first.primaryZone.confidence, second.primaryZone.confidence);
  assert.deepEqual(first.primaryZone.scoreBreakdown, second.primaryZone.scoreBreakdown);
  assert.ok(first.primaryZone.confidence >= 0);
  assert.ok(first.primaryZone.confidence <= 1);
});

test("an alternate zone is available when a primary scenario exists", () => {
  const count = createImpulseCount("bullish", [110, 105, 121, 116]);
  const analysis = buildWaveReactionAnalysis(count, createValidation("impulse", "bullish"));

  assert.ok(analysis?.primaryZone);
  assert.ok((analysis?.alternateZones.length ?? 0) >= 1);
  assert.ok(analysis?.alternateZones[0].invalidation);
});
