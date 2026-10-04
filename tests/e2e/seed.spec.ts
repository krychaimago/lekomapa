// Seed — risk: auth-gate-roundtrip (close to test-plan risk #1): a signed-out visitor who opens
// the medication list must land on the sign-in page and see no interior screen.
import { test, expect } from "@playwright/test";

// The risk is the signed-out path, so this test opts out of the saved session.
test.use({ storageState: { cookies: [], origins: [] } });

test("signed-out visitor opening /leki is sent to sign-in and sees no medication list", async ({ page }) => {
  await page.goto("/leki");

  await expect(page).toHaveURL(/\/auth\/signin$/);
  await expect(page.getByRole("heading", { name: "Sign in", level: 1 })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Menu główne" })).toBeHidden();

  // No cleanup: the test creates no data.
});
