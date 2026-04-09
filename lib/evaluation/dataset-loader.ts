import { readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";

import type { Candle } from "../market-types";
import { normalizeABCCandles } from "../elliott-engine/shared.ts";

import type { HistoricalEvalDataset, HistoricalDatasetSource } from "./types.ts";

type LoadHistoricalDatasetOptions = {
  instrument?: string;
  timeframe?: string;
  source?: HistoricalDatasetSource;
};

type ParsedJsonDataset = {
  instrument?: string;
  timeframe?: string;
  candles: Candle[];
};

function normalizeCsvHeader(header: string) {
  return header.trim().toLowerCase();
}

function parseCsvValue(row: Record<string, string>, keys: string[], fallback = "") {
  for (const key of keys) {
    if (key in row) {
      return row[key] ?? fallback;
    }
  }

  return fallback;
}

function splitCsvLine(line: string) {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];

    if (character === "\"") {
      const nextCharacter = line[index + 1];

      if (inQuotes && nextCharacter === "\"") {
        current += "\"";
        index += 1;
        continue;
      }

      inQuotes = !inQuotes;
      continue;
    }

    if (character === "," && !inQuotes) {
      values.push(current);
      current = "";
      continue;
    }

    current += character;
  }

  values.push(current);
  return values.map((value) => value.trim());
}

function parseCsvCandles(rawCsv: string) {
  const trimmed = rawCsv.trim();

  if (!trimmed) {
    return [] as Candle[];
  }

  const lines = trimmed
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));

  if (lines.length < 2) {
    return [] as Candle[];
  }

  const headers = splitCsvLine(lines[0]).map(normalizeCsvHeader);
  const records = lines.slice(1).map((line) => {
    const values = splitCsvLine(line);
    const record: Record<string, string> = {};

    headers.forEach((header, index) => {
      record[header] = values[index] ?? "";
    });

    return record;
  });

  return normalizeABCCandles(
    records.map((record) => ({
      time: parseCsvValue(record, ["time", "timestamp", "date", "datetime"]),
      open: parseCsvValue(record, ["open", "o"]),
      high: parseCsvValue(record, ["high", "h"]),
      low: parseCsvValue(record, ["low", "l"]),
      close: parseCsvValue(record, ["close", "c"]),
      volume: parseCsvValue(record, ["volume", "v"], "0"),
    })),
  );
}

function parseJsonDataset(rawJson: string): ParsedJsonDataset {
  const parsed = JSON.parse(rawJson) as unknown;

  if (Array.isArray(parsed)) {
    return {
      candles: normalizeABCCandles(parsed),
    };
  }

  if (!parsed || typeof parsed !== "object") {
    throw new Error("Unsupported JSON dataset format.");
  }

  const record = parsed as Record<string, unknown>;
  const candlesInput = Array.isArray(record.candles)
    ? record.candles
    : Array.isArray(record.ohlcData)
      ? record.ohlcData
      : Array.isArray(record.data)
        ? record.data
        : null;

  if (!candlesInput) {
    throw new Error("JSON dataset must contain a candles/data array.");
  }

  return {
    instrument:
      typeof record.instrument === "string"
        ? record.instrument
        : typeof record.symbol === "string"
          ? record.symbol
          : undefined,
    timeframe:
      typeof record.timeframe === "string"
        ? record.timeframe
        : typeof record.interval === "string"
          ? record.interval
          : undefined,
    candles: normalizeABCCandles(candlesInput),
  };
}

export async function loadHistoricalDataset(
  inputPath: string,
  options: LoadHistoricalDatasetOptions = {},
): Promise<HistoricalEvalDataset> {
  const resolvedPath = resolve(inputPath);
  const extension = extname(resolvedPath).toLowerCase();
  const source =
    options.source ??
    (extension === ".csv"
      ? "csv"
      : extension === ".json"
        ? "json"
        : "memory");
  const raw = await readFile(resolvedPath, "utf8");

  const parsed =
    extension === ".csv" ? { candles: parseCsvCandles(raw) } : parseJsonDataset(raw);
  const instrument = options.instrument ?? parsed.instrument ?? "Unknown";
  const timeframe = options.timeframe ?? parsed.timeframe ?? "30m";

  if (parsed.candles.length === 0) {
    throw new Error(`No candles found in dataset: ${resolvedPath}`);
  }

  return {
    instrument,
    timeframe,
    candles: parsed.candles,
    source,
    sourcePath: resolvedPath,
  };
}

export function createHistoricalDataset(
  input: Pick<HistoricalEvalDataset, "instrument" | "timeframe" | "candles">,
  source: HistoricalDatasetSource = "memory",
): HistoricalEvalDataset {
  return {
    instrument: input.instrument,
    timeframe: input.timeframe,
    candles: normalizeABCCandles(input.candles),
    source,
  };
}
