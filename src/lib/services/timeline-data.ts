// Data for the timeline page `/wizyta/os-czasu` (S-09, FR-013). Reads in parallel through RLS and returns raw input
// for the pure timeline logic: medications with every dosage period (the same loadQuestionMedications as the doctor
// questions) and every symptom entry with its severity. symptom_timeline() returns one row per symptom, so
// PostgREST's max_rows never cuts entries off the timeline. Nothing here links a symptom to a medication (FR-012).
import type { createClient } from "@/lib/supabase";
import { reportError } from "@/lib/observability/report";
import { loadQuestionMedications } from "@/lib/services/doctor-question-data";
import type { DoctorQuestionMedication, SymptomSeverity, TimelineSymptomEntries } from "@/types";

type SupabaseClient = NonNullable<ReturnType<typeof createClient>>;

interface SymptomTimelineRow {
  symptom_id: string;
  symptom_name: string;
  occurred_at: string[];
  severities: (SymptomSeverity | null)[];
}

export interface TimelineData {
  medications: DoctorQuestionMedication[];
  symptoms: TimelineSymptomEntries[];
}

// Any failed read gives `{ error: true }`; only the error code is reported, never the data.
export async function loadTimelineData(supabase: SupabaseClient): Promise<TimelineData | { error: true }> {
  const [medications, symptoms] = await Promise.all([
    loadQuestionMedications(supabase),
    supabase.rpc("symptom_timeline"),
  ]);
  // A failed medications read is reported inside loadQuestionMedications.
  if (symptoms.error) reportError("timeline.load", { code: symptoms.error.code, route: "/wizyta/os-czasu" });
  if (symptoms.error || "error" in medications) return { error: true };

  // Untyped client: the setof result is typed as a single row, so the rows are cast here.
  const rows = (symptoms.data ?? []) as SymptomTimelineRow[];
  return {
    medications,
    symptoms: rows.map((row) => ({
      symptomId: row.symptom_id,
      name: row.symptom_name,
      // The two arrays are parallel: severities[i] belongs to occurred_at[i].
      entries: row.occurred_at.map((occurredAt, index) => ({ occurredAt, severity: row.severities[index] ?? null })),
    })),
  };
}
