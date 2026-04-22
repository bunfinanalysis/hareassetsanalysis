import { NextRequest, NextResponse } from "next/server";

import { isMarketDataProviderError } from "@/lib/market-data/errors";
import { getMarketSnapshot } from "@/lib/market-data/service";
import {
  isMetalSymbolCode,
  isTimeframe,
  type MetalSymbolCode,
  type Timeframe,
} from "@/lib/market-types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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

  try {
    const snapshot = await getMarketSnapshot(symbol, timeframe, {
      forceRefresh,
    });

    return NextResponse.json(snapshot, {
      headers: {
        "Cache-Control": "no-store, max-age=0",
        "X-Market-Feed-Provider": snapshot.provider.id,
        "X-Market-Feed-Status": snapshot.provider.status,
        "X-Market-Feed-Source": snapshot.source,
      },
    });
  } catch (error) {
    if (isMarketDataProviderError(error)) {
      return NextResponse.json(
        {
          error: "market_feed_unavailable",
          message: error.message,
          code: error.code,
          provider: "yahoo-finance",
          status: "unavailable",
        },
        {
          status:
            error.code === "rate_limited" ||
              error.code === "network_failure"
              ? 503
              : 502,
          headers: {
            "Cache-Control": "no-store, max-age=0",
            "X-Market-Feed-Provider": "yahoo-finance",
            "X-Market-Feed-Status": "unavailable",
          },
        },
      );
    }

    throw error;
  }
}
