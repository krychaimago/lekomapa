// Risk: the phone header with sign-out scrolls away (mobile-header-sticky; context/changes/mobile-header-sticky/plan.md,
// phase 2). Below lg the header holding "Wyloguj się" and the color mode icon was not sticky: after scrolling down it
// left the window, and only the demo bar stayed on top. The test scrolls an interior screen to the bottom at three
// phone widths and requires both buttons in view, with the header's top edge on the demo bar's bottom edge (no gap,
// no overlap).
//
// Data: none. The test only reads /konto with the saved session of the shared E2E account. Below lg every interior
// screen scrolls, because the top block stands outside the min-h-dvh container; the scrollY precondition below
// checks that it really did. Local Supabase only (playwright.config.ts keeps the preview off .env).
import { test, expect, type Locator } from "@playwright/test";

const SIGN_OUT = "Wyloguj się";
const THEME_ICON = /^Włącz tryb (ciemny|jasny)$/;
const DEMO_BAR_TEXT = "Wersja demonstracyjna";
// Sub-pixel layout rounding between the two bars.
const TOLERANCE_PX = 1;

// 320 px: the narrowest phone, demo bar wraps to 3 lines; 360 and 375 px: the most common Android and iPhone widths.
// 568 px high (iPhone SE 1st gen) keeps the window short, so the screen scrolls without adding data.
const WIDTHS = [320, 360, 375] as const;
const HEIGHT = 568;

async function boxOf(locator: Locator) {
  const box = await locator.boundingBox();
  if (!box) throw new Error("element has no bounding box (not rendered)");
  return box;
}

for (const width of WIDTHS) {
  test.describe(`phone header at ${width} px`, () => {
    test.use({ viewport: { width, height: HEIGHT } });

    test("after scrolling to the bottom, sign-out and the color mode icon stay in view right under the demo bar", async ({
      page,
    }) => {
      await page.goto("/konto");

      const demoBar = page.getByRole("note").filter({ hasText: DEMO_BAR_TEXT });
      const header = page.getByRole("banner");
      const signOut = header.getByRole("button", { name: SIGN_OUT });
      const themeIcon = header.getByRole("button", { name: THEME_ICON });
      await expect(signOut).toBeVisible();
      await expect(themeIcon).toBeVisible();

      await page.evaluate(() => {
        window.scrollTo(0, document.documentElement.scrollHeight);
      });
      // Precondition: the page really scrolled, otherwise the checks below prove nothing.
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);

      await expect(signOut).toBeInViewport({ ratio: 1 });
      await expect(themeIcon).toBeInViewport({ ratio: 1 });

      // The demo bar is stuck at the top and the header stands right below it.
      const barBox = await boxOf(demoBar);
      const headerBox = await boxOf(header);
      expect(Math.abs(barBox.y)).toBeLessThanOrEqual(TOLERANCE_PX);
      expect(Math.abs(headerBox.y - (barBox.y + barBox.height))).toBeLessThanOrEqual(TOLERANCE_PX);
    });
  });
}
