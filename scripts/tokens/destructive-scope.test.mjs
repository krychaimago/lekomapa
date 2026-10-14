import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";

import { REPO_ROOT } from "./contrast.mjs";
import {
  ACCOUNT_ACTION_SCREENS,
  ALLOWED_FILES,
  findRedButtons,
  formatRedButton,
  scanRedButtons,
} from "./destructive-scope.mjs";

const RULE =
  "the red button is reserved for an irreversible account action (CLAUDE.md, Konwencje kodu, destructive*); " +
  "medications, symptoms and every other action keep a neutral button";

const matches = (content) => findRedButtons(content).map((redButton) => redButton.match);

test("every way of picking a red button is detected", () => {
  const samples = [
    ['buttonVariants({ variant: "destructive" })', 'variant: "destructive"', "destructive"],
    ['buttonVariants({ variant: "destructive-outline" })', 'variant: "destructive-outline"', "destructive-outline"],
    ["buttonVariants({ variant: 'destructive' })", "variant: 'destructive'", "destructive"],
    ['<Button variant="destructive">', 'variant="destructive"', "destructive"],
    ['<Button variant={"destructive-outline"}>', 'variant={"destructive-outline"', "destructive-outline"],
    ['<Badge variant = "destructive">', 'variant = "destructive"', "destructive"],
    ['<button class="bg-destructive text-destructive-foreground">', "bg-destructive", null],
    ['<a class="rounded-lg hover:bg-destructive/90">', "hover:bg-destructive/90", null],
  ];
  for (const [content, match, variant] of samples) {
    assert.deepEqual(
      findRedButtons(content).map((redButton) => [redButton.match, redButton.variant]),
      [[match, variant]],
      content,
    );
  }
});

test("error message tokens and other variants are not red buttons", () => {
  const clean = [
    // Error alert, as on the medication deletion screen.
    'class="rounded-lg border border-destructive-border bg-destructive-surface px-4 py-3 text-destructive"',
    // Invalid input states.
    'class="aria-invalid:ring-destructive/20 aria-invalid:border-destructive"',
    'className={cn(inputBase, error ? "border-destructive" : "border-input")}',
    // The neutral buttons.
    'buttonVariants({ variant: "outline" })',
    '<Button variant="ghost">',
    // A variant name that only starts like the red one.
    'buttonVariants({ variant: "destructiveish" })',
    "const variant = isDestructive;",
  ];
  for (const content of clean) {
    assert.deepEqual(matches(content), [], content);
  }
});

test("red buttons carry their line number", () => {
  assert.deepEqual(findRedButtons('<div>\n  <Button variant="destructive">\n</div>'), [
    { line: 2, match: 'variant="destructive"', variant: "destructive" },
  ]);
  assert.equal(
    formatRedButton({ file: "src/x.astro", line: 2, match: 'variant="destructive"' }),
    'src/x.astro:2  variant="destructive"',
  );
});

test("src/: no red button outside the allowed files", async () => {
  const { files, redButtons } = await scanRedButtons();
  // Proof that the scan ran over the real src/: it read the pages this rule is about.
  for (const screen of ACCOUNT_ACTION_SCREENS) {
    assert.ok(files.includes(screen.path), `${screen.path} was not scanned`);
  }
  assert.ok(files.includes("src/pages/leki/[id]/usun.astro"), "the medication deletion screen was not scanned");

  const unexpected = redButtons.filter((redButton) => !ALLOWED_FILES.has(redButton.file));
  assert.deepEqual(
    unexpected.map(formatRedButton),
    [],
    `red button outside the allowed files — ${RULE}:\n${unexpected.map(formatRedButton).join("\n")}`,
  );
});

test("each account action screen uses its own red variant", async () => {
  const { redButtons } = await scanRedButtons();
  for (const screen of ACCOUNT_ACTION_SCREENS) {
    const picked = redButtons.filter((redButton) => redButton.file === screen.path).map((b) => b.variant);
    assert.deepEqual(
      picked,
      [screen.variant],
      `${screen.path} must pick exactly one red button, variant "${screen.variant}" — found: ${JSON.stringify(picked)}`,
    );
  }
});

test("every allowed file exists", async () => {
  for (const file of ALLOWED_FILES) {
    await assert.doesNotReject(
      access(path.join(REPO_ROOT, file)),
      `${file}: allowed in destructive-scope.mjs but does not exist — update the list`,
    );
  }
});
