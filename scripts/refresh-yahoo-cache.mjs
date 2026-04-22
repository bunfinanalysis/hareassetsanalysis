import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const YAHOO_CHART_HOSTS = [
  "query1.finance.yahoo.com",
  "query2.finance.yahoo.com",
];

const SYMBOLS = {
  XAUUSD: "GC=F",
  XAGUSD: "SI=F",
  XPTUSD: "PL=F",
  XCUUSD: "HG=F",
  XURUSD: "URNM",
};

const TIMEFRAMES = {
  "1m": { yahooInterval: "1m", yahooRange: "1d" },
  "5m": { yahooInterval: "5m", yahooRange: "5d" },
  "15m": { yahooInterval: "15m", yahooRange: "1mo" },
  "30m": { yahooInterval: "30m", yahooRange: "1mo" },
  "1H": { yahooInterval: "60m", yahooRange: "3mo" },
  "4H": { yahooInterval: "60m", yahooRange: "6mo" },
  Daily: { yahooInterval: "1d", yahooRange: "1y" },
  Weekly: { yahooInterval: "1wk", yahooRange: "5y" },
};

const CACHE_FILE_PATH = join(process.cwd(), "data", "yahoo-chart-cache.json");

async function fetchWithCurl(url, referer) {
  const { stdout } = await execFileAsync(
    "curl",
    [
      "-sS",
      "--max-time",
      "10",
      "-w",
      "\n%{http_code}",
      "-H",
      "User-Agent: Mozilla/5.0",
      "-H",
      "Accept: application/json",
      "-H",
      "Accept-Language: en-US,en;q=0.9",
      "-H",
      "Origin: https://finance.yahoo.com",
      "-H",
      `Referer: ${referer}`,
      url,
    ],
    {
      timeout: 10_000,
      maxBuffer: 8 * 1024 * 1024,
    },
  );

  const splitIndex = stdout.lastIndexOf("\n");
  const payload = splitIndex === -1 ? stdout : stdout.slice(0, splitIndex);
  const statusCode = Number(splitIndex === -1 ? "0" : stdout.slice(splitIndex + 1).trim());

  if (!Number.isFinite(statusCode) || statusCode >= 400) {
    throw new Error(`Yahoo Finance request failed with ${Number.isFinite(statusCode) ? statusCode : "unknown"}`);
  }

  return JSON.parse(payload);
}

async function fetchChartResult(symbol, timeframe) {
  const yahooSymbol = SYMBOLS[symbol];
  const timeframeConfig = TIMEFRAMES[timeframe];
  const referer = `https://finance.yahoo.com/quote/${yahooSymbol}`;
  const errors = [];

  for (const host of YAHOO_CHART_HOSTS) {
    try {
      const url = new URL(`https://${host}/v8/finance/chart/${yahooSymbol}`);
      url.searchParams.set("interval", timeframeConfig.yahooInterval);
      url.searchParams.set("range", timeframeConfig.yahooRange);
      url.searchParams.set("corsDomain", "finance.yahoo.com");
      url.searchParams.set("includePrePost", "true");
      url.searchParams.set("events", "div,splits");

      const response = await fetchWithCurl(url.toString(), referer);
      const result = response?.chart?.result?.[0];

      if (!result) {
        throw new Error(response?.chart?.error?.description ?? "No chart result");
      }

      return result;
    } catch (error) {
      errors.push(`${host}: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

  throw new Error(errors.join(" | "));
}

async function readExistingCache() {
  try {
    const raw = await readFile(CACHE_FILE_PATH, "utf8");

    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function main() {
  const cache = await readExistingCache();
  const requestedSymbol = process.argv[2];
  const requestedTimeframe = process.argv[3];
  const symbols = requestedSymbol ? [requestedSymbol] : Object.keys(SYMBOLS);
  const timeframes = requestedTimeframe
    ? [requestedTimeframe]
    : Object.keys(TIMEFRAMES);

  for (const symbol of symbols) {
    if (!(symbol in SYMBOLS)) {
      throw new Error(`Unsupported symbol: ${symbol}`);
    }

    for (const timeframe of timeframes) {
      if (!(timeframe in TIMEFRAMES)) {
        throw new Error(`Unsupported timeframe: ${timeframe}`);
      }

      const result = await fetchChartResult(symbol, timeframe);
      const cacheKey = `${symbol}:${timeframe}`;

      cache[cacheKey] = {
        fetchedAt: new Date().toISOString(),
        result,
      };

      const price = result?.meta?.regularMarketPrice ?? "n/a";
      console.log(`Refreshed ${cacheKey} -> ${price}`);
    }
  }

  await mkdir(join(process.cwd(), "data"), { recursive: true });
  await writeFile(CACHE_FILE_PATH, JSON.stringify(cache, null, 2));
  console.log(`Saved Yahoo cache to ${CACHE_FILE_PATH}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
