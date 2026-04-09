import type { Candle } from "../market-types";

import { average, roundTo } from "./shared.ts";
import type {
  ABCImprovedScenario,
  NoTradeConfirmation,
  NoTradeReasonCode,
  NoTradeReasonDetail,
  NoTradeState,
  ScenarioScoreComponent,
} from "./types.ts";

function getScoreComponentValue(
  scenario: ABCImprovedScenario,
  key: ScenarioScoreComponent["key"],
) {
  return scenario.scoreComponents.find((component) => component.key === key)?.value ?? 0;
}

function calculateRecentAtr(candles: Candle[]) {
  if (candles.length === 0) {
    return 0;
  }

  const window = candles.slice(-14);
  const trueRanges = window.map((candle, index) => {
    const previousClose = window[index - 1]?.close ?? candle.close;
    return Math.max(
      candle.high - candle.low,
      Math.abs(candle.high - previousClose),
      Math.abs(candle.low - previousClose),
    );
  });

  return average(trueRanges);
}

function buildReasonDetail(
  code: NoTradeReasonCode,
  label: string,
  detail: string,
): NoTradeReasonDetail {
  return {
    code,
    label,
    detail,
  };
}

function buildReasonDetails(
  scenarios: ABCImprovedScenario[],
  latestPrice: number,
  candles: Candle[],
) {
  const primary = scenarios[0] ?? null;
  const alternate =
    scenarios.find((scenario) => scenario.scenarioRole === "alternate") ?? null;
  const reasons: NoTradeReasonDetail[] = [];

  if (!primary) {
    reasons.push(
      buildReasonDetail(
        "no-valid-scenario",
        "No validated directional edge",
        "No corrective scenario is strong enough to justify a directional count yet.",
      ),
    );
    return reasons;
  }

  const scoreSpread = alternate ? Math.abs(primary.confidence - alternate.confidence) : null;
  const pivotQuality = getScoreComponentValue(primary, "pivot-quality");
  const subdivisionQuality = getScoreComponentValue(primary, "subdivision-quality");
  const structuralCleanliness = getScoreComponentValue(primary, "structural-cleanliness");
  const higherAlignment = primary.evidence.higherTimeframeAlignment;
  const recentAtr = calculateRecentAtr(candles);
  const invalidationDistance = Math.abs(latestPrice - primary.invalidationLevel);
  const invalidationTooClose =
    invalidationDistance <= Math.max(recentAtr * 0.75, latestPrice * 0.0035, 0.18);

  if (
    alternate &&
    (primary.relativeStrength === "close" || alternate.relativeStrength === "close" || (scoreSpread !== null && scoreSpread <= 6))
  ) {
    reasons.push(
      buildReasonDetail(
        "close-scenario-scores",
        "Corrective ambiguity",
        "Primary and alternate corrective counts are too close in quality to justify a strong directional preference.",
      ),
    );
  }

  if (higherAlignment === "not-aligned" || higherAlignment === "mixed") {
    reasons.push(
      buildReasonDetail(
        "higher-timeframe-conflict",
        higherAlignment === "not-aligned"
          ? "Higher timeframe conflict"
          : "Higher timeframe mixed",
        higherAlignment === "not-aligned"
          ? "The best-looking local count conflicts with higher timeframe structure."
          : "Higher timeframe context is mixed and does not strongly support the local count.",
      ),
    );
  }

  if (
    primary.evidence.validationStatus === "weak" ||
    primary.evidence.validationStatus === "invalid" ||
    primary.evidence.setupQuality === "low"
  ) {
    reasons.push(
      buildReasonDetail(
        "weak-structure",
        "Structural validation weak",
        "Rule coverage or setup quality is too weak to support a reliable directional bias.",
      ),
    );
  }

  if (pivotQuality < 48) {
    reasons.push(
      buildReasonDetail(
        "poor-pivot-quality",
        "Pivot quality poor",
        "Recent pivots are unstable or uneven, so the count is too sensitive to small price changes.",
      ),
    );
  }

  if (primary.legacyScenario.kind !== "abc") {
    reasons.push(
      buildReasonDetail(
        "insufficient-confirmation",
        "Awaiting confirmation",
        "The engine is still projecting a C leg from an incomplete AB structure rather than validating a completed ABC.",
      ),
    );
  }

  if (
    structuralCleanliness < 52 ||
    subdivisionQuality < 52 ||
    primary.evidence.riskClassification === "ambiguous"
  ) {
    reasons.push(
      buildReasonDetail(
        "choppy-overlap",
        "Choppy overlap",
        "Overlapping or cluttered price action is reducing the cleanliness of the active interpretation.",
      ),
    );
  }

  if (invalidationTooClose) {
    reasons.push(
      buildReasonDetail(
        "unreliable-invalidation",
        "Invalidation too close",
        "The invalidation boundary is too close to current price to offer a meaningful, reliable setup.",
      ),
    );
  }

  return reasons;
}

function buildConfirmationNeeded(
  scenarios: ABCImprovedScenario[],
  reasonDetails: NoTradeReasonDetail[],
) {
  const primary = scenarios[0] ?? null;
  const alternate =
    scenarios.find((scenario) => scenario.scenarioRole === "alternate") ?? null;
  const confirmations: NoTradeConfirmation[] = [];

  if (primary) {
    const primaryPivotB = primary.pivotSequenceUsed.find((pivot) => pivot.label === "B");

    if (primaryPivotB) {
      confirmations.push({
        label: "Primary count confirmation",
        detail:
          primary.directionBias === "bullish"
            ? `Need cleaner acceptance above the B pivot at ${primaryPivotB.price.toFixed(2)}.`
            : `Need cleaner acceptance below the B pivot at ${primaryPivotB.price.toFixed(2)}.`,
        level: primaryPivotB.price,
        direction: primary.directionBias === "bullish" ? "above" : "below",
      });
    }

    confirmations.push({
      label: "Primary invalidation reference",
      detail: primary.invalidationReason,
      level: primary.invalidationLevel,
      direction: primary.directionBias === "bullish" ? "below" : "above",
    });
  }

  if (alternate?.promotionCondition) {
    confirmations.push({
      label: "Alternate promotion condition",
      detail: alternate.promotionCondition.reason,
      level: alternate.promotionCondition.level,
      direction:
        alternate.directionBias === "bullish"
          ? "above"
          : alternate.directionBias === "bearish"
            ? "below"
            : undefined,
    });
  }

  if (
    reasonDetails.some(
      (reason) =>
        reason.code === "higher-timeframe-conflict" ||
        reason.code === "insufficient-confirmation",
    )
  ) {
    confirmations.push({
      label: "Higher timeframe confirmation",
      detail: "Wait for 1H/4H structure to align with the active corrective path.",
    });
  }

  if (reasonDetails.some((reason) => reason.code === "choppy-overlap")) {
    confirmations.push({
      label: "Cleaner structure required",
      detail: "Wait for a cleaner break outside the current overlap/chop zone before acting.",
      direction: "outside",
    });
  }

  return confirmations.slice(0, 4);
}

function buildEvidenceSummary(scenarios: ABCImprovedScenario[]) {
  if (scenarios.length === 0) {
    return {
      passed: 0,
      warning: 0,
      failed: 0,
      scenarioCount: 0,
    };
  }

  return scenarios.reduce(
    (summary, scenario) => {
      summary.passed += scenario.evidence.evidenceSummary.passed;
      summary.warning += scenario.evidence.evidenceSummary.warning;
      summary.failed += scenario.evidence.evidenceSummary.failed;
      summary.scenarioCount += 1;
      return summary;
    },
    {
      passed: 0,
      warning: 0,
      failed: 0,
      scenarioCount: 0,
    },
  );
}

export function evaluateNoTradeState(
  scenarios: ABCImprovedScenario[],
  latestPrice: number,
  candles: Candle[],
): NoTradeState | null {
  const reasonDetails = buildReasonDetails(scenarios, latestPrice, candles);
  const hardBlocks = reasonDetails.filter((reason) =>
    [
      "no-valid-scenario",
      "close-scenario-scores",
      "higher-timeframe-conflict",
      "weak-structure",
      "insufficient-confirmation",
    ].includes(reason.code),
  );
  const softBlocks = reasonDetails.filter(
    (reason) =>
      ![
        "no-valid-scenario",
        "close-scenario-scores",
        "higher-timeframe-conflict",
        "weak-structure",
        "insufficient-confirmation",
      ].includes(reason.code),
  );

  if (hardBlocks.length === 0 && softBlocks.length < 2) {
    return null;
  }

  const primary = scenarios[0] ?? null;
  const alternate =
    scenarios.find((scenario) => scenario.scenarioRole === "alternate") ?? null;
  const confirmations = buildConfirmationNeeded(scenarios, reasonDetails);

  return {
    status: "no-trade",
    title:
      hardBlocks.some((reason) => reason.code === "higher-timeframe-conflict")
        ? "Higher timeframe conflict"
        : hardBlocks.some((reason) => reason.code === "weak-structure")
          ? "No validated directional edge"
          : hardBlocks.some((reason) => reason.code === "no-valid-scenario")
            ? "No validated directional edge"
            : "Corrective ambiguity",
    reasons: reasonDetails.map((reason) => reason.label),
    reasonDetails,
    evidenceSummary: buildEvidenceSummary(scenarios),
    expectedToResolveWithMoreData: confirmations.length > 0,
    confirmationNeeded: confirmations,
    dominantScenarioId: primary?.id ?? null,
    alternateScenarioId: alternate?.id ?? null,
  };
}

export function buildNoTradeStatusLine(noTradeState: NoTradeState) {
  const primaryReason = noTradeState.reasons[0] ?? "No clear edge";
  const headline = noTradeState.title;

  if (primaryReason.toLowerCase() === headline.toLowerCase()) {
    return headline;
  }

  return roundTo(noTradeState.evidenceSummary.scenarioCount, 0) > 1
    ? `${headline} · ${primaryReason}`
    : headline;
}
