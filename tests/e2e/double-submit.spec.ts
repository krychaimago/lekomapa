// Risk: double-submitted auth form (issue #91). A double-click on "Załóż konto" sent POST /api/auth/signup twice;
// on production the second sign-up re-sent the confirmation mail, and a second request within max_frequency landed
// the person on the sign-up page with a rate-limit error although the account and its mail already existed.
// The submit button must be disabled from the first click until the next page loads.
import { test, expect, type Page } from "@playwright/test";

// Both forms are the signed-out path, so the tests opt out of the saved session.
test.use({ storageState: { cookies: [], origins: [] } });

// Locally the routes answer in milliseconds, before a human second click lands. On production sign-up waits for
// Supabase to send the mail. The answer to the first POST is held until the second click is made, so the second
// click always meets the page still showing the form.
async function holdFirstAnswer(page: Page, path: string) {
  let posts = 0;
  let release!: () => void;
  let markSent!: () => void;
  const released = new Promise<void>((resolve) => (release = resolve));
  const firstSent = new Promise<void>((resolve) => (markSent = resolve));
  await page.route(`**${path}`, async (route) => {
    posts++;
    markSent();
    const response = await route.fetch({ maxRedirects: 0 });
    await released;
    // The browser drops the first navigation when a second submit replaces it; fulfilling it then fails harmlessly.
    await route.fulfill({ response }).catch(() => undefined);
  });
  return { posts: () => posts, release, firstSent };
}

// Locator actions wait for a pending navigation to finish, so they cannot click during one. A human double-click
// does: the second click goes to the screen point of the button, like the mouse would. It waits until the first
// request has left: two clicks with no gap at all are merged by the browser into one submission and prove nothing.
async function clickTwice(page: Page, name: string, firstSent: Promise<void>) {
  const box = await page.getByRole("button", { name }).boundingBox();
  if (!box) throw new Error(`button "${name}" is not on screen`);
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.click(x, y);
  await firstSent;
  await page.mouse.click(x, y);
}

// The forms are React islands: a click before hydration does nothing. The password toggle works only once the
// island has hydrated, so it proves the form will validate and mark itself as submitting.
async function waitForHydration(page: Page) {
  await expect(async () => {
    await page.getByRole("button", { name: "Pokaż hasło" }).first().click();
    await expect(page.getByRole("button", { name: "Ukryj hasło" }).first()).toBeVisible({ timeout: 1_000 });
  }).toPass();
}

test.describe("sign-up", () => {
  const email = `e2e-double-submit-${Date.now()}@example.test`;
  const password = `Haslo-e2e-${Date.now()}`;

  // Runs also when the test fails, so a failed run leaves no account behind. Locally e-mail confirmation is off,
  // so the account signs in with its password and deletes itself through the S-09 route. Origin is what the browser
  // sends with the sign-in and /konto/usun forms (Astro checkOrigin).
  test.afterEach(async ({ request, baseURL }) => {
    const headers = { Origin: baseURL ?? "" };
    const signedIn = await request.post("/api/auth/signin", { form: { email, password }, headers, maxRedirects: 0 });
    expect(signedIn.status()).toBe(302);
    expect(signedIn.headers().location).toBe("/");
    const deleted = await request.post("/api/account/delete", { form: { password }, headers, maxRedirects: 0 });
    expect(deleted.status()).toBe(303);
    expect(deleted.headers().location).toBe("/auth/konto-usuniete");
  });

  test("double-click sends one request and lands on the check-inbox page", async ({ page }) => {
    await page.goto("/auth/signup");
    await waitForHydration(page);
    await page.getByLabel("Adres e-mail").fill(email);
    await page.getByLabel("Hasło", { exact: true }).fill(password);
    await page.getByLabel("Powtórz hasło").fill(password);
    await page.getByRole("checkbox", { name: /Akceptuję/ }).check();

    const signUp = await holdFirstAnswer(page, "/api/auth/signup");
    await clickTwice(page, "Załóż konto", signUp.firstSent);
    signUp.release();

    // Either page the sign-up can end on: the check-inbox page, or the form again with an error.
    await page.waitForURL((url) => url.pathname === "/auth/confirm-email" || url.searchParams.has("error"));
    expect(signUp.posts()).toBe(1);
    await expect(page).toHaveURL(/\/auth\/confirm-email$/);
  });
});

test("double-click on sign-in sends one request", async ({ page }) => {
  const username = process.env.E2E_USERNAME;
  const password = process.env.E2E_PASSWORD;
  if (!username || !password) {
    throw new Error("Set E2E_USERNAME and E2E_PASSWORD in .env.e2e (see context/foundation/test-stack.md, ## E2E)");
  }

  await page.goto("/auth/signin");
  await waitForHydration(page);
  await page.getByLabel("Adres e-mail").fill(username);
  await page.getByLabel("Hasło", { exact: true }).fill(password);

  const signIn = await holdFirstAnswer(page, "/api/auth/signin");
  await clickTwice(page, "Zaloguj się", signIn.firstSent);
  signIn.release();

  await page.waitForURL((url) => !url.pathname.startsWith("/auth/signin"));
  await expect(page.getByRole("button", { name: "Wyloguj się" })).toBeVisible();
  expect(signIn.posts()).toBe(1);

  // No cleanup: signing in creates no data, and the session lives only in this test's context.
});
