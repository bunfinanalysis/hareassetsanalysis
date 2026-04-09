import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { loadHistoricalDataset } from "../lib/evaluation/dataset-loader.ts";
import { buildReplayArtifacts } from "../lib/evaluation/report.ts";
import { runHistoricalEvaluation } from "../lib/evaluation/replay.ts";

type ParsedArgs = {
  input: string | null;
  instrument?: string;
  timeframe?: string;
  jsonOut?: string;
  reportOut?: string;
  warmupBars?: number;
  stepSize?: number;
  lookaheadBars?: number;
  promotionLookaheadBars?: number;
  quickInvalidationBars?: number;
  includeHigherTimeframes?: boolean;
};

function printUsage() {
  console.log(`Usage: npm run eval:abc -- --input <dataset.{json|csv}> [options]

Options:
  --instrument <symbol>             Override dataset instrument
  --timeframe <label>               Override dataset timeframe
  --json-out <path>                 Write machine-readable JSON result
  --report-out <path>               Write Markdown summary report
  --warmup-bars <number>            Bars before replay starts
  --step-size <number>              Evaluate every Nth bar
  --lookahead-bars <number>         Forward bars used for outcome labeling
  --promotion-lookahead-bars <n>    Forward bars used to detect alternate promotion
  --quick-invalidation-bars <n>     Bars defining a quick structural failure
  --no-higher-timeframes            Disable derived 1H/4H context slices
`);
}

function parseNumber(value: string | undefined, flag: string) {
  if (!value) {
    throw new Error(`Missing value for ${flag}`);
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid numeric value for ${flag}: ${value}`);
  }

  return parsed;
}

function parseArgs(argv: string[]): ParsedArgs {
  const parsed: ParsedArgs = {
    input: null,
    includeHigherTimeframes: true,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    switch (arg) {
      case "--input":
        parsed.input = next ?? null;
        index += 1;
        break;
      case "--instrument":
        parsed.instrument = next;
        index += 1;
        break;
      case "--timeframe":
        parsed.timeframe = next;
        index += 1;
        break;
      case "--json-out":
        parsed.jsonOut = next;
        index += 1;
        break;
      case "--report-out":
        parsed.reportOut = next;
        index += 1;
        break;
      case "--warmup-bars":
        parsed.warmupBars = parseNumber(next, arg);
        index += 1;
        break;
      case "--step-size":
        parsed.stepSize = parseNumber(next, arg);
        index += 1;
        break;
      case "--lookahead-bars":
        parsed.lookaheadBars = parseNumber(next, arg);
        index += 1;
        break;
      case "--promotion-lookahead-bars":
        parsed.promotionLookaheadBars = parseNumber(next, arg);
        index += 1;
        break;
      case "--quick-invalidation-bars":
        parsed.quickInvalidationBars = parseNumber(next, arg);
        index += 1;
        break;
      case "--no-higher-timeframes":
        parsed.includeHigherTimeframes = false;
        break;
      case "--help":
      case "-h":
        printUsage();
        process.exit(0);
      default:
        if (arg.startsWith("--")) {
          throw new Error(`Unknown flag: ${arg}`);
        }
    }
  }

  return parsed;
}

async function writeIfRequested(path: string | undefined, content: string) {
  if (!path) {
    return;
  }

  const resolvedPath = resolve(path);
  await mkdir(dirname(resolvedPath), { recursive: true });
  await writeFile(resolvedPath, content, "utf8");
  console.log(`Wrote ${resolvedPath}`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!args.input) {
    printUsage();
    throw new Error("Missing required --input argument.");
  }

  const dataset = await loadHistoricalDataset(args.input, {
    instrument: args.instrument,
    timeframe: args.timeframe,
  });
  const result = runHistoricalEvaluation(dataset, {
    warmupBars: args.warmupBars,
    stepSize: args.stepSize,
    lookaheadBars: args.lookaheadBars,
    promotionLookaheadBars: args.promotionLookaheadBars,
    quickInvalidationBars: args.quickInvalidationBars,
    includeHigherTimeframes: args.includeHigherTimeframes,
  });
  const artifacts = buildReplayArtifacts(result);

  await writeIfRequested(
    args.jsonOut,
    `${JSON.stringify(artifacts.result, null, 2)}\n`,
  );
  await writeIfRequested(args.reportOut, `${artifacts.markdownReport}\n`);

  if (!args.jsonOut && !args.reportOut) {
    console.log(artifacts.markdownReport);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
