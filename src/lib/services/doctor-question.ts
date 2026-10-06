// Question for the doctor (S-06, US-02, FR-010): lines up one symptom with the dosage history. No `@/` imports and no
// Supabase client, so scripts/doctor-question/doctor-question.test.mjs can load this file directly under
// `node --experimental-strip-types`. The window rule is the one in context/changes/symptom-question-composer/plan.md.

import { DOCTOR_QUESTION_COPY as copy } from "../copy/doctor-question.ts";
import type { DoctorQuestion, DoctorQuestionEvent, DoctorQuestionMedication } from "../../types.ts";
import { addDays, formatIsoDate, todayInWarsaw, variantText } from "./medications.ts";

// How far before the first entry with the symptom the window reaches (PRD, open question 4).
export const QUESTION_WINDOW_DAYS = 90;

export interface ComposeDoctorQuestionInput {
  symptomName: string;
  /** `occurred_at` of the current entry. */
  entryOccurredAt: string;
  /** `occurred_at` of every entry with this symptom, the current one included; later ones are ignored here. */
  symptomOccurrences: string[];
  medications: DoctorQuestionMedication[];
}

type Period = DoctorQuestionMedication["periods"][number];

const byName = (a: string, b: string) => a.localeCompare(b, "pl");

// The dose of a change. When the dose text is the same on both sides, the part of the variant that changed is added —
// strength, form or both — otherwise a change of the strength alone would read "1 tabletka, zamiast 1 tabletka".
// Only the changed part, so the sentence stays short (decided with the author, 06.10.2026).
function changeDoses(previous: Period, next: Period): { dose: string; previousDose: string } {
  if (previous.doseText !== next.doseText) return { dose: next.doseText, previousDose: previous.doseText };
  const strengthChanged = previous.strength !== next.strength;
  const formChanged = previous.pharmaceuticalForm !== next.pharmaceuticalForm;
  const withChange = (period: Period) => {
    const label = variantText({
      strength: strengthChanged ? period.strength : null,
      pharmaceutical_form: formChanged ? period.pharmaceuticalForm : null,
    });
    return label ? `${period.doseText} (${label})` : period.doseText;
  };
  return { dose: withChange(next), previousDose: withChange(previous) };
}

function eventsOf(medication: DoctorQuestionMedication, periods: Period[]): DoctorQuestionEvent[] {
  const medicationName = medication.name;
  const events: DoctorQuestionEvent[] = [];
  periods.forEach((period, index) => {
    if (index === 0) {
      events.push({ date: period.startedOn, kind: "start", medicationName, dose: period.doseText });
    } else {
      events.push({
        date: period.startedOn,
        kind: "change",
        medicationName,
        ...changeDoses(periods[index - 1], period),
      });
    }
  });
  if (medication.discontinuedOn !== null) {
    events.push({ date: medication.discontinuedOn, kind: "stop", medicationName });
  }
  return events;
}

// → null when no medication was taken in the window and none started, changed or ended in it.
// The result never depends on the order of the input arrays.
export function composeDoctorQuestion(input: ComposeDoctorQuestionInput): DoctorQuestion | null {
  const entryTime = Date.parse(input.entryOccurredAt);
  const entryOn = todayInWarsaw(new Date(entryTime));
  const earlier = input.symptomOccurrences.filter((occurredAt) => Date.parse(occurredAt) <= entryTime);
  const firstEntryOn = earlier
    .map((occurredAt) => todayInWarsaw(new Date(occurredAt)))
    .reduce((first, day) => (day < first ? day : first), entryOn);
  const windowStart = addDays(firstEntryOn, -QUESTION_WINDOW_DAYS);
  // ISO dates compare correctly as strings.
  const inWindow = (date: string) => windowStart <= date && date <= entryOn;

  const events: DoctorQuestionEvent[] = [];
  const otherMedications: DoctorQuestion["otherMedications"] = [];
  for (const medication of input.medications) {
    const periods = [...medication.periods].sort((a, b) => a.startedOn.localeCompare(b.startedOn));
    const own = eventsOf(medication, periods).filter((event) => inWindow(event.date));
    if (own.length > 0) {
      events.push(...own);
      continue;
    }
    const taken = periods.filter(
      (period) => period.startedOn <= entryOn && (period.endedOn === null || period.endedOn > windowStart),
    );
    const current = taken.at(-1);
    if (current) otherMedications.push({ name: medication.name, since: current.startedOn, dose: current.doseText });
  }
  if (events.length === 0 && otherMedications.length === 0) return null;

  events.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      byName(a.medicationName, b.medicationName) ||
      a.kind.localeCompare(b.kind) ||
      byName(a.dose ?? "", b.dose ?? ""),
  );
  otherMedications.sort((a, b) => byName(a.name, b.name) || a.since.localeCompare(b.since) || byName(a.dose, b.dose));

  return {
    symptomName: input.symptomName,
    firstEntryOn,
    entryOn,
    entryCount: earlier.length,
    windowStart,
    events,
    otherMedications,
  };
}

export interface DoctorQuestionText {
  /** Symptom name with a capital first letter. */
  heading: string;
  summary: string;
  /** Lead-in of the events, or the sentence that there were none. */
  eventsIntro: string;
  events: string[];
  question: string;
  /** "Pozostałe leki (n)" under the events, or the lead-in of the medications taken when there are no events. */
  othersLabel: string;
  others: string[];
  note: string;
}

// Each `{marker}` replaced once; markers are unique within a template.
function fill(template: string, values: Record<string, string | number>): string {
  return Object.entries(values).reduce((text, [marker, value]) => text.replace(`{${marker}}`, String(value)), template);
}

// 2–4 (but not 12–14), 22–24, …: "wpisy"; every other count above one: "wpisów".
function entriesWord(count: number): string {
  const lastDigit = count % 10;
  const lastTwo = count % 100;
  return lastDigit >= 2 && lastDigit <= 4 && (lastTwo < 12 || lastTwo > 14) ? copy.entriesFew : copy.entriesMany;
}

function eventText(event: DoctorQuestionEvent): string {
  const values = { data: formatIsoDate(event.date), lek: event.medicationName };
  if (event.kind === "start") return fill(copy.eventStart, { ...values, ilość: event.dose ?? "" });
  if (event.kind === "change") {
    return fill(copy.eventChange, { ...values, po: event.dose ?? "", przed: event.previousDose ?? "" });
  }
  return fill(copy.eventStop, values);
}

// Ready-made strings from DOCTOR_QUESTION_COPY; the screen only puts them in place.
export function doctorQuestionText(question: DoctorQuestion): DoctorQuestionText {
  const name = question.symptomName;
  const summary =
    question.entryCount > 1
      ? fill(copy.summaryMany, {
          od: formatIsoDate(question.firstEntryOn),
          do: formatIsoDate(question.entryOn),
          liczba: question.entryCount,
          wpisy: entriesWord(question.entryCount),
        })
      : fill(copy.summaryOne, { data: formatIsoDate(question.entryOn) });
  const others = question.otherMedications.map((other) =>
    fill(copy.otherItem, { lek: other.name, data: formatIsoDate(other.since), ilość: other.dose }),
  );
  const hasEvents = question.events.length > 0;
  const changedCount = new Set(question.events.map((event) => event.medicationName)).size;
  const questionTemplate = hasEvents
    ? changedCount > 1
      ? copy.questionMany
      : copy.questionOne
    : others.length > 1
      ? copy.questionTakenMany
      : copy.questionTakenOne;

  return {
    heading: name.charAt(0).toLocaleUpperCase("pl") + name.slice(1),
    summary,
    eventsIntro: hasEvents ? copy.eventsIntro : copy.noEvents,
    events: question.events.map(eventText),
    question: fill(questionTemplate, { objaw: name }),
    othersLabel: hasEvents ? fill(copy.othersLabel, { liczba: others.length }) : copy.takenLabel,
    others,
    note: copy.note,
  };
}
