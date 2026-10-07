// Data for the questions for the doctor of one journal entry (S-06, US-02, FR-010). Takes the client like
// ./registry-search.ts and leaves the window rule to ./doctor-question.ts, which stays free of the Supabase client for
// its node tests. Every read goes through RLS, so only the signed-in person's rows take part. How S-08 reads its data
// (symptoms from many entries) is decided by the S-08 plan; this module reads one entry.
import type { createClient } from "@/lib/supabase";
import { composeDoctorQuestion } from "@/lib/services/doctor-question";
import type { DoctorQuestion, DoctorQuestionMedication, DosagePeriod, Medication, RegistryProduct } from "@/types";

type SupabaseClient = NonNullable<ReturnType<typeof createClient>>;

interface EntryRow {
  occurred_at: string;
  symptom_entry_items: { symptom_id: string; symptoms: { name: string } | null }[];
}

interface OccurrenceRow {
  symptom_id: string;
  symptom_entries: { occurred_at: string };
}

type MedicationRow = Pick<Medication, "id" | "product_name" | "discontinued_on"> & {
  dosage_periods: (Pick<DosagePeriod, "started_on" | "ended_on" | "dose_text"> & {
    registry_products: Pick<RegistryProduct, "strength" | "pharmaceutical_form"> | null;
  })[];
};

export type DoctorQuestionsResult = { questions: DoctorQuestion[]; skippedSymptoms: number } | { error: true };

// One question per symptom of the entry, in the order of the entry card (alphabetically by symptom name). A symptom
// with no medication in its window gets no question and is counted in `skippedSymptoms`. Any failed read gives
// `{ error: true }`; only the error code is logged, never the data.
export async function loadDoctorQuestions(supabase: SupabaseClient, entryId: string): Promise<DoctorQuestionsResult> {
  const entry = await supabase
    .from("symptom_entries")
    .select("occurred_at, symptom_entry_items(symptom_id, symptoms(name))")
    .eq("id", entryId)
    .single()
    .overrideTypes<EntryRow, { merge: false }>();
  if (entry.error) {
    console.error("Loading the entry for the doctor question failed", { code: entry.error.code });
    return { error: true };
  }

  const symptoms = entry.data.symptom_entry_items
    .flatMap((item) => (item.symptoms ? [{ id: item.symptom_id, name: item.symptoms.name }] : []))
    .sort((a, b) => a.name.localeCompare(b.name, "pl"));
  if (symptoms.length === 0) return { questions: [], skippedSymptoms: 0 };

  const [occurrences, medications] = await Promise.all([
    supabase
      .from("symptom_entry_items")
      .select("symptom_id, symptom_entries!inner(occurred_at)")
      .in(
        "symptom_id",
        symptoms.map((symptom) => symptom.id),
      )
      .overrideTypes<OccurrenceRow[], { merge: false }>(),
    supabase
      .from("medications")
      .select(
        "id, product_name, discontinued_on, dosage_periods(started_on, ended_on, dose_text, registry_products(strength, pharmaceutical_form))",
      )
      .overrideTypes<MedicationRow[], { merge: false }>(),
  ]);
  if (occurrences.error || medications.error) {
    console.error("Loading data for the doctor question failed", {
      occurrencesCode: occurrences.error?.code,
      medicationsCode: medications.error?.code,
    });
    return { error: true };
  }

  const questionMedications: DoctorQuestionMedication[] = medications.data.map((row) => ({
    id: row.id,
    name: row.product_name,
    discontinuedOn: row.discontinued_on,
    periods: row.dosage_periods.map((period) => ({
      startedOn: period.started_on,
      endedOn: period.ended_on,
      doseText: period.dose_text,
      strength: period.registry_products?.strength ?? null,
      pharmaceuticalForm: period.registry_products?.pharmaceutical_form ?? null,
    })),
  }));

  const questions: DoctorQuestion[] = [];
  let skippedSymptoms = 0;
  for (const symptom of symptoms) {
    const question = composeDoctorQuestion({
      symptomName: symptom.name,
      entryOccurredAt: entry.data.occurred_at,
      symptomOccurrences: occurrences.data
        .filter((row) => row.symptom_id === symptom.id)
        .map((row) => row.symptom_entries.occurred_at),
      medications: questionMedications,
    });
    if (question) questions.push(question);
    else skippedSymptoms++;
  }
  return { questions, skippedSymptoms };
}
