// Risk: the graph shows an interaction without its description and note, or mixes up the selection (S-10, FR-014;
// context/changes/interaction-graph/plan.md, phase 3). The graph is a React island on /leki fed by the account's
// medications and medication_interactions(), so only the rendered page proves it: touching a medication presses only
// that one and lists its partners, each with the note, and the pair's description as the rule set stores it; touching
// another medication switches the selection; touching it again clears it. The link from "Wizyta" lands on /leki#graf
// with the graph in view, medication buttons never overlap at phone width (also with a long hand-typed name), and no
// address ever carries a medication name. Modeled on tests/e2e/medication-interactions-compact.spec.ts.
//
// Data: a fresh account per test, so the graph depends on this test alone, and the shared E2E account is never
// touched. Signed up and signed in over HTTP (no UI), deleted with everything in it through the S-09 route in
// afterEach, also when the test fails. Only ids travel in URLs: names, substances and doses go in POST bodies. Local
// Supabase only (playwright.config.ts keeps the preview off .env).
import { test, expect, type Page } from "@playwright/test";
import { INTERACTION_COPY } from "../../src/lib/copy/interactions";

// The account is created by the test itself, so it starts without the saved session.
test.use({ storageState: { cookies: [], origins: [] }, viewport: { width: 360, height: 740 } });

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const STAMP = `${Date.now()}`;
const email = `e2e-interaction-graph-${STAMP}@example.test`;
const password = `Haslo-e2e-${STAMP}`;

// The medication touched first: ibuprofenum (M01AE), a coded dictionary name.
const IBUPROFEN = { name: `E2E Graf ${STAMP} Ibuprofen`, substance: "ibuprofenum" };
// Three coded dictionary names from groups paired with M01AE in supabase/seed-data/interaction_pairs.csv. The first
// one's description, as the seed stores it, is checked word for word.
const ACENOCOUMAROL = {
  name: `E2E Graf ${STAMP} Acenokumarol`,
  substance: "acenocoumarolum", // B01AA
  description:
    "Antagoniści witaminy K (np. acenokumarol, warfaryna) i leki przeciwbólowe z grupy ibuprofenu (np. ibuprofen, naproksen) mogą wchodzić w interakcję. Jednoczesne przyjmowanie może mieć związek z łatwiejszym powstawaniem krwawień i siniaków.",
};
const RAMIPRIL = { name: `E2E Graf ${STAMP} Ramipryl`, substance: "ramiprilum" }; // C09AA
const SERTRALINE = { name: `E2E Graf ${STAMP} Sertralina`, substance: "sertralinum" }; // N06AB
const IBUPROFEN_PARTNERS = [ACENOCOUMAROL, RAMIPRIL, SERTRALINE];
// paracetamolum (N02BE) is in no pair of the rule set.
const NO_PAIR = { name: `E2E Graf ${STAMP} Paracetamol`, substance: "paracetamolum" };
// A long name typed by hand with a substance outside the dictionary (saved after the "unchecked substance" step), so
// it is in no pair either. 80 characters: two lines on the button at most, the full name only in the panel.
const LONG_PREFIX = `E2E Graf ${STAMP} Preparat o bardzo długiej nazwie handlowej `;
const LONG_NAME = { name: LONG_PREFIX.padEnd(80, "x"), substance: "substancja wpisana ręcznie w teście grafu" };
const ALL = [IBUPROFEN, ...IBUPROFEN_PARTNERS, NO_PAIR, LONG_NAME];

// Copy template filled the way the graph fills it: `{nazwa}` replaced.
const partnerHeading = (name: string) => INTERACTION_COPY.graphPartner.replace("{nazwa}", name);

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

// The graph is a client:visible island: brought into view, then waited for until it has hydrated, because a touch
// before hydration is lost.
async function openGraph(page: Page) {
  const graph = page.getByRole("group", { name: INTERACTION_COPY.graphLabel });
  await graph.scrollIntoViewIfNeeded();
  await expect(page.locator("astro-island[ssr]")).toHaveCount(0);
  return graph;
}

// Runs also when the test fails: the account and, through the cascade, every medication goes with it.
test.afterEach(async ({ request, baseURL }) => {
  const headers = originOf(baseURL);
  const signedIn = await request.post("/api/auth/signin", { form: { email, password }, headers, maxRedirects: 0 });
  expect(signedIn.status()).toBe(302);
  expect(signedIn.headers().location).toBe("/");
  const deleted = await request.post("/api/account/delete", { form: { password }, headers, maxRedirects: 0 });
  expect(deleted.status()).toBe(303);
  expect(deleted.headers().location).toBe("/auth/konto-usuniete");
});

test.describe("interaction graph on the medication list", () => {
  test("a touch selects, switches and clears; every partner shows the note and the pair's description", async ({
    page,
    baseURL,
  }) => {
    test.setTimeout(90_000);
    test.info().annotations.push({ type: "test-data", description: email });
    const headers = originOf(baseURL);

    // Every address the page asks for, checked at the end for medication names.
    const requestedUrls: string[] = [];
    page.on("request", (request) => requestedUrls.push(request.url()));

    // Set up: a fresh account, signed in in this page's context, with six current medications.
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

    // Saves a leaflet medication; a substance outside the dictionary goes through the "unchecked substance" step.
    async function addMedication(name: string, substance: string, unverified = false) {
      const added = await page.request.post("/api/medications", {
        form: {
          source: "leaflet",
          productName: name,
          substanceName: substance,
          doseText: "1 tabletka rano",
          startedOn: warsawDate(-2),
          ...(unverified ? { confirmUnverified: "1" } : {}),
        },
        headers,
        maxRedirects: 0,
      });
      expect(added.headers().location).toMatch(new RegExp(`^/leki\\?dodano=${UUID}$`));
    }
    for (const medication of ALL) {
      await addMedication(medication.name, medication.substance, medication === LONG_NAME);
    }

    await page.goto("/leki");
    const graph = await openGraph(page);
    const button = (name: string) => graph.getByRole("button", { name, exact: true });
    const panel = page.locator("[aria-live=polite]").filter({ hasText: INTERACTION_COPY.graphNoLineIsNotSafe });

    // Every current medication is a button, none pressed, and the panel says nothing is selected.
    await expect(graph.getByRole("button")).toHaveCount(ALL.length);
    await expect(graph.locator('button[aria-pressed="true"]')).toHaveCount(0);
    await expect(panel.getByText(INTERACTION_COPY.graphNoSelection, { exact: true })).toBeVisible();

    // At phone width the medication buttons never overlap, the long name included. Soft, so one run lists every
    // overlapping pair and still checks the selection below; the test fails all the same.
    const boxes = [];
    for (const medication of ALL) {
      const box = await button(medication.name).boundingBox();
      expect(box, medication.name).not.toBeNull();
      if (box) boxes.push({ name: medication.name, ...box });
    }
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const [a, b] = [boxes[i], boxes[j]];
        const overlap = a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
        expect.soft(overlap, `${a.name} overlaps ${b.name}: ${JSON.stringify([a, b])}`).toBe(false);
      }
    }

    // Touch ibuprofen: only it is pressed, the panel names it and lists its three partners, each with the note.
    await button(IBUPROFEN.name).click();
    await expect(button(IBUPROFEN.name)).toHaveAttribute("aria-pressed", "true");
    await expect(graph.locator('button[aria-pressed="true"]')).toHaveCount(1);
    const ibuprofenPanel = panel.getByRole("region", { name: IBUPROFEN.name });
    await expect(ibuprofenPanel).toBeVisible();
    const cards = ibuprofenPanel.getByRole("listitem");
    await expect(cards).toHaveCount(IBUPROFEN_PARTNERS.length);
    for (const partner of IBUPROFEN_PARTNERS) {
      const card = cards.filter({ hasText: partnerHeading(partner.name) });
      await expect(card).toHaveCount(1);
      await expect(card.getByText(INTERACTION_COPY.note, { exact: true })).toBeVisible();
    }
    await expect(ibuprofenPanel.getByText(INTERACTION_COPY.note, { exact: true })).toHaveCount(
      IBUPROFEN_PARTNERS.length,
    );

    // Unfold the acenocoumarol card: the pair's description, word for word, with the note still under it.
    const acenocoumarolCard = cards.filter({ hasText: partnerHeading(ACENOCOUMAROL.name) });
    await acenocoumarolCard.getByRole("button", { name: partnerHeading(ACENOCOUMAROL.name) }).click();
    await expect(acenocoumarolCard.getByText(ACENOCOUMAROL.description, { exact: true })).toBeVisible();
    await expect(acenocoumarolCard.getByText(INTERACTION_COPY.note, { exact: true })).toBeVisible();

    // Touch the medication without a pair: the selection switches to it and the panel says it has no checked pair.
    await button(NO_PAIR.name).click();
    await expect(button(NO_PAIR.name)).toHaveAttribute("aria-pressed", "true");
    await expect(button(IBUPROFEN.name)).toHaveAttribute("aria-pressed", "false");
    await expect(graph.locator('button[aria-pressed="true"]')).toHaveCount(1);
    const noPairPanel = panel.getByRole("region", { name: NO_PAIR.name });
    await expect(noPairPanel.getByText(INTERACTION_COPY.noInteractionsForMedication, { exact: true })).toBeVisible();
    await expect(noPairPanel.getByRole("listitem")).toHaveCount(0);
    await expect(panel.getByRole("region", { name: IBUPROFEN.name })).toHaveCount(0);

    // Touch it again: nothing is selected.
    await button(NO_PAIR.name).click();
    await expect(graph.locator('button[aria-pressed="true"]')).toHaveCount(0);
    await expect(panel.getByText(INTERACTION_COPY.graphNoSelection, { exact: true })).toBeVisible();
    await expect(panel.getByRole("region")).toHaveCount(0);

    // The long name is selectable too, and the panel carries it in full.
    await button(LONG_NAME.name).click();
    await expect(panel.getByRole("heading", { name: LONG_NAME.name, exact: true })).toBeVisible();

    // From "Wizyta" the link leads to the graph anchor, with the graph in view.
    await page.goto("/wizyta");
    await page
      .locator("[data-visit-interactions]")
      .getByRole("link", { name: INTERACTION_COPY.graphVisitLink, exact: true })
      .click();
    await expect(page).toHaveURL(/\/leki#graf$/);
    await expect(page.getByRole("group", { name: INTERACTION_COPY.graphLabel })).toBeInViewport();

    // No address the page asked for carries a medication name or substance (raw or URL-encoded), or this run's
    // marker, which every name holds.
    const forbidden = [STAMP, ...ALL.flatMap((medication) => [medication.name, medication.substance])];
    for (const url of requestedUrls) {
      const decoded = decodeURIComponent(url.replaceAll("+", " "));
      for (const text of forbidden) expect(decoded, url).not.toContain(text);
    }
    expect(requestedUrls.length).toBeGreaterThan(0);
  });
});
