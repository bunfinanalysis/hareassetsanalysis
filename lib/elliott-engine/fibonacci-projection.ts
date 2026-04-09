import type {
  ABCProjectionTarget,
  ABCProjectionZone,
  FibProjectionInput,
  FibRelationship,
} from "./types.ts";
import {
  B_RETRACE_TARGETS,
  C_TARGETS,
  average,
  clamp,
  roundTo,
  scoreNearestTarget,
} from "./shared.ts";

export function calculateFibConfluenceScore(input: FibProjectionInput) {
  return roundTo(
    average([
      scoreNearestTarget(input.waveBToARatio, B_RETRACE_TARGETS, 0.06, 0.32),
      input.candidate.kind === "abc"
        ? scoreNearestTarget(input.waveCToARatio, C_TARGETS, 0.1, 0.45)
        : 60,
      input.candidate.kind === "abc" &&
      typeof input.cStructure.wave2Retracement === "number"
        ? scoreNearestTarget(
            input.cStructure.wave2Retracement,
            [0.5, 0.618],
            0.08,
            0.3,
          )
        : 54,
    ]),
    2,
  );
}

export function buildProjectionTargets(
  input: FibProjectionInput,
  fibScore: number,
  channelScore: number,
) {
  const directionMultiplier = input.candidate.direction === "bullish" ? 1 : -1;
  const waveALength = Math.abs(
    input.candidate.a.price - input.candidate.anchor.price,
  );
  const waveBToARatio =
    waveALength > 0
      ? Math.abs(input.candidate.a.price - input.candidate.b.price) / waveALength
      : 0;

  return [...C_TARGETS]
    .map<ABCProjectionTarget>((fibRatio) => {
      let probability =
        fibRatio === 1
          ? 76
          : fibRatio === 1.236
            ? 70
            : fibRatio === 1.618
              ? 66
              : 58;

      if (waveBToARatio <= 0.55) {
        if (fibRatio === 1.236 || fibRatio === 1.618) {
          probability += 9;
        }
      } else if (waveBToARatio <= 0.72) {
        if (fibRatio === 1 || fibRatio === 1.236) {
          probability += 10;
        }
      } else if (fibRatio === 0.618 || fibRatio === 1) {
        probability += 9;
      }

      probability += fibScore >= 75 ? 4 : fibScore >= 60 ? 2 : 0;
      probability += channelScore >= 70 ? 3 : 0;

      return {
        level: roundTo(
          input.candidate.b.price + directionMultiplier * waveALength * fibRatio,
          4,
        ),
        fibRatio,
        probability: roundTo(clamp(probability, 0, 100), 2),
      };
    })
    .sort((left, right) => right.probability - left.probability);
}

export function buildTargetZone(targets: ABCProjectionTarget[]) {
  if (targets.length === 0) {
    return null;
  }

  const primary = targets[0];
  const secondary = targets[1] ?? targets[0];

  return {
    nextTargetPrice: primary.level,
    minTarget: Math.min(primary.level, secondary.level),
    maxTarget: Math.max(primary.level, secondary.level),
    probability: roundTo(primary.probability, 2),
    label: "Wave C Objective",
  } satisfies ABCProjectionZone;
}

export function buildFibRelationships(
  waveBToARatio: number | undefined,
  targets: Array<{ price: number; fibRatio: number }>,
) {
  const relationships: FibRelationship[] = [];

  if (typeof waveBToARatio === "number" && Number.isFinite(waveBToARatio)) {
    relationships.push({
      kind: "b-retrace",
      ratio: waveBToARatio,
    });
  }

  for (const target of targets) {
    relationships.push({
      kind: "c-target",
      ratio: target.fibRatio,
      price: target.price,
    });
  }

  return relationships;
}
