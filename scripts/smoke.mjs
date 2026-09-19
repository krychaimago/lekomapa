// Smoke test: proves the built app, the Cloudflare adapter and the Supabase auth flow still work together.
// Zero dependencies on purpose. Run against a live server: BASE_URL=http://localhost:4321 node scripts/smoke.mjs
//
// Two modes, picked by the environment:
//   - throwaway account (default): signs up a fresh address, then signs in. Needs a Supabase with e-mail
//     confirmation disabled, so this is the local and CI mode.
//   - existing account: set SMOKE_EMAIL and SMOKE_PASSWORD to a confirmed account. Signup is skipped, so the
//     run works against an environment that confirms e-mail and leaves no new rows behind.
// SMOKE_EMAIL_DOMAIN overrides the throwaway address domain when example.com is rejected.

const BASE_URL = process.env.BASE_URL ?? "http://localhost:4321";
const EXISTING_EMAIL = process.env.SMOKE_EMAIL;
const EXISTING_PASSWORD = process.env.SMOKE_PASSWORD;

if (Boolean(EXISTING_EMAIL) !== Boolean(EXISTING_PASSWORD)) {
  console.error("SMOKE_EMAIL and SMOKE_PASSWORD must be set together, or neither.");
  process.exit(1);
}

const usesExistingAccount = Boolean(EXISTING_EMAIL);
const emailDomain = process.env.SMOKE_EMAIL_DOMAIN ?? "example.com";
const email = EXISTING_EMAIL ?? `smoke-${Date.now()}@${emailDomain}`;
const password = EXISTING_PASSWORD ?? "Smoke-Test-Passw0rd!";
const jar = new Map();

function cookieHeader() {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

function storeCookies(response) {
  for (const raw of response.headers.getSetCookie()) {
    const [pair, ...attrs] = raw.split(";");
    const [name, ...rest] = pair.split("=");
    const expired = attrs.some((a) => /max-age=0/i.test(a.trim()));
    if (expired) jar.delete(name.trim());
    else jar.set(name.trim(), rest.join("="));
  }
}

async function request(path, { method = "GET", form } = {}) {
  const response = await fetch(BASE_URL + path, {
    method,
    redirect: "manual",
    headers: {
      Cookie: cookieHeader(),
      Origin: BASE_URL,
      ...(form ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
    },
    body: form ? new URLSearchParams(form).toString() : undefined,
  });
  storeCookies(response);
  return { status: response.status, location: response.headers.get("location") ?? "" };
}

const signupStep = [
  "signup creates account",
  () => request("/api/auth/signup", { method: "POST", form: { email, password } }),
  { status: 302, location: "/auth/confirm-email" },
];

const steps = [
  ["home renders", () => request("/"), { status: 200 }],
  ["dashboard redirects anonymous user", () => request("/dashboard"), { status: 302, location: "/auth/signin" }],
  ...(usesExistingAccount ? [] : [signupStep]),
  [
    "signin rejects wrong password",
    () => request("/api/auth/signin", { method: "POST", form: { email, password: "wrong" } }),
    { status: 302, location: "/auth/signin?error=" },
  ],
  [
    "signin accepts correct password",
    () => request("/api/auth/signin", { method: "POST", form: { email, password } }),
    { status: 302, location: "/" },
  ],
  ["dashboard renders for signed-in user", () => request("/dashboard"), { status: 200 }],
  ["signout clears session", () => request("/api/auth/signout", { method: "POST" }), { status: 302, location: "/" }],
  ["dashboard redirects after signout", () => request("/dashboard"), { status: 302, location: "/auth/signin" }],
];

console.log(
  usesExistingAccount ? `Mode: existing account (${email}), signup step skipped` : `Mode: throwaway account (${email})`,
);

let failed = 0;
for (const [name, run, expected] of steps) {
  const actual = await run();
  const ok =
    actual.status === expected.status &&
    (expected.location === undefined || actual.location.startsWith(expected.location));
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}  -> ${actual.status} ${actual.location}`);
  if (!ok) {
    failed++;
    console.log(`      expected ${expected.status} ${expected.location ?? ""}`);
  }
}

console.log(failed ? `\n${failed} step(s) failed` : "\nAll smoke steps passed");
process.exit(failed ? 1 : 0);
