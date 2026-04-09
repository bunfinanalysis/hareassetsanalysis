import assert from "node:assert/strict";
import test from "node:test";

import { buildCorrectiveScenarioDisplayPlans } from "../lib/elliott-engine/scenario-ranking.ts";
import type { RankedABCScenarioData } from "../lib/elliott-engine/types.ts";

function createScenarioFixture(
  id: string,
  {
    direction = "bullish",
    confidence = 72,
    selectionScore = confidence,
    invalidationLevel = direction === "bullish" ? 98 : 102,
    higherDirection = direction,
    higherConfidence = 68,
    fibScore = 74,
    channelScore = 70,
    recencyScore = 82,
  }: {
    direction?: "bullish" | "bearish";
    confidence?: number;
    selectionScore?: number;
    invalidationLevel?: number;
    higherDirection?: "bullish" | "bearish";
    higherConfidence?: number;
    fibScore?: number;
    channelScore?: number;
    recencyScore?: number;
  } = {},
) {
  return {
    baseScenario: {
      id,
      kind: "abc",
      direction,
      degree: "minor",
      count: {
        pattern: "corrective",
        direction,
        degree: "minor",
        source: "auto",
        anchor: {
          id: `${id}-anchor`,
          price: direction === "bullish" ? 100 : 104,
          time: 1,
          kind: direction === "bullish" ? "low" : "high",
          index: 0,
        },
        points: [
          {
            id: `${id}-A`,
            label: "A",
            price: direction === "bullish" ? 108 : 96,
            time: 2,
            degree: "minor",
            source: "auto",
            index: 1,
            kind: direction === "bullish" ? "high" : "low",
          },
          {
            id: `${id}-B`,
            label: "B",
            price: invalidationLevel,
            time: 3,
            degree: "minor",
            source: "auto",
            index: 2,
            kind: direction === "bullish" ? "low" : "high",
          },
          {
            id: `${id}-C`,
            label: "C",
            price: direction === "bullish" ? 112 : 92,
            time: 4,
            degree: "minor",
            source: "auto",
            index: 3,
            kind: direction === "bullish" ? "high" : "low",
          },
        ],
      },
      confidence,
      hardRulePassed: true,
      rules: {
        passed: 4,
        total: 5,
        details: [
          {
            id: "wave-a-five",
            label: "Wave A is a 5-wave move",
            status: "pass",
            severity: "hard",
            detail: "",
            message: "",
          },
          {
            id: "wave-b-fib",
            label: "Wave B retrace is near a preferred fib level",
            status: "pass",
            severity: "soft",
            detail: "",
            message: "",
          },
          {
            id: "wave-c-five",
            label: "Wave C is a 5-wave move",
            status: "pass",
            severity: "hard",
            detail: "",
            message: "",
          },
        ],
      },
      fibScore,
      channelScore,
      momentumScore: 68,
      projectionTargets: [],
      targetZone: null,
      invalidationLevel,
      invalidationExplanation:
        direction === "bullish"
          ? "Break below Wave B low invalidates the bullish scenario."
          : "Break above Wave B high invalidates the bearish scenario.",
      recencyScore,
      candlesFromLatest: 4,
      selectionScore,
      scoreBreakdown: [],
      reasonSummary: `${id} summary`,
      reasons: [`${id} reason`],
      swings: [
        {
          id: `${id}-anchor`,
          index: 0,
          time: 1,
          price: direction === "bullish" ? 100 : 104,
          kind: direction === "bullish" ? "low" : "high",
          source: "fractal-zigzag",
        },
        {
          id: `${id}-a`,
          index: 1,
          time: 2,
          price: direction === "bullish" ? 108 : 96,
          kind: direction === "bullish" ? "high" : "low",
          source: "fractal-zigzag",
        },
        {
          id: `${id}-b`,
          index: 2,
          time: 3,
          price: invalidationLevel,
          kind: direction === "bullish" ? "low" : "high",
          source: "fractal-zigzag",
        },
        {
          id: `${id}-c`,
          index: 3,
          time: 4,
          price: direction === "bullish" ? 112 : 92,
          kind: direction === "bullish" ? "high" : "low",
          source: "fractal-zigzag",
        },
      ],
      detectorMeta: {
        deviationThreshold: 0.4,
        minBarsBetween: 3,
        fractalSpan: 2,
        timeframe: "30m",
      },
    },
    confidence,
    volumeScore: 66,
    momentumScore: 68,
    higherContext: {
      timeframe: "4H",
      direction: higherDirection,
      confidence: higherConfidence,
      referenceHigh: 121,
      referenceLow: 68,
    },
    targets: [
      { price: direction === "bullish" ? 111 : 93, fibRatio: 1, probability: 60 },
      { price: direction === "bullish" ? 114 : 90, fibRatio: 1.618, probability: 40 },
    ],
    channel: {
      upper: direction === "bullish" ? 114 : 104,
      lower: direction === "bullish" ? 101 : 90,
      upperLine: { startTime: 1, startPrice: 108, endTime: 6, endPrice: 114 },
      lowerLine: { startTime: 1, startPrice: 100, endTime: 6, endPrice: 101 },
    },
    fibRelationships: [
      { kind: "b-retrace", ratio: 0.618 },
      { kind: "c-target", ratio: 1, price: direction === "bullish" ? 111 : 93 },
    ],
    subWaveLabels: [],
    scoreBreakdown: [],
  } satisfies RankedABCScenarioData;
}

test("corrective scenario display plans cover ambiguous ranking and promotion cases", () => {
  const cases = [
    {
      name: "close alternate stays visible",
      scenarios: [
        createScenarioFixture("primary-close", { confidence: 76, selectionScore: 78 }),
        createScenarioFixture("alternate-close", { confidence: 72, selectionScore: 74 }),
      ],
      latestPrice: 103,
      expectedRoles: ["primary", "alternate"],
      expectedStrength: "close",
    },
    {
      name: "weaker alternate remains visible",
      scenarios: [
        createScenarioFixture("primary-weaker", { confidence: 81, selectionScore: 82 }),
        createScenarioFixture("alternate-weaker", { confidence: 67, selectionScore: 68 }),
      ],
      latestPrice: 103,
      expectedRoles: ["primary", "alternate"],
      expectedStrength: "weaker",
    },
    {
      name: "clearly weaker alternate is still returned",
      scenarios: [
        createScenarioFixture("primary-clear", { confidence: 88, selectionScore: 90 }),
        createScenarioFixture("alternate-clear", { confidence: 54, selectionScore: 56 }),
      ],
      latestPrice: 103,
      expectedRoles: ["primary", "alternate"],
      expectedStrength: "clearly-weaker",
    },
    {
      name: "single scenario is marked as sole",
      scenarios: [createScenarioFixture("sole", { confidence: 79, selectionScore: 81 })],
      latestPrice: 103,
      expectedRoles: ["sole"],
      expectedStrength: null,
    },
    {
      name: "alternate becomes primary after bullish invalidation",
      scenarios: [
        createScenarioFixture("invalidated-bull", {
          direction: "bullish",
          confidence: 82,
          selectionScore: 83,
          invalidationLevel: 98,
        }),
        createScenarioFixture("promoted-bear", {
          direction: "bearish",
          confidence: 74,
          selectionScore: 75,
          invalidationLevel: 104,
        }),
      ],
      latestPrice: 97,
      expectedRoles: ["primary", "alternate"],
      expectedPrimaryId: "promoted-bear",
    },
    {
      name: "alternate becomes primary after bearish invalidation",
      scenarios: [
        createScenarioFixture("invalidated-bear", {
          direction: "bearish",
          confidence: 83,
          selectionScore: 84,
          invalidationLevel: 104,
        }),
        createScenarioFixture("promoted-bull", {
          direction: "bullish",
          confidence: 75,
          selectionScore: 76,
          invalidationLevel: 98,
        }),
      ],
      latestPrice: 105,
      expectedRoles: ["primary", "alternate"],
      expectedPrimaryId: "promoted-bull",
    },
    {
      name: "counter-trend alternate is marked clearly",
      scenarios: [
        createScenarioFixture("trend-primary", {
          direction: "bullish",
          higherDirection: "bullish",
        }),
        createScenarioFixture("counter-alt", {
          direction: "bearish",
          higherDirection: "bullish",
        }),
      ],
      latestPrice: 103,
      expectedRoles: ["primary", "alternate"],
      expectedTrendContext: "counter-trend",
    },
    {
      name: "third scenario is kept as reserve",
      scenarios: [
        createScenarioFixture("reserve-p1", { confidence: 79, selectionScore: 80 }),
        createScenarioFixture("reserve-p2", { confidence: 65, selectionScore: 66 }),
        createScenarioFixture("reserve-p3", { confidence: 58, selectionScore: 60 }),
      ],
      latestPrice: 103,
      expectedRoles: ["primary", "alternate", "reserve"],
      expectedStrength: "weaker",
    },
    {
      name: "promotion condition references the primary invalidation",
      scenarios: [
        createScenarioFixture("promo-primary", { invalidationLevel: 97 }),
        createScenarioFixture("promo-alt", { invalidationLevel: 103 }),
      ],
      latestPrice: 103,
      expectedRoles: ["primary", "alternate"],
      expectedPromotionLevel: 97,
    },
    {
      name: "component scores remain deterministic",
      scenarios: [
        createScenarioFixture("deterministic-primary", { confidence: 77, selectionScore: 78 }),
        createScenarioFixture("deterministic-alt", { confidence: 71, selectionScore: 72 }),
      ],
      latestPrice: 103,
      expectedRoles: ["primary", "alternate"],
      deterministic: true,
    },
  ] as const;

  for (const fixture of cases) {
    const first = buildCorrectiveScenarioDisplayPlans(
      fixture.scenarios,
      fixture.latestPrice,
    );
    const second = buildCorrectiveScenarioDisplayPlans(
      fixture.scenarios,
      fixture.latestPrice,
    );

    assert.deepEqual(
      first.map((entry) => entry.displayPlan.scenarioRole),
      fixture.expectedRoles,
      fixture.name,
    );
    assert.deepEqual(first, second, `${fixture.name} should be deterministic`);

    if ("expectedStrength" in fixture && fixture.expectedStrength) {
      assert.equal(
        first[1]?.displayPlan.relativeStrength,
        fixture.expectedStrength,
        fixture.name,
      );
    }

    if ("expectedPrimaryId" in fixture) {
      assert.equal(first[0]?.rankedScenario.baseScenario.id, fixture.expectedPrimaryId);
    }

    if ("expectedTrendContext" in fixture) {
      assert.equal(
        first[1]?.displayPlan.trendContext,
        fixture.expectedTrendContext,
      );
    }

    if ("expectedPromotionLevel" in fixture) {
      assert.equal(
        first[1]?.displayPlan.promotionCondition?.level,
        fixture.expectedPromotionLevel,
      );
    }

    if ("deterministic" in fixture && fixture.deterministic) {
      assert.deepEqual(
        first[0]?.displayPlan.scoreComponents,
        second[0]?.displayPlan.scoreComponents,
      );
    }
  }
});
