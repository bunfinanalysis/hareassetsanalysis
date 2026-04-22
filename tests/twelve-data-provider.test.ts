import assert from 'node:assert/strict';
import test from 'node:test';

import { toLightweightCandlestickData } from '../lib/charting/lightweight-chart-adapter.ts';
import { getMarketFeedPresentation } from '../lib/market-data/feed-status.ts';
import { MarketDataProviderError } from '../lib/market-data/errors.ts';
import { createMarketDataService } from '../lib/market-data/service.ts';
import { getTwelveDataInstrumentConfig } from '../lib/market-data/twelve-data-provider.ts';
import {
  buildYahooFinanceQuote,
  createYahooFinanceProvider,
  extractYahooFinanceCandles,
  getYahooFinanceInstrumentConfig,
} from '../lib/market-data/yahoo-finance-provider.ts';
import type { MarketDataProvider } from '../lib/market-data/types.ts';
import { createMarketProviderState, METAL_SYMBOLS } from '../lib/market-types.ts';

const sampleYahooChartResponse = {
  chart: {
    result: [
      {
        meta: {
          regularMarketPrice: 31.42,
          chartPreviousClose: 30.95,
          regularMarketDayHigh: 31.56,
          regularMarketDayLow: 30.88,
          regularMarketOpen: 31.02,
          regularMarketVolume: 48210,
          regularMarketTime: 1775746800,
        },
        timestamp: [1775743200, 1775746800],
        indicators: {
          quote: [
            {
              open: [30.9, 31.1],
              high: [31.2, 31.5],
              low: [30.8, 31.0],
              close: [31.05, 31.33],
              volume: [21000, 27210],
            },
          ],
        },
      },
    ],
  },
};

test('Yahoo symbol mapping keeps internal symbols separate from provider symbols', () => {
  assert.equal(getYahooFinanceInstrumentConfig('XAUUSD').providerSymbol, 'GC=F');
  assert.equal(getYahooFinanceInstrumentConfig('XAGUSD').providerSymbol, 'SI=F');
  assert.equal(getYahooFinanceInstrumentConfig('XPTUSD').providerSymbol, 'PL=F');
  assert.equal(getYahooFinanceInstrumentConfig('XCUUSD').providerSymbol, 'HG=F');
  assert.equal(getYahooFinanceInstrumentConfig('XURUSD').providerSymbol, 'URNM');
  assert.equal(getYahooFinanceInstrumentConfig('SPXUSD').providerSymbol, '^GSPC');
  assert.equal(getTwelveDataInstrumentConfig('SPXUSD').providerSymbol, 'SPX');
  assert.equal(METAL_SYMBOLS.SPXUSD.label, 'S&P 500');
  assert.equal(METAL_SYMBOLS.SPXUSD.displayTicker, 'SPX');
});

test('extractYahooFinanceCandles converts Yahoo chart rows into ascending internal candles', () => {
  const candles = extractYahooFinanceCandles(
    sampleYahooChartResponse.chart.result[0],
    '1H',
  );

  assert.deepEqual(candles, [
    {
      time: 1775743200,
      open: 30.9,
      high: 31.2,
      low: 30.8,
      close: 31.05,
      volume: 21000,
    },
    {
      time: 1775746800,
      open: 31.1,
      high: 31.5,
      low: 31,
      close: 31.33,
      volume: 27210,
    },
  ]);
});

test('buildYahooFinanceQuote prefers Yahoo meta while staying on the normalized quote shape', () => {
  const quote = buildYahooFinanceQuote(
    'XAGUSD',
    [
      {
        time: 1775743200,
        open: 30.9,
        high: 31.2,
        low: 30.8,
        close: 31.05,
        volume: 21000,
      },
      {
        time: 1775746800,
        open: 31.1,
        high: 31.5,
        low: 31,
        close: 31.33,
        volume: 27210,
      },
    ],
    sampleYahooChartResponse.chart.result[0].meta,
  );

  assert.equal(quote.source, 'yahoo-finance');
  assert.equal(quote.lastPrice, 31.42);
  assert.equal(quote.previousClose, 30.95);
  assert.equal(Number(quote.change.toFixed(4)), 0.47);
  assert.equal(Number(quote.changePercent.toFixed(4)), Number(((0.47 / 30.95) * 100).toFixed(4)));
  assert.equal(quote.high, 31.56);
  assert.equal(quote.low, 30.88);
});

test('createYahooFinanceProvider assembles a live normalized market snapshot', async () => {
  const provider = createYahooFinanceProvider({
    requestWithCurl: async () => sampleYahooChartResponse,
    requestWithHttps: async () => {
      throw new Error('https fallback should not be called');
    },
    persistResult: async () => undefined,
    readPersistedResult: async () => null,
  });

  const snapshot = await provider.getMarketSnapshot('XAGUSD', '1H');

  assert.equal(snapshot.source, 'yahoo-finance');
  assert.equal(snapshot.provider.id, 'yahoo-finance');
  assert.equal(snapshot.provider.status, 'live');
  assert.equal(snapshot.provider.symbol, 'SI=F');
  assert.equal(snapshot.quote.lastPrice, 31.42);
  assert.equal(snapshot.candles.length, 2);
});

test('createYahooFinanceProvider falls back to cached Yahoo data instead of fake prices', async () => {
  const provider = createYahooFinanceProvider({
    requestWithCurl: async () => {
      throw new MarketDataProviderError({
        code: 'network_failure',
        endpoint: 'chart',
        message: 'Yahoo Finance chart request failed because the network request did not complete.',
      });
    },
    requestWithHttps: async () => {
      throw new Error('https fallback should not be called after injected curl failure');
    },
    readPersistedResult: async () => ({
      fetchedAt: '2026-04-09T15:00:00.000Z',
      result: sampleYahooChartResponse.chart.result[0],
    }),
    persistResult: async () => undefined,
  });

  const snapshot = await provider.getMarketSnapshot('XAGUSD', '1H');

  assert.equal(snapshot.source, 'yahoo-finance');
  assert.equal(snapshot.provider.status, 'fallback');
  assert.match(snapshot.warning ?? '', /cached Yahoo Finance data/i);
  assert.equal(snapshot.quote.lastPrice, 31.42);
});

test('market-data service does not synthesize demo prices when Yahoo has no live or cached snapshot', async () => {
  const provider: MarketDataProvider = {
    id: 'yahoo-finance',
    isConfigured: () => true,
    getInstrumentMetadata: () => ({ providerSymbol: 'SI=F' }),
    async getHistoricalCandles() {
      throw new Error('not used');
    },
    async getLatestQuote() {
      throw new Error('not used');
    },
    async getMarketSnapshot() {
      throw new MarketDataProviderError({
        code: 'network_failure',
        endpoint: 'chart',
        message: 'Yahoo Finance chart request failed because the network request did not complete.',
      });
    },
  };

  const service = createMarketDataService({ provider });

  await assert.rejects(
    () => service.getMarketSnapshot('XAGUSD', '1H'),
    (error: unknown) => {
      assert.ok(error instanceof MarketDataProviderError);
      assert.equal(error.code, 'network_failure');
      return true;
    },
  );
});

test('feed presentation is explicit about live Yahoo versus cached Yahoo data', () => {
  const livePresentation = getMarketFeedPresentation({
    source: 'yahoo-finance',
    provider: createMarketProviderState({
      id: 'yahoo-finance',
      status: 'live',
      configured: true,
      message: 'Live market data is active from Yahoo Finance.',
    }),
  });
  const fallbackPresentation = getMarketFeedPresentation({
    source: 'yahoo-finance',
    provider: createMarketProviderState({
      id: 'yahoo-finance',
      status: 'fallback',
      configured: true,
      message: 'Yahoo Finance live refresh failed. HareAssets is showing the most recent cached Yahoo Finance snapshot.',
    }),
  });

  assert.equal(livePresentation.badgeLabel, 'Live Feed');
  assert.equal(livePresentation.sourceLabel, 'Yahoo Finance');
  assert.equal(fallbackPresentation.badgeLabel, 'Fallback Feed');
  assert.equal(fallbackPresentation.sourceLabel, 'Yahoo Finance (cached)');
  assert.equal(fallbackPresentation.connectionLabel, 'Fallback');
});

test('lightweight chart adapter preserves normalized candle values for the chart input', () => {
  const series = toLightweightCandlestickData([
    {
      time: 1775743200,
      open: 30.9,
      high: 31.2,
      low: 30.8,
      close: 31.05,
      volume: 21000,
    },
    {
      time: 1775746800,
      open: 31.1,
      high: 31.5,
      low: 31,
      close: 31.33,
      volume: 27210,
    },
  ]);

  assert.deepEqual(series, [
    {
      time: 1775743200,
      open: 30.9,
      high: 31.2,
      low: 30.8,
      close: 31.05,
    },
    {
      time: 1775746800,
      open: 31.1,
      high: 31.5,
      low: 31,
      close: 31.33,
    },
  ]);
});
