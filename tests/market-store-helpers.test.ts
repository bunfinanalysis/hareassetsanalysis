import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  shouldApplyMarketSnapshotResponse,
  snapshotMatchesSelection,
} from "../store/market-store-helpers.ts";

test("snapshotMatchesSelection only accepts snapshots for the active symbol and timeframe", () => {
  assert.equal(
    snapshotMatchesSelection(
      { symbol: "XAGUSD", timeframe: "1H" },
      { symbol: "XAGUSD", timeframe: "1H" },
    ),
    true,
  );
  assert.equal(
    snapshotMatchesSelection(
      { symbol: "SPXUSD", timeframe: "1H" },
      { symbol: "XPTUSD", timeframe: "1H" },
    ),
    false,
  );
  assert.equal(
    snapshotMatchesSelection(
      { symbol: "XPTUSD", timeframe: "4H" },
      { symbol: "XPTUSD", timeframe: "1H" },
    ),
    false,
  );
});

test("shouldApplyMarketSnapshotResponse rejects stale or mismatched responses", () => {
  assert.equal(
    shouldApplyMarketSnapshotResponse({
      currentSelection: { symbol: "XPTUSD", timeframe: "1H" },
      requestSelection: { symbol: "XPTUSD", timeframe: "1H" },
      currentSelectionVersion: 4,
      requestSelectionVersion: 4,
    }),
    true,
  );
  assert.equal(
    shouldApplyMarketSnapshotResponse({
      currentSelection: { symbol: "XPTUSD", timeframe: "1H" },
      requestSelection: { symbol: "SPXUSD", timeframe: "1H" },
      currentSelectionVersion: 5,
      requestSelectionVersion: 4,
    }),
    false,
  );
  assert.equal(
    shouldApplyMarketSnapshotResponse({
      currentSelection: { symbol: "XPTUSD", timeframe: "4H" },
      requestSelection: { symbol: "XPTUSD", timeframe: "1H" },
      currentSelectionVersion: 8,
      requestSelectionVersion: 8,
    }),
    false,
  );
});

test("metal chart clears candle data when the active market snapshot is unavailable", async () => {
  const source = await readFile(
    "/Users/dsaffioti24/Documents/New project/wavemetals/components/charts/metal-chart.tsx",
    "utf8",
  );

  assert.match(
    source,
    /if \(candles\.length === 0\) \{[\s\S]*candleSeriesRef\.current\.setData\(\[\]\);/,
  );
});
