// Risk: color mode switching. The choice saved on Konto or by the header icon must reach the next screen, the server
// must draw <html> in that mode from the first byte (no flash), and "Jak w systemie" must follow the device setting.
// Every test runs in its own browser context (Playwright default), so the theme cookie never leaks between tests.
// No cleanup: the tests create no data; the theme cookie lives only in the test's context.
import { test, expect, type BrowserContext } from "@playwright/test";

const THEME_COOKIE = "lekomapa-theme";
const DARK_CLASS = /(^|\s)dark(\s|$)/;
// Server-rendered <html> with the dark class, as Layout.astro writes it for a saved "dark".
const SERVER_DARK_HTML = /<html[^>]*\sclass="[^"]*\bdark\b[^"]*"/;
const THEME_ICON = /^Włącz tryb (ciemny|jasny)$/;

// A device in light mode by default, so a `dark` class can only come from the saved preference.
test.use({ colorScheme: "light" });

async function setThemeCookie(context: BrowserContext, baseURL: string | undefined, value: string) {
  if (!baseURL) throw new Error("baseURL is not set in playwright.config.ts");
  await context.addCookies([{ name: THEME_COOKIE, value, url: baseURL, httpOnly: true, sameSite: "Lax" }]);
}

test("Konto: choosing Ciemny saves it and the server draws the next screen dark", async ({ page }) => {
  await page.goto("/konto");
  const html = page.locator("html");
  await expect(html).not.toHaveClass(DARK_CLASS);

  await page.getByRole("radio", { name: "Ciemny" }).check();
  await page.getByRole("button", { name: "Zapisz" }).click();

  await expect(page).toHaveURL(/\/konto$/);
  await expect(html).toHaveClass(DARK_CLASS);
  await expect(page.getByRole("radio", { name: "Ciemny" })).toBeChecked();

  // Raw response, no script run: the class must already be in the HTML the server sends.
  const response = await page.request.get("/leki");
  expect(response.ok()).toBe(true);
  expect(await response.text()).toMatch(SERVER_DARK_HTML);
});

test("icon: in dark mode on /leki the light-mode button switches back and stays on /leki", async ({
  page,
  context,
  baseURL,
}) => {
  await setThemeCookie(context, baseURL, "dark");
  await page.goto("/leki");
  const html = page.locator("html");
  await expect(html).toHaveClass(DARK_CLASS);
  await expect(page.getByRole("button", { name: THEME_ICON })).toHaveCount(1);

  await page.getByRole("button", { name: "Włącz tryb jasny" }).click();

  await expect(page).toHaveURL(/\/leki$/);
  await expect(html).not.toHaveClass(DARK_CLASS);
  // Exactly one icon button is exposed, and it offers the opposite of what is on screen.
  await expect(page.getByRole("button", { name: THEME_ICON })).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Włącz tryb ciemny" })).toBeVisible();
});

test("system: without a saved choice the page follows the device setting, also while open", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/leki");
  const html = page.locator("html");
  await expect(html).toHaveClass(DARK_CLASS);

  await page.emulateMedia({ colorScheme: "light" });
  await expect(html).not.toHaveClass(DARK_CLASS);
});

test("Konto: Jak w systemie after Ciemny follows the device", async ({ page }) => {
  await page.goto("/konto");
  const html = page.locator("html");

  await page.getByRole("radio", { name: "Ciemny" }).check();
  await page.getByRole("button", { name: "Zapisz" }).click();
  await expect(html).toHaveClass(DARK_CLASS);

  await page.getByRole("radio", { name: "Jak w systemie" }).check();
  await page.getByRole("button", { name: "Zapisz" }).click();

  await expect(page).toHaveURL(/\/konto$/);
  await expect(page.getByRole("radio", { name: "Jak w systemie" })).toBeChecked();
  await expect(html).not.toHaveClass(DARK_CLASS);

  // A light device alone cannot tell "system" from "light": only "system" turns dark with the device.
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(html).toHaveClass(DARK_CLASS);
});

test.describe("signed out", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("entry screens: a saved dark choice draws /auth/signin dark", async ({ page, context, baseURL }) => {
    await setThemeCookie(context, baseURL, "dark");
    await page.goto("/auth/signin");

    await expect(page).toHaveURL(/\/auth\/signin$/);
    await expect(page.locator("html")).toHaveClass(DARK_CLASS);
  });
});
