// Shared steps for E2E tests on the journal form. No `.spec` in the name, so Playwright never runs this file itself.
import type { Page } from "@playwright/test";
import { JOURNAL_COPY } from "../../src/lib/copy/journal";

// Ticks a symptom through the search field, so the step does not depend on which category groups are folded: hidden
// rows of a folded group cannot be checked. The field is cleared afterwards, which brings the groups back as they were.
// The symptom name stays in the page: the search filters in the browser, no request and no URL carries it.
export async function pickSymptom(page: Page, name: string) {
  const search = page.getByRole("searchbox", { name: JOURNAL_COPY.form.searchLabel });
  await search.fill(name);
  await page.getByRole("checkbox", { name, exact: true }).check();
  await search.fill("");
}
