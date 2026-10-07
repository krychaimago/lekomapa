<!-- PLAN-REVIEW-REPORT -->

# Plan Review: S-06 Złożone pytanie do lekarza

- **Plan**: context/changes/symptom-question-composer/plan.md
- **Mode**: Deep
- **Date**: 2026-10-06
- **Verdict**: REVISE → SOUND po triage'u 2026-10-06 (F1, F2, F3 naprawione w planie)
- **Findings**: 1 critical, 2 warnings, 0 observations

## Verdicts

| Dimension             | Verdict |
| --------------------- | ------- |
| End-State Alignment   | PASS    |
| Lean Execution        | PASS    |
| Architectural Fitness | WARNING |
| Blind Spots           | PASS    |
| Plan Completeness     | FAIL    |

## Grounding

11/11 paths ✓, 6/6 symbols ✓, brief↔plan ✓, Progress↔Phase ✓

## Findings

### F1 — Teksty pytania nie przejdą filtru FR-012

- **Severity**: ❌ CRITICAL
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Completeness
- **Location**: Key Discoveries (linia 48), Faza 2 §3–§4
- **Detail**: Plan twierdzi, że nowy test nie potrzebuje wyjątków. Pomiar `forbiddenWordsIn` znalazł dwa trafienia. `eventStop` („od tego dnia nie przyjmuję”) trafia w rdzeń `nie przyjmuj`. Znacznik `{dawka}` w `eventStart` i `otherItem` trafia w `dawk`, bo filtr szuka podciągu w całym napisie, także w znacznikach. Test bez wyjątków (kryterium 2.1) padnie. Brzmienie „od 3 marca nie przyjmuję X” jest zapisane w PRD (pytanie 4) i w roadmapie.
- **Fix A ⭐ Recommended**: Zmień brzmienie: `eventStop` = „{data} — pierwszy dzień bez leku: {lek}”, znacznik `{dawka}` = `{ilość}`.
  - Strength: Test zostaje bez wyjątków, a filtr zostaje jedyną bramką.
  - Tradeoff: Brzmienie odchodzi od przykładu z PRD, więc PRD trzeba poprawić w fazie 3 §4.
  - Confidence: HIGH — żaden z tych napisów nie zawiera rdzenia z listy.
  - Blind spot: Nowe brzmienie musi zaakceptować autorka (kryterium 2.4).
- **Fix B**: Zostaw brzmienie z PRD i dopisz w teście nazwany wyjątek dla `nie przyjmuj`.
  - Strength: Tekst zgadza się z PRD słowo w słowo.
  - Tradeoff: Wyjątek obejmuje każdy napis modułu, więc przyszłe „nie przyjmuj leku” też by przeszło.
  - Confidence: HIGH — ten wzorzec już działa w `medication-copy.test.mjs:14`.
  - Blind spot: None significant.
- **Decision**: FIXED — wariant Fix A z innym brzmieniem: zdania „Od {data} biorę lek {lek}, {ilość}.” / „Od {data} biorę lek {lek} {po}, zamiast {przed}.” / „Od {data} nie biorę leku {lek}.”, znacznik `{ilość}`; poprawka PRD i roadmapy w fazie 3 §4

### F2 — Faza 1 buduje coś, co w bazie już istnieje

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Architectural Fitness
- **Location**: Faza 1 §1 i §2, Key Discoveries (linia 47)
- **Detail**: Trzy założenia planu nie zgadzają się z kodem.
  - Wyjątek w `dosage_periods_guard_core` już istnieje (`20261006120000_discontinue_medication.sql:357-369`). Przepuszcza zapis, gdy jednocześnie: `pg_trigger_depth() > 1`, okres jest najnowszy w leku i `ended_on` równa się `discontinued_on` (przy leku niezakończonym oba są puste). Ponowne otwarcie poprzedniego okresu przez wyzwalacz AFTER DELETE przejdzie więc bez zmian. Drugi wyjątek niepotrzebnie poszerzyłby strażnika historii. Komentarz w liniach 355-356 każe dopisywać nowe wyzwalacze do tego warunku świadomie.
  - Okno korekty okresu ma gotową funkcję pomocniczą `dosage_period_correction_window_open` (`correction_window.sql:133-159`).
  - W `schema_invariants_checks.sql` nie ma listy do uzupełnienia, bo niezmiennik 7 liczy funkcje dynamicznie. Niezmiennik 8 wymaga wyzwalaczy BEFORE, więc nowego wyzwalacza AFTER DELETE nie wolno tam dopisywać.
- **Fix**: Przepisz kontrakty fazy 1:
  - `guard_core` bez nowego wyjątku; komentarz w liniach 355-356 wymienia nowy wyzwalacz,
  - `guard_delete` i RPC wołają `dosage_period_correction_window_open`,
  - §2: nowy wyzwalacz ma `search_path = ''` i nie trafia do niezmiennika 8,
  - popraw linię 47 w Key Discoveries.
- **Decision**: FIXED — kontrakt fazy 1 bez nowego wyjątku w guard_core, okno przez dosage_period_correction_window_open, schema_invariants_checks.sql bez zmian, Key Discoveries poprawione

### F3 — loadDoctorQuestions(entryId) nie pasuje do S-08

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Architectural Fitness
- **Location**: Faza 3 §1 i §4 (roadmapa S-08)
- **Detail**: Według PRD (pytanie 7) S-08 pokazuje jedno pytanie na objaw, z najnowszego wpisu tego objawu, czyli z różnych wpisów. `loadDoctorQuestions` przyjmuje jeden `entryId`, więc S-08 musiałby wołać tę funkcję raz na każdy wpis, po 3 zapytania przy każdym wywołaniu. Strona `/dzienniczek` już pobiera wszystkie wpisy z `symptom_id` i `occurred_at` (`index.astro:39-45`), więc zapytania 1 i 2 pobierają te same dane drugi raz. Mimo to plan zapisuje w roadmapie, że „S-08 woła loadDoctorQuestions”.
- **Fix**: Wspólną częścią zostaje tylko odczyt leków (zapytanie 3). Strona przekazuje wystąpienia objawu z wpisów, które już pobrała. W roadmapie przy S-08 wpisz, że S-08 używa `composeDoctorQuestion` i odczytu leków, zamiast wołać `loadDoctorQuestions`.
  - Strength: Mniej zapytań, a kształt funkcji nie przesądza z góry o S-08.
  - Tradeoff: Strona dzienniczka sama składa dane wejściowe, więc we frontmatterze jest trochę więcej kodu.
  - Confidence: MED — S-08 nie jest jeszcze zaplanowany.
  - Blind spot: Nie sprawdzono limitu wierszy PostgREST w `supabase/config.toml`.
- **Decision**: FIXED — S-06 zostaje przy loadDoctorQuestions dla jednego wpisu; zdanie „S-08 woła loadDoctorQuestions” usunięte, decyzja o odczycie S-08 odłożona do planu S-08, w roadmapie notatka o limicie max_rows = 1000
