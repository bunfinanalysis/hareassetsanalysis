import { formatPrice } from "./shared.ts";
import type {
  ABCImprovedDetection,
  ABCImprovedScenario,
  ABCImprovedTarget,
  ExplanationLayerInput,
  FibRelationship,
  NormalizedScenarioPriceRange,
  RankedABCScenarioData,
  ScenarioEvidence,
  ScenarioEvidenceCheck,
} from "./types.ts";

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function buildImprovedScenarioLabel(
  rankedScenario: RankedABCScenarioData,
) {
  const degreeLabel = capitalize(rankedScenario.baseScenario.degree);

  if (rankedScenario.higherContext) {
    return `${degreeLabel} Wave C of Wave (4) of larger ${rankedScenario.higherContext.timeframe} ABC zigzag post $121 ATH`;
  }

  return `${degreeLabel} Wave C of Wave (4) of larger ABC zigzag post $121 ATH`;
}

function buildImprovedScenarioName(
  rankedScenario: RankedABCScenarioData,
  input: ExplanationLayerInput,
) {
  const directionLabel =
    rankedScenario.baseScenario.direction === "bearish" ? "Bearish" : "Bullish";
  const { scenarioRole } = input.displayPlan;

  if (scenarioRole === "primary" || scenarioRole === "sole") {
    return `Primary ${directionLabel} ABC Zigzag`;
  }

  if (scenarioRole === "alternate") {
    return `Alternate ${directionLabel} ABC Zigzag`;
  }

  return `Reserve ${directionLabel} ABC Zigzag`;
}

function buildImprovedReason(
  rankedScenario: RankedABCScenarioData,
) {
  const { baseScenario, volumeScore, higherContext } = rankedScenario;

  return [
    baseScenario.reasonSummary,
    `Momentum ${
      baseScenario.momentumScore >= 70
        ? "supports"
        : baseScenario.momentumScore >= 50
          ? "is neutral for"
          : "is weak for"
    } Wave C`,
    `Volume ${
      volumeScore >= 70
        ? "confirms"
        : volumeScore >= 50
          ? "is neutral for"
          : "is weak for"
    } Wave C follow-through`,
    higherContext
      ? `${higherContext.timeframe} context is ${
          higherContext.direction === baseScenario.direction ? "aligned" : "mixed"
        }`
      : "Higher-degree context inferred from current data",
  ]
    .filter(Boolean)
    .join(" · ");
}

function formatFibRatio(ratio: number) {
  return `${ratio.toFixed(ratio % 1 === 0 ? 1 : 3).replace(/0+$/, "0")}×A`;
}

function buildImprovedTargets(
  rankedScenario: RankedABCScenarioData,
): ABCImprovedTarget[] {
  return rankedScenario.targets.map((target) => ({
    price: target.price,
    fibRatio: formatFibRatio(target.fibRatio),
    probability: target.probability,
  }));
}

function buildFibRelationshipLines(
  relationships: FibRelationship[],
): string[] {
  return relationships
    .map((relationship) => {
      if (relationship.kind === "b-retrace") {
        return `B retrace = ${(relationship.ratio * 100).toFixed(1)}% of A`;
      }

      return relationship.price
        ? `C = ${formatFibRatio(relationship.ratio)} at ${formatPrice(relationship.price)}`
        : `C = ${formatFibRatio(relationship.ratio)}`;
    })
    .slice(0, 5);
}

function buildDescription(
  rankedScenario: RankedABCScenarioData,
) {
  return rankedScenario.baseScenario.direction === "bearish"
    ? "Bearish corrective inside larger Wave C"
    : "Bullish corrective inside larger Wave C";
}

function buildStructureLabel(
  rankedScenario: RankedABCScenarioData,
) {
  const directionLabel =
    rankedScenario.baseScenario.direction === "bearish" ? "Bearish" : "Bullish";
  const structureName =
    rankedScenario.baseScenario.kind === "abc"
      ? "ABC Zigzag"
      : "AB-to-C Projection";

  return `${directionLabel} ${structureName}`;
}

function buildPivotSequenceUsed(
  rankedScenario: RankedABCScenarioData,
) {
  const { anchor } = rankedScenario.baseScenario.count;
  const points = rankedScenario.baseScenario.count.points;

  return [
    ...(anchor
      ? [
          {
            label: "Anchor" as const,
            price: anchor.price,
            time: anchor.time,
          },
        ]
      : []),
    ...points.map((point) => ({
      label: point.label as "A" | "B" | "C",
      price: point.price,
      time: point.time,
    })),
  ];
}

function buildValidationStatus(
  rankedScenario: RankedABCScenarioData,
): ScenarioEvidence["validationStatus"] {
  const { baseScenario } = rankedScenario;
  const ruleRatio =
    baseScenario.rules.total > 0
      ? baseScenario.rules.passed / Math.max(baseScenario.rules.total, 1)
      : 0;

  if (!baseScenario.hardRulePassed) {
    return "invalid";
  }

  if (baseScenario.kind === "abc" && ruleRatio >= 0.8) {
    return "valid";
  }

  if (ruleRatio >= 0.6) {
    return "provisional";
  }

  return "weak";
}

function buildSetupQuality(
  rankedScenario: RankedABCScenarioData,
): ScenarioEvidence["setupQuality"] {
  if (rankedScenario.confidence >= 75) {
    return "high";
  }

  if (rankedScenario.confidence >= 55) {
    return "medium";
  }

  return "low";
}

function buildHigherTimeframeAlignment(
  rankedScenario: RankedABCScenarioData,
): ScenarioEvidence["higherTimeframeAlignment"] {
  const { higherContext, baseScenario } = rankedScenario;

  if (!higherContext) {
    return "mixed";
  }

  if (higherContext.direction !== baseScenario.direction) {
    return "not-aligned";
  }

  return higherContext.confidence >= 65 ? "aligned" : "mixed";
}

function buildRiskClassification(
  validationStatus: ScenarioEvidence["validationStatus"],
  alignment: ScenarioEvidence["higherTimeframeAlignment"],
  rankedScenario: RankedABCScenarioData,
): ScenarioEvidence["riskClassification"] {
  if (alignment === "not-aligned") {
    return "counter-trend";
  }

  if (
    validationStatus === "weak" ||
    validationStatus === "invalid" ||
    (rankedScenario.momentumScore < 52 && rankedScenario.volumeScore < 52)
  ) {
    return "trap-prone";
  }

  if (
    alignment === "aligned" &&
    validationStatus === "valid" &&
    rankedScenario.baseScenario.kind === "abc"
  ) {
    return "trend-aligned";
  }

  return "ambiguous";
}

function buildEvidenceChecks(
  rankedScenario: RankedABCScenarioData,
  alignment: ScenarioEvidence["higherTimeframeAlignment"],
): ScenarioEvidenceCheck[] {
  const baseChecks = rankedScenario.baseScenario.rules.details.map((rule) => ({
    label: rule.label,
    status: rule.status,
    detail: rule.message || rule.detail,
  }));
  const momentumStatus =
    rankedScenario.momentumScore >= 70
      ? "pass"
      : rankedScenario.momentumScore >= 52
        ? "warning"
        : "fail";
  const volumeStatus =
    rankedScenario.volumeScore >= 70
      ? "pass"
      : rankedScenario.volumeScore >= 52
        ? "warning"
        : "fail";
  const alignmentStatus =
    alignment === "aligned"
      ? "pass"
      : alignment === "mixed"
        ? "warning"
        : "fail";

  return [
    ...baseChecks,
    {
      label: "Higher timeframe trend alignment",
      status: alignmentStatus,
      detail:
        alignment === "aligned"
          ? "Higher timeframe direction supports the active ABC interpretation."
          : alignment === "mixed"
            ? "Higher timeframe context is present but not fully aligned."
            : "Higher timeframe direction conflicts with the active ABC interpretation.",
    },
    {
      label: "Momentum profile",
      status: momentumStatus,
      detail:
        rankedScenario.momentumScore >= 70
          ? "Momentum behavior supports the projected Wave C resolution."
          : rankedScenario.momentumScore >= 52
            ? "Momentum is mixed and does not strongly confirm Wave C."
            : "Momentum profile is weak for the active Wave C interpretation.",
    },
    {
      label: "Volume confirmation",
      status: volumeStatus,
      detail:
        rankedScenario.volumeScore >= 70
          ? "Volume behavior supports continuation into the active target path."
          : rankedScenario.volumeScore >= 52
            ? "Volume is neutral and does not strongly confirm the setup."
            : "Volume confirmation is weak and raises trap risk.",
    },
  ];
}

function buildEvidence(
  rankedScenario: RankedABCScenarioData,
  alternateCountExists: boolean,
): ScenarioEvidence {
  const validationStatus = buildValidationStatus(rankedScenario);
  const setupQuality = buildSetupQuality(rankedScenario);
  const higherTimeframeAlignment = buildHigherTimeframeAlignment(rankedScenario);
  const evidenceChecks = buildEvidenceChecks(
    rankedScenario,
    higherTimeframeAlignment,
  );
  const evidenceSummary = evidenceChecks.reduce(
    (summary, check) => {
      if (check.status === "pass") {
        summary.passed += 1;
      } else if (check.status === "warning" || check.status === "pending") {
        summary.warning += 1;
      } else if (check.status === "fail") {
        summary.failed += 1;
      }

      return summary;
    },
    { passed: 0, warning: 0, failed: 0 },
  );

  return {
    validationStatus,
    setupQuality,
    higherTimeframeAlignment,
    invalidation: {
      level: rankedScenario.baseScenario.invalidationLevel,
      explanation: rankedScenario.baseScenario.invalidationExplanation,
    },
    alternateCountExists,
    evidenceChecks,
    evidenceSummary,
    riskClassification: buildRiskClassification(
      validationStatus,
      higherTimeframeAlignment,
      rankedScenario,
    ),
  };
}

export function buildImprovedScenario(
  input: ExplanationLayerInput,
): ABCImprovedScenario {
  const { rankedScenario, index, alternateCountExists, displayPlan } = input;
  const { baseScenario } = rankedScenario;
  const targets = buildImprovedTargets(rankedScenario);
  const primaryTarget = targets[0] ?? {
    price:
      baseScenario.targetZone?.nextTargetPrice ?? baseScenario.invalidationLevel,
    fibRatio: "1.0×A",
    probability: 100,
  };
  const targetPrices =
    targets.length > 0 ? targets.map((target) => target.price) : [primaryTarget.price];
  const evidence = buildEvidence(rankedScenario, alternateCountExists);

  return {
    id: index + 1,
    name: buildImprovedScenarioName(rankedScenario, input),
    confidence: rankedScenario.confidence,
    label: buildImprovedScenarioLabel(rankedScenario),
    structureLabel: buildStructureLabel(rankedScenario),
    description: buildDescription(rankedScenario),
    reason: buildImprovedReason(rankedScenario),
    directionBias: baseScenario.direction,
    degree: baseScenario.degree,
    pivotSequenceUsed: buildPivotSequenceUsed(rankedScenario),
    waveCProjection: primaryTarget.price,
    targets,
    invalidationLevel: baseScenario.invalidationLevel,
    invalidationReason: baseScenario.invalidationExplanation,
    channel: rankedScenario.channel,
    momentumScore: rankedScenario.momentumScore,
    volumeScore: rankedScenario.volumeScore,
    primary:
      displayPlan.scenarioRole === "primary" || displayPlan.scenarioRole === "sole",
    scenarioRole: displayPlan.scenarioRole,
    relativeStrength: displayPlan.relativeStrength,
    promotionCondition: displayPlan.promotionCondition,
    trendContext: displayPlan.trendContext,
    currentlyInvalidated: displayPlan.currentlyInvalidated,
    fibRelationships: buildFibRelationshipLines(rankedScenario.fibRelationships),
    subWaveLabels: rankedScenario.subWaveLabels,
    scoreBreakdown: rankedScenario.scoreBreakdown,
    scoreComponents: displayPlan.scoreComponents,
    validation: baseScenario.rules,
    evidence,
    legacyScenario: {
      ...baseScenario,
      targetZone: baseScenario.targetZone
        ? {
            ...baseScenario.targetZone,
            nextTargetPrice: primaryTarget.price,
            minTarget: Math.min(...targetPrices),
            maxTarget: Math.max(...targetPrices),
            probability: primaryTarget.probability,
          }
        : null,
    },
  };
}

export function buildInstitutionalChartOverlays(
  scenarios: ABCImprovedScenario[],
  priceRange: NormalizedScenarioPriceRange | null,
): ABCImprovedDetection["chartOverlays"] {
  return {
    priceRange: priceRange
      ? {
          minPrice: priceRange.minPrice,
          maxPrice: priceRange.maxPrice,
          dataLow: priceRange.dataLow,
          dataHigh: priceRange.dataHigh,
          padding: priceRange.padding,
        }
      : null,
    channels: scenarios.map((scenario) => ({
      scenarioId: scenario.id,
      primary: scenario.primary,
      ...scenario.channel,
    })),
    labels: scenarios[0]?.subWaveLabels ?? [],
    targetTables: scenarios.map((scenario) => ({
      scenarioId: scenario.id,
      name: scenario.name,
      targets: scenario.targets,
    })),
    invalidations: scenarios.map((scenario) => ({
      scenarioId: scenario.id,
      level: scenario.invalidationLevel,
      explanation: scenario.legacyScenario.invalidationExplanation,
    })),
  };
}
