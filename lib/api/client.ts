import axios from "axios";

import { type MarketSnapshot, type MetalSymbolCode, type Timeframe } from "@/lib/market-types";

type MarketApiErrorResponse = {
  error?: string;
  message?: string;
  code?: string;
  provider?: string;
  status?: string;
};

const marketApiClient = axios.create({
  baseURL: "/api",
  timeout: 10_000,
});

export async function fetchMarketSnapshot(
  symbol: MetalSymbolCode,
  timeframe: Timeframe,
) {
  try {
    const response = await marketApiClient.get<MarketSnapshot>("/market", {
      params: {
        symbol,
        timeframe,
      },
    });

    return response.data;
  } catch (error) {
    if (axios.isAxiosError<MarketApiErrorResponse>(error)) {
      const message =
        error.response?.data?.message ??
        "HareAssets could not load the market feed.";

      throw new Error(message, error.cause ? { cause: error.cause } : undefined);
    }

    throw error;
  }
}
