import type { Candle } from "../market-types";

import { getTimeframeConfig } from "./shared.ts";
import type { DetectedABCSwing, PivotDetectionResult } from "./types.ts";

export function calculateATR(candles: Candle[], period = 14) {
  if (candles.length === 0) {
    return 0;
  }

  const trueRanges: number[] = [];

  for (let index = 0; index < candles.length; index += 1) {
    const candle = candles[index];
    const previousClose = candles[index - 1]?.close ?? candle.close;
    trueRanges.push(
      Math.max(
        candle.high - candle.low,
        Math.abs(candle.high - previousClose),
        Math.abs(candle.low - previousClose),
      ),
    );
  }

  const window = trueRanges.slice(-period);
  return window.length === 0
    ? 0
    : window.reduce((sum, value) => sum + value, 0) / window.length;
}

export function detectFractalSwings(candles: Candle[], span = 2) {
  const pivots: DetectedABCSwing[] = [];

  for (let index = span; index < candles.length - span; index += 1) {
    const candle = candles[index];
    let isHigh = true;
    let isLow = true;

    for (let offset = 1; offset <= span; offset += 1) {
      const left = candles[index - offset];
      const right = candles[index + offset];

      if (!left || !right) {
        isHigh = false;
        isLow = false;
        break;
      }

      if (candle.high < left.high || candle.high < right.high) {
        isHigh = false;
      }

      if (candle.low > left.low || candle.low > right.low) {
        isLow = false;
      }
    }

    if (isHigh) {
      pivots.push({
        id: `fractal-high-${candle.time}`,
        index,
        time: candle.time,
        price: candle.high,
        kind: "high",
        source: "fractal-zigzag",
      });
    }

    if (isLow) {
      pivots.push({
        id: `fractal-low-${candle.time}`,
        index,
        time: candle.time,
        price: candle.low,
        kind: "low",
        source: "fractal-zigzag",
      });
    }
  }

  return pivots.sort((left, right) => left.index - right.index);
}

function keepMoreExtreme(current: DetectedABCSwing, next: DetectedABCSwing) {
  if (current.kind !== next.kind) {
    return next;
  }

  return current.kind === "high"
    ? next.price >= current.price
      ? next
      : current
    : next.price <= current.price
      ? next
      : current;
}

export function detectZigZagFractalSwings(
  candles: Candle[],
  options: { timeframe?: string } = {},
): PivotDetectionResult {
  const timeframe = options.timeframe ?? "30m";
  const timeframeConfig = getTimeframeConfig(timeframe);
  const atr = calculateATR(candles, 14);
  const defaultDeviationThreshold = Math.max(
    atr * 0.42,
    (candles[candles.length - 1]?.close ?? candles[0]?.close ?? 1) *
      timeframeConfig.moveRatio,
  );

  const buildSwings = (fractalSpan: number, deviationThreshold: number) => {
    const rawPivots = detectFractalSwings(candles, fractalSpan);
    const swings: DetectedABCSwing[] = [];

    for (const pivot of rawPivots) {
      const previous = swings[swings.length - 1];

      if (!previous) {
        swings.push(pivot);
        continue;
      }

      if (previous.kind === pivot.kind) {
        swings[swings.length - 1] = keepMoreExtreme(previous, pivot);
        continue;
      }

      if (pivot.index - previous.index < timeframeConfig.minBarsBetween) {
        continue;
      }

      if (Math.abs(pivot.price - previous.price) < deviationThreshold) {
        continue;
      }

      swings.push(pivot);
    }

    return swings.slice(-36);
  };

  let deviationThreshold = defaultDeviationThreshold;
  let fractalSpan = timeframeConfig.fractalSpan;
  let swings = buildSwings(fractalSpan, deviationThreshold);

  if (swings.length < 3) {
    fractalSpan = 1;
    deviationThreshold = Math.max(defaultDeviationThreshold * 0.72, atr * 0.24);
    swings = buildSwings(fractalSpan, deviationThreshold);
  }

  return {
    swings,
    deviationThreshold,
    minBarsBetween: timeframeConfig.minBarsBetween,
    fractalSpan,
    timeframe,
    atr,
  };
}

export type FixedABCSwing = {
  index: number;
  price: number;
  isHigh: boolean;
};

export function detectSimpleZigZagSwings(
  candles: Candle[],
  devThreshold = 0.006,
) {
  const swings: FixedABCSwing[] = [];

  for (let index = 2; index < candles.length - 2; index += 1) {
    const slice = candles.slice(index - 2, index + 3);
    const high = Math.max(...slice.map((candle) => candle.high));
    const low = Math.min(...slice.map((candle) => candle.low));
    const candle = candles[index];

    if (candle.high === high && candle.high - low > devThreshold * candle.close) {
      swings.push({ index, price: candle.high, isHigh: true });
    } else if (
      candle.low === low &&
      high - candle.low > devThreshold * candle.close
    ) {
      swings.push({ index, price: candle.low, isHigh: false });
    }
  }

  return swings;
}
