import axios from "axios";

import { type MarketSnapshot, type MetalSymbolCode, type Timeframe } from "@/lib/market-types";

const marketApiClient = axios.create({
  baseURL: "/api",
  timeout: 10_000,
});

export async function fetchMarketSnapshot(
  symbol: MetalSymbolCode,
  timeframe: Timeframe,
) {
  const response = await marketApiClient.get<MarketSnapshot>("/market", {
    params: {
      symbol,
      timeframe,
    },
  });

  return response.data;
}
