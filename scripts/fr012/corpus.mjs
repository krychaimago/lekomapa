// FR-012 corpus: expected wording derived from the PRD (context/foundation/prd.md), never from validator code.
// This module is data only and depends on nothing, so removing a stem from the validator cannot remove a test case.
// The pairs validator test (scripts/rpl/pairs-fr012.test.mjs) reads it today; S-02 reads it for UI copy.
// Sentence data is Polish on purpose: it is the language the product speaks to the user.

// FR-012 (prd.md:144): the only wording allowed for a link between medicines and a symptom.
export const REQUIRED_PHRASE = "może mieć związek";

// Sentences a product text must never contain, grouped by the PRD rule they break. Each one must be rejected
// even when the same text also carries REQUIRED_PHRASE.
export const FORBIDDEN_SENTENCES = {
  // FR-012 (prd.md:144): never state that a medicine causes a symptom.
  cause: [
    "Lek powoduje objawy.",
    "Połączenie wywoła krwawienie.",
    "Połączenie wywołało krwawienie.",
    "Lek odpowiada za objawy.",
    "Objawy są wynikiem interakcji.",
    "Objawy wynikają z interakcji.",
    "Połączenie zwiększa ryzyko krwawień.",
    "Połączenie prowadzi do krwawień.",
    "Połączenie jest przyczyną objawów.",
    "Połączenie skutkuje objawami.",
  ],
  // FR-012 (prd.md:144), guardrail (prd.md:50): never suggest stopping a medicine, changing a dose or swapping
  // one medicine for another.
  advice: [
    "Odstaw jeden z leków.",
    "Przerwij leczenie.",
    "Przerwanie leczenia jednym z leków.",
    "Nie bierz obu leków razem.",
    "Zrezygnuj z jednego z leków.",
    "Zmniejsz ilość leku.",
    "Ogranicz przyjmowanie ibuprofenu.",
    "Zamień ibuprofen na paracetamol.",
    "Dostosuj dawkę leku.",
    "Przestań przyjmować jeden z leków.",
    "Zmień lek na inny.",
    "Zamien lek.",
  ],
  // Guardrail (prd.md:49), US-01 (prd.md:67): no warning never means "safe", and no text may claim safety.
  safety: [
    "Połączenie jest bezpieczne.",
    "Te leki można bezpiecznie przyjmować razem.",
    "Połączenie jest groźne.",
    "Połączenie jest nieszkodliwe.",
    "Nic nie grozi.",
    "Przyjmowanie razem jest dozwolone.",
  ],
  // FR-012 (prd.md:144), US-01 (prd.md:66): never order medicines by degree of suspicion.
  ranking: ["Ten lek jest najbardziej podejrzany.", "Ibuprofen jest bardziej podejrzany niż ramipryl."],
  // US-01 (prd.md:66): never state a ban on taking medicines together.
  ban: [
    "Unikaj tego połączenia.",
    "Nie łącz tych leków.",
    "Tych leków nie wolno przyjmować razem.",
    "Przyjmowanie razem jest zakazane.",
    "Nie przyjmuj obu leków razem.",
    "Nie stosuj tych leków razem.",
  ],
};

// Full pair descriptions that follow FR-012 and must pass. Each carries REQUIRED_PHRASE and uses, neutrally, a
// word a broader stem could catch (risk, reduced, test results, limited, breaks, "responsible for", "most").
// No neutral sentence exists for wywoł, bezpieczn, podejrz, zamień, zamien, zmień lek, rezygn, nie bierz,
// nie przyjmuj, nie stosuj, nieszkodliw, dozwolon, grozi: in a pair description these words only state a cause,
// judge safety, rank suspicion or give advice, so each stem is justified by FORBIDDEN_SENTENCES alone.
export const ALLOWED_SENTENCES = [
  "Leki przeciwkrzepliwe z grupy rywaroksabanu i leki przeciwbólowe z grupy ibuprofenu mogą wchodzić w interakcję. Jednoczesne przyjmowanie może mieć związek ze zwiększonym ryzykiem krwawień.",
  "Leki z grupy amlodypiny i statyny mogą wchodzić w interakcję. Jednoczesne przyjmowanie może mieć związek ze zmniejszoną skutecznością leku.",
  "Antagoniści witaminy K i leki przeciwdepresyjne z grupy SSRI mogą wchodzić w interakcję. Jednoczesne przyjmowanie może mieć związek ze zmianami w wynikach badań krzepliwości krwi.",
  "Tiazydowe leki moczopędne i leki przeciwbólowe z grupy ibuprofenu mogą wchodzić w interakcję. Jednoczesne przyjmowanie może mieć związek z ograniczonym działaniem moczopędnym.",
  "Leki przeciwdepresyjne z grupy SSRI i lit mogą wchodzić w interakcję. Jednoczesne przyjmowanie może mieć związek z przerwami w śnie.",
  "Leki z grupy amlodypiny i statyny mogą wchodzić w interakcję. Jednoczesne przyjmowanie może mieć związek ze zmianami pracy enzymu, który odpowiada za rozkład statyn w wątrobie.",
  "Pętlowe leki moczopędne i inhibitory ACE mogą wchodzić w interakcję. Jednoczesne przyjmowanie może mieć związek z niższym ciśnieniem krwi, najbardziej zauważalnym w pierwszych dniach przyjmowania obu leków.",
];

// FR-012-compliant descriptions the validator rejects on purpose: { sentence, stem, reason }. A sentence lands
// here only when its stem cannot be narrowed without letting a forbidden sentence through.
export const ACCEPTED_FALSE_POSITIVES = [
  {
    sentence:
      "Inhibitory ACE i lit mogą wchodzić w interakcję. Jednoczesne przyjmowanie może mieć związek z wyższym stężeniem litu we krwi, niezależnie od wielkości dawki litu.",
    stem: "dawk",
    reason:
      "Any mention of a dose is blocked because advice to change it has too many forms (adjust, lower, split) to list.",
  },
  {
    sentence:
      "Antagoniści witaminy K i leki przeciwdepresyjne z grupy SSRI mogą wchodzić w interakcję. Jednoczesne przyjmowanie może mieć związek z nieprawidłowym wynikiem badania krzepliwości krwi.",
    stem: "wynikiem",
    reason:
      "Narrowing to `jest wynikiem` would let `Objawy są wynikiem interakcji.` through; the plural `wynikach` stays allowed.",
  },
  {
    sentence:
      "Leki przeciwdepresyjne z grupy SSRI i lit mogą wchodzić w interakcję. Jednoczesne przyjmowanie może mieć związek z objawami, o których warto przekazać komunikat lekarzowi.",
    stem: "unika",
    reason:
      "The stem sits inside `komunikat`; narrowing to `unikaj` would let `Należy unikać tego połączenia.` through.",
  },
  {
    sentence:
      "Pętlowe leki moczopędne i inhibitory ACE mogą wchodzić w interakcję. Jednoczesne przyjmowanie może mieć związek z niższym ciśnieniem krwi po wprowadzeniu drugiego leku.",
    stem: "prowadz",
    reason:
      "The stem sits inside `wprowadzenie`; `prowadzi do` has enough inflected forms (prowadził, prowadzące) that a narrower stem would miss some.",
  },
];
