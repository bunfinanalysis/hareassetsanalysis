export type OverlayDecisionInput = {
  noTradeTitle?: string;
  noTradeConfirmations?: string[];
  validationStatusText?: string;
  setupQualityText?: string;
  fallbackSetupText: string;
  invalidationLevel?: number;
  startPrice: number;
  targetPrice: number;
};

type PriceFormatter = (value: number) => string;

function parseValidationStatus(
  validationStatusText?: string,
) {
  const normalized = validationStatusText?.toLowerCase() ?? "";

  if (normalized.includes("invalid")) {
    return "Invalid";
  }

  if (normalized.includes("weak")) {
    return "Weak";
  }

  if (normalized.includes("provisional")) {
    return "Provisional";
  }

  if (normalized.includes("valid")) {
    return "Valid";
  }

  return null;
}

function compactSetupQuality(setupQualityText: string | undefined, fallbackSetupText: string) {
  return (setupQualityText ?? fallbackSetupText).replace(
    " setup quality",
    " quality",
  );
}

export function buildOverlayStatusLine(input: OverlayDecisionInput) {
  if (input.noTradeTitle) {
    return "No clear edge";
  }

  const validation = parseValidationStatus(input.validationStatusText);
  const setup = compactSetupQuality(input.setupQualityText, input.fallbackSetupText);

  if (validation) {
    return `${validation} · ${setup}`;
  }

  return setup;
}

export function buildOverlayActionLine(
  input: OverlayDecisionInput,
  formatPrice: PriceFormatter,
) {
  if (input.noTradeTitle) {
    if (input.noTradeConfirmations?.length) {
      return input.targetPrice <= input.startPrice
        ? `Need acceptance below ${formatPrice(input.startPrice)}`
        : `Need acceptance above ${formatPrice(input.startPrice)}`;
    }

    return "Await confirmation";
  }

  if (typeof input.invalidationLevel === "number") {
    return `Inv ${formatPrice(input.invalidationLevel)}`;
  }

  return input.targetPrice <= input.startPrice
    ? `Confirm below ${formatPrice(input.startPrice)}`
    : `Confirm above ${formatPrice(input.startPrice)}`;
}

export function shouldShowDetailedAlternateOverlay(
  hovered: boolean,
  alternateCount: number,
) {
  return hovered || alternateCount <= 1;
}
