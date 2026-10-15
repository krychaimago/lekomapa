// Working copy (Polish) for the question for the doctor (S-06, US-02, FR-010). scripts/fr012/doctor-question-copy.test.mjs
// runs every string here through the FR-012 stem filter with no exception, so the module has only string fields.
// Templates carry markers that doctorQuestionText (src/lib/services/doctor-question.ts) replaces — never a function,
// because text built in a function would bypass the filter. The dose marker is `{ilość}`, not a word with the dose stem,
// and an end reads "nie biorę leku": "nie przyjmuję" hits the stem `nie przyjmuj`. The word "lek" before a name takes
// the case ending, because product names are never declined. These texts link a medicine to a symptom, so every
// question uses "może mieć związek" ("mogą mieć związek" for a symptom name in the plural) and never states a cause.

export const DOCTOR_QUESTION_COPY = {
  sectionTitle: "Pytanie do lekarza",
  summaryOne: "wpis {data}",
  summaryMany: "pierwszy wpis {od}, ostatni {do} ({liczba} {wpisy})",
  // Polish plural of "wpis" after a number: 2–4, 22–24… and 5–21, 25–31…
  entriesFew: "wpisy",
  entriesMany: "wpisów",
  eventsIntro: "Zmiany w lekach w tym czasie i do 90 dni wcześniej:",
  eventStart: "Od {data} biorę lek {lek}, {ilość}.",
  eventChange: "Od {data} biorę lek {lek} {po}, zamiast {przed}.",
  eventStop: "Od {data} nie biorę leku {lek}.",
  noEvents: "W tym czasie i do 90 dni wcześniej nie było zmian w lekach.",
  questionOne: "Czy {objaw} może mieć związek z tym lekiem?",
  questionMany: "Czy {objaw} może mieć związek z którymś z tych leków?",
  questionTakenOne: "Czy {objaw} może mieć związek z lekiem, który biorę?",
  questionTakenMany: "Czy {objaw} może mieć związek z którymś z leków, które biorę?",
  // The same questions for a symptom name in the plural ("mdłości", "zawroty głowy"): the verb agrees with it.
  questionOnePlural: "Czy {objaw} mogą mieć związek z tym lekiem?",
  questionManyPlural: "Czy {objaw} mogą mieć związek z którymś z tych leków?",
  questionTakenOnePlural: "Czy {objaw} mogą mieć związek z lekiem, który biorę?",
  questionTakenManyPlural: "Czy {objaw} mogą mieć związek z którymś z leków, które biorę?",
  othersLabel: "Pozostałe leki ({liczba})",
  takenLabel: "Przyjmowane leki:",
  otherItem: "{lek} — od {data}, {ilość}",
  note: "Pytanie zestawia daty z dziennika i z listy leków. Nie jest oceną ani diagnozą. O każdy lek i każdy objaw możesz zapytać lekarza lub farmaceutę.",
  noQuestion:
    "Pytanie do lekarza powstaje, gdy w czasie objawu albo do 90 dni przed pierwszym wpisem z tym objawem masz na liście jakiś lek.",
  loadError: "Nie udało się przygotować pytania do lekarza. Odśwież stronę.",
} as const;
