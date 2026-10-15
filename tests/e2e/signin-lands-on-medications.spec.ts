// Risk: signin-landing (S-03): signing in through the form must end on the medication list.
// The path crosses the React form, /api/auth/signin, the redirect from / and the middleware;
// a wrong target in src/pages/index.astro would send the user to an empty or missing screen.
import { test, expect } from "@playwright/test";

// The risk is the sign-in itself, so this test opts out of the saved session.
test.use({ storageState: { cookies: [], origins: [] } });

test("signing in through the form lands on the medication list", async ({ page }) => {
  const username = process.env.E2E_USERNAME;
  const password = process.env.E2E_PASSWORD;
  if (!username || !password) {
    throw new Error("Set E2E_USERNAME and E2E_PASSWORD in .env.e2e (see context/foundation/test-stack.md, ## E2E)");
  }

  await page.goto("/auth/signin");
  // Same retry as auth.setup.ts: input typed before the React island hydrates is lost.
  await expect(async () => {
    await page.getByRole("textbox", { name: "Adres e-mail" }).fill("");
    await page.getByRole("textbox", { name: "Adres e-mail" }).fill(username);
    await page.getByRole("textbox", { name: "Hasło" }).fill("");
    await page.getByRole("textbox", { name: "Hasło" }).fill(password);
    await page.getByRole("button", { name: "Zaloguj się" }).click();
    await page.waitForURL((url) => !url.pathname.startsWith("/auth/signin"), { timeout: 5_000 });
  }).toPass();

  await expect(page).toHaveURL(/\/leki$/);
  await expect(page.getByRole("heading", { name: "Leki", level: 1 })).toBeVisible();

  // No cleanup: the test creates no data.
});
