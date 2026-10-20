// Risk: a filter hides data and the picture shown to the doctor is incomplete without a warning (S-09, FR-013;
// context/changes/medication-symptom-timeline/plan.md, phase 4). The timeline filters work with CSS alone, so only the
// rendered page proves them: with no symptom chosen there is no symptom row and the hint shows; a chosen symptom shows
// its row and no other; an unticked medication leaves the chart and the text list, and "Część leków jest ukryta." is
// in view for as long as one is unticked; "Pokaż wszystkie" brings the medications back and keeps the chosen symptom
// and range. The address stays /wizyta/os-czasu with no parameters throughout. Runs at phone width. Modeled on
// tests/e2e/medication-interactions-compact.spec.ts.
//
// Data: a fresh account per test, so the rows depend on this test alone, and the shared E2E account is never touched.
// Signed up and signed in over HTTP (no UI), deleted with everything in it through the S-09 route in afterEach, also
// when the test fails. Only ids travel in URLs: names, substances, doses and symptoms go in POST bodies. Local Supabase
// only (playwright.config.ts keeps the preview off .env).
import { test, expect, type Locator, type Page } from "@playwright/test";
import { JOURNAL_COPY } from "../../src/lib/copy/journal";
import { TIMELINE_COPY } from "../../src/lib/copy/timeline";
import { TIMELINE_DOM } from "../../src/lib/services/timeline";
import { pickSymptom } from "./journal-helpers";

// The account is created by the test itself, so it starts without the saved session.
test.use({ storageState: { cookies: [], origins: [] }, viewport: { width: 360, height: 740 } });

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const STAMP = `${Date.now()}`;
const email = `e2e-timeline-${STAMP}@example.test`;
const password = `Haslo-e2e-${STAMP}`;
const TIMELINE_PATH = "/wizyta/os-czasu";

// Two coded dictionary names, so the leaflet form saves them without the "unchecked substance" step. The first one
// changes its dose, so its bar has two periods; the second one is the medication unticked in the test.
const CHANGED = {
  name: `E2E Oś ${STAMP} Zmiana`,
  substance: "paracetamolum",
  firstDose: "1 tabletka rano",
  secondDose: "2 tabletki rano",
};
const HIDDEN = { name: `E2E Oś ${STAMP} Ukrywany`, substance: "ramiprilum", dose: "1 tabletka wieczorem" };
// Two symptoms with entries from the last 14 days (the journal accepts at most 14 days back).
const CHOSEN_SYMPTOM = "kaszel";
const OTHER_SYMPTOM = "gorączka";

// Warsaw calendar date, `offsetDays` from today, as `YYYY-MM-DD` (the app's "today" is Polish time).
function warsawDate(offsetDays: number): string {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Warsaw" }).format(new Date());
  const date = new Date(`${today}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

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
  await pickSymptom(page, symptom);
  await page.getByLabel(JOURNAL_COPY.form.occurredLabel).fill(occurredLocal);
  await page.getByRole("button", { name: JOURNAL_COPY.form.submit }).click();
  await page.waitForURL(new RegExp(`/dzienniczek\\?dodano=${UUID}$`));
}

// The filters never touch the address: nothing but the fixed path and the fixed origin flag of the way in
// (`?z=wizyta`, src/lib/back-link.ts), no fragment.
async function expectPlainTimelineUrl(page: Page) {
  await expect(page).toHaveURL(
    (url) => url.pathname === TIMELINE_PATH && url.search === "?z=wizyta" && url.hash === "",
  );
}

// Every range is rendered in both layouts and CSS shows one, so every check counts only what is visible.
const visibleText = (scope: Locator, text: string) => scope.getByText(text, { exact: true }).filter({ visible: true });

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

test.describe("medication and symptom timeline on a phone", () => {
  test("filters show one symptom and the ticked medications; hidden medications are always announced", async ({
    page,
    baseURL,
  }) => {
    test.setTimeout(90_000);
    test.info().annotations.push({ type: "test-data", description: email });
    const headers = originOf(baseURL);

    // Set up: a fresh account, signed in in this page's context.
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

    // Saves a leaflet medication and returns its id from the `?dodano=` redirect.
    async function addMedication(name: string, substance: string, doseText: string, startedOn: string) {
      const added = await page.request.post("/api/medications", {
        form: { source: "leaflet", productName: name, substanceName: substance, doseText, startedOn },
        headers,
        maxRedirects: 0,
      });
      const location = added.headers().location;
      expect(location).toMatch(new RegExp(`^/leki\\?dodano=${UUID}$`));
      return new URL(location, "http://localhost").searchParams.get("dodano") ?? "";
    }

    // The first medication starts first, so it is the first row; its dose changes three days ago, which closes the
    // first period and opens a second one.
    const changedId = await addMedication(CHANGED.name, CHANGED.substance, CHANGED.firstDose, warsawDate(-10));
    const changed = await page.request.post(`/api/medications/${changedId}/dosage`, {
      form: { doseText: CHANGED.secondDose, changedOn: warsawDate(-3) },
      headers,
      maxRedirects: 0,
    });
    expect(changed.status()).toBe(302);
    expect(changed.headers().location).toBe(`/leki/${changedId}?zmieniono=1`);
    await addMedication(HIDDEN.name, HIDDEN.substance, HIDDEN.dose, warsawDate(-5));

    await saveSymptom(page, OTHER_SYMPTOM, `${warsawDate(-4)}T10:00`);
    await saveSymptom(page, CHOSEN_SYMPTOM, `${warsawDate(-2)}T11:00`);

    // The way in: the link next to the current medications in "Wizyta".
    await page.goto("/wizyta");
    await page.getByRole("link", { name: TIMELINE_COPY.timelineLink }).click();
    await page.waitForURL((url) => url.pathname === TIMELINE_PATH);
    await expectPlainTimelineUrl(page);

    const chart = page.locator("section").filter({ has: page.getByRole("img", { name: TIMELINE_COPY.chartLabel }) });
    const textList = page
      .getByRole("group")
      .filter({ has: page.getByText(TIMELINE_COPY.textListSummary, { exact: true }) });
    const symptomSelect = page.getByRole("combobox", { name: TIMELINE_COPY.symptomLabel, exact: true });
    const hiddenNotice = page.getByRole("status").filter({ hasText: TIMELINE_COPY.medicationsHidden });
    const rangeRadio = (label: string) => page.getByRole("radio", { name: label, exact: true });
    const visibleRange = (key: "90d" | "year" | "all") =>
      page.locator(`.${TIMELINE_DOM.rangeClass(key)}`).filter({ visible: true });
    const textItemOf = (name: string) =>
      textList
        .getByRole("listitem")
        .filter({ hasText: `${name}: ` })
        .filter({ visible: true });

    // Start: every medication, no symptom row, the hint in its place, nothing announced as hidden.
    await expect(rangeRadio(TIMELINE_COPY.range90d)).toBeChecked();
    await expect(visibleText(chart, CHANGED.name)).toHaveCount(1);
    await expect(visibleText(chart, HIDDEN.name)).toHaveCount(1);
    await expect(visibleText(chart, TIMELINE_COPY.symptomHint)).toHaveCount(1);
    await expect(visibleText(chart, CHOSEN_SYMPTOM)).toHaveCount(0);
    await expect(visibleText(chart, OTHER_SYMPTOM)).toHaveCount(0);
    await expect(hiddenNotice).toBeHidden();
    await expect(symptomSelect).toHaveValue("");

    // Range "Rok": the year's chart replaces the 90 days'.
    // The radio itself is sr-only; a user clicks its visible label.
    await page
      .locator("label")
      .filter({ has: rangeRadio(TIMELINE_COPY.rangeYear) })
      .click();
    await expect(rangeRadio(TIMELINE_COPY.rangeYear)).toBeChecked();
    await expect(visibleRange("90d")).toHaveCount(0);
    await expect(visibleRange("year").first()).toBeVisible();
    await expect(visibleText(chart, CHANGED.name)).toHaveCount(1);
    await expectPlainTimelineUrl(page);

    // One symptom chosen: its row shows, the other symptom's does not, the hint goes.
    await symptomSelect.selectOption({ label: CHOSEN_SYMPTOM });
    await expect(visibleText(chart, CHOSEN_SYMPTOM)).toHaveCount(1);
    await expect(visibleText(chart, OTHER_SYMPTOM)).toHaveCount(0);
    await expect(visibleText(chart, TIMELINE_COPY.symptomHint)).toHaveCount(0);
    await expectPlainTimelineUrl(page);

    // The same data as text: both medications, the changed one with both doses, and only the chosen symptom.
    await textList.getByText(TIMELINE_COPY.textListSummary, { exact: true }).click();
    await expect(textItemOf(CHANGED.name)).toHaveCount(1);
    await expect(textItemOf(CHANGED.name)).toContainText(CHANGED.firstDose);
    await expect(textItemOf(CHANGED.name)).toContainText(CHANGED.secondDose);
    await expect(textItemOf(HIDDEN.name)).toHaveCount(1);
    await expect(textList.getByText(`${CHOSEN_SYMPTOM}: `).filter({ visible: true })).toHaveCount(1);
    await expect(textList.getByText(`${OTHER_SYMPTOM}: `).filter({ visible: true })).toHaveCount(0);

    // One medication unticked: its row and its text item go, the other stays, and the hiding is announced.
    await page.getByText(TIMELINE_COPY.showMedications, { exact: true }).click();
    await page.getByRole("checkbox", { name: HIDDEN.name, exact: true }).uncheck();
    await expect(visibleText(chart, HIDDEN.name)).toHaveCount(0);
    await expect(textItemOf(HIDDEN.name)).toHaveCount(0);
    await expect(visibleText(chart, CHANGED.name)).toHaveCount(1);
    await expect(textItemOf(CHANGED.name)).toHaveCount(1);
    await expect(hiddenNotice).toBeVisible();
    await expect(hiddenNotice.getByText(TIMELINE_COPY.medicationsHidden, { exact: true })).toBeVisible();
    await expectPlainTimelineUrl(page);

    // "Pokaż wszystkie": the medication is back in the chart and the text, the notice goes, and the chosen symptom and
    // the range "Rok" stay as they were.
    await hiddenNotice.getByRole("button", { name: TIMELINE_COPY.showAll }).click();
    await expect(page.getByRole("checkbox", { name: HIDDEN.name, exact: true })).toBeChecked();
    await expect(visibleText(chart, HIDDEN.name)).toHaveCount(1);
    await expect(textItemOf(HIDDEN.name)).toHaveCount(1);
    await expect(hiddenNotice).toBeHidden();
    await expect(symptomSelect.locator("option:checked")).toHaveText(CHOSEN_SYMPTOM);
    await expect(visibleText(chart, CHOSEN_SYMPTOM)).toHaveCount(1);
    await expect(visibleText(chart, OTHER_SYMPTOM)).toHaveCount(0);
    await expect(rangeRadio(TIMELINE_COPY.rangeYear)).toBeChecked();
    await expect(visibleRange("90d")).toHaveCount(0);
    await expect(visibleRange("year").first()).toBeVisible();
    await expectPlainTimelineUrl(page);
  });
});
