export const DISCLAIMER_STORAGE_KEY = "hareassets-disclaimer-acknowledged";
const DISCLAIMER_STORAGE_VALUE = "accepted";

type DisclaimerReadableStorage = Pick<Storage, "getItem">;
type DisclaimerWritableStorage = Pick<Storage, "setItem">;

export function resolveDisclaimerAcceptance(
  storage: DisclaimerReadableStorage | null | undefined,
): boolean {
  if (!storage) {
    return false;
  }

  return hasAcceptedDisclaimer(storage);
}

export function hasAcceptedDisclaimer(storage: DisclaimerReadableStorage): boolean {
  return storage.getItem(DISCLAIMER_STORAGE_KEY) === DISCLAIMER_STORAGE_VALUE;
}

export function persistDisclaimerAcceptance(
  storage: DisclaimerWritableStorage,
): void {
  storage.setItem(DISCLAIMER_STORAGE_KEY, DISCLAIMER_STORAGE_VALUE);
}
