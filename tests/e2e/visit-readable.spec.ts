// Risk: visit-readable-with-many-entries (S-05, #108; context/changes/visit-readable-with-current-meds/plan.md, phase 3).
// With many medications and symptoms "Wizyta" folds things away to stay readable. Folding must never hide what FR-012
// requires next to an interaction: when the interactions part is folded, its title with the count keeps the note in
// view while the pair cards go. The current medications list shows every current medication, and only the newest
// symptom's question is open. Modeled on tests/e2e/seed.spec.ts.
//
// Data: a fresh account per test, so the count and the list depend on this test alone, and the shared E2E account
// is never touched. Signed up and signed in over HTTP (no UI), deleted with everything in it through the S-09 route in
// afterEach, also when the test fails. Only ids travel in URLs: names, substances and doses go in POST bodies. Local
// Supabase only (playwright.config.ts keeps the preview off .env).
import { test, expect, type Page } from "@playwright/test";
import { INTERACTION_COPY } from "../../src/lib/copy/interactions";
import { VISIT_SUMMARY_COPY } from "../../src/lib/copy/visit-summary";

// The account is created by the test itself, so it starts without the saved session.
test.use({ storageState: { cookies: [], origins: [] } });

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const STAMP = `${Date.now()}`;
const email = `e2e-visit-readable-${STAMP}@example.test`;
const password = `Haslo-e2e-${STAMP}`;

// A checked pair from scripts/rpl/pairs.mjs (B01AA with M01AE), both coded dictionary names, so the leaflet form saves
// them with their codes; paracetamolum is outside every pair. Three current medications, one possible interaction.
const MEDICATIONS = [
  { name: `E2E Wizyta ${STAMP} A`, substance: "acenocoumarolum" },
  { name: `E2E Wizyta ${STAMP} B`, substance: "ibuprofenum" },
  { name: `E2E Wizyta ${STAMP} C`, substance: "paracetamolum" },
];
// Four symptoms, oldest first: each saved an hour after the previous one, so "Ból głowy" is the newest.
const SYMPTOMS = ["kaszel", "gorączka", "drżenie", "ból głowy"];
const QUESTION_PHRASE = /mo(że|gą) mieć związek/;

// Warsaw calendar date, `offsetDays` from today, as `YYYY-MM-DD` (the app's "today" is Polish time).
function warsawDate(offsetDays: number): string {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Warsaw" }).format(new Date());
  const date = new Date(`${today}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

const capitalized = (name: string) => name.charAt(0).toLocaleUpperCase("pl") + name.slice(1);

// Origin is what the browser sends with the app's forms (Astro checkOrigin).
function originOf(baseURL: string | undefined): { Origin: string } {
  if (!baseURL) throw new Error("baseURL is not set in playwright.config.ts");
  return { Origin: new URL(baseURL).origin };
}

// The journal form is a React island: input typed before it hydrates is lost.
async function waitForIslands(page: Page) {
  await expect(page.locator("astro-island[ssr]")).toHaveCount(0);
}

async function saveSymptom(page: Page, symptom: string, occurredLocal: string) {
  await page.goto("/dzienniczek/nowy");
  await waitForIslands(page);
  await page.getByRole("checkbox", { name: symptom, exact: true }).check();
  await page.getByLabel("Data i godzina").fill(occurredLocal);
  await page.getByRole("button", { name: "Zapisz wpis" }).click();
  await page.waitForURL(new RegExp(`/dzienniczek\\?dodano=${UUID}$`));
}

// Runs also when the test fails: the account and, through the cascade, every medication and entry go with it.
test.afterEach(async ({ request, baseURL }) => {
  const headers = originOf(baseURL);
  const signedIn = await request.post("/api/auth/signin", { form: { email, password }, headers, maxRedirects: 0 });
  expect(signedIn.status()).toBe(302);
  expect(signedIn.headers().location).toBe("/");
  const deleted = await request.post("/api/account/delete", { form: { password }, headers, maxRedirects: 0 });
  expect(deleted.status()).toBe(303);
  expect(deleted.headers().location).toBe("/auth/konto-usuniete");
});

test.describe("visit summary with many medications and symptoms", () => {
  test("folded interactions keep the count and the note in view; every current medication listed; only the newest question open", async ({
    page,
    baseURL,
  }) => {
    test.setTimeout(90_000);
    test.info().annotations.push({ type: "test-data", description: email });
    const headers = originOf(baseURL);

    // Set up: a fresh account, signed in in this page's context, with three current medications and four symptoms.
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

    for (const medication of MEDICATIONS) {
      const added = await page.request.post("/api/medications", {
        form: {
          source: "leaflet",
          productName: medication.name,
          substanceName: medication.substance,
          doseText: "1 tabletka rano",
          startedOn: warsawDate(-2),
        },
        headers,
        maxRedirects: 0,
      });
      expect(added.headers().location).toMatch(new RegExp(`^/leki\\?dodano=${UUID}$`));
    }
    for (const [index, symptom] of SYMPTOMS.entries()) {
      await saveSymptom(page, symptom, `${warsawDate(-1)}T${10 + index}:00`);
    }

    await page.goto("/wizyta");

    // Every current medication is listed once at the top.
    const currentMedications = page.getByRole("region", { name: VISIT_SUMMARY_COPY.currentMedicationsHeading });
    for (const medication of MEDICATIONS) {
      await expect(currentMedications.getByRole("listitem").filter({ hasText: medication.name })).toHaveCount(1);
    }

    // Unfolded on arrival: the title with the count, the note under it and on the pair card.
    const interactionsTitle = VISIT_SUMMARY_COPY.interactionsHeadingCount.replace("{liczba}", "1");
    const interactions = page.getByRole("region", { name: interactionsTitle });
    const pairLabel = `${MEDICATIONS[0].name} i ${MEDICATIONS[1].name}`;
    await expect(interactions.getByText(pairLabel)).toBeVisible();
    await expect(interactions.getByText(INTERACTION_COPY.note).filter({ visible: true })).toHaveCount(2);

    // Folded through its title: the pair card goes, the title with the count and the note stay.
    await interactions.getByRole("heading", { name: interactionsTitle }).click();
    await expect(interactions.getByText(pairLabel)).toBeHidden();
    await expect(interactions.getByRole("heading", { name: interactionsTitle })).toBeVisible();
    await expect(interactions.getByText(INTERACTION_COPY.note).filter({ visible: true })).toHaveCount(1);

    // Questions: one per symptom; the newest one's question shows, the others are folded to their heading.
    const questions = page.getByRole("region", { name: VISIT_SUMMARY_COPY.questionsHeading });
    const newest = SYMPTOMS[SYMPTOMS.length - 1];
    for (const symptom of SYMPTOMS) {
      const card = questions.getByRole("group").filter({ has: page.getByText(capitalized(symptom), { exact: true }) });
      await expect(card.getByText(capitalized(symptom), { exact: true })).toBeVisible();
      const phrase = card.getByText(QUESTION_PHRASE).filter({ visible: true });
      if (symptom === newest) await expect(phrase.first()).toBeVisible();
      else await expect(phrase).toHaveCount(0);
    }
  });
});
