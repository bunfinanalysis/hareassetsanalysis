import { NextRequest, NextResponse } from "next/server";

import { getMarketSnapshot } from "@/lib/api/yahoo-finance";
import {
  isMetalSymbolCode,
  isTimeframe,
  type MetalSymbolCode,
  type Timeframe,
} from "@/lib/market-types";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const symbolParam = searchParams.get("symbol");
  const timeframeParam = searchParams.get("timeframe");
  const refreshParam = searchParams.get("refresh");

  const symbol: MetalSymbolCode =
    symbolParam && isMetalSymbolCode(symbolParam) ? symbolParam : "XAUUSD";
  const timeframe: Timeframe =
    timeframeParam && isTimeframe(timeframeParam) ? timeframeParam : "1H";
  const forceRefresh = refreshParam === "1" || refreshParam === "true";

  const snapshot = await getMarketSnapshot(symbol, timeframe, {
    forceRefresh,
  });

  return NextResponse.json(snapshot, {
    headers: {
      "Cache-Control": "no-store, max-age=0",
    },
  });
}
