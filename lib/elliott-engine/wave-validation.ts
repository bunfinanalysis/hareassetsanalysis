import type { Candle } from "../market-types";
import type { WaveCount, WavePoint } from "../elliottWaveUtils";

import { scoreNearestTarget, toRule, average, clamp, roundTo } from "./shared.ts";
import { buildSegmentPivots, inferAnchorSwing } from "./swing-classification.ts";
import type {
  ABCScenarioRule,
  CorrectiveCandidateEvaluation,
  CorrectiveCandidateInput,
  DetectedABCSwing,
  SegmentPivot,
  StructureType,
  SubwaveAnalysis,
} from "./types.ts";

function buildWavePoint(
  swing: DetectedABCSwing,
  label: "A" | "B" | "C",
  degree: CorrectiveCandidateInput["degree"],
): WavePoint {
  return {
    id: `abc-${label}-${swing.time}`,
    label,
    price: swing.price,
    time: swing.time,
    degree,
    source: "auto",
    index: swing.index,
    kind: swing.kind,
  };
}

export function buildCorrectiveCount(
  candidate: CorrectiveCandidateInput,
): WaveCount {
  const points = [
    buildWavePoint(candidate.a, "A", candidate.degree),
    buildWavePoint(candidate.b, "B", candidate.degree),
    ...(candidate.c ? [buildWavePoint(candidate.c, "C", candidate.degree)] : []),
  ];

  return {
    pattern: "corrective",
    direction: candidate.direction,
    degree: candidate.degree,
    source: "auto",
    anchor: {
      id: `abc-anchor-${candidate.anchor.time}`,
      price: candidate.anchor.price,
      time: candidate.anchor.time,
      kind: candidate.anchor.kind,
      index: candidate.anchor.index,
    },
    points,
  };
}

export function buildABCCandidatesFromSwings(
  swings: DetectedABCSwing[],
  candles: Candle[],
  degree: CorrectiveCandidateInput["degree"],
) {
  const candidates: CorrectiveCandidateInput[] = [];

  for (let index = 0; index <= swings.length - 2; index += 1) {
    const a = swings[index];
    const b = swings[index + 1];
    const c = swings[index + 2];

    if (a.kind === "high" && b.kind === "low") {
      const anchor = inferAnchorSwing(a, "bullish", candles);

      if (anchor && a.price > anchor.price && b.price > anchor.price) {
        candidates.push({
          anchor,
          a,
          b,
          direction: "bullish",
          degree,
          kind: "ab",
        });

        if (c && c.kind === "high" && c.price > b.price) {
          candidates.push({
            anchor,
            a,
            b,
            c,
            direction: "bullish",
            degree,
            kind: "abc",
          });
        }
      }
    }

    if (a.kind === "low" && b.kind === "high") {
      const anchor = inferAnchorSwing(a, "bearish", candles);

      if (anchor && a.price < anchor.price && b.price < anchor.price) {
        candidates.push({
          anchor,
          a,
          b,
          direction: "bearish",
          degree,
          kind: "ab",
        });

        if (c && c.kind === "low" && c.price < b.price) {
          candidates.push({
            anchor,
            a,
            b,
            c,
            direction: "bearish",
            degree,
            kind: "abc",
          });
        }
      }
    }
  }

  return candidates;
}

function findBestSubwaveSequence(
  pivots: SegmentPivot[],
  direction: CorrectiveCandidateInput["direction"],
  allowDiagonal: boolean,
) {
  if (pivots.length < 6) {
    return null;
  }

  const [start, end] = [pivots[0], pivots[pivots.length - 1]];
  const expectedInternalKinds =
    direction === "bullish"
      ? (["high", "low", "high", "low"] as const)
      : (["low", "high", "low", "high"] as const);
  const internal = pivots.slice(1, -1);
  let best:
    | {
        sequence: SegmentPivot[];
        score: number;
        wave2Retracement: number;
        wave3ToWave1Ratio: number;
        wave4Retracement: number;
        wave3Shortest: boolean;
        wave4Overlap: boolean;
        structure: StructureType;
      }
    | null = null;

  for (let i = 0; i < internal.length; i += 1) {
    if (internal[i].kind !== expectedInternalKinds[0]) {
      continue;
    }

    for (let j = i + 1; j < internal.length; j += 1) {
      if (internal[j].kind !== expectedInternalKinds[1]) {
        continue;
      }

      for (let k = j + 1; k < internal.length; k += 1) {
        if (internal[k].kind !== expectedInternalKinds[2]) {
          continue;
        }

        for (let l = k + 1; l < internal.length; l += 1) {
          if (internal[l].kind !== expectedInternalKinds[3]) {
            continue;
          }

          const sequence = [start, internal[i], internal[j], internal[k], internal[l], end];
          const multiplier = direction === "bullish" ? 1 : -1;
          const wave1Length = (sequence[1].price - sequence[0].price) * multiplier;
          const wave2Length = (sequence[1].price - sequence[2].price) * multiplier;
          const wave3Length = (sequence[3].price - sequence[2].price) * multiplier;
          const wave4Length = (sequence[3].price - sequence[4].price) * multiplier;
          const wave5Length = (sequence[5].price - sequence[4].price) * multiplier;

          if (
            wave1Length <= 0 ||
            wave2Length <= 0 ||
            wave3Length <= 0 ||
            wave4Length <= 0 ||
            wave5Length <= 0
          ) {
            continue;
          }

          const wave2Retracement = wave2Length / wave1Length;
          const wave3ToWave1Ratio = wave3Length / wave1Length;
          const wave4Retracement = wave4Length / wave3Length;
          const wave4Overlap =
            direction === "bullish"
              ? sequence[4].price <= sequence[1].price
              : sequence[4].price >= sequence[1].price;
          const wave3Shortest = wave3Length <= Math.min(wave1Length, wave5Length);
          const diagonalCandidate =
            wave4Overlap &&
            wave2Retracement <= 1 &&
            !wave3Shortest &&
            wave4Retracement <= 0.886;
          const structure =
            wave4Overlap && allowDiagonal
              ? diagonalCandidate
                ? "leading-diagonal"
                : "invalid"
              : wave4Overlap
                ? "invalid"
                : "impulse";

          if (structure === "invalid") {
            continue;
          }

          const fibScore = average([
            scoreNearestTarget(wave2Retracement, [0.5, 0.618], 0.08, 0.34),
            scoreNearestTarget(wave3ToWave1Ratio, [1.618, 2, 2.618], 0.18, 0.95),
            scoreNearestTarget(wave4Retracement, [0.236, 0.382, 0.5], 0.08, 0.32),
          ]);
          const barBalance =
            100 -
            average([
              Math.abs(
                (sequence[1].index - sequence[0].index) -
                  (sequence[3].index - sequence[2].index),
              ),
              Math.abs(
                (sequence[3].index - sequence[2].index) -
                  (sequence[5].index - sequence[4].index),
              ),
            ]) *
              2;
          const score = fibScore * 0.75 + clamp(barBalance, 0, 100) * 0.25;

          if (!best || score > best.score) {
            best = {
              sequence,
              score: roundTo(score, 2),
              wave2Retracement,
              wave3ToWave1Ratio,
              wave4Retracement,
              wave3Shortest,
              wave4Overlap,
              structure,
            };
          }
        }
      }
    }
  }

  return best;
}

export function detectFiveWaveStructure(
  start: DetectedABCSwing,
  end: DetectedABCSwing,
  candles: Candle[],
  direction: CorrectiveCandidateInput["direction"],
  timeframe: string,
  allowDiagonal: boolean,
): SubwaveAnalysis {
  const pivots = buildSegmentPivots(start, end, candles, timeframe);
  const best = findBestSubwaveSequence(pivots, direction, allowDiagonal);

  if (!best) {
    return {
      valid: false,
      structure: "invalid",
      sequence: null,
    };
  }

  return {
    valid: true,
    structure:
      best.structure === "leading-diagonal" && end.kind === start.kind
        ? "ending-diagonal"
        : best.structure,
    sequence: best.sequence,
    wave2Retracement: roundTo(best.wave2Retracement, 4),
    wave3ToWave1Ratio: roundTo(best.wave3ToWave1Ratio, 4),
    wave4Retracement: roundTo(best.wave4Retracement, 4),
    wave3Shortest: best.wave3Shortest,
    wave4Overlap: best.wave4Overlap,
  };
}

export function evaluateCorrectiveCandidate(
  candidate: CorrectiveCandidateInput,
  candles: Candle[],
  timeframe: string,
) {
  const count = buildCorrectiveCount(candidate);
  const aStructure = detectFiveWaveStructure(
    candidate.anchor,
    candidate.a,
    candles,
    candidate.direction,
    timeframe,
    true,
  );
  const cStructure =
    candidate.kind === "abc" && candidate.c
      ? detectFiveWaveStructure(
          candidate.b,
          candidate.c,
          candles,
          candidate.direction,
          timeframe,
          true,
        )
      : {
          valid: false,
          structure: "invalid" as const,
          sequence: null,
        };
  const waveALength = Math.abs(candidate.a.price - candidate.anchor.price);
  const waveBToARatio =
    waveALength > 0 ? Math.abs(candidate.a.price - candidate.b.price) / waveALength : undefined;
  const waveCToARatio =
    candidate.kind === "abc" && candidate.c && waveALength > 0
      ? Math.abs(candidate.c.price - candidate.b.price) / waveALength
      : undefined;
  const hardRules: ABCScenarioRule[] = [
    toRule({
      id: "wave-a-five",
      label: "Wave A is a 5-wave move",
      status: aStructure.valid ? "pass" : "fail",
      severity: "hard",
      detail: "Wave A should be a 5-wave impulse or leading diagonal.",
      message: aStructure.valid
        ? `Wave A is classified as ${aStructure.structure.replace("-", " ")}.`
        : "Wave A does not resolve into a valid 5-wave actionary leg.",
    }),
    toRule({
      id: "wave-b-retrace-limit",
      label: "Wave B retrace does not exceed 100% of Wave A",
      status:
        typeof waveBToARatio === "number" && waveBToARatio <= 1
          ? "pass"
          : "fail",
      severity: "hard",
      detail:
        "Wave B must remain within the origin of Wave A for a zigzag candidate.",
      message:
        typeof waveBToARatio === "number" && waveBToARatio <= 1
          ? `Wave B retraces ${roundTo(waveBToARatio, 3)} of Wave A.`
          : "Wave B has retraced more than 100% of Wave A.",
      value: waveBToARatio,
      target: "<= 1.000",
    }),
  ];

  if (candidate.kind === "abc") {
    hardRules.push(
      toRule({
        id: "wave-c-five",
        label: "Wave C is a 5-wave move",
        status: cStructure.valid ? "pass" : "fail",
        severity: "hard",
        detail: "Wave C should resolve as a 5-wave impulse or ending diagonal.",
        message: cStructure.valid
          ? `Wave C is classified as ${cStructure.structure.replace("-", " ")}.`
          : "Wave C does not resolve into a valid 5-wave actionary leg.",
      }),
      toRule({
        id: "wave-c-overlap",
        label: "Wave 4 of C does not overlap Wave 1 of C",
        status:
          cStructure.valid &&
          (!cStructure.wave4Overlap || cStructure.structure === "ending-diagonal")
            ? "pass"
            : "fail",
        severity: "hard",
        detail:
          "Standard C-wave impulses avoid Wave 4 overlap; ending diagonals are the only accepted exception.",
        message:
          cStructure.valid && cStructure.wave4Overlap
            ? "Wave C overlaps like an ending diagonal, so the count stays valid under the diagonal exception."
            : cStructure.valid
              ? "Wave 4 of C stays outside Wave 1 territory."
              : "Wave C overlap cannot be validated because the subwaves are invalid.",
      }),
      toRule({
        id: "wave-c-wave3-shortest",
        label: "Wave 3 of C is not the shortest actionary sub-wave",
        status: cStructure.valid && !cStructure.wave3Shortest ? "pass" : "fail",
        severity: "hard",
        detail:
          "Wave 3 cannot be the shortest of 1, 3, and 5 within Wave C.",
        message:
          cStructure.valid && !cStructure.wave3Shortest
            ? "Wave 3 of C is not the shortest sub-wave."
            : "Wave 3 of C is the shortest sub-wave.",
      }),
    );
  } else {
    hardRules.push(
      toRule({
        id: "wave-c-pending",
        label: "Wave C structure is still pending",
        status: "pending",
        severity: "hard",
        detail:
          "Wave C hard rules become active once Wave C starts to unfold.",
        message:
          "Wave C is not complete yet, so the remaining hard rules stay pending.",
      }),
    );
  }

  const softRules: ABCScenarioRule[] = [
    toRule({
      id: "wave-b-fib",
      label: "Wave B retrace is near a preferred fib level",
      status:
        typeof waveBToARatio === "number"
          ? scoreNearestTarget(waveBToARatio, [0.5, 0.618, 0.786, 0.854], 0.06, 0.32) >= 72
            ? "pass"
            : scoreNearestTarget(waveBToARatio, [0.5, 0.618, 0.786, 0.854], 0.06, 0.32) >= 45
              ? "warning"
              : "fail"
          : "fail",
      severity: "soft",
      detail: "Wave B ideally retraces 50%, 61.8%, 78.6%, or 85.4% of Wave A.",
      message:
        typeof waveBToARatio === "number"
          ? `Wave B retraces ${roundTo(waveBToARatio, 3)} of Wave A.`
          : "Wave B retracement could not be measured.",
      value: waveBToARatio,
      target: "0.500 / 0.618 / 0.786 / 0.854",
    }),
  ];

  if (candidate.kind === "abc") {
    softRules.push(
      toRule({
        id: "wave-c-fib",
        label: "Wave C projects a preferred fib relationship",
        status:
          typeof waveCToARatio === "number"
            ? scoreNearestTarget(waveCToARatio, [0.618, 1, 1.236, 1.618], 0.1, 0.45) >= 72
              ? "pass"
              : scoreNearestTarget(waveCToARatio, [0.618, 1, 1.236, 1.618], 0.1, 0.45) >= 45
                ? "warning"
                : "fail"
            : "fail",
        severity: "soft",
        detail:
          "Wave C commonly reaches 61.8%, 100%, 123.6%, or 161.8% of Wave A.",
        message:
          typeof waveCToARatio === "number"
            ? `Wave C projects ${roundTo(waveCToARatio, 3)} of Wave A.`
            : "Wave C projection could not be measured.",
        value: waveCToARatio,
        target: "0.618 / 1.000 / 1.236 / 1.618",
      }),
    );

    softRules.push(
      toRule({
        id: "wave-c-wave2",
        label: "Wave (2) of C retraces the preferred zone",
        status:
          typeof cStructure.wave2Retracement === "number"
            ? scoreNearestTarget(cStructure.wave2Retracement, [0.5, 0.618], 0.08, 0.3) >= 70
              ? "pass"
              : scoreNearestTarget(cStructure.wave2Retracement, [0.5, 0.618], 0.08, 0.3) >= 40
                ? "warning"
                : "fail"
            : "warning",
        severity: "soft",
        detail:
          "Wave (2) of C often retraces 50% to 61.8% of Wave (1) of C.",
        message:
          typeof cStructure.wave2Retracement === "number"
            ? `Wave (2) of C retraces ${roundTo(cStructure.wave2Retracement, 3)} of Wave (1).`
            : "Wave (2) of C is not available yet.",
        value: cStructure.wave2Retracement,
        target: "0.500 - 0.618",
      }),
    );
  } else {
    softRules.push(
      toRule({
        id: "wave-c-fib-pending",
        label: "Wave C target ladder is prepared",
        status: "warning",
        severity: "soft",
        detail:
          "Wave C target quality will improve once price starts resolving away from Wave B.",
        message:
          "Wave C is still pending, so the target ladder is based on Wave A proportions only.",
      }),
    );
  }

  return {
    candidate,
    count,
    aStructure,
    cStructure,
    waveBToARatio,
    waveCToARatio,
    hardRules,
    softRules,
  } satisfies CorrectiveCandidateEvaluation;
}
