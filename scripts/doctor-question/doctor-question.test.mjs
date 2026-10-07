// The question for the doctor (S-06, US-02, FR-010): which medicine events fall into the time window of a symptom and
// what the composed text says. Expected values come from the plan's window rule and the PRD, not from the code:
// window = from (first entry with the symptom − 90 days) to the day of the current entry, both ends included, days in
// Polish time; events after the current entry do not count; nothing is ordered by suspicion.

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import {
  PLURAL_SYMPTOM_NAMES,
  composeDoctorQuestion,
  doctorQuestionText,
} from "../../src/lib/services/doctor-question.ts";
import { REQUIRED_PHRASE, REQUIRED_PHRASE_PLURAL } from "../fr012/corpus.mjs";
import { forbiddenWordsIn } from "../rpl/pairs.mjs";

// Run in a zone other than Warsaw: on a machine already in Europe/Warsaw the day of an entry would come out right even
// without the time zone conversion. The Worker runs in UTC. Set before any test runs.
process.env.TZ = "UTC";

let nextId = 0;
// A medication as the data layer hands it over: periods `[startedOn, endedOn)`, the last one closed by discontinuedOn.
function med(name, periods, discontinuedOn = null) {
  nextId += 1;
  return {
    id: `med-${nextId}`,
    name,
    discontinuedOn,
    // Registry variant: strength and form, both null for a medication from a leaflet.
    periods: periods.map(([startedOn, endedOn, doseText, strength = null, pharmaceuticalForm = null]) => ({
      startedOn,
      endedOn,
      doseText,
      strength,
      pharmaceuticalForm,
    })),
  };
}

// Entries with the symptom on 01.09.2026 and 06.10.2026 (noon in Poland): window from 03.06.2026 to 06.10.2026.
const firstEntry = "2026-09-01T10:00:00Z";
const currentEntry = "2026-10-06T10:00:00Z";

function compose(medications, overrides = {}) {
  return composeDoctorQuestion({
    symptomName: "ból głowy",
    entryOccurredAt: currentEntry,
    symptomOccurrences: [firstEntry, currentEntry],
    medications,
    ...overrides,
  });
}

const eventNames = (question) => question.events.map((event) => `${event.date} ${event.kind} ${event.medicationName}`);
const otherNames = (question) => question.otherMedications.map((other) => other.name);

test("first entry on 01.09.2026 opens the window on 03.06.2026, 90 days earlier", () => {
  const question = compose([med("Apap", [["2026-07-01", null, "1 tabletka"]])]);
  assert.equal(question.windowStart, "2026-06-03");
  assert.equal(question.firstEntryOn, "2026-09-01");
  assert.equal(question.entryOn, "2026-10-06");
  assert.equal(question.entryCount, 2);
  assert.equal(question.symptomName, "ból głowy");
});

test("an event on the first day of the window or on the day of the entry is on top; a day outside is not", () => {
  const question = compose([
    med("Apap", [["2026-06-03", null, "1 tabletka"]]),
    med("Biotyna", [["2026-06-02", null, "1 kapsułka"]]),
    med("Cetyryzyna", [
      ["2026-01-01", "2026-10-06", "5 mg"],
      ["2026-10-06", null, "10 mg"],
    ]),
    med("Euthyrox", [
      ["2026-01-01", "2026-10-07", "50 µg"],
      ["2026-10-07", null, "75 µg"],
    ]),
    med("Furagin", [["2026-01-01", "2026-06-03", "1 tabletka"]], "2026-06-03"),
  ]);
  assert.deepEqual(eventNames(question), [
    "2026-06-03 start Apap",
    "2026-06-03 stop Furagin",
    "2026-10-06 change Cetyryzyna",
  ]);
  assert.deepEqual(question.events[2], {
    date: "2026-10-06",
    kind: "change",
    medicationName: "Cetyryzyna",
    dose: "10 mg",
    previousDose: "5 mg",
  });
  // Started a day before the window; changed a day after the entry, so it shows with the dose taken on the entry day.
  assert.deepEqual(question.otherMedications, [
    { name: "Biotyna", since: "2026-06-02", dose: "1 kapsułka" },
    { name: "Euthyrox", since: "2026-01-01", dose: "50 µg" },
  ]);
});

test("a medication ended before the window or started after the entry is nowhere in the question", () => {
  const question = compose([
    med("Apap", [["2026-07-01", null, "1 tabletka"]]),
    med("Ibuprom", [["2026-01-01", "2026-06-02", "1 tabletka"]], "2026-06-02"),
    med("Zyrtec", [["2026-10-07", null, "1 tabletka"]]),
  ]);
  assert.deepEqual(eventNames(question), ["2026-07-01 start Apap"]);
  assert.deepEqual(otherNames(question), []);
});

test("an entry saved at 00:30 Polish time on 06.10.2026 (22:30 UTC the day before) is an entry from 06.10.2026", () => {
  const late = "2026-10-05T22:30:00Z";
  const question = compose([med("Apap", [["2026-10-06", null, "1 tabletka"]])], {
    entryOccurredAt: late,
    symptomOccurrences: [late],
  });
  assert.equal(question.entryOn, "2026-10-06");
  assert.equal(question.firstEntryOn, "2026-10-06");
  assert.deepEqual(eventNames(question), ["2026-10-06 start Apap"]);
});

test("a backdated entry earlier than the first becomes the first; entries after the current one do not move the window", () => {
  const backdated = "2026-08-01T10:00:00Z";
  const question = compose([med("Apap", [["2026-05-03", null, "1 tabletka"]])], {
    entryOccurredAt: backdated,
    symptomOccurrences: [firstEntry, "2026-10-01T10:00:00Z", backdated],
  });
  assert.equal(question.firstEntryOn, "2026-08-01");
  assert.equal(question.entryOn, "2026-08-01");
  assert.equal(question.entryCount, 1);
  assert.equal(question.windowStart, "2026-05-03");
  assert.deepEqual(eventNames(question), ["2026-05-03 start Apap"]);
});

test("an entry later the same day does not count for an earlier entry", () => {
  const question = compose([med("Apap", [["2026-01-01", null, "1 tabletka"]])], {
    symptomOccurrences: [firstEntry, currentEntry, "2026-10-06T15:00:00Z"],
  });
  assert.equal(question.entryCount, 2);
});

test("no medication taken in the window gives no question", () => {
  assert.equal(compose([]), null);
  assert.equal(compose([med("Ibuprom", [["2026-01-01", "2026-05-01", "1 tabletka"]], "2026-05-01")]), null);
});

test("medications taken in the window without any event: no events, all of them among the others", () => {
  const question = compose([
    med("Euthyrox", [
      ["2025-01-01", "2026-02-01", "50 µg"],
      ["2026-02-01", null, "75 µg"],
    ]),
    med("Apap", [["2026-01-01", null, "1 tabletka"]]),
  ]);
  assert.deepEqual(question.events, []);
  // `since` is the start of the dose shown, so "od 01.02.2026, 75 µg" is true; the medication start would not be.
  assert.deepEqual(question.otherMedications, [
    { name: "Apap", since: "2026-01-01", dose: "1 tabletka" },
    { name: "Euthyrox", since: "2026-02-01", dose: "75 µg" },
  ]);
});

// Decided with the author (06.10.2026): only the part of the variant that changed, so the sentence stays short.
test("a change of the strength alone shows the strength with both doses, not the unchanged form", () => {
  const question = compose([
    med("Euthyrox", [
      ["2026-01-01", "2026-09-20", "1 tabletka", "50 µg", "tabletki"],
      ["2026-09-20", null, "1 tabletka", "75 µg", "tabletki"],
    ]),
  ]);
  assert.deepEqual(question.events, [
    {
      date: "2026-09-20",
      kind: "change",
      medicationName: "Euthyrox",
      dose: "1 tabletka (Moc: 75 µg)",
      previousDose: "1 tabletka (Moc: 50 µg)",
    },
  ]);
});

test("a change of the form alone shows the form with both doses, not the unchanged strength", () => {
  const question = compose([
    med("Euthyrox", [
      ["2026-01-01", "2026-09-20", "1 sztuka", "75 µg", "tabletki"],
      ["2026-09-20", null, "1 sztuka", "75 µg", "kapsułki miękkie"],
    ]),
  ]);
  assert.equal(question.events[0].dose, "1 sztuka (Postać: kapsułki miękkie)");
  assert.equal(question.events[0].previousDose, "1 sztuka (Postać: tabletki)");
});

// The database treats dose texts differing only in case as the same dose (DP004), so this is a change of the strength.
test("a dose text differing only in case, with a new strength, shows the strength with both doses", () => {
  const question = compose([
    med("Euthyrox", [
      ["2026-01-01", "2026-09-20", "1 Tabletka", "50 µg", "tabletki"],
      ["2026-09-20", null, "1 tabletka", "100 µg", "tabletki"],
    ]),
  ]);
  assert.equal(question.events[0].dose, "1 tabletka (Moc: 100 µg)");
  assert.equal(question.events[0].previousDose, "1 Tabletka (Moc: 50 µg)");
});

test("a change of the dose text shows the doses alone, without the variant", () => {
  const question = compose([
    med("Euthyrox", [
      ["2026-01-01", "2026-09-20", "50 µg", "50 µg", "tabletki"],
      ["2026-09-20", null, "75 µg", "75 µg", "tabletki"],
    ]),
  ]);
  assert.equal(question.events[0].dose, "75 µg");
  assert.equal(question.events[0].previousDose, "50 µg");
});

test("events stand by date, then alphabetically by name; shuffled input gives the same question", () => {
  const medications = [
    med("Żelazo", [["2026-07-01", null, "1 tabletka"]]),
    med("Zyrtec", [["2026-07-01", null, "1 tabletka"]]),
    med("Apap", [["2026-07-01", null, "2 tabletki"]]),
    // The same product added twice is two medications; their order must not depend on the input either.
    med("Apap", [["2026-07-01", null, "1 tabletka"]]),
    med("Ibuprom", [["2026-03-01", "2026-09-03", "1 tabletka"]], "2026-09-03"),
    med("Euthyrox", [
      ["2026-02-01", "2026-06-10", "25 µg"],
      ["2026-06-10", "2026-09-20", "50 µg"],
      ["2026-09-20", null, "75 µg"],
    ]),
    med("Witamina D", [["2026-01-01", null, "1 kapsułka"]]),
    med("Biotyna", [["2026-01-01", null, "1 kapsułka"]]),
  ];
  const question = compose(medications);
  assert.deepEqual(eventNames(question), [
    "2026-06-10 change Euthyrox",
    "2026-07-01 start Apap",
    "2026-07-01 start Apap",
    // Polish collation: Z before Ż (without it, "Że…" would come before "Zy…").
    "2026-07-01 start Zyrtec",
    "2026-07-01 start Żelazo",
    "2026-09-03 stop Ibuprom",
    "2026-09-20 change Euthyrox",
  ]);
  assert.deepEqual(otherNames(question), ["Biotyna", "Witamina D"]);
  assert.deepEqual(
    question.events.filter((event) => event.medicationName === "Apap").map((event) => event.dose),
    ["1 tabletka", "2 tabletki"],
  );

  const shuffled = [...medications].reverse().map((m) => ({ ...m, periods: [...m.periods].reverse() }));
  assert.deepEqual(compose(shuffled, { symptomOccurrences: [currentEntry, firstEntry] }), question);
});

// The planning example (plan.md, Desired End State): five entries, a start, an end and a dose change in the window.
const planExample = compose(
  [
    med("Apap", [["2026-07-01", null, "1 tabletka"]]),
    med("Ibuprom", [["2026-03-01", "2026-09-03", "1 tabletka"]], "2026-09-03"),
    med("Euthyrox", [
      ["2026-02-01", "2026-09-20", "50 µg"],
      ["2026-09-20", null, "75 µg"],
    ]),
    med("Witamina D", [["2026-01-01", null, "1 kapsułka"]]),
  ],
  {
    symptomOccurrences: [
      firstEntry,
      "2026-09-10T10:00:00Z",
      "2026-09-20T10:00:00Z",
      "2026-10-01T10:00:00Z",
      currentEntry,
    ],
  },
);

test("the planning example reads as agreed in the plan", () => {
  const text = doctorQuestionText(planExample);
  assert.equal(text.heading, "Ból głowy");
  assert.equal(text.summary, "pierwszy wpis 01.09.2026, ostatni 06.10.2026 (5 wpisów)");
  assert.equal(text.eventsIntro, "Zmiany w lekach w tym czasie i do 90 dni wcześniej:");
  assert.deepEqual(text.events, [
    "Od 01.07.2026 biorę lek Apap, 1 tabletka.",
    "Od 03.09.2026 nie biorę leku Ibuprom.",
    "Od 20.09.2026 biorę lek Euthyrox 75 µg, zamiast 50 µg.",
  ]);
  assert.equal(text.question, "Czy ból głowy może mieć związek z którymś z tych leków?");
  assert.equal(text.othersLabel, "Pozostałe leki (1)");
  assert.deepEqual(text.others, ["Witamina D — od 01.01.2026, 1 kapsułka"]);
});

test("one medication on top asks about that medication; a single entry is summed up by its day", () => {
  const text = doctorQuestionText(
    compose([med("Apap", [["2026-10-01", null, "1 tabletka"]])], { symptomOccurrences: [currentEntry] }),
  );
  assert.equal(text.summary, "wpis 06.10.2026");
  assert.equal(text.question, "Czy ból głowy może mieć związek z tym lekiem?");
  assert.deepEqual(text.others, []);
});

// A name typed from a leaflet is free text: "$&" and "{po}" in it must stay as typed, not act as replacement patterns.
test("a medication name with $& and a marker in it is written as typed", () => {
  const text = doctorQuestionText(
    compose([
      med("Krople $& {po}", [
        ["2026-01-01", "2026-09-20", "1 kropla"],
        ["2026-09-20", null, "2 krople"],
      ]),
    ]),
  );
  assert.deepEqual(text.events, ["Od 20.09.2026 biorę lek Krople $& {po} 2 krople, zamiast 1 kropla."]);
});

test("without events in the window the question is about the medications taken, listed in full", () => {
  const one = doctorQuestionText(compose([med("Apap", [["2026-01-01", null, "1 tabletka"]])]));
  assert.equal(one.eventsIntro, "W tym czasie i do 90 dni wcześniej nie było zmian w lekach.");
  assert.deepEqual(one.events, []);
  assert.equal(one.othersLabel, "Przyjmowane leki:");
  assert.deepEqual(one.others, ["Apap — od 01.01.2026, 1 tabletka"]);
  assert.equal(one.question, "Czy ból głowy może mieć związek z lekiem, który biorę?");

  const many = doctorQuestionText(
    compose([med("Apap", [["2026-01-01", null, "1 tabletka"]]), med("Biotyna", [["2026-01-01", null, "1 kapsułka"]])]),
  );
  assert.equal(many.question, "Czy ból głowy może mieć związek z którymś z leków, które biorę?");
});

test("the number of entries takes the Polish plural form", () => {
  const summaryFor = (count) => {
    const occurrences = Array.from(
      { length: count },
      (_, day) => `2026-09-${String(day + 1).padStart(2, "0")}T10:00:00Z`,
    );
    return doctorQuestionText(
      compose([med("Apap", [["2026-01-01", null, "1 tabletka"]])], {
        entryOccurredAt: occurrences.at(-1),
        symptomOccurrences: occurrences,
      }),
    ).summary;
  };
  assert.match(summaryFor(2), /\(2 wpisy\)$/);
  assert.match(summaryFor(4), /\(4 wpisy\)$/);
  assert.match(summaryFor(5), /\(5 wpisów\)$/);
  assert.match(summaryFor(10), /\(10 wpisów\)$/);
  assert.match(summaryFor(12), /\(12 wpisów\)$/);
  assert.match(summaryFor(14), /\(14 wpisów\)$/);
  assert.match(summaryFor(21), /\(21 wpisów\)$/);
  assert.match(summaryFor(22), /\(22 wpisy\)$/);
  assert.match(summaryFor(25), /\(25 wpisów\)$/);
});

// FR-012 on the composed text, not only on the templates: names, doses and dates inserted into a sentence must not
// turn it into a statement of cause, and the question always carries the required wording.
test("every composed text passes the FR-012 filter and the question carries the required wording", () => {
  const fixtures = [
    planExample,
    compose([
      med("Euthyrox", [
        ["2026-01-01", "2026-09-20", "1 tabletka", "50 µg", "tabletki"],
        ["2026-09-20", null, "1 tabletka", "75 µg", "tabletki"],
      ]),
    ]),
    compose([med("Apap", [["2026-01-01", null, "1 tabletka"]])]),
  ];
  for (const question of fixtures) {
    const text = doctorQuestionText(question);
    const strings = [text.heading, text.summary, text.eventsIntro, ...text.events, text.question, text.othersLabel];
    for (const string of [...strings, ...text.others, text.note]) {
      assert.deepEqual(forbiddenWordsIn(string), [], `"${string}"`);
    }
    assert.ok(text.question.includes(REQUIRED_PHRASE), text.question);
    assert.ok(text.note.length > 0);
  }
});

// A symptom name in the plural takes "mogą": "Czy mdłości może mieć związek…" was reported on the phone (S-06, 3.5).
test("the verb of the question agrees with the number of the symptom name", () => {
  const medications = [med("Apap", [["2026-07-01", null, "1 tabletka"]])];
  const singular = doctorQuestionText(compose(medications));
  assert.equal(singular.question, "Czy ból głowy może mieć związek z tym lekiem?");
  const plural = doctorQuestionText(compose(medications, { symptomName: "mdłości" }));
  assert.equal(plural.question, "Czy mdłości mogą mieć związek z tym lekiem?");
  assert.deepEqual(forbiddenWordsIn(plural.question), []);
  assert.ok(plural.question.includes(REQUIRED_PHRASE_PLURAL));

  // Without changes in the window the question is about the medicines taken, in the plural as well.
  const taken = doctorQuestionText(
    compose([med("Apap", [["2026-01-01", null, "1 tabletka"]])], { symptomName: "zawroty głowy" }),
  );
  assert.equal(taken.question, "Czy zawroty głowy mogą mieć związek z lekiem, który biorę?");
});

// A typo here would silently leave that symptom with "może"; every name must be a name the catalog seeds.
test("every plural symptom name is a name in the symptom catalog", async () => {
  const seed = await readFile(
    new URL("../../supabase/migrations/20260926120100_symptom_catalog_seed.sql", import.meta.url),
    "utf8",
  );
  assert.ok(PLURAL_SYMPTOM_NAMES.size > 0);
  for (const name of PLURAL_SYMPTOM_NAMES) {
    assert.ok(seed.includes(`', '${name}', '`), `"${name}" is not in the catalog seed`);
  }
});
