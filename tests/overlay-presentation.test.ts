import assert from "node:assert/strict";
import test from "node:test";

import {
  buildOverlayActionLine,
  buildOverlayStatusLine,
  shouldShowDetailedAlternateOverlay,
} from "../lib/elliott-engine/overlay-presentation.ts";

const formatOverlayPrice = (value: number) => `$${value.toFixed(2)}`;

test("overlay status line stays disciplined in no-trade state", () => {
  const line = buildOverlayStatusLine({
    noTradeTitle: "Corrective ambiguity",
    noTradeConfirmations: ["Need acceptance below $74.85"],
    fallbackSetupText: "Medium setup",
    startPrice: 74.85,
    targetPrice: 72.4,
  });

  assert.equal(line, "No clear edge");
});

test("overlay action line prioritizes invalidation for directional setups", () => {
  const line = buildOverlayActionLine(
    {
      validationStatusText: "Valid structure",
      setupQualityText: "High setup quality",
      fallbackSetupText: "High setup",
      invalidationLevel: 74.85,
      startPrice: 73.2,
      targetPrice: 71.4,
    },
    formatOverlayPrice,
  );

  assert.equal(line, "Inv $74.85");
});

test("overlay action line uses confirmation guidance when no-trade is active", () => {
  const line = buildOverlayActionLine(
    {
      noTradeTitle: "Corrective ambiguity",
      noTradeConfirmations: ["Need acceptance below $74.85"],
      fallbackSetupText: "Medium setup",
      startPrice: 74.85,
      targetPrice: 72.4,
    },
    formatOverlayPrice,
  );

  assert.equal(line, "Need acceptance below $74.85");
});

test("alternate overlays only show detailed labels when hovered or alone", () => {
  assert.equal(shouldShowDetailedAlternateOverlay(false, 2), false);
  assert.equal(shouldShowDetailedAlternateOverlay(true, 2), true);
  assert.equal(shouldShowDetailedAlternateOverlay(false, 1), true);
});
