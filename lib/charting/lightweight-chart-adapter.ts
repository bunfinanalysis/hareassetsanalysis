import {
  type CandlestickData,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";

import { type Candle } from "../market-types.ts";

export function toLightweightCandlestickData(
  candles: Candle[],
): CandlestickData<Time>[] {
  return candles.map((candle) => ({
    time: candle.time as UTCTimestamp,
    open: candle.open,
    high: candle.high,
    low: candle.low,
    close: candle.close,
  }));
}
