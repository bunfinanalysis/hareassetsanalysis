export const TWELVE_DATA_SERVER_API_KEY_ENV = "TWELVE_DATA_API_KEY";
export const TWELVE_DATA_PUBLIC_API_KEY_ENV = "NEXT_PUBLIC_TWELVE_DATA_API_KEY";

type EnvShape = Partial<Record<string, string | undefined>>;

export type TwelveDataConfigStatus =
  | "configured"
  | "missing"
  | "misnamed-public-env";

export type ResolvedTwelveDataConfig = {
  apiKey: string;
  envVarName: typeof TWELVE_DATA_SERVER_API_KEY_ENV;
  isConfigured: boolean;
  status: TwelveDataConfigStatus;
  message: string;
};

export function resolveTwelveDataApiKey(
  env: EnvShape = process.env,
): ResolvedTwelveDataConfig {
  const serverApiKey = env[TWELVE_DATA_SERVER_API_KEY_ENV]?.trim() ?? "";
  const publicApiKey = env[TWELVE_DATA_PUBLIC_API_KEY_ENV]?.trim() ?? "";

  if (serverApiKey) {
    return {
      apiKey: serverApiKey,
      envVarName: TWELVE_DATA_SERVER_API_KEY_ENV,
      isConfigured: true,
      status: "configured",
      message: `${TWELVE_DATA_SERVER_API_KEY_ENV} is configured for the server-side Twelve Data feed.`,
    };
  }

  if (publicApiKey) {
    return {
      apiKey: "",
      envVarName: TWELVE_DATA_SERVER_API_KEY_ENV,
      isConfigured: false,
      status: "misnamed-public-env",
      message: `${TWELVE_DATA_PUBLIC_API_KEY_ENV} is set, but HareAssets fetches Twelve Data on the server through /api/market. Move the key to ${TWELVE_DATA_SERVER_API_KEY_ENV}.`,
    };
  }

  return {
    apiKey: "",
    envVarName: TWELVE_DATA_SERVER_API_KEY_ENV,
    isConfigured: false,
    status: "missing",
    message: `${TWELVE_DATA_SERVER_API_KEY_ENV} is not configured on the server. Add it to .env.local before expecting live Twelve Data quotes.`,
  };
}
