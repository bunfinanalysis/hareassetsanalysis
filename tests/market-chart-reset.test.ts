import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("market switch reset re-enables right price scale autoscaling", async () => {
  const source = await readFile(
    "/Users/dsaffioti24/Documents/New project/wavemetals/components/charts/metal-chart.tsx",
    "utf8",
  );

  assert.match(
    source,
    /function resetChartViewportForMarketChange[\s\S]*chart\.priceScale\("right"\)\.setAutoScale\(true\);/,
  );
});
