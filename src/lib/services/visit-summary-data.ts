// Data for the doctor visit section `/wizyta` (S-08, US-03, FR-011). Reads in parallel through RLS and leaves
// every decision to ./visit-summary.ts: interactions come from the same medication_interactions() as /leki, questions
// from the same composeDoctorQuestion as the journal. symptom_occurrences() returns one row per symptom with all its
// entry dates, so PostgREST's max_rows never cuts off the first entry of a window.
import type { createClient } from "@/lib/supabase";
import { loadQuestionMedications } from "@/lib/services/doctor-question-data";
import { todayInWarsaw } from "@/lib/services/medications";
import {
  composeVisitQuestions,
  interactionsEmptyState,
  isCurrentMedication,
  showIntro,
  uniqueInteractions,
} from "@/lib/services/visit-summary";
import type { MedicationInteraction, VisitSummary } from "@/types";

type SupabaseClient = NonNullable<ReturnType<typeof createClient>>;

interface SymptomOccurrenceRow {
  symptom_id: string;
  symptom_name: string;
  occurrences: string[];
}

// Any failed read gives `{ error: true }`; only error codes are logged, never the data.
export async function loadVisitSummary(supabase: SupabaseClient): Promise<VisitSummary | { error: true }> {
  const [symptoms, medications, interactions] = await Promise.all([
    supabase.rpc("symptom_occurrences"),
    loadQuestionMedications(supabase),
    supabase.rpc("medication_interactions"),
  ]);
  if (symptoms.error || interactions.error || "error" in medications) {
    console.error("Loading the doctor visit section failed", {
      symptomsCode: symptoms.error?.code,
      medicationsFailed: "error" in medications,
      interactionsCode: interactions.error?.code,
    });
    return { error: true };
  }

  // Untyped client: the setof results are typed as a single row, so the rows are cast here.
  const symptomRows = (symptoms.data ?? []) as SymptomOccurrenceRow[];
  const interactionRows = (interactions.data ?? []) as MedicationInteraction[];

  const today = todayInWarsaw();
  const currentCount = medications.filter((medication) => isCurrentMedication(medication.discontinuedOn, today)).length;
  const names = new Map(medications.map((medication) => [medication.id, medication.name]));
  const pairs = uniqueInteractions(interactionRows, names);
  const { questions, withoutQuestion } = composeVisitQuestions(
    symptomRows.map((row) => ({ symptomId: row.symptom_id, name: row.symptom_name, occurrences: row.occurrences })),
    medications,
  );

  return {
    showIntro: showIntro(medications.length, symptomRows.length),
    interactions: pairs,
    interactionsEmptyState: interactionsEmptyState(currentCount, pairs.length),
    questions,
    withoutQuestion,
  };
}
