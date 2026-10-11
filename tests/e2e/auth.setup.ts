import { test as setup, expect } from "@playwright/test";

const authFile = "playwright/.auth/user.json";

setup("sign in once and save the session", async ({ page }) => {
  const username = process.env.E2E_USERNAME;
  const password = process.env.E2E_PASSWORD;
  if (!username || !password) {
    throw new Error("Set E2E_USERNAME and E2E_PASSWORD in .env.e2e (see context/foundation/test-stack.md, ## E2E)");
  }

  await page.goto("/auth/signin");
  // The sign-in form is a React island: input typed before it hydrates is lost and validation
  // blocks the submit. Retry fill + submit until the submit leaves the sign-in page (signing in
  // twice changes nothing). Clear before filling: re-filling the same value fires no change event.
  await expect(async () => {
    await page.getByRole("textbox", { name: "Adres e-mail" }).fill("");
    await page.getByRole("textbox", { name: "Adres e-mail" }).fill(username);
    await page.getByRole("textbox", { name: "Hasło" }).fill("");
    await page.getByRole("textbox", { name: "Hasło" }).fill(password);
    await page.getByRole("button", { name: "Zaloguj się" }).click();
    await page.waitForURL((url) => !url.pathname.startsWith("/auth/signin"), { timeout: 5_000 });
  }).toPass();
  await expect(page.getByRole("button", { name: "Wyloguj się" })).toBeVisible();

  await page.context().storageState({ path: authFile });
});
