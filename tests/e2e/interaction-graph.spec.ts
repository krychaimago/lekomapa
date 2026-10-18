// Risk: the graph shows an interaction without its description and note, or mixes up the selection (S-10, FR-014;
// context/changes/interaction-graph/plan.md, phase 3). The graph is a React island on /leki fed by the account's
// medications and medication_interactions(), so only the rendered page proves it: touching a medication presses only
// that one and lists its partners, each with the note, and the pair's description as the rule set stores it; touching
// another medication switches the selection; touching it again clears it. The link from "Wizyta" lands on /leki#graf
// with the graph in view, medication buttons never overlap at phone width (also with a long hand-typed name), and no
// address ever carries a medication name. Modeled on tests/e2e/medication-interactions-compact.spec.ts.
//
// Layouts (issue 126, context/changes/graph-narrow-column/plan.md, phase 3): the card shows exactly one of three layouts
// by the width of its content in rem, so a larger text size counts as less room. The text size is raised the way a
// reader raises it, with font-size on <html>, which also grows the page and card margins (in rem); the cases at
// 412 px + 125% and 640 px + 125% are the ones where a threshold in px would pick another layout than the one in rem.
// In the column no two buttons overlap, Tab walks the rows top to bottom, and a selection lists the pair cards.
//
// Data: a fresh account per test, so the graph depends on this test alone, and the shared E2E account is never
// touched. Signed up and signed in over HTTP (no UI), deleted with everything in it through the S-09 route in
// afterEach, also when the test fails. Only ids travel in URLs: names, substances and doses go in POST bodies. Local
// Supabase only (playwright.config.ts keeps the preview off .env).
import { test, expect, type Locator, type Page } from "@playwright/test";
import { INTERACTION_COPY } from "../../src/lib/copy/interactions";

// The account is created by the test itself, so it starts without the saved session.
test.use({ storageState: { cookies: [], origins: [] }, viewport: { width: 360, height: 740 } });

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const STAMP = `${Date.now()}`;

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

interface Account {
  email: string;
  password: string;
}
// The account of the test running in this worker; tests of a worker run one after another, and every test's email
// carries its own label, so parallel workers never share an account.
let account: Account | null = null;

// A fresh account, signed in in this page's context, with every medication of ALL current. Only ids travel in URLs.
async function setUpAccount(page: Page, baseURL: string | undefined, label: string): Promise<void> {
  const email = `e2e-interaction-graph-${label}-${STAMP}@example.test`;
  const password = `Haslo-e2e-${STAMP}`;
  account = { email, password };
  test.info().annotations.push({ type: "test-data", description: email });
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

  // Saves a leaflet medication; a substance outside the dictionary goes through the "unchecked substance" step.
  for (const medication of ALL) {
    const added = await page.request.post("/api/medications", {
      form: {
        source: "leaflet",
        productName: medication.name,
        substanceName: medication.substance,
        doseText: "1 tabletka rano",
        startedOn: warsawDate(-2),
        ...(medication === LONG_NAME ? { confirmUnverified: "1" } : {}),
      },
      headers,
      maxRedirects: 0,
    });
    expect(added.headers().location).toMatch(new RegExp(`^/leki\\?dodano=${UUID}$`));
  }
}

// Bounding boxes of every medication button of `group`, each pair checked for overlap. Soft, so one run lists every
// overlapping pair; the test fails all the same. Requires a box for every medication, so a check that found no
// buttons cannot pass. All boxes are read in one call, in one frame: read one by one, they drifted apart by a fraction
// of a pixel while the page still scrolled after a viewport change, and rows that touch looked like overlapping ones.
async function expectNoOverlap(group: Locator, context: string) {
  const boxes = await group.getByRole("button").evaluateAll((buttons) =>
    buttons.map((button) => {
      const { x, y, width, height } = button.getBoundingClientRect();
      return { name: button.textContent.trim(), x, y, width, height };
    }),
  );
  expect(boxes.map((box) => box.name).sort(), context).toEqual(ALL.map((medication) => medication.name).sort());
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const [a, b] = [boxes[i], boxes[j]];
      const overlap = a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
      expect.soft(overlap, `${context}: ${a.name} overlaps ${b.name}: ${JSON.stringify([a, b])}`).toBe(false);
    }
  }
}

// Runs also when the test fails: the account and, through the cascade, every medication goes with it.
test.afterEach(async ({ request, baseURL }) => {
  if (!account) throw new Error("the test did not set up its account");
  const { email, password } = account;
  account = null;
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

    // Every address the page asks for, checked at the end for medication names.
    const requestedUrls: string[] = [];
    page.on("request", (request) => requestedUrls.push(request.url()));

    // Set up: a fresh account, signed in in this page's context, with six current medications.
    await setUpAccount(page, baseURL, "select");

    await page.goto("/leki");
    const graph = await openGraph(page);
    const button = (name: string) => graph.getByRole("button", { name, exact: true });
    // The graph section holds the panel; the live region announces only a short status, never the cards.
    const panel = page.locator("#graf");
    const status = panel.getByRole("status");
    // Visible text of the panel; the status repeats some of it for the screen reader.
    const shown = (text: string) => panel.getByRole("paragraph").and(panel.getByText(text, { exact: true }));

    // Every current medication is a button, none pressed, and the panel says nothing is selected.
    await expect(graph.getByRole("button")).toHaveCount(ALL.length);
    await expect(graph.locator('button[aria-pressed="true"]')).toHaveCount(0);
    await expect(shown(INTERACTION_COPY.graphNoSelection)).toBeVisible();
    await expect(status).toHaveText(INTERACTION_COPY.graphNoSelection);

    // At phone width the medication buttons never overlap, the long name included; the selection is still checked
    // below when they do.
    await expectNoOverlap(graph, "360 px, text 100%");

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
    // The screen reader hears the name and the partner count once, without the cards and their notes.
    await expect(status).toHaveText(
      INTERACTION_COPY.graphStatusMany
        .replace("{nazwa}", IBUPROFEN.name)
        .replace("{liczba}", String(IBUPROFEN_PARTNERS.length)),
    );
    await expect(status.locator("li")).toHaveCount(0);

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
    await expect(status).toHaveText(`${NO_PAIR.name}: ${INTERACTION_COPY.noInteractionsForMedication}`);
    await expect(panel.getByRole("region", { name: IBUPROFEN.name })).toHaveCount(0);

    // Touch it again: nothing is selected.
    await button(NO_PAIR.name).click();
    await expect(graph.locator('button[aria-pressed="true"]')).toHaveCount(0);
    await expect(shown(INTERACTION_COPY.graphNoSelection)).toBeVisible();
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

  test("exactly one layout by the card's width in rem; the column never overlaps, tabs top to bottom and selects", async ({
    page,
    baseURL,
  }) => {
    test.setTimeout(90_000);
    await setUpAccount(page, baseURL, "layouts");

    await page.goto("/leki");
    await openGraph(page);
    const scene = (name: string) => page.locator(`[data-graph-scene="${name}"]`);
    // Only the visible layout's group is in the accessibility tree; the other two are display:none.
    const visibleGraph = page.getByRole("group", { name: INTERACTION_COPY.graphLabel });
    await expect(page.locator("[data-graph-scene]")).toHaveCount(3);

    // Card content = viewport minus the page and card margins, which grow with the text. "column" below 18.25 rem,
    // "phone" from 18.25 rem, "wide" from 30 rem.
    const cases = [
      { width: 320, text: 100, layout: "column" },
      // A regression of the threshold the other way: at the default text size a 360 px phone keeps layout "C".
      { width: 360, text: 100, layout: "phone" },
      { width: 1280, text: 100, layout: "wide" },
      { width: 360, text: 125, layout: "column" },
      // About 330 px of card content: a threshold of 292 px would show the phone layout.
      { width: 412, text: 125, layout: "column" },
      // About 558 px of card content: a threshold of 480 px would show the wide layout.
      { width: 640, text: 125, layout: "phone" },
      { width: 360, text: 150, layout: "column" },
    ];
    for (const { width, text, layout } of cases) {
      const context = `${String(width)} px, text ${String(text)}%`;
      await page.setViewportSize({ width, height: 740 });
      await page.evaluate(
        (size) => {
          document.documentElement.style.fontSize = size;
        },
        `${String(text)}%`,
      );

      await expect(scene(layout), context).toBeVisible();
      for (const other of ["column", "phone", "wide"].filter((name) => name !== layout)) {
        await expect(scene(other), `${context}: ${other}`).toBeHidden();
      }
      await expect(visibleGraph, context).toHaveCount(1);
      await expect(scene(layout).getByRole("group", { name: INTERACTION_COPY.graphLabel }), context).toHaveCount(1);
      await expect(visibleGraph.getByRole("button"), context).toHaveCount(ALL.length);
      if (layout === "column") await expectNoOverlap(visibleGraph, context);
    }

    // The column at 320 px and the default text size.
    await page.setViewportSize({ width: 320, height: 740 });
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "100%";
    });
    await expect(scene("column")).toBeVisible();
    const column = scene("column").getByRole("group", { name: INTERACTION_COPY.graphLabel });
    const rows = column.getByRole("button");

    // Rows alphabetically (Polish collation, written out by hand), each one lower on the screen than the one before.
    const alphabetical = [ACENOCOUMAROL, IBUPROFEN, NO_PAIR, LONG_NAME, RAMIPRIL, SERTRALINE];
    await expect(rows).toHaveCount(alphabetical.length);
    let previousY = Number.NEGATIVE_INFINITY;
    for (const [index, medication] of alphabetical.entries()) {
      await expect(rows.nth(index)).toHaveAccessibleName(medication.name);
      const box = await rows.nth(index).boundingBox();
      expect(box, medication.name).not.toBeNull();
      if (box) {
        expect(box.y, medication.name).toBeGreaterThan(previousY);
        previousY = box.y;
      }
    }

    // Tab walks the rows in the order they stand on the screen.
    await rows.first().focus();
    await expect(rows.first()).toBeFocused();
    for (let index = 1; index < alphabetical.length; index++) {
      await page.keyboard.press("Tab");
      await expect(rows.nth(index), alphabetical[index].name).toBeFocused();
    }

    // Touch ibuprofen in the column: only it is pressed and the panel lists its three partners, each with the note.
    await column.getByRole("button", { name: IBUPROFEN.name, exact: true }).click();
    await expect(column.getByRole("button", { name: IBUPROFEN.name, exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(column.locator('button[aria-pressed="true"]')).toHaveCount(1);
    const panel = page.locator("#graf");
    const ibuprofenPanel = panel.getByRole("region", { name: IBUPROFEN.name });
    await expect(ibuprofenPanel).toBeVisible();
    const cards = ibuprofenPanel.getByRole("listitem");
    await expect(cards).toHaveCount(IBUPROFEN_PARTNERS.length);
    for (const partner of IBUPROFEN_PARTNERS) {
      const card = cards.filter({ hasText: partnerHeading(partner.name) });
      await expect(card).toHaveCount(1);
      await expect(card.getByText(INTERACTION_COPY.note, { exact: true })).toBeVisible();
    }

    // The selection is shared: at 360 px the phone layout shows the same medication pressed.
    await page.setViewportSize({ width: 360, height: 740 });
    await expect(scene("phone")).toBeVisible();
    const phone = scene("phone").getByRole("group", { name: INTERACTION_COPY.graphLabel });
    await expect(phone.getByRole("button", { name: IBUPROFEN.name, exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(ibuprofenPanel.getByRole("listitem")).toHaveCount(IBUPROFEN_PARTNERS.length);
  });
});
