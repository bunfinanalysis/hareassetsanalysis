import {
  type Candle,
  type MarketDataSource,
  type MarketSnapshot,
  type MetalSymbolCode,
  type QuoteData,
  type Timeframe,
} from "../market-types.ts";

export type ProviderMarketDataSource = Exclude<MarketDataSource, "mock">;

export type MarketSnapshotOptions = {
  forceRefresh?: boolean;
};

export type ProviderInstrumentMetadata = {
  providerSymbol: string;
  exchange?: string;
  type?: string;
  country?: string;
};

export type HistoricalCandlesRequest = {
  symbol: MetalSymbolCode;
  timeframe: Timeframe;
};

export type HistoricalCandlesResponse = {
  symbol: MetalSymbolCode;
  timeframe: Timeframe;
  candles: Candle[];
  metadata: ProviderInstrumentMetadata;
  source: ProviderMarketDataSource;
};

export type LatestQuoteRequest = {
  symbol: MetalSymbolCode;
  timeframe: Timeframe;
  candles: Candle[];
};

export type LatestQuoteResponse = {
  symbol: MetalSymbolCode;
  timeframe: Timeframe;
  quote: QuoteData;
  metadata: ProviderInstrumentMetadata;
  source: ProviderMarketDataSource;
};

export interface MarketDataProvider {
  readonly id: ProviderMarketDataSource;
  isConfigured(): boolean;
  getInstrumentMetadata(symbol: MetalSymbolCode): ProviderInstrumentMetadata;
  getHistoricalCandles(
    request: HistoricalCandlesRequest,
  ): Promise<HistoricalCandlesResponse>;
  getLatestQuote(request: LatestQuoteRequest): Promise<LatestQuoteResponse>;
  getMarketSnapshot(symbol: MetalSymbolCode, timeframe: Timeframe): Promise<MarketSnapshot>;
}
