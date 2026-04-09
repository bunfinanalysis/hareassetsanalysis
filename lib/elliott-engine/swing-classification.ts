import type { Candle } from "../market-types";

import { getTimeframeConfig } from "./shared.ts";
import { calculateATR, detectFractalSwings } from "./pivot-detection.ts";
import type {
  DetectedABCSwing,
  SegmentPivot,
  SwingLeg,
} from "./types.ts";

export function buildSwingLegs(swings: DetectedABCSwing[]): SwingLeg[] {
  return swings.slice(1).map((end, index) => {
    const start = swings[index];
    const previous = index > 0 ? swings[index - 1] : null;
    const priceChange = end.price - start.price;
    const percentChange =
      start.price !== 0 ? (priceChange / start.price) * 100 : 0;
    const durationBars = Math.max(end.index - start.index, 0);
    const durationSeconds = Math.max(end.time - start.time, 0);
    const momentumProxy =
      durationBars > 0 ? Math.abs(priceChange) / durationBars : Math.abs(priceChange);
    const overlapWithPrevious = previous
      ? start.kind === "high"
        ? start.price <= previous.price
        : start.price >= previous.price
      : false;

    return {
      id: `${start.id}-${end.id}`,
      start,
      end,
      direction: priceChange >= 0 ? "bullish" : "bearish",
      priceChange,
      percentChange,
      durationBars,
      durationSeconds,
      overlapWithPrevious,
      momentumProxy,
    };
  });
}

export function inferAnchorSwing(
  firstSwing: DetectedABCSwing,
  direction: "bullish" | "bearish",
  candles: Candle[],
) {
  const startIndex = Math.max(0, firstSwing.index - 48);
  const windowCandles = candles.slice(startIndex, firstSwing.index + 1);

  if (windowCandles.length === 0) {
    return null;
  }

  if (direction === "bullish") {
    const anchorCandle = windowCandles.reduce((lowest, candle) =>
      candle.low < lowest.low ? candle : lowest,
    );

    return {
      id: `abc-auto-anchor-${anchorCandle.time}`,
      index: candles.findIndex((candle) => candle.time === anchorCandle.time),
      time: anchorCandle.time,
      price: anchorCandle.low,
      kind: "low",
      source: "fractal-zigzag",
    } satisfies DetectedABCSwing;
  }

  const anchorCandle = windowCandles.reduce((highest, candle) =>
    candle.high > highest.high ? candle : highest,
  );

  return {
    id: `abc-auto-anchor-${anchorCandle.time}`,
    index: candles.findIndex((candle) => candle.time === anchorCandle.time),
    time: anchorCandle.time,
    price: anchorCandle.high,
    kind: "high",
    source: "fractal-zigzag",
  } satisfies DetectedABCSwing;
}

export function buildSegmentPivots(
  start: DetectedABCSwing,
  end: DetectedABCSwing,
  candles: Candle[],
  timeframe: string,
) {
  if (start.index >= end.index) {
    return [] as SegmentPivot[];
  }

  const atr = calculateATR(candles.slice(start.index, end.index + 1), 14);
  const minMove = Math.max(
    atr * 0.18,
    Math.abs(end.price - start.price) * 0.05,
    (candles[end.index]?.close ?? end.price) *
      getTimeframeConfig(timeframe).moveRatio *
      0.7,
  );
  const minBarsBetween = Math.max(
    1,
    Math.floor(getTimeframeConfig(timeframe).minBarsBetween / 2),
  );
  const segmentCandles = candles.slice(start.index, end.index + 1);
  const fractalPivots = detectFractalSwings(segmentCandles, 1).map((pivot) => ({
    index: start.index + pivot.index,
    time: pivot.time,
    price: pivot.price,
    kind: pivot.kind,
  }));
  const pivots: SegmentPivot[] = [
    {
      index: start.index,
      time: start.time,
      price: start.price,
      kind: start.kind,
    },
    ...fractalPivots.filter(
      (pivot) => pivot.index > start.index && pivot.index < end.index,
    ),
    {
      index: end.index,
      time: end.time,
      price: end.price,
      kind: end.kind,
    },
  ].sort((left, right) => left.index - right.index);

  const compressed: SegmentPivot[] = [];

  for (const pivot of pivots) {
    const previous = compressed[compressed.length - 1];

    if (!previous) {
      compressed.push(pivot);
      continue;
    }

    if (previous.kind === pivot.kind) {
      compressed[compressed.length - 1] =
        previous.kind === "high"
          ? pivot.price >= previous.price
            ? pivot
            : previous
          : pivot.price <= previous.price
            ? pivot
            : previous;
      continue;
    }

    if (pivot.index - previous.index < minBarsBetween) {
      continue;
    }

    if (Math.abs(pivot.price - previous.price) < minMove) {
      continue;
    }

    compressed.push(pivot);
  }

  return compressed;
}
