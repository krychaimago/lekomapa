// Risk: the product name searched on /leki/nowy had to be typed again on the leaflet form (reported 20.10.2026).
// The search text lives in the registry search draft cookie (path /leki/nowy, so it reaches /leki/nowy/z-ulotki too),
// never in the URL; the leaflet form starts with it. Both ways in are covered: the "Szukaj" button (POST to the draft
// route) and a suggestion picked with JavaScript (?wariant=<id>, no search POST). Nothing is saved, so the shared
// E2E account keeps no data; each test runs in its own browser context, so the drafts never leak between tests.
import { test, expect, type Page } from "@playwright/test";
import { MEDICATION_COPY } from "../../src/lib/copy/medications";

const SEARCHED = "Nurofen";

async function openLeafletForm(page: Page) {
  await page.getByRole("link", { name: MEDICATION_COPY.add.notInRegistry }).first().click();
  await page.waitForURL((url) => url.pathname === "/leki/nowy/z-ulotki" && url.search === "");
}

test("after Szukaj, the leaflet form starts with the searched name", async ({ page }) => {
  await page.goto("/leki/nowy");
  await expect(page.locator("astro-island[ssr]")).toHaveCount(0);
  await page.getByRole("combobox", { name: /Nazwa handlowa/ }).fill(SEARCHED);
  await page.getByRole("button", { name: "Szukaj" }).click();
  await page.waitForURL((url) => url.pathname === "/leki/nowy");

  await openLeafletForm(page);
  await expect(page.getByLabel(new RegExp(MEDICATION_COPY.leaflet.productNameLabel))).toHaveValue(SEARCHED);
});

test("after a picked suggestion, the leaflet form starts with the product's name", async ({ page }) => {
  await page.goto("/leki/nowy");
  await expect(page.locator("astro-island[ssr]")).toHaveCount(0);
  await page.getByRole("combobox", { name: /Nazwa handlowa/ }).fill(SEARCHED);
  await page
    .getByRole("option", { name: new RegExp(`^${SEARCHED}`) })
    .first()
    .click();
  await page.waitForURL((url) => url.pathname === "/leki/nowy" && url.searchParams.has("wariant"));
  const shown = (await page.getByRole("heading", { level: 2 }).first().textContent())?.trim() ?? "";
  expect(shown).toMatch(new RegExp(`^${SEARCHED}`));

  await openLeafletForm(page);
  await expect(page.getByLabel(new RegExp(MEDICATION_COPY.leaflet.productNameLabel))).toHaveValue(shown);
});
