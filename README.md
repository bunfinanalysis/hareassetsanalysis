HareAssets is a Next.js trading dashboard for metals using Yahoo Finance market data.

## Current Feed Path

- `/api/market` fetches live Yahoo Finance chart data server-side.
- The chart, quote cards, and Elliott engine all consume the same normalized `MarketSnapshot` object.
- If the latest Yahoo refresh fails, HareAssets can show the most recent confirmed Yahoo snapshot as cached fallback data.
- HareAssets does not synthesize fake prices and present them as live data.

## Getting Started

No API key is required for the current Yahoo Finance path.

Run the development server:

```bash
npm run dev -- --hostname 127.0.0.1 --port 3000
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000) in your browser.

## Optional Yahoo Cache Refresh

Refresh the local Yahoo snapshot cache for one symbol/timeframe or for every supported combination:

```bash
npm run refresh:yahoo
```

```bash
npm run refresh:yahoo -- XAGUSD 1H
```

## Evaluation Harness

Run the historical ABC evaluation harness against a JSON or CSV OHLC dataset:

```bash
npm run eval:abc -- --input ./tests/fixtures/eval-silver-30m.json --warmup-bars 4
```

Write machine-readable JSON plus a Markdown summary report:

```bash
npm run eval:abc -- \
  --input ./tests/fixtures/eval-silver-30m.json \
  --warmup-bars 4 \
  --json-out ./tmp/eval-result.json \
  --report-out ./tmp/eval-report.md
```
