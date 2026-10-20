// Risk: in a browser set to English, the validation bubble of a required field read "Please fill in this field."
// (reported 20.10.2026 on the add-medication form). The bubble text follows the browser's language, not the page's
// `lang="pl"`, so the app sets its own Polish text. Nothing is saved: every submit here is blocked by the browser.
import { test, expect } from "@playwright/test";

test.use({ locale: "en-US" });

test("an empty required field asks in Polish, and the form is not sent", async ({ page }) => {
  await page.goto("/leki/nowy");
  const search = page.getByRole("combobox", { name: /Nazwa handlowa/ });
  await search.fill("");
  await page.getByRole("button", { name: "Szukaj" }).click();

  await expect(page).toHaveURL(/\/leki\/nowy$/);
  await expect.poll(() => search.evaluate((el: HTMLInputElement) => el.validationMessage)).toBe("Uzupełnij to pole.");

  // Typing clears the message, so the field is no longer held invalid by it.
  await search.fill("Nurofen");
  expect(await search.evaluate((el: HTMLInputElement) => el.checkValidity())).toBe(true);
});

test("a journal time before the 14-day limit names the limit as DD.MM.YYYY, HH:MM", async ({ page }) => {
  await page.goto("/dzienniczek/nowy");
  const occurred = page.getByLabel(/Data i godzina/);
  const min = await occurred.getAttribute("min");
  if (!min) throw new Error("the time field has no lower bound");
  const [date, time] = min.split("T");
  const [year, month, day] = date.split("-");

  await occurred.fill("2026-01-01T08:00");
  await page.getByRole("button", { name: "Zapisz wpis" }).click();

  await expect
    .poll(() => occurred.evaluate((el: HTMLInputElement) => el.validationMessage))
    .toBe(`Wybierz datę nie wcześniejszą niż ${day}.${month}.${year}, ${time}.`);
});
