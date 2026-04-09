import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  autoDetectABCImproved,
  type ABCImprovedScenario,
} from "../lib/elliottABCEngine.ts";
import {
  buildAnalysisRailSections,
} from "../lib/elliott-engine/analysis-rail-presentation.ts";
import { buildFocusModeContextCards } from "../lib/elliott-engine/focus-mode-presentation.ts";
import { evaluateNoTradeState } from "../lib/elliott-engine/no-trade-state.ts";
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

function buildFocusSectionsForScenario({
  primary,
  alternate = null,
  noTradeState = null,
}: {
  primary: ABCImprovedScenario;
  alternate?: ABCImprovedScenario | null;
  noTradeState?: ReturnType<typeof evaluateNoTradeState> | null;
}) {
  const sections = buildAnalysisRailSections({
    activeCount: primary.legacyScenario.count,
    reactionAnalysis: null,
    primaryScenario: primary,
    alternateScenario: alternate,
    noTradeState,
    pricePrecision: 2,
  });

  return {
    sections,
    focusCards: buildFocusModeContextCards(sections),
  };
}

function cardByKey(
  cards: ReturnType<typeof buildFocusModeContextCards>,
  key: ReturnType<typeof buildFocusModeContextCards>[number]["key"],
) {
  return cards.find((card) => card.key === key) ?? null;
}

test("focus mode context condenses the shared rail mapping into setup, next, and risk cards", () => {
  const primary = createSeedScenario();
  const { sections, focusCards } = buildFocusSectionsForScenario({ primary });

  assert.deepEqual(
    focusCards.map((card) => card.key),
    ["setup", "next", "risk-line"],
  );

  assert.equal(
    cardByKey(focusCards, "setup")?.title,
    sections.find((section) => section.key === "market-status")?.title,
  );
  assert.equal(
    cardByKey(focusCards, "setup")?.detail,
    sections.find((section) => section.key === "market-status")?.detail,
  );
  assert.equal(
    cardByKey(focusCards, "setup")?.statusTag,
    sections.find((section) => section.key === "edge-status")?.title,
  );
  assert.equal(
    cardByKey(focusCards, "next")?.title,
    sections.find((section) => section.key === "confirmation")?.title,
  );
  assert.equal(
    cardByKey(focusCards, "risk-line")?.title,
    sections.find((section) => section.key === "invalidation")?.title,
  );

  assert.ok(
    focusCards.every(
      (card) => card.label.length > 0 && card.title.length > 0,
    ),
  );
});

test("focus mode context shows disciplined ambiguity messaging when no-trade is active", () => {
  const seed = createSeedScenario();
  const candles = createSyntheticCandles();
  const primary = cloneScenario(seed, {
    id: 1,
    primary: true,
    scenarioRole: "primary",
    confidence: 70,
    relativeStrength: "close",
  });
  const alternate = cloneScenario(seed, {
    id: 2,
    primary: false,
    scenarioRole: "alternate",
    confidence: 69,
    relativeStrength: "close",
    directionBias: primary.directionBias === "bullish" ? "bearish" : "bullish",
  });
  const noTradeState = evaluateNoTradeState(
    [primary, alternate],
    candles[candles.length - 1]!.close,
    candles,
  );

  assert.ok(noTradeState);

  const { focusCards } = buildFocusSectionsForScenario({
    primary,
    alternate,
    noTradeState,
  });

  assert.equal(cardByKey(focusCards, "setup")?.title, noTradeState.title);
  assert.equal(cardByKey(focusCards, "setup")?.statusTag, "Not yet");
  assert.match(
    cardByKey(focusCards, "next")?.detail ?? "",
    /await|confirm|accept|break/i,
  );
});

test("focus mode context keeps directional state concise when structure is actionable", () => {
  const seed = createSeedScenario();
  const primary = cloneScenario(seed, {
    evidence: {
      ...seed.evidence,
      validationStatus: "valid",
      setupQuality: "high",
      higherTimeframeAlignment: "aligned",
      riskClassification: "trend-aligned",
    },
  });

  const { focusCards } = buildFocusSectionsForScenario({ primary });

  assert.notEqual(cardByKey(focusCards, "setup")?.statusTag, "Not yet");
  assert.match(
    cardByKey(focusCards, "next")?.title ?? "",
    /Break (above|below)|Wait for a cleaner trigger/i,
  );
  assert.match(
    cardByKey(focusCards, "risk-line")?.title ?? "",
    /\d/,
  );
});

test("focus mode HUD component and page layout use the shared section data path", () => {
  const pageSource = readFileSync(
    new URL("../app/page.tsx", import.meta.url),
    "utf8",
  );
  const componentSource = readFileSync(
    new URL("../components/dashboard/focus-mode-context-bar.tsx", import.meta.url),
    "utf8",
  );

  assert.match(pageSource, /FocusModeContextBar/);
  assert.match(pageSource, /cards=\{focusModeView\.contextCards\}/);
  assert.match(pageSource, /summary=\{focusModeView\.summaryLine\}/);
  assert.match(pageSource, /className="mb-1 sticky top-1 z-20"/);
  assert.match(componentSource, /xl:grid-cols-\[minmax\(0,1\.45fr\)_minmax\(0,1\.1fr\)_minmax\(0,0\.95fr\)\]/);
  assert.match(componentSource, /rounded-\[18px\]/);
  assert.match(componentSource, /Focus summary/);
  assert.match(componentSource, /aria-expanded=\{isExpanded\}/);
  assert.match(componentSource, /Why/);
  assert.match(componentSource, /card\.label/);
  assert.match(componentSource, /card\.title/);
  assert.match(componentSource, /card\.detail/);
  assert.match(componentSource, /card\.statusTag/);
  assert.doesNotMatch(componentSource, /railToggleLabel/);
  assert.match(componentSource, /\bonClick=\{/);
});
