import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { autoDetectABCImproved, type ABCImprovedScenario } from "../lib/elliottABCEngine.ts";
import { buildAnalysisRailSections } from "../lib/elliott-engine/analysis-rail-presentation.ts";
import {
  buildFocusModeDecisionSummary,
  buildFocusModeViewModel,
  getFocusModeShortcutAction,
} from "../lib/elliott-engine/focus-mode-presentation.ts";
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

test("focus mode collapses the rail column while preserving essential context sections", () => {
  const scenario = createSeedScenario();
  const sections = buildAnalysisRailSections({
    activeCount: scenario.legacyScenario.count,
    reactionAnalysis: null,
    primaryScenario: scenario,
    alternateScenario: null,
    noTradeState: null,
    pricePrecision: 2,
  });

  const viewModel = buildFocusModeViewModel({
    isFocusMode: true,
    isFocusRailVisible: false,
    sections,
  });

  assert.equal(viewModel.showRailColumn, false);
  assert.equal(viewModel.showFocusContext, true);
  assert.equal(viewModel.showFocusRailDrawer, false);
  assert.deepEqual(
    viewModel.contextCards.map((card) => card.key),
    ["setup", "next", "risk-line"],
  );
  assert.match(viewModel.summaryLine, /\.$/);
  assert.equal(viewModel.contextCards[0]?.label, "Current setup");
  assert.equal(viewModel.contextCards[1]?.label, "What needs to happen?");
  assert.equal(viewModel.contextCards[2]?.label, "Wrong if");
  assert.equal(typeof viewModel.contextCards[0]?.statusTag, "string");
});

test("focus mode can reopen the analysis rail without losing context ordering", () => {
  const scenario = createSeedScenario();
  const sections = buildAnalysisRailSections({
    activeCount: scenario.legacyScenario.count,
    reactionAnalysis: null,
    primaryScenario: scenario,
    alternateScenario: null,
    noTradeState: null,
    pricePrecision: 2,
  });

  const viewModel = buildFocusModeViewModel({
    isFocusMode: true,
    isFocusRailVisible: true,
    sections,
  });

  assert.equal(viewModel.showRailColumn, false);
  assert.equal(viewModel.showFocusRailDrawer, true);
  assert.equal(viewModel.railToggleLabel, "Hide Analysis Rail");
});

test("focus mode context stays disciplined for no-trade states", () => {
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
    confidence: 68,
    relativeStrength: "close",
    directionBias: primary.directionBias === "bullish" ? "bearish" : "bullish",
  });
  const noTradeState = evaluateNoTradeState(
    [primary, alternate],
    candles[candles.length - 1]!.close,
    candles,
  );

  assert.ok(noTradeState);

  const sections = buildAnalysisRailSections({
    activeCount: primary.legacyScenario.count,
    reactionAnalysis: null,
    primaryScenario: primary,
    alternateScenario: alternate,
    noTradeState,
    pricePrecision: 2,
  });
  const viewModel = buildFocusModeViewModel({
    isFocusMode: true,
    isFocusRailVisible: false,
    sections,
  });

  assert.equal(viewModel.contextCards[0]?.title, noTradeState.title);
  assert.equal(viewModel.contextCards[0]?.statusTag, "Not yet");
  assert.match(viewModel.summaryLine, /No trade yet\./);
});

test("focus mode decision summary stays concise and degrades gracefully", () => {
  const summary = buildFocusModeDecisionSummary([
    {
      key: "setup",
      label: "Current setup",
      title: "Corrective setup forming",
      detail: "Wave C path is still being tested.",
      statusTag: "Not yet",
    },
    {
      key: "next",
      label: "What needs to happen?",
      title: "Break above 75.60",
      detail: "That would strengthen the active Wave C path.",
    },
    {
      key: "risk-line",
      label: "Wrong if",
      title: "Below 73.25",
      detail: "That would invalidate the current idea.",
    },
  ]);

  assert.equal(
    summary,
    "Corrective setup forming. No trade yet. Needs break above 75.60. Wrong if below 73.25.",
  );

  assert.equal(
    buildFocusModeDecisionSummary([
      {
        key: "setup",
        label: "Current setup",
        title: "No clear setup yet",
        detail: "",
        statusTag: "Not yet",
      },
      {
        key: "next",
        label: "What needs to happen?",
        title: "Pending",
        detail: "",
      },
      {
        key: "risk-line",
        label: "Wrong if",
        title: "Pending",
        detail: "",
      },
    ]),
    "No clear setup yet. No trade yet.",
  );
});

test("page source includes focus mode controls and keeps rail access available", () => {
  const pageSource = readFileSync(
    new URL("../app/page.tsx", import.meta.url),
    "utf8",
  );
  const chartSource = readFileSync(
    new URL("../components/charts/metal-chart.tsx", import.meta.url),
    "utf8",
  );
  const drawerSource = readFileSync(
    new URL("../components/dashboard/focus-mode-rail-drawer.tsx", import.meta.url),
    "utf8",
  );
  const helperSource = readFileSync(
    new URL("../lib/elliott-engine/focus-mode-presentation.ts", import.meta.url),
    "utf8",
  );

  assert.match(pageSource, /!\s*isFocusMode\s*\?\s*\(\s*<HeaderTicker/);
  assert.match(pageSource, /focusModeView\.focusToggleLabel/);
  assert.match(pageSource, /focusModeView\.railToggleLabel/);
  assert.match(pageSource, /getFocusModeShortcutAction/);
  assert.match(pageSource, /aria-keyshortcuts="F,Escape"/);
  assert.match(pageSource, /!\s*isFocusMode\s*\?\s*\(/);
  assert.match(pageSource, /<SymbolSwitcher compact selectedSymbol=\{selectedSymbol\} \/>/);
  assert.match(pageSource, /<TimeframeSwitcher \/>/);
  assert.match(pageSource, /title=\{focusModeView\.railToggleLabel\}/);
  assert.match(pageSource, /cards=\{focusModeView\.contextCards\}/);
  assert.match(pageSource, /summary=\{focusModeView\.summaryLine\}/);
  assert.match(pageSource, /grid-rows-\[minmax\(0,1fr\)\]/);
  assert.match(pageSource, /max-w-\[1920px\] gap-1 px-1.5 py-1/);
  assert.match(pageSource, /isFocusMode \? "p-1 sm:p-1.5"/);
  assert.match(pageSource, /isFocusMode=\{isFocusMode\}/);
  assert.match(pageSource, /<FocusModeRailDrawer/);
  assert.match(pageSource, /isOpen=\{focusModeView\.showFocusRailDrawer\}/);
  assert.match(pageSource, /!\s*focusModeView\.showFocusRailDrawer \?\s*\(/);
  assert.match(pageSource, /<WaveAnalysisPanel/);
  assert.match(helperSource, /Focus Mode|Exit Focus Mode/);
  assert.match(helperSource, /Show Analysis Rail|Hide Analysis Rail/);
  assert.match(helperSource, /buildFocusModeDecisionSummary/);
  assert.match(helperSource, /label: "Current setup"/);
  assert.match(helperSource, /label: "What needs to happen\?"/);
  assert.match(helperSource, /label: "Wrong if"/);
  assert.doesNotMatch(pageSource, /Focus Workspace/);
  assert.match(chartSource, /isFocusMode\?: boolean/);
  assert.match(chartSource, /min-h-\[clamp\(680px,86dvh,1120px\)\]/);
  assert.match(chartSource, /const chartHeaderHeightClass = isFocusMode \? "h-16" : "h-28"/);
  assert.match(chartSource, /const chartViewportTopClass = isFocusMode \? "top-16" : "top-28"/);
  assert.match(chartSource, /const chartViewportBottomClass = isFocusMode \? "bottom-12" : "bottom-16"/);
  assert.match(chartSource, /chartViewportTopClass/);
  assert.match(chartSource, /chartViewportBottomClass/);
  assert.match(drawerSource, /translate-x-\[108%\]|translate-x-full/);
  assert.match(drawerSource, /Hide Rail/);
  assert.match(drawerSource, /pointer-events-none fixed inset-0 z-40/);
});

test("focus mode shortcut helper toggles safely and ignores editable targets", () => {
  assert.equal(
    getFocusModeShortcutAction({
      event: { key: "f" },
      isFocusMode: false,
      isFocusRailVisible: false,
    }),
    "toggle-focus-mode",
  );

  assert.equal(
    getFocusModeShortcutAction({
      event: { key: "Escape" },
      isFocusMode: true,
      isFocusRailVisible: true,
    }),
    "close-focus-rail",
  );

  assert.equal(
    getFocusModeShortcutAction({
      event: { key: "Escape" },
      isFocusMode: true,
      isFocusRailVisible: false,
    }),
    "exit-focus-mode",
  );

  assert.equal(
    getFocusModeShortcutAction({
      event: {
        key: "f",
        target: {
          tagName: "input",
        } as unknown as EventTarget,
      },
      isFocusMode: false,
      isFocusRailVisible: false,
    }),
    null,
  );

  assert.equal(
    getFocusModeShortcutAction({
      event: { key: "f", metaKey: true },
      isFocusMode: false,
      isFocusRailVisible: false,
    }),
    null,
  );
});

test("page source keeps MetalChart mounted without a focus-mode-specific key", () => {
  const pageSource = readFileSync(
    new URL("../app/page.tsx", import.meta.url),
    "utf8",
  );

  assert.match(pageSource, /<MetalChart/);
  assert.doesNotMatch(pageSource, /<MetalChart[\s\S]*?\bkey=/);
});
