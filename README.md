HareAssets is a Next.js trading dashboard for Gold and Silver using Yahoo Finance public chart data.

## Getting Started

Run the development server:

```bash
npm run dev -- --hostname 127.0.0.1 --port 3000
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000) in your browser.

No API key or `.env.local` setup is required.

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
