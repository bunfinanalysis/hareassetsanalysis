import type { Candle } from "../market-types";
import type {
  NormalizedScenarioPriceRange,
  PriceNormalizer,
  RuleFactoryInput,
} from "./types.ts";

export const B_RETRACE_TARGETS = [0.5, 0.618, 0.786, 0.854] as const;
export const C_TARGETS = [0.618, 1, 1.236, 1.618] as const;

export function toRecord(value: unknown) {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

export function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}

export function roundTo(value: number, decimals = 4) {
  return Number(value.toFixed(decimals));
}

export function formatPrice(value: number) {
  const decimals = Math.abs(value) >= 100 ? 2 : 3;
  return `$${value.toFixed(decimals)}`;
}

export function average(values: number[]) {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function scoreNearestTarget(
  value: number | undefined,
  targets: readonly number[],
  idealTolerance: number,
  maxTolerance: number,
) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return 0;
  }

  return Math.max(
    ...targets.map((target) => {
      const distance = Math.abs(value - target);

      if (distance <= idealTolerance) {
        return 100;
      }

      if (distance >= maxTolerance) {
        return 0;
      }

      return roundTo(
        ((maxTolerance - distance) /
          Math.max(maxTolerance - idealTolerance, 0.0001)) *
          100,
        2,
      );
    }),
  );
}

export function getTimeframeConfig(timeframe = "30m") {
  switch (timeframe) {
    case "1m":
      return { minBarsBetween: 2, fractalSpan: 1, moveRatio: 0.0009 };
    case "5m":
      return { minBarsBetween: 2, fractalSpan: 1, moveRatio: 0.0012 };
    case "15m":
      return { minBarsBetween: 2, fractalSpan: 2, moveRatio: 0.0017 };
    case "1H":
      return { minBarsBetween: 3, fractalSpan: 2, moveRatio: 0.0026 };
    case "4H":
      return { minBarsBetween: 3, fractalSpan: 2, moveRatio: 0.0038 };
    case "Daily":
      return { minBarsBetween: 4, fractalSpan: 2, moveRatio: 0.0052 };
    case "Weekly":
      return { minBarsBetween: 4, fractalSpan: 2, moveRatio: 0.0075 };
    case "30m":
    default:
      return { minBarsBetween: 2, fractalSpan: 2, moveRatio: 0.0021 };
  }
}

export function getTimeframeSeconds(timeframe: string) {
  switch (timeframe) {
    case "1m":
      return 60;
    case "5m":
      return 300;
    case "15m":
      return 900;
    case "30m":
      return 1800;
    case "1H":
      return 3600;
    case "4H":
      return 14400;
    case "Daily":
      return 86400;
    case "Weekly":
      return 604800;
    default:
      return 1800;
  }
}

export function normalizeABCCandles(ohlcData: unknown[]) {
  return ohlcData
    .map((entry, index) => {
      const record = toRecord(entry);
      const timeValue = record.time ?? record.timestamp ?? record.date ?? index + 1;
      const parsedTime =
        typeof timeValue === "number"
          ? timeValue > 1e12
            ? Math.floor(timeValue / 1000)
            : timeValue
          : Number.isFinite(Date.parse(String(timeValue)))
            ? Math.floor(Date.parse(String(timeValue)) / 1000)
            : index + 1;

      return {
        time: parsedTime,
        open: Number(record.open ?? record.o),
        high: Number(record.high ?? record.h),
        low: Number(record.low ?? record.l),
        close: Number(record.close ?? record.c),
        volume: Number(record.volume ?? record.v ?? 0),
      } satisfies Candle;
    })
    .filter(
      (candle) =>
        Number.isFinite(candle.time) &&
        Number.isFinite(candle.open) &&
        Number.isFinite(candle.high) &&
        Number.isFinite(candle.low) &&
        Number.isFinite(candle.close),
    )
    .sort((left, right) => left.time - right.time);
}

export function median(values: number[]) {
  const sortedValues = values
    .filter((value) => Number.isFinite(value))
    .sort((left, right) => left - right);

  if (sortedValues.length === 0) {
    return 0;
  }

  const middle = Math.floor(sortedValues.length / 2);

  return sortedValues.length % 2 === 0
    ? (sortedValues[middle - 1] + sortedValues[middle]) / 2
    : sortedValues[middle];
}

export function createScenarioPriceClamp(
  candles: Candle[],
): NormalizedScenarioPriceRange {
  const referencePrice = median(candles.map((candle) => candle.close));
  const shouldScaleThousands = referencePrice > 10000;
  const normalizePrice: PriceNormalizer = (price) => {
    if (!Number.isFinite(price)) {
      return 0;
    }

    let normalizedPrice = price;

    if (shouldScaleThousands || Math.abs(normalizedPrice) > 10000) {
      while (Math.abs(normalizedPrice) > 1000) {
        normalizedPrice /= 1000;
      }
    }

    return normalizedPrice;
  };
  const recentWindow = candles.slice(-80);
  const rangeCandles = recentWindow.length > 0 ? recentWindow : candles;
  const normalizedLows = rangeCandles
    .map((candle) => normalizePrice(candle.low))
    .filter((price) => Number.isFinite(price) && price > 0);
  const normalizedHighs = rangeCandles
    .map((candle) => normalizePrice(candle.high))
    .filter((price) => Number.isFinite(price) && price > 0);
  const dataLow = normalizedLows.length > 0 ? Math.min(...normalizedLows) : 0;
  const dataHigh =
    normalizedHighs.length > 0 ? Math.max(...normalizedHighs) : dataLow + 1;
  const normalizedReferencePrice = normalizePrice(referencePrice);
  const rangeSize = Math.max(
    dataHigh - dataLow,
    normalizedReferencePrice * 0.004,
    0.25,
  );
  const padding = Math.max(
    rangeSize * 0.1,
    normalizedReferencePrice * 0.0025,
    0.12,
  );
  const rawMinPrice = dataLow - padding;
  const rawMaxPrice = dataHigh + padding;
  const minPrice = Number.isFinite(rawMinPrice) ? rawMinPrice : 0;
  const maxPrice =
    Number.isFinite(rawMaxPrice) && rawMaxPrice > minPrice
      ? rawMaxPrice
      : minPrice + Math.max(rangeSize, 1);

  return {
    minPrice,
    maxPrice,
    dataLow,
    dataHigh,
    padding,
    normalizePrice,
    clampPrice: (price: number) => {
      const normalizedPrice = normalizePrice(price);

      return roundTo(
        Math.max(minPrice, Math.min(maxPrice, normalizedPrice || minPrice)),
        4,
      );
    },
  };
}

export function normalizeFixedABCCandles(
  candles: Candle[],
  normalizePrice: PriceNormalizer,
) {
  return candles.map((candle) => ({
    ...candle,
    open: normalizePrice(candle.open),
    high: normalizePrice(candle.high),
    low: normalizePrice(candle.low),
    close: normalizePrice(candle.close),
  }));
}

export function resampleCandles(candles: Candle[], bucketSeconds: number) {
  if (candles.length === 0) {
    return [] as Candle[];
  }

  const buckets = new Map<number, Candle>();

  for (const candle of candles) {
    const bucketTime =
      Math.floor(candle.time / bucketSeconds) * bucketSeconds;
    const currentCandle = buckets.get(bucketTime);

    if (!currentCandle) {
      buckets.set(bucketTime, { ...candle, time: bucketTime });
      continue;
    }

    buckets.set(bucketTime, {
      time: bucketTime,
      open: currentCandle.open,
      high: Math.max(currentCandle.high, candle.high),
      low: Math.min(currentCandle.low, candle.low),
      close: candle.close,
      volume: (currentCandle.volume ?? 0) + (candle.volume ?? 0),
    });
  }

  return Array.from(buckets.values()).sort(
    (left, right) => left.time - right.time,
  );
}

export function toRule(input: RuleFactoryInput) {
  return input;
}
