// The heavy account for the timeline measurements (S-09): 20 medications with 3 dosage periods each and 1000 symptom
// entries spread over 8 symptoms within the year before `today`. Deterministic — a fixed-seed generator, no
// Math.random — so every run measures the same data. Shared by scripts/timeline/bench.mjs (logic), the page render
// measurement and the local seed of the heavy account; reuse it there, do not copy it.
//
// Shapes are the input of buildTimeline (src/lib/services/timeline.ts): DoctorQuestionMedication[] and
// TimelineSymptomEntries[], entries oldest first as symptom_timeline() returns them. Ids are synthetic uuids; a seed
// into a real database maps the symptoms onto catalog ids itself.

export const HEAVY_TODAY = "2026-10-17";
export const HEAVY_MEDICATIONS = 20;
export const HEAVY_PERIODS_PER_MEDICATION = 3;
export const HEAVY_ENTRIES = 1000;
export const HEAVY_SYMPTOMS = 8;

const MS_PER_DAY = 86_400_000;
const SEVERITIES = [null, "mild", "moderate", "severe"];
const SYMPTOM_NAMES = [
  "ból głowy",
  "zawroty głowy",
  "mdłości",
  "senność",
  "bezsenność",
  "ból brzucha",
  "kołatanie serca",
  "wysypka",
];

function addDays(iso, days) {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day) + days * MS_PER_DAY).toISOString().slice(0, 10);
}

const uuid = (group, n) => `00000000-0000-4000-${group}-${n.toString(16).padStart(12, "0")}`;

// Park–Miller minimal standard generator, fixed seed.
function generator(seed) {
  let state = seed;
  return (limit) => {
    state = (state * 48271) % 2147483647;
    return state % limit;
  };
}

export function heavyAccount(today = HEAVY_TODAY) {
  const medications = [];
  for (let i = 0; i < HEAVY_MEDICATIONS; i += 1) {
    // Starts spread from ~13 months back; lengths vary so the dose changes do not line up.
    const firstStart = addDays(today, -400 + i * 7);
    const lengths = [60 + (i % 5) * 10, 50 + (i % 3) * 15, 40];
    const periods = [];
    let start = firstStart;
    for (let p = 0; p < HEAVY_PERIODS_PER_MEDICATION; p += 1) {
      const last = p === HEAVY_PERIODS_PER_MEDICATION - 1;
      // Even medications are still taken; odd ones ended after their third period.
      const end = last && i % 2 === 0 ? null : addDays(start, lengths[p]);
      periods.push({
        startedOn: start,
        endedOn: end,
        doseText: `${p + 1} tabletka`,
        strength: `${(p + 1) * 100} mg`,
        pharmaceuticalForm: "tabletki",
      });
      if (end !== null) start = end;
    }
    medications.push({
      id: uuid("8000", i + 1),
      name: `Lek ${String(i + 1).padStart(2, "0")}`,
      discontinuedOn: periods[periods.length - 1].endedOn,
      periods,
    });
  }

  const next = generator(20261017);
  const entriesBySymptom = SYMPTOM_NAMES.map(() => []);
  const todayMidnight = Date.parse(`${today}T00:00:00Z`);
  for (let k = 0; k < HEAVY_ENTRIES; k += 1) {
    const daysBack = next(365);
    const minuteOfDay = next(24 * 60);
    const occurredAt = new Date(todayMidnight - daysBack * MS_PER_DAY + minuteOfDay * 60_000 - 2 * 3_600_000);
    entriesBySymptom[k % HEAVY_SYMPTOMS].push({
      occurredAt: occurredAt.toISOString(),
      severity: SEVERITIES[next(SEVERITIES.length)],
    });
  }
  const symptoms = SYMPTOM_NAMES.map((name, s) => ({
    symptomId: uuid("9000", s + 1),
    name,
    entries: entriesBySymptom[s].sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt)),
  }));

  return { today, medications, symptoms };
}
