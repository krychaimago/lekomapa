// Every unexpected server error goes through reportError (src/lib/observability/report.ts), which logs it and sends an
// allow-listed report. A bare console.error in src/ would skip the report, so the test fails on any reference to it
// outside src/lib/observability/. The label (first argument) groups reports and is sent as a tag, so it must be a fixed
// dotted English literal: text built at run time could carry a medication name, a dose or a symptom. The details may
// hold only code, status, error and route; the error's message never leaves (buildErrorEvent reads its type and stack).

import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";

import ts from "typescript";

const SRC_DIR = path.join(import.meta.dirname, "../../src");
const SOURCE_EXTENSIONS = [".ts", ".tsx", ".astro"];
const OBSERVABILITY_DIR = "lib/observability/";
const LABEL = /^[a-z][a-z0-9-]*(\.[a-z0-9-]+)+$/;
const ALLOWED_DETAILS = new Set(["code", "status", "error", "route"]);

// The script parts of a file, parsed by TypeScript: the whole file for .ts/.tsx; the frontmatter and every <script>
// block for .astro. The rest of an .astro template has no parser here and is returned as `template` text.
function scriptParts(source, fileName) {
  if (!fileName.endsWith(".astro")) {
    return { scripts: [{ code: source, kind: fileName.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS }] };
  }
  const match = /^---\n([\s\S]*?)\n---\n/.exec(source);
  const scripts = match ? [{ code: match[1], kind: ts.ScriptKind.TS }] : [];
  let template = match ? source.slice(match[0].length) : source;
  template = template.replace(/<script\b[^>]*>([\s\S]*?)<\/script>/g, (_, body) => {
    scripts.push({ code: body, kind: ts.ScriptKind.TS });
    return "";
  });
  return { scripts, template };
}

function isConsoleError(node) {
  if (ts.isPropertyAccessExpression(node)) {
    return ts.isIdentifier(node.expression) && node.expression.text === "console" && node.name.text === "error";
  }
  if (ts.isElementAccessExpression(node)) {
    return (
      ts.isIdentifier(node.expression) &&
      node.expression.text === "console" &&
      ts.isStringLiteralLike(node.argumentExpression) &&
      node.argumentExpression.text === "error"
    );
  }
  return false;
}

function labelProblem(argument) {
  if (!argument) return "has no label";
  if (!ts.isStringLiteral(argument) && !ts.isNoSubstitutionTemplateLiteral(argument)) {
    return "has a label that is not a string literal";
  }
  return LABEL.test(argument.text) ? null : `has label "${argument.text}" that is not a dotted lowercase label`;
}

function detailsProblem(argument) {
  if (!argument) return null;
  if (!ts.isObjectLiteralExpression(argument)) return "passes details that are not an object literal";
  for (const property of argument.properties) {
    const name = property.name && (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name));
    if (!name || !(ts.isPropertyAssignment(property) || ts.isShorthandPropertyAssignment(property))) {
      return "passes details with a spread or a computed key";
    }
    if (!ALLOWED_DETAILS.has(property.name.text)) return `passes "${property.name.text}" in its details`;
  }
  return null;
}

// `{ problems, reportCalls }` for one source file. `checkConsole` is false inside src/lib/observability/, where
// reportError itself logs.
function scan(source, relativePath, { checkConsole = true } = {}) {
  const problems = [];
  let reportCalls = 0;
  const { scripts, template } = scriptParts(source, relativePath);
  for (const { code, kind } of scripts) {
    const file = ts.createSourceFile(relativePath, code, ts.ScriptTarget.Latest, true, kind);
    const at = (node) => `${relativePath}:${file.getLineAndCharacterOfPosition(node.getStart()).line + 1}`;
    const visit = (node) => {
      if (checkConsole && isConsoleError(node)) {
        problems.push(`${at(node)}: console.error instead of reportError`);
      }
      if (ts.isImportSpecifier(node) && (node.propertyName ?? node.name).text === "reportError") {
        if (node.name.text !== "reportError") problems.push(`${at(node)}: reportError imported under another name`);
      }
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "reportError") {
        reportCalls += 1;
        const [label, details] = node.arguments;
        for (const problem of [labelProblem(label), detailsProblem(details)]) {
          if (problem) problems.push(`${at(node)}: reportError ${problem}`);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(file);
  }
  // Outside the parsed parts only a plain search is possible; an .astro template has no business logging errors.
  if (template !== undefined) {
    const code = template.replace(/<!--[\s\S]*?-->/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
    if (checkConsole && /\bconsole\s*(?:\.\s*error\b|\[\s*["'`]error)/.test(code)) {
      problems.push(`${relativePath}: console.error in the template instead of reportError`);
    }
    if (/\breportError\s*\(/.test(code)) {
      problems.push(`${relativePath}: reportError in the template; call it in the frontmatter`);
    }
  }
  return { problems, reportCalls };
}

async function listSources() {
  const entries = await readdir(SRC_DIR, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && SOURCE_EXTENSIONS.some((extension) => entry.name.endsWith(extension)))
    .map((entry) => path.join(entry.parentPath, entry.name));
}

test("a bare console.error is reported in scripts, frontmatter and templates", () => {
  const script = [
    'console.error("Loading failed", { code });',
    'console["error"]("x");',
    "const log = console.error;",
    "// console.error in a comment is fine",
  ].join("\n");
  assert.equal(scan(script, "lib/services/a.ts").problems.length, 3);
  const astro = [
    "---",
    'console.error("Loading the medication list failed");',
    "---",
    "<script>console.error('x');</script>",
    "<p>{console.error('y')}</p>",
  ].join("\n");
  assert.equal(scan(astro, "pages/a.astro").problems.length, 3);
  assert.deepEqual(scan('console.error("x");', "lib/observability/report.ts", { checkConsole: false }).problems, []);
});

test("a label that is not a fixed dotted literal is reported", () => {
  const source = [
    "reportError(`medications.${name}`, { code });",
    'reportError("Bad Label", { code });',
    "reportError(label, { code });",
    'reportError("medications", { code });',
    "reportError();",
  ].join("\n");
  const { problems, reportCalls } = scan(source, "pages/api/a.ts");
  assert.equal(reportCalls, 5);
  assert.equal(problems.length, 5);
});

test("details outside code, status, error and route are reported", () => {
  const source = [
    'reportError("medications.create", { code, message: error.message });',
    'reportError("medications.create", { ...details });',
    'reportError("medications.create", details);',
    'reportError("medications.create", { ["na" + "me"]: x });',
  ].join("\n");
  assert.equal(scan(source, "pages/api/a.ts").problems.length, 4);
  assert.equal(scan('import { reportError as report } from "@/lib/observability/report";', "a.ts").problems.length, 1);
});

test("a fixed label with allowed details passes", () => {
  const astro = [
    "---",
    'import { reportError } from "@/lib/observability/report";',
    'reportError("journal.list-load", { code: result.error.code, route: Astro.routePattern });',
    'reportError("journal.correction-catalog-unknown-category", { error, route: Astro.routePattern });',
    "reportError(`auth.claims-threw`, { error: thrown, status: 500 });",
    "---",
    "<p>x</p>",
  ].join("\n");
  assert.deepEqual(scan(astro, "pages/a.astro"), { problems: [], reportCalls: 3 });
});

test("src/ has no bare console.error and every reportError label is a fixed dotted literal", async () => {
  const files = await listSources();
  assert.ok(files.length > 50, `expected the app's sources, found ${files.length}`);
  const problems = [];
  let reportCalls = 0;
  for (const file of files) {
    const relativePath = path.relative(SRC_DIR, file).split(path.sep).join("/");
    const source = await readFile(file, "utf8");
    const result = scan(source, relativePath, { checkConsole: !relativePath.startsWith(OBSERVABILITY_DIR) });
    problems.push(...result.problems);
    reportCalls += result.reportCalls;
  }
  // The scan must find the reports the app does make, or an empty problem list proves nothing.
  assert.ok(reportCalls > 50, `expected the app's reportError calls, found ${reportCalls}`);
  assert.deepEqual(problems, [], "Report unexpected errors with reportError and a fixed dotted label.");
});
