import {
  type MarketProviderStatus,
  type MarketSnapshot,
} from "../market-types.ts";

type StatusTone = "positive" | "warning" | "negative" | "neutral";

export type MarketFeedPresentation = {
  badgeLabel: string;
  badgeTone: StatusTone;
  connectionLabel: string;
  connectionTone: StatusTone;
  sourceLabel: string;
  sourceTone: StatusTone;
  description: string;
  priceLabel: string;
};

type FeedSnapshot =
  | Pick<MarketSnapshot, "provider" | "source">
  | null
  | undefined;

function buildUnavailablePresentation(): MarketFeedPresentation {
  return {
    badgeLabel: "Feed Unavailable",
    badgeTone: "neutral",
    connectionLabel: "Unavailable",
    connectionTone: "neutral",
    sourceLabel: "No market snapshot",
    sourceTone: "neutral",
    description: "No market snapshot has loaded yet.",
    priceLabel: "Latest",
  };
}

function isDemoFallback(snapshot: NonNullable<FeedSnapshot>) {
  return snapshot.source === "mock";
}

function getProviderSourceLabel(snapshot: NonNullable<FeedSnapshot>) {
  if (snapshot.provider.id === "yahoo-finance" || snapshot.source === "yahoo-finance") {
    return "Yahoo Finance";
  }

  if (snapshot.provider.id === "twelve-data" || snapshot.source === "twelve-data") {
    return "Twelve Data";
  }

  return "Market provider";
}

export function getMarketFeedPresentation(
  snapshot: FeedSnapshot,
): MarketFeedPresentation {
  if (!snapshot) {
    return buildUnavailablePresentation();
  }

  if (snapshot.provider.status === "live") {
    const sourceLabel = getProviderSourceLabel(snapshot);

    return {
      badgeLabel: "Live Feed",
      badgeTone: "positive",
      connectionLabel: "Live",
      connectionTone: "positive",
      sourceLabel,
      sourceTone: "positive",
      description:
        snapshot.provider.message ||
        `Server-side ${sourceLabel} market data is active.`,
      priceLabel: "Live",
    };
  }

  if (snapshot.provider.status === "fallback") {
    if (isDemoFallback(snapshot)) {
      return {
        badgeLabel: "Demo Data",
        badgeTone: "negative",
        connectionLabel: "Fallback",
        connectionTone: "negative",
        sourceLabel: "Demo fallback feed",
        sourceTone: "negative",
        description:
          snapshot.provider.message ||
          "Live market data is unavailable. HareAssets is showing demo fallback data instead of a connected feed.",
        priceLabel: "Demo",
      };
    }

    const sourceLabel = getProviderSourceLabel(snapshot);

    return {
      badgeLabel: "Fallback Feed",
      badgeTone: "warning",
      connectionLabel: "Fallback",
      connectionTone: "warning",
      sourceLabel: `${sourceLabel} (cached)`,
      sourceTone: "warning",
      description:
        snapshot.provider.message ||
        `Live refresh is unavailable. HareAssets is showing the most recent confirmed ${sourceLabel} snapshot.`,
      priceLabel: "Fallback",
    };
  }

  if (snapshot.provider.status === "error") {
    return {
      badgeLabel: "Feed Error",
      badgeTone: "negative",
      connectionLabel: "Error",
      connectionTone: "negative",
      sourceLabel: "Provider error",
      sourceTone: "negative",
      description:
        snapshot.provider.message ||
        "The market provider returned an error.",
      priceLabel: "Latest",
    };
  }

  return {
    badgeLabel: "Feed Unavailable",
    badgeTone: "neutral",
    connectionLabel: "Unavailable",
    connectionTone: "neutral",
    sourceLabel: "Live feed unavailable",
    sourceTone: "neutral",
    description:
      snapshot.provider.message ||
      "Live market data is currently unavailable.",
    priceLabel: "Latest",
  };
}

export function isLiveFeedStatus(status: MarketProviderStatus | null | undefined) {
  return status === "live";
}
