import type {
  ABCImprovedScenario,
  NoTradeState,
  ScenarioEvidence,
} from "./types.ts";

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function formatValidationStatusLabel(
  validationStatus: ScenarioEvidence["validationStatus"],
) {
  switch (validationStatus) {
    case "valid":
      return "Valid structure";
    case "provisional":
      return "Provisional structure";
    case "weak":
      return "Weak structure";
    case "invalid":
      return "Invalid structure";
    default:
      return "Structure pending";
  }
}

export function formatValidationStatusShortLabel(
  validationStatus: ScenarioEvidence["validationStatus"],
) {
  switch (validationStatus) {
    case "valid":
      return "Valid";
    case "provisional":
      return "Provisional";
    case "weak":
      return "Weak";
    case "invalid":
      return "Invalid";
    default:
      return "Pending";
  }
}

export function formatSetupQualityLabel(
  setupQuality: ScenarioEvidence["setupQuality"],
) {
  return `${capitalize(setupQuality)} setup quality`;
}

export function formatHigherTimeframeAlignmentLabel(
  alignment: ScenarioEvidence["higherTimeframeAlignment"],
) {
  switch (alignment) {
    case "aligned":
      return "Higher timeframe aligned";
    case "mixed":
      return "Higher timeframe mixed";
    case "not-aligned":
      return "Higher timeframe not aligned";
    default:
      return "Higher timeframe mixed";
  }
}

export function formatRiskClassificationLabel(
  riskClassification: ScenarioEvidence["riskClassification"],
) {
  switch (riskClassification) {
    case "trend-aligned":
      return "Trend-aligned";
    case "counter-trend":
      return "Counter-trend";
    case "trap-prone":
      return "Trap-prone";
    case "ambiguous":
      return "Ambiguous";
    default:
      return "Ambiguous";
  }
}

export function buildScenarioEvidenceBadge(
  scenario: Pick<ABCImprovedScenario, "evidence">,
) {
  return `${formatValidationStatusLabel(scenario.evidence.validationStatus)} · ${formatSetupQualityLabel(scenario.evidence.setupQuality)}`;
}

export function buildScenarioEvidenceSummary(
  scenario: Pick<ABCImprovedScenario, "evidence">,
) {
  const { evidenceSummary } = scenario.evidence;
  return `${evidenceSummary.passed} pass · ${evidenceSummary.warning} warning · ${evidenceSummary.failed} fail`;
}

export function buildScenarioEdgeLabel(
  scenario: Pick<ABCImprovedScenario, "evidence">,
) {
  const { validationStatus, setupQuality, higherTimeframeAlignment } =
    scenario.evidence;

  if (
    validationStatus === "valid" &&
    setupQuality === "high" &&
    higherTimeframeAlignment === "aligned"
  ) {
    return "Yes, if confirmed";
  }

  if (
    validationStatus === "invalid" ||
    validationStatus === "weak" ||
    higherTimeframeAlignment === "not-aligned"
  ) {
    return "Not yet";
  }

  return "Needs more confirmation";
}

export function buildScenarioRoleLabel(
  scenario: Pick<ABCImprovedScenario, "scenarioRole">,
) {
  switch (scenario.scenarioRole) {
    case "primary":
      return "Primary";
    case "alternate":
      return "Alternate";
    case "reserve":
      return "Reserve";
    case "sole":
      return "Only count";
    default:
      return "Scenario";
  }
}

export function buildTargetLadderRows(
  scenario: Pick<ABCImprovedScenario, "targets">,
) {
  return scenario.targets.map((target, index) => ({
    ...target,
    emphasis:
      index === 0
        ? "Primary target"
        : index === 1
          ? "Stretch target"
          : "Extended target",
  }));
}

export function buildNoTradeBadge(noTradeState: NoTradeState) {
  return noTradeState.title;
}

export function buildNoTradeSummary(noTradeState: NoTradeState) {
  return noTradeState.reasons.slice(0, 2).join(" · ");
}

export function buildNoTradeEvidenceSummary(noTradeState: NoTradeState) {
  const { evidenceSummary } = noTradeState;
  return `${evidenceSummary.passed} pass · ${evidenceSummary.warning} warning · ${evidenceSummary.failed} fail`;
}

export function buildNoTradeConfirmationSummary(noTradeState: NoTradeState) {
  return (
    noTradeState.confirmationNeeded[0]?.detail ??
    "Await cleaner structure before treating the setup as directional."
  );
}
