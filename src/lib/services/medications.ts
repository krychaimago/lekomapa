// Pure helpers for the medication screens (S-02). No `@/` imports and no Supabase client, so
// scripts/medications/medications.test.mjs can load this file directly under `node --experimental-strip-types`.

export interface OrderableMedication {
  // Start date of the first dosage period, ISO `YYYY-MM-DD`.
  startedOn: string;
  // `medications.created_at`, ISO timestamp.
  createdAt: string;
}

// Newest start date first; on the same date, the medicine added later first. Reads only these two fields:
// the order never depends on the interaction flag or anything else a caller passes along (FR-012, US-01).
export function orderMedications<T extends OrderableMedication>(items: readonly T[]): T[] {
  return [...items].sort(
    (a, b) => b.startedOn.localeCompare(a.startedOn) || Date.parse(b.createdAt) - Date.parse(a.createdAt),
  );
}

export interface RegistryNameGroup {
  name: string;
  variants: number;
}

// One entry per product name ignoring case, spelled as it first appears, sorted alphabetically (Polish collation).
export function groupRegistryResults(rows: readonly { product_name: string }[]): RegistryNameGroup[] {
  const groups = new Map<string, RegistryNameGroup>();
  for (const { product_name } of rows) {
    const key = product_name.toLocaleLowerCase("pl");
    const group = groups.get(key);
    if (group) group.variants += 1;
    else groups.set(key, { name: product_name, variants: 1 });
  }
  return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name, "pl"));
}

// Makes `%`, `_` and `\` typed by the user literal inside an `ilike` pattern (backslash is the default escape).
export function escapeLikePattern(input: string): string {
  return input.replace(/[\\%_]/g, (char) => `\\${char}`);
}

// "Today" as an ISO date in Europe/Warsaw. The only source of today for the form default and zod validation:
// the Worker runs in UTC, so `new Date().toISOString()` would give yesterday between midnight and 2:00.
export function todayInWarsaw(now: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Warsaw",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
