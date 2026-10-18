// Dark-mode gallery (S-11, phase 3): full-page screenshots of every screen in src/pages (api/ excluded) in dark mode,
// on a phone and a desktop, also in states with data. Not a regression test: it runs only with DARK_GALLERY=1, so a
// plain `npx playwright test` skips it.
//
//   DARK_GALLERY=1 npx playwright test tests/e2e/dark-gallery.spec.ts
//
// Output: test-results/dark-gallery/<route>[--<state>]--<phone|desktop>.png (Playwright empties test-results/ at the
// start of every run, so the folder always holds one complete gallery).
//
// Data: created through the UI in the local Supabase (playwright.config.ts loads .env.e2e and keeps the preview off
// .env), every name carrying this run's marker, and deleted through the UI in afterAll, inside the correction window —
// also when a screenshot fails halfway. Only ids travel in URLs: names, substances and doses go in POST bodies.
import { readdirSync } from "node:fs";
import path from "node:path";
import { test, expect, type Browser, type BrowserContext, type Page, type TestInfo } from "@playwright/test";
import { INTERACTION_COPY } from "../../src/lib/copy/interactions";
import { TIMELINE_COPY } from "../../src/lib/copy/timeline";
import { pickSymptom } from "./journal-helpers";

const GALLERY_DIR = path.join("test-results", "dark-gallery");
const AUTH_FILE = "playwright/.auth/user.json";
const THEME_COOKIE = "lekomapa-theme";
const DARK_CLASS = /(^|\s)dark(\s|$)/;
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

// A full-page shot draws fixed and sticky elements once, where the first viewport puts them: the phone tab bar landed
// over the middle of long pages (hiding a form error) and the desktop sidebar ended at 800 px. Applied only while the
// screenshot is taken, it puts both back into the page flow: the tab bar below the content, the sidebar full height.
const FULL_PAGE_LAYOUT_CSS = `
  nav[aria-label="Menu główne"] { position: static !important; }
  aside { position: static !important; height: auto !important; }
`;

const SIZES = [
  { name: "phone", viewport: { width: 390, height: 844 } },
  { name: "desktop", viewport: { width: 1280, height: 800 } },
] as const;

// Unique per run: every medication name and the journal note carry it, so cleanup finds only this run's data.
const RUN_MARKER = `Galeria ${new Date().toISOString().replace(/\D/g, "").slice(0, 14)}`;

// A checked pair from scripts/rpl/pairs.mjs (B01AA with M01AE): acenocoumarolum (B01AA07) and ibuprofenum (M01AE01),
// both coded dictionary names (registry_substances.normalized_name), so the leaflet form saves them with their codes.
const INTERACTING_SUBSTANCE = "acenocoumarolum";
const PAIRED_SUBSTANCE = "ibuprofenum";
// Outside every pair; the medication is ended anyway, and ended medications are never compared.
const ENDED_SUBSTANCE = "paracetamolum";
const JOURNAL_SYMPTOM = "mdłości";

interface GalleryData {
  // Current, flagged "Możliwa interakcja" with `paired`.
  interactingId?: string;
  // Current, flagged, with a dose change saved today (second period open for correction and undo).
  pairedId?: string;
  changedPeriodId?: string;
  // Ended today, its end still inside the correction window.
  endedId?: string;
  journalId?: string;
}

const data: GalleryData = {};

function need(value: string | undefined, what: string): string {
  if (!value) throw new Error(`Gallery data missing: ${what} (the data step failed)`);
  return value;
}

interface Entry {
  // The page file in src/pages, without the extension.
  page: string;
  // State shown, added to the file name; absent for the screen as it opens.
  state?: string;
  session: boolean;
  path: () => string;
  // Steps after opening the path, through the UI, to reach the state.
  prepare?: (page: Page) => Promise<void>;
}

// One entry = one screen in one state. Every page in src/pages except api/ has at least one (checked by the first test).
// Screens that cannot show their main state without a special session are shot as they actually appear, named so.
const ENTRIES: Entry[] = [
  // --- Entry and public screens, no session ---
  { page: "auth/confirm-email", session: false, path: () => "/auth/confirm-email" },
  // A made-up token: the page only renders the confirm button; nothing is posted.
  {
    page: "auth/confirm",
    state: "token-link",
    session: false,
    path: () => "/auth/confirm?token_hash=gallery-not-a-token&type=email",
  },
  { page: "auth/confirm", state: "confirmed", session: false, path: () => "/auth/confirm?confirmed=1" },
  { page: "auth/confirm", state: "link-expired", session: false, path: () => "/auth/confirm" },
  { page: "auth/forgot-password", session: false, path: () => "/auth/forgot-password" },
  { page: "auth/forgot-password/sent", session: false, path: () => "/auth/forgot-password/sent" },
  { page: "auth/konto-usuniete", session: false, path: () => "/auth/konto-usuniete" },
  // Reachable only in a session opened from a reset link; without one the middleware shows the expired-link screen.
  {
    page: "auth/reset-password",
    state: "no-recovery-session-redirects-to-expired-link",
    session: false,
    path: () => "/auth/reset-password",
  },
  {
    page: "auth/reset-password/confirm",
    state: "token-link",
    session: false,
    path: () => "/auth/reset-password/confirm?token_hash=gallery-not-a-token&type=recovery",
  },
  {
    page: "auth/reset-password/confirm",
    state: "link-expired",
    session: false,
    path: () => "/auth/reset-password/confirm?expired=1",
  },
  { page: "auth/signin", session: false, path: () => "/auth/signin" },
  {
    page: "auth/signin",
    state: "wrong-password",
    session: false,
    path: () => "/auth/signin",
    prepare: signInWithWrongPassword,
  },
  { page: "auth/signup", session: false, path: () => "/auth/signup" },
  {
    page: "auth/signup",
    state: "empty-form-errors",
    session: false,
    path: () => "/auth/signup",
    prepare: async (page) => {
      await page.getByRole("button", { name: "Załóż konto" }).click();
      await expect(page).toHaveURL(/\/auth\/signup$/);
    },
  },
  { page: "prywatnosc", session: false, path: () => "/prywatnosc" },
  { page: "warunki", session: false, path: () => "/warunki" },

  // --- Interior, signed-in test account ---
  { page: "index", state: "signed-in-redirects-to-leki", session: true, path: () => "/" },
  // The test account has accepted the current terms, so the screen sends it back into the app.
  {
    page: "warunki/akceptacja",
    state: "accepted-account-redirects-to-leki",
    session: true,
    path: () => "/warunki/akceptacja",
  },
  { page: "leki/index", state: "with-interaction", session: true, path: () => "/leki" },
  // The interaction graph (S-10) with the medication of the checked pair touched: it is pressed, its partner and line
  // highlighted, and the panel under the graph shows the partner card with the note.
  {
    page: "leki/index",
    state: "graph-selected",
    session: true,
    path: () => "/leki",
    prepare: async (page) => {
      const graph = page.getByRole("group", { name: INTERACTION_COPY.graphLabel });
      await graph.scrollIntoViewIfNeeded();
      await waitForIslands(page);
      const node = graph.getByRole("button", { name: `${RUN_MARKER} A`, exact: true });
      await node.click();
      await expect(node).toHaveAttribute("aria-pressed", "true");
      await expect(
        page.getByRole("region", { name: `${RUN_MARKER} A` }).getByText(INTERACTION_COPY.note, { exact: true }),
      ).toBeVisible();
      // The pointer would stay on the button and the screenshot would show its hover state; scrolled back to the top,
      // or the full-page shot draws the sticky header where the graph was scrolled into view.
      await page.mouse.move(0, 0);
      await page.evaluate(() => {
        window.scrollTo(0, 0);
      });
    },
  },
  { page: "leki/zakonczone", state: "with-ended", session: true, path: () => "/leki/zakonczone" },
  { page: "leki/nowy", session: true, path: () => "/leki/nowy" },
  { page: "leki/nowy/z-ulotki", session: true, path: () => "/leki/nowy/z-ulotki" },
  // Blank text (spaces pass the browser's `required`): the server answers with the "name required" error.
  {
    page: "leki/nowy/z-ulotki",
    state: "blank-fields-error",
    session: true,
    path: () => "/leki/nowy/z-ulotki",
    prepare: async (page) => {
      await waitForIslands(page);
      await page.getByRole("textbox", { name: "Nazwa leku" }).fill(" ");
      await page.getByRole("combobox", { name: "Substancja czynna" }).fill(" ");
      await page.getByRole("textbox", { name: "Dawkowanie" }).fill(" ");
      await page.getByRole("button", { name: "Zapisz lek" }).click();
      await expect(page).toHaveURL(/[?&]error=/);
    },
  },
  {
    page: "leki/[id]",
    state: "with-interaction",
    session: true,
    path: () => `/leki/${need(data.interactingId, "interacting medication")}`,
  },
  {
    page: "leki/[id]",
    state: "dose-changed",
    session: true,
    path: () => `/leki/${need(data.pairedId, "paired medication")}`,
  },
  {
    page: "leki/[id]",
    state: "ended",
    session: true,
    path: () => `/leki/${need(data.endedId, "ended medication")}`,
  },
  {
    page: "leki/[id]/zmiana-dawki",
    session: true,
    path: () => `/leki/${need(data.interactingId, "interacting medication")}/zmiana-dawki`,
  },
  {
    page: "leki/[id]/zakonczenie",
    state: "current",
    session: true,
    path: () => `/leki/${need(data.interactingId, "interacting medication")}/zakonczenie`,
  },
  {
    page: "leki/[id]/zakonczenie",
    state: "ended-correction-window",
    session: true,
    path: () => `/leki/${need(data.endedId, "ended medication")}/zakonczenie`,
  },
  {
    page: "leki/[id]/usun",
    session: true,
    path: () => `/leki/${need(data.interactingId, "interacting medication")}/usun`,
  },
  {
    page: "leki/[id]/okresy/[periodId]/poprawa",
    session: true,
    path: () =>
      `/leki/${need(data.pairedId, "paired medication")}/okresy/${need(data.changedPeriodId, "changed period")}/poprawa`,
  },
  {
    page: "leki/[id]/okresy/[periodId]/cofniecie",
    session: true,
    path: () =>
      `/leki/${need(data.pairedId, "paired medication")}/okresy/${need(data.changedPeriodId, "changed period")}/cofniecie`,
  },
  { page: "dzienniczek/index", state: "with-entry", session: true, path: () => "/dzienniczek" },
  { page: "dzienniczek/nowy", session: true, path: () => "/dzienniczek/nowy" },
  {
    page: "dzienniczek/nowy",
    state: "no-symptom-error",
    session: true,
    path: () => "/dzienniczek/nowy",
    prepare: async (page) => {
      await waitForIslands(page);
      await page.getByRole("button", { name: "Zapisz wpis" }).click();
      await expect(page.getByText("Wybierz co najmniej jeden objaw.")).toBeVisible();
    },
  },
  // One group unfolded with a ticked symptom and its severity under it; a second symptom ticked through the search, its
  // group folded again (its count on the heading), without severity. Nothing is saved, so the account keeps no entry from this state.
  {
    page: "dzienniczek/nowy",
    state: "with-selected",
    session: true,
    path: () => "/dzienniczek/nowy",
    prepare: async (page) => {
      await waitForIslands(page);
      const nervous = page.getByRole("button", { name: "nerwowy", exact: true });
      await nervous.click();
      await expect(nervous).toHaveAttribute("aria-expanded", "true");
      await page.getByRole("checkbox", { name: "ból głowy", exact: true }).check();
      const severity = page.getByRole("group", { name: "Nasilenie: ból głowy" });
      await severity.getByRole("button", { name: "umiarkowane", exact: true }).click();
      await expect(severity.getByRole("button", { name: "umiarkowane", exact: true })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      await pickSymptom(page, JOURNAL_SYMPTOM);
      // Ticked in the search results, so its group unfolds (impl-review F4); fold it to show the count on the heading.
      const digestive = page.getByRole("button", { name: /^pokarmowy\s+1 wybrany$/ });
      await expect(digestive).toHaveAttribute("aria-expanded", "true");
      await digestive.click();
      await expect(digestive).toHaveAttribute("aria-expanded", "false");
      // The pointer would stay on the heading and the screenshot would show its hover background.
      await page.mouse.move(0, 0);
      await expect(page.getByRole("region", { name: "Wybrane objawy" }).getByRole("listitem")).toHaveCount(2);
    },
  },
  {
    page: "dzienniczek/[id]",
    session: true,
    path: () => `/dzienniczek/${need(data.journalId, "journal entry")}`,
  },
  {
    page: "dzienniczek/[id]/usun",
    session: true,
    path: () => `/dzienniczek/${need(data.journalId, "journal entry")}/usun`,
  },
  { page: "wizyta", state: "with-question-and-interaction", session: true, path: () => "/wizyta" },
  // The interactions part folded through its title: the count, the note under it and the turned chevron stay in view.
  {
    page: "wizyta",
    state: "interactions-collapsed",
    session: true,
    path: () => "/wizyta",
    prepare: async (page) => {
      const interactions = page.locator("[data-visit-interactions] details");
      await expect(interactions).toHaveAttribute("open", "");
      await interactions.locator("summary").click();
      await expect(interactions).not.toHaveAttribute("open");
    },
  },
  // The timeline as it opens: every medication, the hint in place of a symptom row. The gallery data (3 medications
  // from 2 days ago, 1 entry of one symptom) shows neither dense marks, several months nor the ranges "Rok" and
  // "Całość"; those are checked by hand (plan step 3.6).
  { page: "wizyta/os-czasu", session: true, path: () => "/wizyta/os-czasu" },
  // The journal symptom chosen in the drop-down: its row of marks replaces the hint.
  {
    page: "wizyta/os-czasu",
    state: "symptom-selected",
    session: true,
    path: () => "/wizyta/os-czasu",
    prepare: async (page) => {
      await page
        .getByRole("combobox", { name: TIMELINE_COPY.symptomLabel, exact: true })
        .selectOption({ label: JOURNAL_SYMPTOM });
      const chart = page.locator("section").filter({ has: page.getByRole("img", { name: TIMELINE_COPY.chartLabel }) });
      await expect(chart.getByText(JOURNAL_SYMPTOM, { exact: true }).filter({ visible: true })).toHaveCount(1);
      await expect(chart.getByText(TIMELINE_COPY.symptomHint, { exact: true }).filter({ visible: true })).toHaveCount(
        0,
      );
    },
  },
  { page: "konto", session: true, path: () => "/konto" },
  { page: "konto/usun", session: true, path: () => "/konto/usun" },
  // The error key the route sends back after a wrong password. Opened by URL: posting the deletion form from a script
  // is not worth the risk of deleting the test account.
  {
    page: "konto/usun",
    state: "wrong-password-error",
    session: true,
    path: () => "/konto/usun?error=wrongPassword",
  },
];

function fileName(entry: Entry, size: string): string {
  const route = entry.page.replace(/[[\]]/g, "").replaceAll("/", "_");
  return [route, entry.state, size].filter(Boolean).join("--") + ".png";
}

function baseUrlOf(testInfo: TestInfo): string {
  const baseURL = testInfo.project.use.baseURL;
  if (!baseURL) throw new Error("baseURL is not set in playwright.config.ts");
  return baseURL;
}

async function newDarkContext(
  browser: Browser,
  testInfo: TestInfo,
  session: boolean,
  viewport: { width: number; height: number } = SIZES[1].viewport,
): Promise<BrowserContext> {
  const baseURL = baseUrlOf(testInfo);
  const context = await browser.newContext({
    baseURL,
    viewport,
    // A light device: the dark mode on the screenshots comes from the saved choice only.
    colorScheme: "light",
    storageState: session ? AUTH_FILE : { cookies: [], origins: [] },
  });
  await context.addCookies([{ name: THEME_COOKIE, value: "dark", url: baseURL, httpOnly: true, sameSite: "Lax" }]);
  return context;
}

// React islands typed into before hydration lose the input; wait until every island has hydrated.
async function waitForIslands(page: Page) {
  await expect(page.locator("astro-island[ssr]")).toHaveCount(0);
}

// Warsaw calendar date, `offsetDays` from today, as `YYYY-MM-DD` (the app's "today" is Polish time).
function warsawDate(offsetDays: number): string {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Warsaw" }).format(new Date());
  const date = new Date(`${today}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

async function signInWithWrongPassword(page: Page) {
  // Same retry as auth.setup.ts: input typed before the island hydrates is lost. A made-up address, so the test
  // account never collects failed attempts.
  await expect(async () => {
    await page.getByRole("textbox", { name: "Adres e-mail" }).fill("");
    await page.getByRole("textbox", { name: "Adres e-mail" }).fill("galeria-brak-konta@lekomapa.test");
    await page.getByRole("textbox", { name: "Hasło" }).fill("");
    await page.getByRole("textbox", { name: "Hasło" }).fill("niepoprawne-haslo-galerii");
    await page.getByRole("button", { name: "Zaloguj się" }).click();
    await page.waitForURL(/\/auth\/signin\?error=/, { timeout: 5_000 });
  }).toPass();
  await waitForIslands(page);
}

function idFrom(url: string, pattern: RegExp, what: string): string {
  const match = pattern.exec(new URL(url).pathname + new URL(url).search);
  if (!match) throw new Error(`No ${what} id in ${new URL(url).pathname}`);
  return match[1];
}

// Adds a medication through the leaflet form (POST body only) and returns its id from the list's `?dodano=`.
async function addLeafletMedication(page: Page, name: string, substance: string, startedOn: string) {
  await page.goto("/leki/nowy/z-ulotki");
  await waitForIslands(page);
  await page.getByRole("textbox", { name: "Nazwa leku" }).fill(name);
  await page.getByRole("combobox", { name: "Substancja czynna" }).fill(substance);
  await page.getByRole("textbox", { name: "Dawkowanie" }).fill("1 tabletka rano");
  await page.getByLabel("Data rozpoczęcia").fill(startedOn);
  await page.getByRole("button", { name: "Zapisz lek" }).click();
  await page.waitForURL(new RegExp(`/leki\\?dodano=${UUID}$`));
  return idFrom(page.url(), new RegExp(`dodano=(${UUID})`), "medication");
}

test.describe("dark-mode gallery", () => {
  test.skip(process.env.DARK_GALLERY !== "1", "Gallery runs only with DARK_GALLERY=1");
  test.describe.configure({ mode: "serial" });

  test("every page in src/pages has an entry", () => {
    const pagesDir = path.join("src", "pages");
    const pages = readdirSync(pagesDir, { recursive: true, encoding: "utf8" })
      .map((file) => file.split(path.sep).join("/"))
      .filter((file) => file.endsWith(".astro") && !file.startsWith("api/"))
      .map((file) => file.replace(/\.astro$/, ""))
      .sort();
    const covered = new Set(ENTRIES.map((entry) => entry.page));
    expect(pages.filter((page) => !covered.has(page))).toEqual([]);
    expect([...covered].filter((page) => !pages.includes(page))).toEqual([]);
  });

  test("create gallery data through the UI", async ({ browser }, testInfo) => {
    test.setTimeout(120_000);
    const context = await newDarkContext(browser, testInfo, true);
    const page = await context.newPage();
    try {
      const startedOn = warsawDate(-2);
      data.interactingId = await addLeafletMedication(page, `${RUN_MARKER} A`, INTERACTING_SUBSTANCE, startedOn);
      data.pairedId = await addLeafletMedication(page, `${RUN_MARKER} B`, PAIRED_SUBSTANCE, startedOn);
      data.endedId = await addLeafletMedication(page, `${RUN_MARKER} C`, ENDED_SUBSTANCE, startedOn);

      // The checked pair shows on the list.
      await expect(
        page.locator(`[data-medication-id="${data.interactingId}"]`).getByText("Możliwa interakcja"),
      ).toBeVisible();

      // Dose change today on B: closes the first period, opens a second one (correction and undo screens).
      await page.goto(`/leki/${data.pairedId}/zmiana-dawki`);
      await waitForIslands(page);
      await page.getByRole("textbox", { name: "Nowe dawkowanie" }).fill("2 tabletki rano");
      await page.getByRole("button", { name: "Zapisz zmianę dawkowania" }).click();
      await page.waitForURL(new RegExp(`/leki/${data.pairedId}\\?zmieniono=1$`));
      const undoHref = await page.locator('a[href$="/cofniecie"]').getAttribute("href");
      data.changedPeriodId = idFrom(
        new URL(undoHref ?? "", page.url()).toString(),
        new RegExp(`/okresy/(${UUID})/cofniecie$`),
        "period",
      );

      // End C today: it moves to the ended list, its end correctable for 24 hours.
      await page.goto(`/leki/${data.endedId}/zakonczenie`);
      await page.getByRole("button", { name: "Zapisz zakończenie przyjmowania" }).click();
      await page.waitForURL(new RegExp(`/leki/${data.endedId}\\?zakonczenie=zapisane$`));

      // Journal entry now, with the run marker in the note (the note never travels in a URL).
      await page.goto("/dzienniczek/nowy");
      await waitForIslands(page);
      await pickSymptom(page, JOURNAL_SYMPTOM);
      await page.getByRole("textbox", { name: "Notatka" }).fill(RUN_MARKER);
      await page.getByRole("button", { name: "Zapisz wpis" }).click();
      await page.waitForURL(new RegExp(`/dzienniczek\\?dodano=${UUID}$`));
      data.journalId = idFrom(page.url(), new RegExp(`dodano=(${UUID})`), "journal entry");
    } finally {
      await context.close();
    }
  });

  for (const size of SIZES) {
    for (const session of [false, true]) {
      test(`screenshots: ${session ? "signed in" : "signed out"}, ${size.name}`, async ({ browser }, testInfo) => {
        test.setTimeout(300_000);
        const context = await newDarkContext(browser, testInfo, session, size.viewport);
        const page = await context.newPage();
        try {
          for (const entry of ENTRIES.filter((item) => item.session === session)) {
            await test.step(fileName(entry, size.name), async () => {
              await page.goto(entry.path());
              await page.waitForLoadState("load");
              await expect(page.locator("html")).toHaveClass(DARK_CLASS);
              await waitForIslands(page);
              if (entry.prepare) await entry.prepare(page);
              await page.screenshot({
                path: path.join(GALLERY_DIR, fileName(entry, size.name)),
                fullPage: true,
                animations: "disabled",
                caret: "hide",
                style: FULL_PAGE_LAYOUT_CSS,
              });
            });
          }
        } finally {
          await context.close();
        }
      });
    }
  }

  // Runs also when a step above failed: deletes this run's data through the UI, inside the correction window. Every
  // deletion is tried on its own; failures are collected and reported after the final "no marker left" check.
  test.afterAll(async ({ browser }, testInfo) => {
    const context = await newDarkContext(browser, testInfo, true);
    const page = await context.newPage();
    const failures: string[] = [];
    const attempt = async (label: string, action: () => Promise<void>) => {
      try {
        await action();
      } catch (error) {
        failures.push(`${label}: ${error instanceof Error ? error.message : String(error)}`);
      }
    };
    try {
      // Tracked id plus any entry whose note carries this run's marker (an id lost to a failure halfway).
      const journalIds = new Set([data.journalId].filter((id): id is string => id !== undefined));
      await attempt("find journal entries", async () => {
        await page.goto("/dzienniczek");
        const found = await page
          .locator("li[data-entry-id]")
          .filter({ hasText: RUN_MARKER })
          .evaluateAll((items) => items.map((item) => item.getAttribute("data-entry-id") ?? ""));
        for (const id of found) if (new RegExp(`^${UUID}$`).test(id)) journalIds.add(id);
      });
      for (const id of journalIds) {
        await attempt(`delete journal entry ${id}`, async () => {
          await page.goto(`/dzienniczek/${id}/usun`);
          await page.getByRole("button", { name: "Usuń wpis" }).click();
          await page.waitForURL(/\/dzienniczek\?usunieto=1$/);
        });
      }

      // Tracked ids plus anything with this run's marker on either list (an id lost to a failure halfway).
      const ids = new Set(
        [data.interactingId, data.pairedId, data.endedId].filter((id): id is string => id !== undefined),
      );
      for (const listPath of ["/leki", "/leki/zakonczone"]) {
        await attempt(`find medications on ${listPath}`, async () => {
          await page.goto(listPath);
          const hrefs = await page
            .locator('a[href^="/leki/"]')
            .filter({ hasText: RUN_MARKER })
            .evaluateAll((links) => links.map((link) => link.getAttribute("href") ?? ""));
          for (const href of hrefs) {
            const match = new RegExp(`^/leki/(${UUID})$`).exec(href);
            if (match) ids.add(match[1]);
          }
        });
      }

      for (const id of ids) {
        await attempt(`delete medication ${id}`, async () => {
          await page.goto(`/leki/${id}/usun`);
          await page.getByRole("button", { name: "Usuń pozycję" }).click();
          await page.waitForURL(/\/leki\?usunieto=1$/);
        });
      }

      for (const listPath of ["/dzienniczek", "/leki", "/leki/zakonczone"]) {
        await attempt(`marker left on ${listPath}`, async () => {
          await page.goto(listPath);
          await expect(page.getByText(RUN_MARKER)).toHaveCount(0);
        });
      }
    } finally {
      await context.close();
    }
    if (failures.length > 0) throw new Error(`Gallery cleanup incomplete:\n${failures.join("\n")}`);
  });
});
