// Risk: severity-off-screen-on-a-phone (S-06, #109; context/changes/severity-next-to-symptom/plan.md, phase 3).
// On a phone the severity buttons stood in a block above the search field and the list of 34 symptoms, so after
// ticking the last symptom they were about 2,000 px higher, off-screen. The test ticks the last symptom of the last
// group at 390 px and requires its severity right there, without scrolling, then saves it and finds it on the list.
//
// Data: a fresh account per test, so the list shows this test's entry alone and the shared E2E account is never
// touched. Signed up and signed in over HTTP (no UI), deleted with everything in it through the S-09 route in
// afterEach, also when the test fails. The symptom is ticked in the page: no symptom travels in a URL. Local Supabase
// only (playwright.config.ts keeps the preview off .env).
import { test, expect, type Page } from "@playwright/test";
import { JOURNAL_COPY } from "../../src/lib/copy/journal";
import { pickSymptom } from "./journal-helpers";

// The account is created by the test itself, so it starts without the saved session.
test.use({ storageState: { cookies: [], origins: [] }, viewport: { width: 390, height: 844 } });

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const STAMP = `${Date.now()}`;
const password = `Haslo-e2e-${STAMP}`;
// One account per test: the tests of this file run in parallel (fullyParallel).
let email = "";
test.beforeEach(() => {
  email = `e2e-severity-phone-${STAMP}-${test.info().testId}@example.test`;
});

// The last group of the catalog and its last symptom (supabase/migrations/20260926120100_symptom_catalog_seed.sql):
// the row furthest from the old block above the list.
const CATEGORY = "pozostałe";
const SYMPTOM = "spadek libido";
const SEVERITY = "silne";

// Origin is what the browser sends with the app's forms (Astro checkOrigin).
function originOf(baseURL: string | undefined): { Origin: string } {
  if (!baseURL) throw new Error("baseURL is not set in playwright.config.ts");
  return { Origin: new URL(baseURL).origin };
}

// The journal form is a React island: input typed before it hydrates is lost.
async function waitForIslands(page: Page) {
  await expect(page.locator("astro-island[ssr]")).toHaveCount(0);
}

// A fresh account, signed in in this page's context.
async function signUpAndSignIn(page: Page, baseURL: string | undefined) {
  const headers = originOf(baseURL);
  const signedUp = await page.request.post("/api/auth/signup", {
    form: { email, password, confirmPassword: password, terms: "accepted" },
    headers,
    maxRedirects: 0,
  });
  expect(signedUp.headers().location).toBe("/auth/confirm-email");
  const signedIn = await page.request.post("/api/auth/signin", {
    form: { email, password },
    headers,
    maxRedirects: 0,
  });
  expect(signedIn.headers().location).toBe("/");
}

// Runs also when the test fails: the account and, through the cascade, every entry go with it.
test.afterEach(async ({ request, baseURL }) => {
  const headers = originOf(baseURL);
  const signedIn = await request.post("/api/auth/signin", { form: { email, password }, headers, maxRedirects: 0 });
  expect(signedIn.status()).toBe(302);
  expect(signedIn.headers().location).toBe("/");
  const deleted = await request.post("/api/account/delete", { form: { password }, headers, maxRedirects: 0 });
  expect(deleted.status()).toBe(303);
  expect(deleted.headers().location).toBe("/auth/konto-usuniete");
});

test.describe("severity on a phone", () => {
  test("ticking the last symptom shows its severity in view; the chosen severity is saved with it", async ({
    page,
    baseURL,
  }) => {
    test.setTimeout(60_000);
    test.info().annotations.push({ type: "test-data", description: email });
    await signUpAndSignIn(page, baseURL);

    await page.goto("/dzienniczek/nowy");
    await waitForIslands(page);

    // Unfold the last group through its heading button (folded at the start, no count yet).
    const groupHeader = page.getByRole("button", { name: CATEGORY, exact: true });
    await expect(groupHeader).toHaveAttribute("aria-expanded", "false");
    await groupHeader.click();
    await expect(groupHeader).toHaveAttribute("aria-expanded", "true");

    // Tick the last symptom straight from the list. Its severity must be in view right away: no scrolling before the
    // check (the tick itself may bring the checkbox into view, as a finger would).
    const checkbox = page.getByRole("checkbox", { name: SYMPTOM, exact: true });
    await checkbox.check();
    // Severity must stand in the symptom's own row and be wholly in view, not one pixel of it.
    const row = page.getByRole("listitem").filter({ has: checkbox });
    const severity = row.getByRole("group", { name: `${JOURNAL_COPY.form.severityLegend}: ${SYMPTOM}` });
    await expect(severity).toBeInViewport({ ratio: 1 });

    const strong = severity.getByRole("button", { name: SEVERITY, exact: true });
    await strong.click();
    await expect(strong).toHaveAttribute("aria-pressed", "true");

    // The summary before the note shows the symptom with the chosen severity.
    const summary = page.getByRole("region", { name: JOURNAL_COPY.form.selectedHeading });
    await expect(summary.getByRole("listitem")).toHaveCount(1);
    await expect(summary.getByRole("listitem")).toContainText(`${SYMPTOM} · ${SEVERITY}`);

    await page.getByRole("button", { name: JOURNAL_COPY.form.submit }).click();
    await page.waitForURL(new RegExp(`/dzienniczek\\?dodano=${UUID}$`));

    // The list shows the saved entry with the symptom and its severity.
    const entry = page.locator("li[data-entry-id]");
    await expect(entry).toHaveCount(1);
    await expect(entry.getByRole("listitem")).toHaveText([`${SYMPTOM} · ${SEVERITY}`]);
  });

  // Unticking a symptom pinned under "Zaznaczone" during a search removes its row (impl-review F2). The focus must not
  // fall back to the top of the page with it: a keyboard or screen reader user goes on from the search field.
  test("unticking a pinned symptom with the keyboard leaves the focus in the search field", async ({
    page,
    baseURL,
  }) => {
    test.setTimeout(60_000);
    test.info().annotations.push({ type: "test-data", description: email });
    await signUpAndSignIn(page, baseURL);

    await page.goto("/dzienniczek/nowy");
    await waitForIslands(page);

    await pickSymptom(page, SYMPTOM);
    const search = page.getByRole("searchbox", { name: JOURNAL_COPY.form.searchLabel });
    await search.fill("ból");

    const pinned = page.getByRole("region", { name: JOURNAL_COPY.form.pinnedHeading });
    const checkbox = pinned.getByRole("checkbox", { name: SYMPTOM, exact: true });
    await expect(checkbox).toBeChecked();
    await checkbox.focus();
    await page.keyboard.press("Space");

    await expect(pinned).toHaveCount(0);
    await expect(search).toBeFocused();
  });
});
