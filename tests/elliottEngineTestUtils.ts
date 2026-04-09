import { detectZigZagFractalSwings } from "../lib/elliott-engine/pivot-detection.ts";
import { buildABCCandidatesFromSwings } from "../lib/elliott-engine/wave-validation.ts";

export function createSyntheticCandles() {
  return [
    100, 102, 104, 103, 105, 107, 106, 109, 108, 110, 108, 106, 104, 106, 108, 107,
    110, 109, 112, 111, 114, 113,
  ].map((close, index) => ({
    time: index + 1,
    open: close - 0.2,
    high: close + 0.4,
    low: close - 0.4,
    close,
    volume: 100 + index * 8,
  }));
}

export function getFirstABCCandidate() {
  const candles = createSyntheticCandles();
  const detector = detectZigZagFractalSwings(candles, { timeframe: "30m" });
  const candidates = buildABCCandidatesFromSwings(detector.swings, candles, "minor");
  const candidate =
    candidates.find((entry) => entry.kind === "abc") ??
    candidates.find((entry) => entry.kind === "ab") ??
    null;

  return {
    candles,
    detector,
    candidate,
  };
}

