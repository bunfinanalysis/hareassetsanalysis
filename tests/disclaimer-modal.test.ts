import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  DISCLAIMER_STORAGE_KEY,
  hasAcceptedDisclaimer,
  persistDisclaimerAcceptance,
  resolveDisclaimerAcceptance,
} from "../lib/disclaimer.ts";

function createStorageFixture(initialValue?: string) {
  const storage = new Map<string, string>();
  if (typeof initialValue === "string") {
    storage.set(DISCLAIMER_STORAGE_KEY, initialValue);
  }

  const readableStorage = {
    getItem(key: string) {
      return storage.get(key) ?? null;
    },
  };

  const writableStorage = {
    setItem(key: string, value: string) {
      storage.set(key, value);
    },
  };

  return {
    storage,
    readableStorage,
    writableStorage,
  };
}

test("first-time users do not have a stored disclaimer acknowledgement", () => {
  const { readableStorage } = createStorageFixture();

  assert.equal(hasAcceptedDisclaimer(readableStorage), false);
  assert.equal(resolveDisclaimerAcceptance(readableStorage), false);
});

test("returning users skip the disclaimer when the stored flag exists", () => {
  const { readableStorage } = createStorageFixture("accepted");

  assert.equal(hasAcceptedDisclaimer(readableStorage), true);
  assert.equal(resolveDisclaimerAcceptance(readableStorage), true);
});

test("clicking I Understand persists the disclaimer acknowledgement", () => {
  const { storage, readableStorage, writableStorage } = createStorageFixture();

  persistDisclaimerAcceptance(writableStorage);

  assert.equal(storage.get(DISCLAIMER_STORAGE_KEY), "accepted");
  assert.equal(hasAcceptedDisclaimer(readableStorage), true);
  assert.equal(resolveDisclaimerAcceptance(readableStorage), true);
});

test("disclaimer modal includes the required notice copy and explicit acknowledgement button", () => {
  const modalSource = readFileSync(
    new URL("../components/dashboard/disclaimer-modal.tsx", import.meta.url),
    "utf8",
  );

  assert.match(modalSource, /Important Notice/);
  assert.match(
    modalSource,
    /This platform is for educational and informational purposes only\./,
  );
  assert.match(
    modalSource,
    /It\s+does not provide financial advice,\s+and nothing shown here should be\s+used as the sole basis for trading decisions\./,
  );
  assert.match(
    modalSource,
    /Trading involves risk\.\s+You are fully responsible for your own\s+decisions\./,
  );
  assert.match(modalSource, /I Understand/);
  assert.match(modalSource, /aria-modal="true"/);
  assert.doesNotMatch(modalSource, /onEscapeKeyDown|onInteractOutside|onKeyDown/);
});

test("home initializes the disclaimer gate before rendering the dashboard", () => {
  const pageSource = readFileSync(
    new URL("../app/page.tsx", import.meta.url),
    "utf8",
  );

  assert.match(pageSource, /const ACCESS_CODE = "Hare5626"/);
  assert.match(pageSource, /const ACCESS_STORAGE_KEY = "hareassets-site-access"/);
  assert.match(pageSource, /window\.localStorage\.getItem\(ACCESS_STORAGE_KEY\) === ACCESS_CODE/);
  assert.match(pageSource, /window\.localStorage\.setItem\(ACCESS_STORAGE_KEY, ACCESS_CODE\)/);
  assert.match(
    pageSource,
    /if \(!hasAccess\) {\s*return \(\s*<AccessGate/,
  );
  assert.match(pageSource, /const \[isDisclaimerAccepted, setIsDisclaimerAccepted\] = useState<boolean \| null>\(null\)/);
  assert.match(pageSource, /resolveDisclaimerAcceptance\(window\.localStorage\)/);
  assert.match(pageSource, /persistDisclaimerAcceptance\(window\.localStorage\)/);
  assert.match(
    pageSource,
    /if \(hasAccess === null \|\| isDisclaimerAccepted === null\)/,
  );
  assert.match(
    pageSource,
    /if \(!isDisclaimerAccepted\) {\s*return <DisclaimerModal onAcknowledge=\{handleAcknowledgeDisclaimer\} \/>;\s*}/,
  );
  assert.match(pageSource, /return <DashboardContent \/>;/);
});
