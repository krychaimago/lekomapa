// Working copy (Polish) for the "Do omówienia z lekarzem" section (S-08, US-03, FR-011). The author approves the
// wording in phase 3 of context/changes/doctor-visit-summary/plan.md. scripts/fr012/visit-summary-copy.test.mjs runs
// every string here through the FR-012 stem filter with no exception, so the module has no imports and only string
// fields. Templates carry `{…}` markers the screen replaces — never a function, because text built in a function would
// bypass the filter. Texts that already exist are not copied here: the interaction note, rulesIncomplete,
// noWarningIsNotSafe and detailsHeading come from src/lib/copy/interactions.ts, noQuestion from
// src/lib/copy/doctor-question.ts. DOCTOR_QUESTION_COPY.note is not used in the section: its last sentence is
// askDoctorOrPharmacist, which the section shows once at the bottom.

export const VISIT_SUMMARY_COPY = {
  title: "Do omówienia z lekarzem",
  intro: "Tu zbiorą się możliwe interakcje między Twoimi lekami i pytania do lekarza o objawy z dzienniczka.",
  introAddMedication: "Dodaj lek",
  introAddSymptom: "Zapisz objaw",
  pairLabel: "{lek} i {drugi}",
  noCurrentMedications: "Nie masz bieżących leków. Pary sprawdzane są wśród leków, które bierzesz teraz.",
  oneMedication: "Masz jeden bieżący lek. Pary sprawdzane są, gdy na liście są co najmniej dwa bieżące leki.",
  noPairFound: "Wśród Twoich bieżących leków nie znaleziono sprawdzanej pary.",
  questionsHeading: "Pytania do lekarza",
  noQuestions: "Pytania pojawią się po zapisaniu objawu w dzienniczku.",
  journalLink: "Przejdź do dzienniczka",
  withoutQuestion: "Bez pytania: {objawy}.",
  askDoctorOrPharmacist: "O każdy lek i każdy objaw możesz zapytać lekarza lub farmaceutę.",
  questionsNote: "Pytania zestawiają daty z dzienniczka i z listy leków. Nie są oceną ani diagnozą.",
  loadError: "Nie udało się wczytać sekcji. Odśwież stronę.",
} as const;
