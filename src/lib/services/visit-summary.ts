// The "Wizyta" section (S-08, US-03, FR-011): gathers what S-02 and S-06 already produce and decides
// only which entry is the newest, the order of symptoms, which pairs show once and which empty state appears.
// S-05 adds the list of current medications, built from the same medication rows as the questions.
// No `@/` imports and no Supabase client, so scripts/visit-summary/visit-summary.test.mjs can load this file directly
// under `node --experimental-strip-types`.

import { VISIT_SUMMARY_COPY as copy } from "../copy/visit-summary.ts";
import type {
  DoctorQuestion,
  DoctorQuestionMedication,
  MedicationInteraction,
  VisitCurrentMedication,
} from "../../types.ts";
import { composeDoctorQuestion, fill } from "./doctor-question.ts";
import { formatIsoDate, variantText } from "./medications.ts";

export interface VisitSymptom {
  symptomId: string;
  name: string;
  /** `occurred_at` of every entry with the symptom, in any order. */
  occurrences: string[];
}

export interface VisitInteraction {
  firstName: string;
  secondName: string;
  description: string;
}

export type InteractionsEmptyState = "noMedications" | "oneMedication" | "noPair";

const byName = (a: string, b: string) => a.localeCompare(b, "pl");

// One question per symptom, built from its newest entry by symptom date (`occurred_at`), not by the time it was
// written down. Symptoms go from the newest entry; on the same moment, alphabetically.
export function composeVisitQuestions(
  symptoms: VisitSymptom[],
  medications: DoctorQuestionMedication[],
): { questions: DoctorQuestion[]; withoutQuestion: string[] } {
  const composed: { question: DoctorQuestion; latest: number }[] = [];
  const withoutQuestion: string[] = [];
  for (const symptom of symptoms) {
    // No entry, nothing to ask about; Math.max of no dates would be -Infinity and break toISOString.
    if (symptom.occurrences.length === 0) continue;
    const latest = Math.max(...symptom.occurrences.map((occurredAt) => Date.parse(occurredAt)));
    const question = composeDoctorQuestion({
      symptomName: symptom.name,
      entryOccurredAt: new Date(latest).toISOString(),
      symptomOccurrences: symptom.occurrences,
      medications,
    });
    if (question) composed.push({ question, latest });
    else withoutQuestion.push(symptom.name);
  }
  composed.sort((a, b) => b.latest - a.latest || byName(a.question.symptomName, b.question.symptomName));
  return { questions: composed.map(({ question }) => question), withoutQuestion: withoutQuestion.sort(byName) };
}

// medication_interactions() returns every pair in both directions; one item per unordered pair of medications and
// checked pair. Alphabetical order only — never by suspicion (FR-012).
export function uniqueInteractions(
  rows: MedicationInteraction[],
  names: ReadonlyMap<string, string>,
): VisitInteraction[] {
  const items = new Map<string, VisitInteraction>();
  for (const row of rows) {
    const [first, second] = [row.medication_id, row.other_medication_id].sort();
    const key = `${first}|${second}|${row.pair_id}`;
    if (items.has(key)) continue;
    const [firstName, secondName] = [names.get(first) ?? "", names.get(second) ?? ""].sort(byName);
    items.set(key, { firstName, secondName, description: row.description });
  }
  return [...items.values()].sort(
    (a, b) =>
      byName(a.firstName, b.firstName) || byName(a.secondName, b.secondName) || byName(a.description, b.description),
  );
}

// The rule of medication_interactions() and /leki: current until the day of discontinuation (Polish time).
// ISO dates compare correctly as strings.
export function isCurrentMedication(discontinuedOn: string | null, today: string): boolean {
  return discontinuedOn === null || discontinuedOn > today;
}

// Each current medication once (S-05), with the dose of its latest period — the same rows the questions are built
// from, nothing read anew. A medication with no period is left out instead of failing. Alphabetical, then by the
// start of the current dose; never by suspicion (FR-012). The result never depends on the order of the input arrays.
export function currentMedications(medications: DoctorQuestionMedication[], today: string): VisitCurrentMedication[] {
  const items: VisitCurrentMedication[] = [];
  for (const medication of medications) {
    if (!isCurrentMedication(medication.discontinuedOn, today)) continue;
    const current = medication.periods.reduce<DoctorQuestionMedication["periods"][number] | undefined>(
      (latest, period) => (latest === undefined || period.startedOn > latest.startedOn ? period : latest),
      undefined,
    );
    if (!current) continue;
    items.push({
      name: medication.name,
      since: current.startedOn,
      doseText: current.doseText,
      strength: current.strength,
      pharmaceuticalForm: current.pharmaceuticalForm,
    });
  }
  return items.sort(
    (a, b) => byName(a.name, b.name) || a.since.localeCompare(b.since) || byName(a.doseText, b.doseText),
  );
}

// One line of the current medications list; the variant in brackets only when the registry gave any part of it.
export function currentMedicationText(item: VisitCurrentMedication): string {
  const variant = variantText({ strength: item.strength, pharmaceutical_form: item.pharmaceuticalForm });
  const values = { lek: item.name, data: formatIsoDate(item.since), ilość: item.doseText };
  return variant
    ? fill(copy.currentMedicationItemWithVariant, { ...values, wariant: variant })
    : fill(copy.currentMedicationItem, values);
}

// "No checked pair found" is only true with at least two current medications to compare.
export function interactionsEmptyState(currentCount: number, pairCount: number): InteractionsEmptyState | null {
  if (pairCount > 0) return null;
  if (currentCount === 0) return "noMedications";
  if (currentCount === 1) return "oneMedication";
  return "noPair";
}

// One intro instead of two empty parts — only with no medication at all (ended ones count) and no symptom entry.
export function showIntro(medicationCount: number, symptomCount: number): boolean {
  return medicationCount === 0 && symptomCount === 0;
}
