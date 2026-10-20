// Risk: no way back from the timeline and the graph to "Wizyta" (parked 18.10.2026, done 20.10.2026). Both screens are
// shared: the timeline opens from "Wizyta" and "Dziennik", the graph lives on /leki. The link in, with the fixed flag
// `?z=`, decides the "Wróć do …" link; a plain visit to /leki shows none. Only the fixed flag travels in the URL.
//
// Data: a fresh account (two current medications, so "Wizyta" links to the graph), deleted in afterEach through the
// S-09 route, also when the test fails. Local Supabase only (playwright.config.ts keeps the preview off .env).
import { test, expect } from "@playwright/test";
import { INTERACTION_COPY } from "../../src/lib/copy/interactions";
import { JOURNAL_COPY } from "../../src/lib/copy/journal";
import { TIMELINE_COPY } from "../../src/lib/copy/timeline";
import { pickSymptom } from "./journal-helpers";

test.use({ storageState: { cookies: [], origins: [] } });

const STAMP = `${Date.now()}`;
const email = `e2e-back-to-visit-${STAMP}@example.test`;
const password = `Haslo-e2e-${STAMP}`;
const MEDICATIONS = [
  { name: `E2E Powrót ${STAMP} A`, substance: "acenocoumarolum" },
  { name: `E2E Powrót ${STAMP} B`, substance: "ibuprofenum" },
];

function originOf(baseURL: string | undefined): { Origin: string } {
  if (!baseURL) throw new Error("baseURL is not set in playwright.config.ts");
  return { Origin: new URL(baseURL).origin };
}

function warsawDate(offsetDays: number): string {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Warsaw" }).format(new Date());
  const date = new Date(`${today}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

test.afterEach(async ({ request, baseURL }) => {
  const headers = originOf(baseURL);
  await request.post("/api/auth/signin", { form: { email, password }, headers, maxRedirects: 0 });
  const deleted = await request.post("/api/account/delete", { form: { password }, headers, maxRedirects: 0 });
  expect(deleted.headers().location).toBe("/auth/konto-usuniete");
});

test("the timeline and the graph lead back to where they were opened from", async ({ page, baseURL }) => {
  test.setTimeout(90_000);
  const headers = originOf(baseURL);
  await page.request.post("/api/auth/signup", {
    form: { email, password, confirmPassword: password, terms: "accepted" },
    headers,
    maxRedirects: 0,
  });
  const signedIn = await page.request.post("/api/auth/signin", { form: { email, password }, headers, maxRedirects: 0 });
  expect(signedIn.headers().location).toBe("/");
  for (const medication of MEDICATIONS) {
    await page.request.post("/api/medications", {
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
  }
  // "Dziennik" links to the timeline only once there is an entry.
  await page.goto("/dzienniczek/nowy");
  await expect(page.locator("astro-island[ssr]")).toHaveCount(0);
  await pickSymptom(page, "kaszel");
  await page.getByRole("button", { name: JOURNAL_COPY.form.submit }).click();
  await page.waitForURL(/\/dzienniczek\?dodano=/);

  // Wizyta → timeline → back to Wizyta.
  await page.goto("/wizyta");
  await page.getByRole("link", { name: TIMELINE_COPY.timelineLink }).click();
  await expect(page.getByRole("heading", { level: 1, name: TIMELINE_COPY.title })).toBeVisible();
  await expect(page.getByRole("link", { name: TIMELINE_COPY.backToJournal })).toHaveCount(0);
  await page.getByRole("link", { name: TIMELINE_COPY.backToVisit }).click();
  await expect(page).toHaveURL(/\/wizyta$/);

  // Wizyta → graph → back to Wizyta.
  await page.getByRole("link", { name: INTERACTION_COPY.graphVisitLink }).click();
  const graph = page.getByRole("region", { name: INTERACTION_COPY.graphTitle });
  await expect(graph.getByRole("link", { name: INTERACTION_COPY.graphBackToVisit })).toBeVisible();
  await graph.getByRole("link", { name: INTERACTION_COPY.graphBackToVisit }).click();
  await expect(page).toHaveURL(/\/wizyta$/);

  // Dziennik → timeline → back to Dziennik.
  await page.goto("/dzienniczek");
  await page.getByRole("link", { name: TIMELINE_COPY.timelineLink }).click();
  await expect(page.getByRole("link", { name: TIMELINE_COPY.backToVisit })).toHaveCount(0);
  await page.getByRole("link", { name: TIMELINE_COPY.backToJournal }).click();
  await expect(page).toHaveURL(/\/dzienniczek$/);

  // Leki opened from the menu: the graph is at home there, no link back.
  await page.goto("/leki");
  await expect(page.getByRole("link", { name: INTERACTION_COPY.graphBackToVisit })).toHaveCount(0);
});
