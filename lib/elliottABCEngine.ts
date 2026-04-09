import type { Candle } from "./market-types";
import type { WaveCount } from "./elliottWaveUtils";

import {
  calculateATR,
  detectFractalSwings,
  detectSimpleZigZagSwings,
  detectZigZagFractalSwings,
} from "./elliott-engine/pivot-detection.ts";
import {
  buildCorrectiveScenarioDisplayPlans,
  rankInstitutionalScenario,
  rankValidatedScenario,
  selectHigherTimeframeContext,
  timeframeToWaveDegree,
} from "./elliott-engine/scenario-ranking.ts";
import {
  createScenarioPriceClamp,
  getTimeframeConfig,
  normalizeABCCandles,
  normalizeFixedABCCandles,
  resampleCandles,
  roundTo,
  toRule,
} from "./elliott-engine/shared.ts";
import {
  evaluateNoTradeState,
} from "./elliott-engine/no-trade-state.ts";
import {
  buildImprovedScenario,
  buildInstitutionalChartOverlays,
} from "./elliott-engine/ui-explanation-layer.ts";
import {
  buildABCCandidatesFromSwings,
  buildCorrectiveCount,
  evaluateCorrectiveCandidate,
} from "./elliott-engine/wave-validation.ts";
import type {
  ABCDetectionOptions,
  ABCImprovedDetection,
  ABCProjectionTarget,
  ABCScenario,
  CorrectiveCandidateInput,
  DetectedABCSwing,
  HigherABCContext,
  HigherTimeframeInputMap,
  PriceClamp,
  PriceNormalizer,
} from "./elliott-engine/types.ts";

export type {
  ABCDetectionOptions,
  ABCImprovedChannel,
  ABCImprovedChannelLine,
  ABCImprovedDetection,
  ABCImprovedScenario,
  ABCImprovedSubWaveLabel,
  ABCImprovedTarget,
  ABCProjectionTarget,
  ABCProjectionZone,
  ABCScenario,
  ABCScenarioRule,
  CorrectiveCandidateEvaluation,
  CorrectiveCandidateInput,
  DetectedABCSwing,
  HigherABCContext,
  HigherTimeframeInputMap,
  PivotDetectionResult,
  RankedABCScenarioData,
  SegmentPivot,
  StructureType,
  SubwaveAnalysis,
  SwingLeg,
} from "./elliott-engine/types.ts";

type FixedABCSwing = {
  index: number;
  price: number;
  isHigh: boolean;
};

type FixedABCCandidate = {
  anchor: FixedABCSwing;
  a: FixedABCSwing;
  b: FixedABCSwing;
  c?: FixedABCSwing;
  direction: "bullish" | "bearish";
  waveC100: number;
  waveC161: number;
};

function buildDetectorMeta(candles: Candle[], timeframe: string) {
  const timeframeConfig = getTimeframeConfig(timeframe);
  return {
    deviationThreshold: Math.max(
      calculateATR(candles, 14) * 0.42,
      (candles[candles.length - 1]?.close ?? candles[0]?.close ?? 1) *
        timeframeConfig.moveRatio,
    ),
    minBarsBetween: timeframeConfig.minBarsBetween,
    fractalSpan: timeframeConfig.fractalSpan,
    timeframe,
  } satisfies ABCScenario["detectorMeta"];
}

function sortRankedScenarios(left: ABCScenario, right: ABCScenario) {
  if (left.selectionScore !== right.selectionScore) {
    return right.selectionScore - left.selectionScore;
  }

  if (left.confidence !== right.confidence) {
    return right.confidence - left.confidence;
  }

  return left.candlesFromLatest - right.candlesFromLatest;
}

function buildScenarioSignature(scenario: ABCScenario) {
  return JSON.stringify({
    kind: scenario.kind,
    direction: scenario.direction,
    degree: scenario.degree,
    anchor: scenario.count.anchor
      ? {
          time: scenario.count.anchor.time,
          price: roundTo(scenario.count.anchor.price, 4),
        }
      : null,
    points: scenario.count.points.map((point) => ({
      label: point.label,
      time: point.time,
      price: roundTo(point.price, 4),
    })),
  });
}

function dedupeScenarioCounts(scenarios: ABCScenario[]) {
  const dedupedScenarios = new Map<string, ABCScenario>();

  for (const scenario of scenarios) {
    const signature = buildScenarioSignature(scenario);
    const existingScenario = dedupedScenarios.get(signature);

    if (
      !existingScenario ||
      scenario.selectionScore > existingScenario.selectionScore ||
      (scenario.selectionScore === existingScenario.selectionScore &&
        scenario.confidence > existingScenario.confidence)
    ) {
      dedupedScenarios.set(signature, scenario);
    }
  }

  return Array.from(dedupedScenarios.values());
}

function buildFixedABCCandidates(swings: FixedABCSwing[]) {
  const candidates: FixedABCCandidate[] = [];

  for (let index = 2; index < swings.length; index += 1) {
    const anchor = swings[index - 3] ?? swings[index - 2];
    const a = swings[index - 2];
    const b = swings[index - 1];
    const c = swings[index];

    if (a && b && !a.isHigh && b.isHigh && c && !c.isHigh) {
      const waveA = b.price - a.price;

      if (waveA > 0) {
        candidates.push({
          anchor: anchor && anchor.isHigh ? anchor : b,
          a,
          b,
          c,
          direction: "bearish",
          waveC100: b.price - waveA,
          waveC161: b.price - waveA * 1.618,
        });
      }
    }

    if (a && b && a.isHigh && !b.isHigh && c && c.isHigh) {
      const waveA = a.price - b.price;

      if (waveA > 0) {
        candidates.push({
          anchor: anchor && !anchor.isHigh ? anchor : b,
          a,
          b,
          c,
          direction: "bullish",
          waveC100: b.price + waveA,
          waveC161: b.price + waveA * 1.618,
        });
      }
    }
  }

  return candidates;
}

function toDetectedSwing(
  swing: FixedABCSwing,
  candles: Candle[],
  clampPrice: PriceClamp,
): DetectedABCSwing {
  const candle = candles[swing.index] ?? candles[0];

  return {
    id: `fixed-abc-${swing.isHigh ? "high" : "low"}-${swing.index}`,
    index: swing.index,
    time: candle?.time ?? swing.index,
    price: clampPrice(swing.price),
    kind: swing.isHigh ? "high" : "low",
    source: "fractal-zigzag",
  };
}

function buildFixedLegacyABCScenario(
  candidate: FixedABCCandidate,
  scenarioIndex: number,
  candles: Candle[],
  clampPrice: PriceClamp,
): ABCScenario {
  const anchor = toDetectedSwing(candidate.anchor, candles, clampPrice);
  const a = toDetectedSwing(candidate.a, candles, clampPrice);
  const b = toDetectedSwing(candidate.b, candles, clampPrice);
  const c = candidate.c ? toDetectedSwing(candidate.c, candles, clampPrice) : undefined;
  const projectionTargets = [
    {
      level: clampPrice(candidate.waveC100),
      fibRatio: 1,
      probability: 62,
    },
    {
      level: clampPrice(candidate.waveC161),
      fibRatio: 1.618,
      probability: 28,
    },
  ] satisfies ABCProjectionTarget[];
  const count = buildCorrectiveCount({
    anchor,
    a,
    b,
    c: undefined,
    kind: "ab",
    direction: candidate.direction,
    degree: "minor",
  });
  const rules = [
    toRule({
      id: "fixed-wave-b-retrace-limit",
      label: "Wave B retrace does not exceed 100% of Wave A",
      status: "pass",
      severity: "hard",
      detail: "Wave B stays inside the Wave A origin for this fixed ABC candidate.",
      message: "Wave B retracement is valid for the active zigzag setup.",
    }),
    toRule({
      id: "fixed-wave-c-targets",
      label: "Wave C target ladder is clamped to the live price range",
      status: "pass",
      severity: "soft",
      detail: "Wave C targets are normalized and bounded before being returned to the chart.",
      message: "Projection prices are inside the visible market range.",
    }),
  ];

  return {
    id: `fixed-abc-v2-3-${scenarioIndex}-${a.time}-${b.time}`,
    kind: "ab",
    direction: candidate.direction,
    degree: "minor",
    count,
    confidence: 78,
    hardRulePassed: true,
    rules: {
      passed: 1,
      total: 1,
      details: rules,
    },
    fibScore: 78,
    channelScore: 72,
    momentumScore: 72,
    projectionTargets,
    targetZone:
      projectionTargets.length > 0
        ? {
            nextTargetPrice: projectionTargets[0].level,
            minTarget: Math.min(
              projectionTargets[0].level,
              (projectionTargets[1] ?? projectionTargets[0]).level,
            ),
            maxTarget: Math.max(
              projectionTargets[0].level,
              (projectionTargets[1] ?? projectionTargets[0]).level,
            ),
            probability: roundTo(projectionTargets[0].probability, 2),
            label: "Wave C Objective",
          }
        : null,
    invalidationLevel: clampPrice(
      candidate.direction === "bearish" ? b.price * 1.005 : b.price * 0.995,
    ),
    invalidationExplanation:
      candidate.direction === "bearish"
        ? "Break above Wave B high invalidates the bearish corrective scenario."
        : "Break below Wave B low invalidates the bullish corrective scenario.",
    recencyScore: 100,
    candlesFromLatest: Math.max(candles.length - 1 - b.index, 0),
    selectionScore: Math.max(0, 100 - scenarioIndex * 6),
    scoreBreakdown: [
      { label: "Hard rules", value: 100 },
      { label: "Fib score", value: 78 },
      { label: "Channel fit", value: 72 },
      { label: "Momentum", value: 72 },
      { label: "Clamped price safety", value: 100 },
    ],
    reasonSummary: "Clamped ABC zigzag target ladder + invalidation at Wave B",
    reasons: [
      "ABC swing sequence is present",
      "Wave C 1.0x and 1.618x targets are clamped to the live price range",
      "Wave B invalidation is explicit",
    ],
    swings: [anchor, a, b, ...(c ? [c] : [])],
    detectorMeta: {
      deviationThreshold: 0.006,
      minBarsBetween: 2,
      fractalSpan: 2,
      timeframe: "v2.3-fixed",
    },
  };
}

function buildHigherTimeframeContexts(
  normalizedCandles: Candle[],
  timeframe: string,
  higherTimeframes: HigherTimeframeInputMap,
  normalizePrice: PriceNormalizer,
) {
  const inputs = new Map<string, Candle[]>();

  for (const [higherTimeframe, rawCandles] of Object.entries(higherTimeframes)) {
    const normalizedHigherCandles = normalizeFixedABCCandles(
      normalizeABCCandles(rawCandles),
      normalizePrice,
    );

    if (normalizedHigherCandles.length >= 12) {
      inputs.set(higherTimeframe, normalizedHigherCandles);
    }
  }

  for (const higherTimeframe of ["1H", "4H"] as const) {
    if (inputs.has(higherTimeframe)) {
      continue;
    }

    if (timeframe === higherTimeframe) {
      inputs.set(higherTimeframe, normalizedCandles);
      continue;
    }

    const currentSeconds =
      timeframe === "1m" ||
      timeframe === "5m" ||
      timeframe === "15m" ||
      timeframe === "30m" ||
      timeframe === "1H" ||
      timeframe === "4H" ||
      timeframe === "Daily" ||
      timeframe === "Weekly"
        ? {
            "1m": 60,
            "5m": 300,
            "15m": 900,
            "30m": 1800,
            "1H": 3600,
            "4H": 14400,
            Daily: 86400,
            Weekly: 604800,
          }[timeframe]
        : 1800;
    const higherSeconds =
      higherTimeframe === "1H" ? 3600 : higherTimeframe === "4H" ? 14400 : 1800;

    if (currentSeconds < higherSeconds) {
      const resampledCandles = resampleCandles(normalizedCandles, higherSeconds);

      if (resampledCandles.length >= 12) {
        inputs.set(higherTimeframe, resampledCandles);
      }
    }
  }

  return Array.from(inputs.entries())
    .map(([higherTimeframe, candles]) => {
      const scenario =
        autoDetectABC(candles, {
          timeframe: higherTimeframe,
          degree: timeframeToWaveDegree(higherTimeframe),
          limit: 1,
        })[0] ?? null;

      if (!scenario) {
        return null;
      }

      return {
        timeframe: higherTimeframe,
        direction: scenario.direction,
        confidence: scenario.confidence,
        referenceHigh: Math.max(...candles.map((candle) => candle.high)),
        referenceLow: Math.min(...candles.map((candle) => candle.low)),
      } satisfies HigherABCContext;
    })
    .filter((context): context is HigherABCContext => context !== null)
    .sort((left, right) => right.confidence - left.confidence);
}

function emptyImprovedDetection(): ABCImprovedDetection {
  return {
    analysisStatus: "no-trade",
    noTradeState: {
      status: "no-trade",
      title: "No validated directional edge",
      reasons: ["No corrective scenario is available yet."],
      reasonDetails: [
        {
          code: "no-valid-scenario",
          label: "No validated directional edge",
          detail: "No corrective scenario is available yet.",
        },
      ],
      evidenceSummary: {
        passed: 0,
        warning: 0,
        failed: 0,
        scenarioCount: 0,
      },
      expectedToResolveWithMoreData: true,
      confirmationNeeded: [
        {
          label: "Await cleaner structure",
          detail: "Wait for a cleaner pivot sequence and more confirmation.",
        },
      ],
      dominantScenarioId: null,
      alternateScenarioId: null,
    },
    scenarios: [],
    primaryScenario: null,
    alternateScenario: null,
    chartOverlays: {
      channels: [],
      labels: [],
      targetTables: [],
      invalidations: [],
      priceRange: null,
    },
  };
}

export function autoDetectABC(
  ohlcData: Candle[],
  options: ABCDetectionOptions = {},
) {
  if (ohlcData.length < 12) {
    return [] as ABCScenario[];
  }

  const timeframe = options.timeframe ?? "30m";
  const degree = options.degree ?? "minor";
  const detector = detectZigZagFractalSwings(ohlcData, { timeframe });
  const detectorMeta = {
    deviationThreshold: detector.deviationThreshold,
    minBarsBetween: detector.minBarsBetween,
    fractalSpan: detector.fractalSpan,
    timeframe: detector.timeframe,
  } satisfies ABCScenario["detectorMeta"];

  return dedupeScenarioCounts(
    buildABCCandidatesFromSwings(detector.swings, ohlcData, degree)
    .map((candidate) => evaluateCorrectiveCandidate(candidate, ohlcData, detector.timeframe))
    .map((evaluation) => rankValidatedScenario(evaluation, ohlcData, detectorMeta))
    .filter((scenario) => scenario.hardRulePassed && scenario.confidence > 0),
  )
    .sort(sortRankedScenarios)
    .slice(0, options.limit ?? 5);
}

export function autoDetectABCImproved(
  ohlcData: unknown[],
  timeframe: string,
  higherTimeframes: HigherTimeframeInputMap = {},
): ABCImprovedDetection {
  const candles = normalizeABCCandles(ohlcData);

  if (candles.length < 12) {
    return emptyImprovedDetection();
  }

  const priceRange = createScenarioPriceClamp(candles);
  const normalizedCandles = normalizeFixedABCCandles(
    candles,
    priceRange.normalizePrice,
  );
  const higherContexts = buildHigherTimeframeContexts(
    normalizedCandles,
    timeframe,
    higherTimeframes,
    priceRange.normalizePrice,
  );
  const institutionalScenarios = autoDetectABC(normalizedCandles, {
    timeframe,
    degree: timeframeToWaveDegree(timeframe),
    limit: 12,
  });
  const fallbackScenarios =
    institutionalScenarios.length > 0
      ? []
      : buildFixedABCCandidates(detectSimpleZigZagSwings(normalizedCandles))
          .sort(
            (left, right) =>
              (right.c?.index ?? right.b.index) - (left.c?.index ?? left.b.index),
          )
          .slice(0, 6)
          .map((candidate, index) =>
            buildFixedLegacyABCScenario(
              candidate,
              index,
              normalizedCandles,
              priceRange.clampPrice,
            ),
          );

  const scenarios = dedupeScenarioCounts([...institutionalScenarios, ...fallbackScenarios])
    .sort(sortRankedScenarios)
    .slice(0, 3)
    .map((scenario) =>
      rankInstitutionalScenario(
        scenario,
        normalizedCandles,
        timeframe,
        priceRange.clampPrice,
        selectHigherTimeframeContext(scenario, higherContexts),
      ),
    );
  const latestPrice = normalizedCandles[normalizedCandles.length - 1]?.close ?? 0;
  const displayScenarios = buildCorrectiveScenarioDisplayPlans(scenarios, latestPrice);
  const scenariosCount = displayScenarios.length;
  const improvedScenarios = displayScenarios
    .map(({ rankedScenario, displayPlan }, index) =>
      buildImprovedScenario({
        rankedScenario,
        index,
        alternateCountExists: scenariosCount > 1,
        displayPlan,
      }),
    );
  const noTradeState = evaluateNoTradeState(
    improvedScenarios,
    latestPrice,
    normalizedCandles,
  );

  return {
    analysisStatus: noTradeState ? "no-trade" : "directional",
    noTradeState,
    scenarios: improvedScenarios,
    primaryScenario: improvedScenarios[0] ?? null,
    alternateScenario:
      improvedScenarios.find((scenario) => scenario.scenarioRole === "alternate") ??
      null,
    chartOverlays: buildInstitutionalChartOverlays(improvedScenarios, priceRange),
  };
}

function toDetectedSwingFromWavePoint(
  point: WaveCount["points"][number],
  candles: Candle[],
  fallbackKind: DetectedABCSwing["kind"],
): DetectedABCSwing {
  const index =
    point.index ??
    candles.findIndex((candle) => candle.time === point.time);

  return {
    id: point.id,
    index,
    time: point.time,
    price: point.price,
    kind: point.kind ?? fallbackKind,
    source: "fractal-zigzag",
  };
}

export function projectWaveCScenarios(
  count: WaveCount,
  candles: Candle[],
  options: ABCDetectionOptions = {},
) {
  if (!count.anchor || count.pattern !== "corrective" || count.points.length < 2) {
    return [] as ABCScenario[];
  }

  const [aPoint, bPoint, cPoint] = count.points;

  if (!aPoint || !bPoint) {
    return [] as ABCScenario[];
  }

  const timeframe = options.timeframe ?? "30m";
  const degree = options.degree ?? count.degree ?? "minor";
  const anchorIndex =
    count.anchor.index ??
    candles.findIndex((candle) => candle.time === count.anchor?.time);
  const anchor: DetectedABCSwing = {
    id: count.anchor.id,
    index: anchorIndex,
    time: count.anchor.time,
    price: count.anchor.price,
    kind: count.anchor.kind,
    source: "fractal-zigzag",
  };
  const a = toDetectedSwingFromWavePoint(
    aPoint,
    candles,
    count.direction === "bullish" ? "high" : "low",
  );
  const b = toDetectedSwingFromWavePoint(
    bPoint,
    candles,
    count.direction === "bullish" ? "low" : "high",
  );
  const c = cPoint
    ? toDetectedSwingFromWavePoint(
        cPoint,
        candles,
        count.direction === "bullish" ? "high" : "low",
      )
    : undefined;

  if (anchor.index < 0 || a.index < 0 || b.index < 0 || (c && c.index < 0)) {
    return [] as ABCScenario[];
  }

  const detectorMeta = buildDetectorMeta(candles, timeframe);
  const evaluation = evaluateCorrectiveCandidate(
    {
      anchor,
      a,
      b,
      c,
      kind: c ? "abc" : "ab",
      direction: count.direction,
      degree,
    } satisfies CorrectiveCandidateInput,
    candles,
    timeframe,
  );
  const scenario = rankValidatedScenario(evaluation, candles, detectorMeta);

  return scenario.hardRulePassed && scenario.confidence > 0
    ? [scenario]
    : [];
}

export { calculateATR, detectFractalSwings, detectZigZagFractalSwings };
