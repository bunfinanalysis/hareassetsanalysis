import { type MarketProviderErrorCode } from "../market-types.ts";

type MarketDataProviderErrorOptions = {
  code: MarketProviderErrorCode;
  message: string;
  endpoint?: string;
  status?: number;
  cause?: unknown;
  retriable?: boolean;
};

export class MarketDataProviderError extends Error {
  readonly code: MarketProviderErrorCode;
  readonly endpoint?: string;
  readonly status?: number;
  readonly retriable: boolean;

  constructor(options: MarketDataProviderErrorOptions) {
    super(options.message, options.cause ? { cause: options.cause } : undefined);
    this.name = "MarketDataProviderError";
    this.code = options.code;
    this.endpoint = options.endpoint;
    this.status = options.status;
    this.retriable = options.retriable ?? true;
  }
}

export function isMarketDataProviderError(
  error: unknown,
): error is MarketDataProviderError {
  return error instanceof MarketDataProviderError;
}

export function toMarketDataProviderError(
  error: unknown,
  fallback: Omit<MarketDataProviderErrorOptions, "cause">,
) {
  if (isMarketDataProviderError(error)) {
    return error;
  }

  return new MarketDataProviderError({
    ...fallback,
    cause: error,
  });
}
