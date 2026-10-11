// A page title lands in browser history, bookmarks, tab previews and synced devices, the same places as the URL.
// A medication name, substance, dose or symptom must never get there (lesson "Żadna nazwa leku ani dawka w adresie
// URL"). Every `title=` on a page must therefore be fixed text: a string literal or a value from a module in
// src/lib/copy/. A condition may pick between such values; the values themselves may not come from anywhere else.

import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";

import ts from "typescript";

const PAGES_DIR = path.join(import.meta.dirname, "../../src/pages");
const COPY_MODULE = /^@\/lib\/copy\//;

function splitPage(source) {
  const match = /^---\n([\s\S]*?)\n---\n/.exec(source);
  return match
    ? { frontmatter: match[1], template: source.slice(match[0].length) }
    : { frontmatter: "", template: source };
}

function parseExpression(text) {
  const file = ts.createSourceFile("expr.ts", `(${text});`, ts.ScriptTarget.Latest, true);
  return file.statements[0].expression.expression;
}

// The root identifier of `A.b.c` or `A["b"]`; null for anything that is not a plain member chain.
function memberRoot(node) {
  let current = node;
  while (ts.isPropertyAccessExpression(current) || ts.isElementAccessExpression(current)) {
    if (ts.isElementAccessExpression(current) && !ts.isStringLiteralLike(current.argumentExpression)) return null;
    current = current.expression;
  }
  return ts.isIdentifier(current) ? current.text : null;
}

function isFixedText(node, fixedNames) {
  if (ts.isParenthesizedExpression(node)) return isFixedText(node.expression, fixedNames);
  if (ts.isStringLiteralLike(node)) return true;
  // The condition may read anything: it only chooses which fixed text is shown.
  if (ts.isConditionalExpression(node)) {
    return isFixedText(node.whenTrue, fixedNames) && isFixedText(node.whenFalse, fixedNames);
  }
  const root = memberRoot(node);
  return root !== null && fixedNames.has(root);
}

// Names bound to fixed text: imports from src/lib/copy/ and consts built only from them.
function fixedNamesOf(frontmatter) {
  const file = ts.createSourceFile("page.ts", frontmatter, ts.ScriptTarget.Latest, true);
  const names = new Set();
  for (const statement of file.statements) {
    if (ts.isImportDeclaration(statement) && COPY_MODULE.test(statement.moduleSpecifier.text)) {
      const bindings = statement.importClause?.namedBindings;
      if (bindings && ts.isNamedImports(bindings))
        for (const element of bindings.elements) names.add(element.name.text);
    }
    if (ts.isVariableStatement(statement) && statement.declarationList.flags & ts.NodeFlags.Const) {
      for (const declaration of statement.declarationList.declarations) {
        if (
          ts.isIdentifier(declaration.name) &&
          declaration.initializer &&
          isFixedText(declaration.initializer, names)
        ) {
          names.add(declaration.name.text);
        }
      }
    }
  }
  return names;
}

// Every `title=` attribute in the template: `{ kind: "literal" }` or `{ kind: "expression", text }`.
function titleAttributes(template) {
  const found = [];
  const pattern = /\btitle=(["'{])/g;
  let match;
  while ((match = pattern.exec(template))) {
    const start = match.index + match[0].length;
    if (match[1] !== "{") {
      found.push({ kind: "literal" });
      continue;
    }
    let depth = 1;
    let end = start;
    while (end < template.length && depth > 0) {
      if (template[end] === "{") depth += 1;
      if (template[end] === "}") depth -= 1;
      end += 1;
    }
    found.push({ kind: "expression", text: template.slice(start, end - 1) });
  }
  return found;
}

function violations(source) {
  const { frontmatter, template } = splitPage(source);
  const fixedNames = fixedNamesOf(frontmatter);
  return titleAttributes(template)
    .filter((attribute) => attribute.kind === "expression" && !isFixedText(parseExpression(attribute.text), fixedNames))
    .map((attribute) => attribute.text.trim());
}

async function listPages() {
  const entries = await readdir(PAGES_DIR, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".astro"))
    .map((entry) => path.join(entry.parentPath, entry.name));
}

const page = (frontmatter, template) => `---\n${frontmatter}\n---\n${template}\n`;

test("a title from a copy module, a literal, or a choice between them is accepted", () => {
  const frontmatter = [
    'import { MEDICATION_COPY } from "@/lib/copy/medications";',
    "const copy = MEDICATION_COPY.details;",
    "const title = hasToken ? copy.title : MEDICATION_COPY.list.title;",
  ].join("\n");
  assert.deepEqual(
    violations(page(frontmatter, '<AppLayout title={copy.title}><Card title="lekomapa" /></AppLayout>')),
    [],
  );
  assert.deepEqual(violations(page(frontmatter, "<Layout title={title}>")), []);
});

test("a title read from the database is reported", () => {
  const frontmatter = [
    'import { MEDICATION_COPY } from "@/lib/copy/medications";',
    "const copy = MEDICATION_COPY.details;",
    "const { data: medication } = await supabase.from('medications').select().single();",
  ].join("\n");
  assert.deepEqual(violations(page(frontmatter, "<AppLayout title={medication?.product_name ?? copy.title}>")), [
    "medication?.product_name ?? copy.title",
  ]);
  assert.deepEqual(violations(page(frontmatter, "<AppLayout title={medication.product_name}>")), [
    "medication.product_name",
  ]);
});

test("a value only passed through a const or a template is still reported", () => {
  const frontmatter = [
    'import { MEDICATION_COPY } from "@/lib/copy/medications";',
    "const name = medication.product_name;",
    "const title = hasToken ? MEDICATION_COPY.details.title : name;",
  ].join("\n");
  assert.deepEqual(violations(page(frontmatter, "<Layout title={title}>")), ["title"]);
  assert.deepEqual(violations(page(frontmatter, "<Layout title={`${MEDICATION_COPY.details.title} ${name}`}>")), [
    "`${MEDICATION_COPY.details.title} ${name}`",
  ]);
});

test("a copy-like name not imported from src/lib/copy/ is reported", () => {
  const frontmatter = 'import { MEDICATION_COPY } from "@/lib/services/medications";';
  assert.deepEqual(violations(page(frontmatter, "<Layout title={MEDICATION_COPY.details.title}>")), [
    "MEDICATION_COPY.details.title",
  ]);
});

test("every page title is fixed text, never data", async () => {
  const pages = await listPages();
  assert.ok(pages.length > 20, `expected the app's pages, found ${pages.length}`);
  const reported = [];
  for (const file of pages) {
    for (const expression of violations(await readFile(file, "utf8"))) {
      reported.push(`${path.relative(PAGES_DIR, file)}: title={${expression}}`);
    }
  }
  assert.deepEqual(reported, []);
});
