// Risk: folding-hides-the-note (S-07; context/changes/medication-interactions-compact/plan.md, phase 2).
// On a medication's details every interaction card is folded to its heading to keep the page short on a phone.
// Folding must never hide what FR-007 requires next to an interaction: the note stays in view on every folded card,
// and unfolding one card shows that pair's description and the link to the other medication while the rest stay
// folded. Runs at phone width, where the length of the list hurts most. Modeled on tests/e2e/visit-readable.spec.ts.
//
// Data: a fresh account per test, so the cards depend on this test alone, and the shared E2E account is never
// touched. Signed up and signed in over HTTP (no UI), deleted with everything in it through the S-09 route in
// afterEach, also when the test fails. Only ids travel in URLs: names, substances and doses go in POST bodies. Local
// Supabase only (playwright.config.ts keeps the preview off .env).
import { test, expect } from "@playwright/test";
import { INTERACTION_COPY } from "../../src/lib/copy/interactions";

// The account is created by the test itself, so it starts without the saved session.
test.use({ storageState: { cookies: [], origins: [] }, viewport: { width: 360, height: 740 } });

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const STAMP = `${Date.now()}`;
const email = `e2e-interactions-compact-${STAMP}@example.test`;
const password = `Haslo-e2e-${STAMP}`;

// The medication whose details are checked: ibuprofenum (M01AE), a coded dictionary name.
const IBUPROFEN = { name: `E2E Kolizje ${STAMP} Ibuprofen`, substance: "ibuprofenum" };
// Three coded dictionary names from three groups paired with M01AE in supabase/seed-data/interaction_pairs.csv,
// each with that pair's description as the seed stores it.
const OTHERS = [
  {
    name: `E2E Kolizje ${STAMP} Acenokumarol`,
    substance: "acenocoumarolum", // B01AA
    description:
      "Antagoniści witaminy K (np. acenokumarol, warfaryna) i leki przeciwbólowe z grupy ibuprofenu (np. ibuprofen, naproksen) mogą wchodzić w interakcję. Jednoczesne przyjmowanie może mieć związek z łatwiejszym powstawaniem krwawień i siniaków.",
  },
  {
    name: `E2E Kolizje ${STAMP} Ramipryl`,
    substance: "ramiprilum", // C09AA
    description:
      "Inhibitory ACE (np. ramipryl, perindopryl) i leki przeciwbólowe z grupy ibuprofenu (np. ibuprofen, naproksen) mogą wchodzić w interakcję. Jednoczesne przyjmowanie może mieć związek ze słabszym obniżeniem ciśnienia oraz ze zmianami czynności nerek i stężenia potasu we krwi.",
  },
  {
    name: `E2E Kolizje ${STAMP} Sertralina`,
    substance: "sertralinum", // N06AB
    description:
      "Leki przeciwbólowe z grupy ibuprofenu (np. ibuprofen, naproksen) i leki przeciwdepresyjne z grupy SSRI (np. sertralina, escytalopram) mogą wchodzić w interakcję. Jednoczesne przyjmowanie może mieć związek z krwawieniem z przewodu pokarmowego.",
  },
];

// Copy templates are filled the way the screen fills them: `{nazwa}` / `{liczba}` replaced.
const withMedication = (name: string) => INTERACTION_COPY.withMedication.replace("{nazwa}", name);
const openOtherMedication = (name: string) => INTERACTION_COPY.openOtherMedication.replace("{nazwa}", name);

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

test.describe("folded interaction cards on medication details", () => {
  test("every folded card keeps its note; unfolding one shows its description and link, the rest stay folded", async ({
    page,
    baseURL,
  }) => {
    test.setTimeout(60_000);
    test.info().annotations.push({ type: "test-data", description: email });
    const headers = originOf(baseURL);

    // Set up: a fresh account, signed in in this page's context, with ibuprofen and three medications paired with it.
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
    async function addMedication(name: string, substance: string): Promise<string> {
      const added = await page.request.post("/api/medications", {
        form: {
          source: "leaflet",
          productName: name,
          substanceName: substance,
          doseText: "1 tabletka rano",
          startedOn: warsawDate(-2),
        },
        headers,
        maxRedirects: 0,
      });
      const location = added.headers().location;
      expect(location).toMatch(new RegExp(`^/leki\\?dodano=${UUID}$`));
      return new URL(location, "http://localhost").searchParams.get("dodano") ?? "";
    }

    const ibuprofenId = await addMedication(IBUPROFEN.name, IBUPROFEN.substance);
    const otherIds: string[] = [];
    for (const other of OTHERS) otherIds.push(await addMedication(other.name, other.substance));

    await page.goto(`/leki/${ibuprofenId}`);

    // The section title carries the number of cards.
    const title = INTERACTION_COPY.detailsHeadingCount.replace("{liczba}", String(OTHERS.length));
    await expect(page.getByRole("heading", { level: 2, name: title })).toBeVisible();

    const cardOf = (name: string) => page.getByRole("listitem").filter({ hasText: withMedication(name) });

    // Folded on arrival: each card shows its heading and its note, never the pair's description or the link.
    await expect(page.getByText(INTERACTION_COPY.note, { exact: true }).filter({ visible: true })).toHaveCount(
      OTHERS.length,
    );
    for (const other of OTHERS) {
      const card = cardOf(other.name);
      await expect(card).toHaveCount(1);
      await expect(card.getByText(withMedication(other.name), { exact: true })).toBeVisible();
      await expect(card.getByText(INTERACTION_COPY.note, { exact: true })).toBeVisible();
      await expect(card.getByText(other.description, { exact: true })).toBeHidden();
      await expect(card.getByRole("link", { name: openOtherMedication(other.name) })).toBeHidden();
    }

    // Unfold the first card through its heading.
    const [opened, ...folded] = OTHERS;
    const openedCard = cardOf(opened.name);
    await openedCard.getByText(withMedication(opened.name), { exact: true }).click();

    // The unfolded card shows the description and the link to the other medication, and keeps its note.
    await expect(openedCard.getByText(opened.description, { exact: true })).toBeVisible();
    const link = openedCard.getByRole("link", { name: openOtherMedication(opened.name) });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute("href", `/leki/${otherIds[0]}`);
    await expect(openedCard.getByText(INTERACTION_COPY.note, { exact: true })).toBeVisible();

    // The other cards stay folded, each still with its note.
    for (const other of folded) {
      const card = cardOf(other.name);
      await expect(card.getByText(other.description, { exact: true })).toBeHidden();
      await expect(card.getByRole("link", { name: openOtherMedication(other.name) })).toBeHidden();
      await expect(card.getByText(INTERACTION_COPY.note, { exact: true })).toBeVisible();
    }
    await expect(page.getByText(INTERACTION_COPY.note, { exact: true }).filter({ visible: true })).toHaveCount(
      OTHERS.length,
    );

    // The keyboard unfolds a card too: Enter on the focused heading shows that pair's description, the note stays.
    // `<summary>` has no reliable role in Playwright, so it is located by its tag.
    const keyboardCard = cardOf(folded[0].name);
    await keyboardCard.locator("summary").focus();
    await page.keyboard.press("Enter");
    await expect(keyboardCard.getByText(folded[0].description, { exact: true })).toBeVisible();
    await expect(keyboardCard.getByText(INTERACTION_COPY.note, { exact: true })).toBeVisible();
  });
});
