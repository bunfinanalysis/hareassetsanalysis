import type { WaveReactionAnalysis } from "../elliottReactionEngine";
import type { WaveCount } from "../elliottWaveUtils";

import {
  buildNoTradeConfirmationSummary,
  buildNoTradeSummary,
  buildScenarioEdgeLabel,
  formatHigherTimeframeAlignmentLabel,
  formatRiskClassificationLabel,
} from "./evidence-presentation.ts";
import type {
  ABCImprovedScenario,
  NoTradeState,
} from "./types.ts";
import { formatPrice } from "../utils.ts";

export type AnalysisRailSectionKey =
  | "market-status"
  | "edge-status"
  | "confirmation"
  | "invalidation"
  | "primary-scenario"
  | "alternate-scenario"
  | "risk-notes";

export type AnalysisRailSection = {
  key: AnalysisRailSectionKey;
  label: string;
  title: string;
  detail: string;
};

type BuildAnalysisRailSectionsInput = {
  activeCount: WaveCount | null;
  reactionAnalysis: WaveReactionAnalysis | null;
  primaryScenario: ABCImprovedScenario | null;
  alternateScenario: ABCImprovedScenario | null;
  noTradeState: NoTradeState | null;
  pricePrecision?: number;
};

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function buildConfirmationSection(
  primaryScenario: ABCImprovedScenario | null,
  noTradeState: NoTradeState | null,
  pricePrecision: number,
): AnalysisRailSection {
  if (noTradeState) {
    return {
      key: "confirmation",
      label: "What needs to happen?",
      title:
        noTradeState.confirmationNeeded[0]?.label ?? "Wait for a cleaner trigger",
      detail: buildNoTradeConfirmationSummary(noTradeState),
    };
  }

  if (!primaryScenario) {
    return {
      key: "confirmation",
      label: "What needs to happen?",
      title: "Wait for a cleaner trigger",
      detail:
        "The engine needs a clearer structural trigger before treating the setup as actionable.",
    };
  }

  const pivotB = primaryScenario.pivotSequenceUsed.find(
    (pivot) => pivot.label === "B",
  );

  if (pivotB) {
    return {
      key: "confirmation",
      label: "What needs to happen?",
      title:
        primaryScenario.directionBias === "bullish"
          ? `Break above ${formatPrice(pivotB.price, pricePrecision)}`
          : `Break below ${formatPrice(pivotB.price, pricePrecision)}`,
      detail:
        primaryScenario.directionBias === "bullish"
          ? "That would strengthen the active Wave C path."
          : "That would strengthen the active Wave C path.",
    };
  }

  return {
    key: "confirmation",
    label: "What needs to happen?",
    title: "Wait for a cleaner trigger",
    detail:
      primaryScenario.promotionCondition?.reason ??
      primaryScenario.description,
  };
}

function buildWrongIfTitle({
  level,
  explanation,
  directionBias,
}: {
  level: string;
  explanation?: string;
  directionBias?: ABCImprovedScenario["directionBias"];
}) {
  if (directionBias === "bullish") {
    return `Below ${level}`;
  }

  if (directionBias === "bearish") {
    return `Above ${level}`;
  }

  const normalizedExplanation = explanation?.toLowerCase() ?? "";

  if (normalizedExplanation.includes("above")) {
    return `Above ${level}`;
  }

  if (normalizedExplanation.includes("below")) {
    return `Below ${level}`;
  }

  return `Breaks ${level}`;
}

function buildInvalidationSection(
  primaryScenario: ABCImprovedScenario | null,
  reactionAnalysis: WaveReactionAnalysis | null,
  pricePrecision: number,
): AnalysisRailSection {
  if (primaryScenario) {
    const formattedLevel = formatPrice(
      primaryScenario.invalidationLevel,
      pricePrecision,
    );

    return {
      key: "invalidation",
      label: "Wrong if",
      title: buildWrongIfTitle({
        level: formattedLevel,
        explanation: primaryScenario.invalidationReason,
        directionBias: primaryScenario.directionBias,
      }),
      detail: primaryScenario.invalidationReason,
    };
  }

  if (reactionAnalysis?.invalidation) {
    const formattedLevel = formatPrice(
      reactionAnalysis.invalidation.level,
      pricePrecision,
    );

    return {
      key: "invalidation",
      label: "Wrong if",
      title: buildWrongIfTitle({
        level: formattedLevel,
        explanation: reactionAnalysis.invalidation.explanation,
      }),
      detail: reactionAnalysis.invalidation.explanation,
    };
  }

  return {
    key: "invalidation",
    label: "Wrong if",
    title: "Pending",
    detail:
      "Invalidation is waiting on a cleaner structure and a more reliable trigger.",
  };
}

export function buildAnalysisRailSections({
  activeCount,
  reactionAnalysis,
  primaryScenario,
  alternateScenario,
  noTradeState,
  pricePrecision = 2,
}: BuildAnalysisRailSectionsInput): AnalysisRailSection[] {
  const marketStatus: AnalysisRailSection = noTradeState
    ? {
        key: "market-status",
        label: "Current setup",
        title: noTradeState.title,
        detail: buildNoTradeSummary(noTradeState),
      }
    : primaryScenario
      ? {
          key: "market-status",
          label: "Current setup",
          title:
            primaryScenario.evidence.riskClassification === "trap-prone"
              ? "Trap-prone setup"
              : primaryScenario.evidence.validationStatus === "valid"
                ? `${capitalize(primaryScenario.directionBias)} corrective setup`
                : primaryScenario.evidence.validationStatus === "provisional"
                  ? `${capitalize(primaryScenario.directionBias)} setup forming`
                  : "Corrective ambiguity",
          detail: primaryScenario.structureLabel,
        }
      : {
          key: "market-status",
          label: "Current setup",
          title: activeCount
            ? `${capitalize(activeCount.pattern)} structure forming`
            : "No clear setup yet",
          detail: reactionAnalysis
            ? `${capitalize(reactionAnalysis.reactionType)} response is being tracked while structure develops.`
            : "The engine is still waiting for enough pivots to validate a structure.",
        };

  const edgeStatus: AnalysisRailSection = noTradeState
    ? {
        key: "edge-status",
        label: "Can I act yet?",
        title: "Not yet",
        detail: buildNoTradeSummary(noTradeState),
      }
    : primaryScenario
      ? {
          key: "edge-status",
          label: "Can I act yet?",
          title: buildScenarioEdgeLabel(primaryScenario),
          detail:
            buildScenarioEdgeLabel(primaryScenario) === "Yes, if confirmed"
              ? "The setup is usable, but price still needs the trigger."
              : buildScenarioEdgeLabel(primaryScenario) === "Needs more confirmation"
                ? "The idea is forming, but it is not ready to act on yet."
                : "The setup is too mixed or too weak to trust right now.",
        }
      : {
          key: "edge-status",
          label: "Can I act yet?",
          title: "Not yet",
          detail:
            "The current structure is not developed enough to support a disciplined directional read.",
        };

  const primarySection: AnalysisRailSection = primaryScenario
    ? {
        key: "primary-scenario",
        label: "Primary Scenario",
        title: primaryScenario.structureLabel,
        detail: primaryScenario.reason,
      }
    : {
        key: "primary-scenario",
        label: "Primary Scenario",
        title: "No primary scenario yet",
        detail:
          "The engine is still waiting for a cleaner corrective sequence before ranking a primary count.",
      };

  const alternateSection = alternateScenario
    ? ({
        key: "alternate-scenario",
        label: "Alternate Scenario",
        title: alternateScenario.structureLabel,
        detail:
          alternateScenario.promotionCondition?.reason ??
          "This count becomes primary if the leading scenario loses structural validity.",
      } satisfies AnalysisRailSection)
    : null;

  const riskSection: AnalysisRailSection = noTradeState
    ? {
        key: "risk-notes",
        label: "Risk Notes",
        title: noTradeState.expectedToResolveWithMoreData
          ? "Ambiguity may resolve"
          : "Stand aside",
        detail:
          noTradeState.reasonDetails[0]?.detail ??
          "Current conditions are too mixed to support a reliable directional edge.",
      }
    : primaryScenario
      ? {
          key: "risk-notes",
          label: "Risk Notes",
          title: formatRiskClassificationLabel(
            primaryScenario.evidence.riskClassification,
          ),
          detail: formatHigherTimeframeAlignmentLabel(
            primaryScenario.evidence.higherTimeframeAlignment,
          ),
        }
      : {
          key: "risk-notes",
          label: "Risk Notes",
          title: "Risk pending",
          detail: "Risk notes will tighten once the engine has a ranked scenario.",
        };

  return [
    marketStatus,
    edgeStatus,
    buildConfirmationSection(primaryScenario, noTradeState, pricePrecision),
    buildInvalidationSection(primaryScenario, reactionAnalysis, pricePrecision),
    primarySection,
    ...(alternateSection ? [alternateSection] : []),
    riskSection,
  ];
}
