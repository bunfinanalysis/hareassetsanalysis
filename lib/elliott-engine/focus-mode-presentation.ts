import type { AnalysisRailSection } from "./analysis-rail-presentation.ts";

export type FocusModeContextCardKey = "setup" | "next" | "risk-line";

export type FocusModeContextCard = {
  key: FocusModeContextCardKey;
  label: string;
  title: string;
  detail: string;
  statusTag?: string;
};

export type FocusModeViewModel = {
  showRailColumn: boolean;
  showFocusContext: boolean;
  showFocusRailDrawer: boolean;
  focusToggleLabel: string;
  railToggleLabel: string;
  summaryLine: string;
  contextCards: FocusModeContextCard[];
};

export type FocusModeShortcutAction =
  | "toggle-focus-mode"
  | "close-focus-rail"
  | "exit-focus-mode";

type FocusModeShortcutEvent = {
  key: string;
  altKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  repeat?: boolean;
  target?: EventTarget | null;
};

function getSection(
  sections: AnalysisRailSection[],
  key: AnalysisRailSection["key"],
) {
  return sections.find((section) => section.key === key) ?? null;
}

function isEditableShortcutTarget(target: EventTarget | null | undefined) {
  if (!target || typeof target !== "object") {
    return false;
  }

  const candidate = target as {
    tagName?: string;
    isContentEditable?: boolean;
    getAttribute?: (name: string) => string | null;
    closest?: (selector: string) => unknown;
  };
  const tagName = candidate.tagName?.toUpperCase();

  if (tagName === "INPUT" || tagName === "TEXTAREA" || tagName === "SELECT") {
    return true;
  }

  if (candidate.isContentEditable) {
    return true;
  }

  if (typeof candidate.getAttribute === "function") {
    const role = candidate.getAttribute("role");

    if (role === "textbox") {
      return true;
    }
  }

  if (typeof candidate.closest === "function") {
    return Boolean(
      candidate.closest(
        "input, textarea, select, [contenteditable='true'], [role='textbox']",
      ),
    );
  }

  return false;
}

export function getFocusModeShortcutAction({
  event,
  isFocusMode,
  isFocusRailVisible,
}: {
  event: FocusModeShortcutEvent;
  isFocusMode: boolean;
  isFocusRailVisible: boolean;
}): FocusModeShortcutAction | null {
  if (
    event.altKey ||
    event.ctrlKey ||
    event.metaKey ||
    event.repeat ||
    isEditableShortcutTarget(event.target)
  ) {
    return null;
  }

  const normalizedKey = event.key.toLowerCase();

  if (normalizedKey === "f") {
    return "toggle-focus-mode";
  }

  if (normalizedKey !== "escape") {
    return null;
  }

  if (isFocusRailVisible) {
    return "close-focus-rail";
  }

  if (isFocusMode) {
    return "exit-focus-mode";
  }

  return null;
}

export function buildFocusModeContextCards(
  sections: AnalysisRailSection[],
) {
  const marketStatus = getSection(sections, "market-status");
  const edgeStatus = getSection(sections, "edge-status");
  const confirmation = getSection(sections, "confirmation");
  const invalidation = getSection(sections, "invalidation");

  return [
    {
      key: "setup",
      label: "Current setup",
      title: marketStatus?.title ?? "No clear setup",
      detail:
        marketStatus?.detail ??
        "The engine is still waiting for enough structure to define a setup.",
      statusTag: edgeStatus?.title ?? "Not yet",
    },
    {
      key: "next",
      label: "What needs to happen?",
      title: confirmation?.title ?? "Wait for a cleaner trigger",
      detail:
        confirmation?.detail ??
        "The engine needs a clearer trigger before treating the setup as actionable.",
    },
    {
      key: "risk-line",
      label: "Wrong if",
      title: invalidation?.title ?? "Pending",
      detail:
        invalidation?.detail ??
        "Invalidation is waiting on a cleaner structure and a more reliable trigger.",
    },
  ] satisfies FocusModeContextCard[];
}

function normalizeSummaryFragment(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const normalized = value.replace(/\s+/g, " ").trim();

  if (!normalized) {
    return null;
  }

  return normalized.replace(/[.]+$/g, "");
}

function sentenceCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function buildSetupActionClause(statusTag?: string) {
  const normalized = normalizeSummaryFragment(statusTag)?.toLowerCase();

  if (!normalized) {
    return null;
  }

  if (normalized === "not yet") {
    return "No trade yet";
  }

  if (normalized === "needs more confirmation") {
    return "Watch only";
  }

  if (normalized === "yes, if confirmed") {
    return "Setup active on confirmation";
  }

  return sentenceCase(normalized);
}

function buildNextClause(nextCard?: FocusModeContextCard) {
  const title = normalizeSummaryFragment(nextCard?.title);

  if (!title || /^pending$/i.test(title)) {
    return null;
  }

  if (/^break /i.test(title) || /^hold /i.test(title)) {
    return `Needs ${title.charAt(0).toLowerCase()}${title.slice(1)}`;
  }

  if (/^wait /i.test(title)) {
    return title;
  }

  return sentenceCase(title);
}

function buildRiskClause(riskCard?: FocusModeContextCard) {
  const title = normalizeSummaryFragment(riskCard?.title);

  if (!title || /^pending$/i.test(title)) {
    return null;
  }

  return `Wrong if ${title.charAt(0).toLowerCase()}${title.slice(1)}`;
}

export function buildFocusModeDecisionSummary(
  cards: FocusModeContextCard[],
) {
  const setupCard = cards.find((card) => card.key === "setup");
  const nextCard = cards.find((card) => card.key === "next");
  const riskCard = cards.find((card) => card.key === "risk-line");

  const fragments = [
    normalizeSummaryFragment(setupCard?.title),
    buildSetupActionClause(setupCard?.statusTag),
    buildNextClause(nextCard),
    buildRiskClause(riskCard),
  ].filter((fragment): fragment is string => Boolean(fragment));

  if (fragments.length === 0) {
    return "No clear setup yet.";
  }

  return fragments.map((fragment) => `${fragment}.`).join(" ");
}

export function buildFocusModeViewModel({
  isFocusMode,
  isFocusRailVisible,
  sections,
}: {
  isFocusMode: boolean;
  isFocusRailVisible: boolean;
  sections: AnalysisRailSection[];
}): FocusModeViewModel {
  const contextCards = buildFocusModeContextCards(sections);
  const summaryLine = buildFocusModeDecisionSummary(contextCards);

  return {
    showRailColumn: !isFocusMode,
    showFocusContext: isFocusMode,
    showFocusRailDrawer: isFocusMode && isFocusRailVisible,
    focusToggleLabel: isFocusMode ? "Exit Focus Mode" : "Focus Mode",
    railToggleLabel: isFocusRailVisible
      ? "Hide Analysis Rail"
      : "Show Analysis Rail",
    summaryLine,
    contextCards,
  };
}
