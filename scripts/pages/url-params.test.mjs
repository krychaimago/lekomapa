// Every query parameter the app reads or writes is listed here on purpose. An address lands in browser history,
// bookmarks, the Referer header and Cloudflare logs, so a medication name, substance, dose or symptom must never get
// there (lesson "Żadna nazwa leku ani dawka w adresie URL"). The test scans src/ for parameter names and fails on any
// name outside ALLOWED_URL_PARAMS, so a new parameter needs a deliberate entry instead of slipping in with a feature.
// It also fails on a form not sent with POST, since a GET form puts every field name and value in the address.
// The path is not checked: `/leki/${encodeURIComponent(name)}` would pass. Every dynamic route segment in src/pages
// ([id], [periodId]) is a uuid looked up under RLS; a segment carrying anything else needs its own guard first.

import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";

import ts from "typescript";

const SRC_DIR = path.join(import.meta.dirname, "../../src");
const SOURCE_EXTENSIONS = [".ts", ".tsx", ".astro"];
const LESSON = 'lesson "Żadna nazwa leku ani dawka w adresie URL" (context/foundation/lessons.md)';

// A new entry only for an id, a code or a fixed flag — never for text the user typed. Health data that has to cross
// a step goes in a POST body or in a short-lived HttpOnly cookie; between steps only ids travel.
const ALLOWED_URL_PARAMS = new Set([
  // Error and state codes looked up in src/lib/copy/*; unknown codes show nothing.
  "error",
  // Supabase auth links: confirmation and password reset (src/lib/auth/confirm-link.ts, reset-password/confirm.astro).
  "code",
  "token_hash",
  "type",
  // Fixed flags after a redirect.
  "expired",
  "reset",
  "confirmed",
  "usunieto",
  "zmieniono",
  "cofnieto",
  "zakonczenie",
  // Ids (uuid) of a registry product, medication, period or journal entry.
  "wariant",
  "dodano",
  "poprawiono",
  "notatka",
]);

// Files that build a parameter name at run time (`?${key}=`), with where the possible names come from. A new entry
// only when the key comes from a fixed set of names that are all in ALLOWED_URL_PARAMS.
const DYNAMIC_KEY_FILES = new Map([
  [
    "components/journal/EditEntryForm.tsx",
    'successParam is typed "poprawiono" | "notatka", the journal success flags in ALLOWED_URL_PARAMS.',
  ],
  ["pages/dzienniczek/index.astro", "uuidParam(name) reads searchParams.get(name); its callers pass literal names."],
]);

// The code without comments, so an example `?x=` in a comment is not read as a parameter. TypeScript reprints the
// code (string and template text kept as written); the template of an .astro page has no parser here, so its
// `<!-- -->`, `{/* */}` and whole-line `//` comments are cut by pattern.
function stripComments(source, fileName) {
  if (fileName.endsWith(".astro")) {
    const match = /^---\n([\s\S]*?)\n---\n/.exec(source);
    const frontmatter = match ? stripScriptComments(match[1], "page.ts") : "";
    const template = (match ? source.slice(match[0].length) : source)
      .replace(/<!--[\s\S]*?-->/g, "")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    return `${frontmatter}\n${template}`;
  }
  return stripScriptComments(source, fileName);
}

function stripScriptComments(source, fileName) {
  const kind = fileName.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const file = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, false, kind);
  return ts.createPrinter({ removeComments: true }).printFile(file);
}

const STRING = String.raw`["'\`]([^"'\`]+)["'\`]`;
const METHODS = "(?:get|getAll|has|set|append|delete)";

// A regex source matching a URLSearchParams object: any `*params` / `*Params`, plus every variable the file assigns
// from `new URLSearchParams(…)` or `….searchParams`, so `const qs = new URLSearchParams()` is not missed by its name.
function paramObjects(code) {
  const assigned = /\b(?:const|let|var)\s+(\w+)\s*=\s*(?:new URLSearchParams\(|[\w.$?]*\.searchParams\b)/g;
  const names = [...code.matchAll(assigned)].map((match) => match[1]);
  return String.raw`\b(?:\w*[pP]arams${names.map((name) => `|${name}`).join("")})`;
}

const NAME_PATTERNS = [
  // Helpers reading one parameter: uuidParam("notatka"), readParam("…").
  new RegExp(String.raw`\b\w+Param\(\s*${STRING}`, "g"),
  // Literal ?x= / &x= in strings and templates.
  /[?&]([A-Za-z_][\w-]*)=(?!=)/g,
];

// The keys of `new URLSearchParams({ … })`; a spread or a computed key is a dynamic key.
function objectLiteralKeys(code, report) {
  const names = [];
  const pattern = /URLSearchParams\(\s*\{/g;
  let match;
  while ((match = pattern.exec(code))) {
    let depth = 1;
    let end = match.index + match[0].length;
    while (end < code.length && depth > 0) {
      if (code[end] === "{") depth += 1;
      if (code[end] === "}") depth -= 1;
      end += 1;
    }
    const body = code.slice(match.index + match[0].length, end - 1);
    const file = ts.createSourceFile("o.ts", `({${body}});`, ts.ScriptTarget.Latest, false);
    const literal = file.statements[0].expression.expression;
    for (const property of literal.properties) {
      const name = property.name;
      if (name && (ts.isIdentifier(name) || ts.isStringLiteral(name))) names.push(name.text);
      else report(`URLSearchParams({ ${body.trim()} })`);
    }
  }
  return names;
}

// Parameter names a key built at run time could produce: `?${…}=` / `&${…}=`, `"?" + key + "="`, URLSearchParams
// from anything but an object literal, a method called with a key that is not a string literal, and reads of every
// parameter at once.
function dynamicKeys(code, objects) {
  const found = [];
  const template = /[?&]\$\{/g;
  let match;
  while ((match = template.exec(code))) {
    let depth = 1;
    let end = match.index + match[0].length;
    while (end < code.length && depth > 0) {
      if (code[end] === "{") depth += 1;
      if (code[end] === "}") depth -= 1;
      end += 1;
    }
    if (code[end] === "=") found.push(code.slice(match.index, end + 1));
  }
  for (const constructed of code.matchAll(/new URLSearchParams\(\s*([^\s){])/g)) {
    found.push(`new URLSearchParams(${constructed[1]}…)`);
  }
  for (const joined of code.matchAll(/[?&]["'`]\s*\+\s*[^;\n]+?\s*\+\s*["'`]=/g)) found.push(joined[0]);
  for (const call of code.matchAll(new RegExp(String.raw`${objects}\s*\.\s*${METHODS}\(\s*[^\s"'\`)]`, "g"))) {
    found.push(call[0]);
  }
  const everyParam = String.raw`Object\.fromEntries\(\s*[\w.$?]*${objects}|${objects}\s*\.\s*(?:entries|keys|forEach)\(`;
  for (const all of code.matchAll(new RegExp(everyParam, "g"))) found.push(all[0]);
  return found;
}

// `{ names, dynamic }` for one source file: every parameter name it reads or writes, and every run-time key.
function urlParamsOf(source, fileName) {
  const code = stripComments(source, fileName);
  const objects = paramObjects(code);
  const dynamic = dynamicKeys(code, objects);
  const names = objectLiteralKeys(code, (expression) => dynamic.push(expression));
  // searchParams.get("x"), params.has("x"), qs.set("x", …), sp.append("x", …) on URLSearchParams objects.
  for (const match of code.matchAll(new RegExp(String.raw`${objects}\s*\.\s*${METHODS}\(\s*${STRING}`, "g"))) {
    names.push(match[1]);
  }
  for (const pattern of NAME_PATTERNS) {
    for (const match of code.matchAll(pattern)) names.push(match[1]);
  }
  return { names: [...new Set(names)], dynamic };
}

// The opening `<form …>` tags; braces are tracked so an `=>` inside `onSubmit={…}` does not end the tag.
function formTags(code) {
  const tags = [];
  for (const start of code.matchAll(/<form\b/g)) {
    let depth = 0;
    let end = start.index;
    while (end < code.length && !(code[end] === ">" && depth === 0)) {
      if (code[end] === "{") depth += 1;
      if (code[end] === "}") depth -= 1;
      end += 1;
    }
    tags.push(code.slice(start.index, end + 1));
  }
  return tags;
}

// The literal value of an attribute (`x="v"`, `x='v'`, `x={"v"}`), "" when it is absent, null when it is computed.
function attributeValue(tag, name) {
  const match = new RegExp(
    String.raw`\b${name}\s*=\s*(?:"([^"]*)"|'([^']*)'|\{\s*["'\`]([^"'\`]*)["'\`]\s*\}|\{)`,
    "i",
  ).exec(tag);
  if (!match) return "";
  const value = match[1] ?? match[2] ?? match[3];
  return value === undefined ? null : value;
}

// A form sent with GET puts the name and value of every field in the address — the way `?q=` leaked in S-02. A
// native form must say method="POST"; a .tsx form with onSubmit and no action is sent by JavaScript and is left alone.
function formViolations(code, relativePath) {
  const reported = [];
  for (const tag of formTags(code)) {
    const method = attributeValue(tag, "method");
    const scriptOnly = relativePath.endsWith(".tsx") && /\bonSubmit\s*=/.test(tag) && !/\baction\s*=/.test(tag);
    if (method?.toLowerCase() === "post" || (method === "" && scriptOnly)) continue;
    reported.push(`${relativePath}: ${tag.split("\n")[0]} is not sent with method="POST"`);
  }
  for (const override of code.matchAll(/\bformmethod\s*=\s*\S+/gi)) {
    if (attributeValue(override[0], "formmethod")?.toLowerCase() !== "post") {
      reported.push(`${relativePath}: ${override[0]} sends a form with something other than POST`);
    }
  }
  return reported;
}

// Failure lines for one file: a parameter outside the list, a run-time key in a file not in DYNAMIC_KEY_FILES, or a
// form not sent with POST.
function violations(source, relativePath) {
  const { names, dynamic } = urlParamsOf(source, relativePath);
  const reported = names
    .filter((name) => !ALLOWED_URL_PARAMS.has(name))
    .map((name) => `${relativePath}: parameter "${name}" is not in ALLOWED_URL_PARAMS`);
  if (!DYNAMIC_KEY_FILES.has(relativePath)) {
    for (const expression of dynamic) {
      reported.push(`${relativePath}: parameter name built at run time (${expression}), file not in DYNAMIC_KEY_FILES`);
    }
  }
  reported.push(...formViolations(stripComments(source, relativePath), relativePath));
  return reported;
}

async function listSources() {
  const entries = await readdir(SRC_DIR, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && SOURCE_EXTENSIONS.some((extension) => entry.name.endsWith(extension)))
    .map((entry) => path.join(entry.parentPath, entry.name));
}

test("parameter names are read from every form the app uses", () => {
  const source = [
    'const a = Astro.url.searchParams.get("dodano");',
    'const params = new URLSearchParams({ wariant: id, "error": code });',
    'params.set("zmieniono", "1");',
    'const b = uuidParam("notatka");',
    'const c = readParam("poprawiono");',
    "const d = `/leki/${id}?cofnieto=1&zakonczenie=${state}`;",
    'const e = "/auth/signin?reset=done";',
  ].join("\n");
  assert.deepEqual(urlParamsOf(source, "a.ts").names.sort(), [
    "cofnieto",
    "dodano",
    "error",
    "notatka",
    "poprawiono",
    "reset",
    "wariant",
    "zakonczenie",
    "zmieniono",
  ]);
});

test("a medication name in the address is reported", () => {
  const astro = [
    "---",
    "const href = `/leki/nowy?${new URLSearchParams({ nazwa: group.name }).toString()}`;",
    "---",
    "<a href={`/leki/nowy?q=${encodeURIComponent(q)}`}>x</a>",
  ].join("\n");
  assert.deepEqual(violations(astro, "pages/leki/nowy.astro"), [
    'pages/leki/nowy.astro: parameter "nazwa" is not in ALLOWED_URL_PARAMS',
    'pages/leki/nowy.astro: parameter "q" is not in ALLOWED_URL_PARAMS',
  ]);
  assert.deepEqual(violations('const s = Astro.url.searchParams.get("substancja");', "a.ts"), [
    'a.ts: parameter "substancja" is not in ALLOWED_URL_PARAMS',
  ]);
  // Whatever the variable is called.
  const renamed = [
    "const qs = new URLSearchParams();",
    'qs.set("nazwa", name);',
    "const sp = Astro.url.searchParams;",
    'const substance = sp.get("substancja");',
  ].join("\n");
  assert.deepEqual(violations(renamed, "a.ts"), [
    'a.ts: parameter "nazwa" is not in ALLOWED_URL_PARAMS',
    'a.ts: parameter "substancja" is not in ALLOWED_URL_PARAMS',
  ]);
});

test("an example address in a comment is not a parameter", () => {
  const script = ["// redirects with ?nazwa=…", "/* ?q= */", 'const url = "https://example.com/x";'].join("\n");
  assert.deepEqual(urlParamsOf(script, "a.ts").names, []);
  const astro = ["---", "// ?nazwa=", "---", "<!-- ?q= -->", "{/* ?substancja= */}", "<p>x</p>"].join("\n");
  assert.deepEqual(urlParamsOf(astro, "a.astro").names, []);
});

test("a parameter name built at run time is reported outside DYNAMIC_KEY_FILES", () => {
  const source = [
    "const a = `/dzienniczek?${key}=${id}`;",
    "const b = new URLSearchParams(fields);",
    'params.set(name, "1");',
    "const c = new URLSearchParams({ ...fields });",
  ].join("\n");
  assert.equal(violations(source, "components/Other.tsx").length, 4);
  assert.deepEqual(violations("const a = `/dzienniczek?${key}=${id}`;", "components/journal/EditEntryForm.tsx"), []);
  const other = [
    'const qs = new URLSearchParams(); qs.set(key, "1");',
    "const sp = Astro.url.searchParams; const v = sp.get(name);",
    "const all = Object.fromEntries(Astro.url.searchParams);",
    'const u = "/leki/nowy?" + key + "=" + value;',
  ].join("\n");
  assert.equal(violations(other, "components/Other.tsx").length, 4);
  // A whole query string after `?` is not a key.
  assert.deepEqual(urlParamsOf("const a = `/leki?${params.toString()}`;", "a.ts").dynamic, []);
});

test("a form not sent with POST is reported", () => {
  const astro = [
    "---",
    "---",
    '<form method="GET" action="/leki/nowy"><input name="q" /></form>',
    '<form action="/leki/nowy"><input name="q" /></form>',
    '<form method="post" action="/api/medications/draft"><button formmethod="get">x</button></form>',
  ].join("\n");
  assert.equal(violations(astro, "pages/leki/nowy.astro").length, 3);
  const component = [
    'const a = <form method={method} action={path}><input name="q" /></form>;',
    'const b = <form onSubmit={(event) => void submit(event)} action="/leki/nowy"><input name="q" /></form>;',
  ].join("\n");
  assert.equal(violations(component, "components/Other.tsx").length, 2);
});

test("a form sent with POST or only by JavaScript is not reported", () => {
  const component = [
    'const a = <form method="POST" action={`/api/medications/${id}/dosage`} onSubmit={markSubmitting}>x</form>;',
    'const b = <form className="flex" onSubmit={(event) => void submit(event)}>x</form>;',
  ].join("\n");
  assert.deepEqual(violations(component, "components/Other.tsx"), []);
  assert.deepEqual(violations('<form method="post" action="/api/account/delete">x</form>', "pages/a.astro"), []);
});

test("every URL parameter in src/ is an allowed id, code or flag", async () => {
  const files = await listSources();
  assert.ok(files.length > 50, `expected the app's sources, found ${files.length}`);
  const reported = [];
  let seen = 0;
  for (const file of files) {
    const relativePath = path.relative(SRC_DIR, file).split(path.sep).join("/");
    const source = await readFile(file, "utf8");
    seen += urlParamsOf(source, relativePath).names.length;
    reported.push(...violations(source, relativePath));
  }
  // The scan must find the parameters the app does use, or an empty report proves nothing.
  assert.ok(seen > 20, `expected the app's URL parameters, found ${seen}`);
  assert.deepEqual(reported, [], `A URL parameter must be an id, a code or a fixed flag — see the ${LESSON}.`);
});
