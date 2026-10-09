<!-- PLAN-REVIEW-REPORT -->

# Plan Review: Sekcja „Do omówienia z lekarzem” (S-08)

- **Plan**: context/changes/doctor-visit-summary/plan.md
- **Mode**: Deep
- **Date**: 2026-10-08
- **Verdict**: SOUND
- **Findings**: 0 critical, 2 warnings, 2 observations

## Verdicts

| Dimension             | Verdict |
| --------------------- | ------- |
| End-State Alignment   | PASS    |
| Lean Execution        | PASS    |
| Architectural Fitness | WARNING |
| Blind Spots           | WARNING |
| Plan Completeness     | WARNING |

## Grounding

13/13 paths ✓, 9/9 symbols ✓, brief↔plan ✓

## Findings

### F1 — Krok smoke może ominąć sprawdzenie „URL bez nazwy”

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Faza 3, punkt 6 — Krok smoke
- **Detail**: Krok „journal: no URL on the way carries…” jest ostatni w `journalFlowSteps` (`scripts/smoke.mjs:1346-1358`) i czyta `journal.paths` w chwili uruchomienia. `requestPage` nie dopisuje ścieżki sam (`:115-121`), robi to tylko `postJson` (`:1181`). Plan mówi „ścieżka dopisana do `journal.paths`”, ale nie mówi, gdzie wstawić krok ani że dopisanie trzeba zrobić ręcznie. Krok wstawiony za sprawdzeniem albo w innej tablicy oznacza, że `/do-omowienia` nigdy nie jest sprawdzone, a bramka i tak jest zielona.
- **Fix**: W kontrakcie dopisać: krok wstawiony w `journalFlowSteps` przed krokiem „no URL…” i sam woła `journal.paths.push("/do-omowienia")` (jak `:1300`, `:1322`).
- **Decision**: FIXED

### F2 — Zdanie o lekarzu lub farmaceucie dwa razy na ekranie

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Architectural Fitness
- **Location**: Faza 2, punkt 2 — Teksty sekcji
- **Detail**: Nowe `askDoctorOrPharmacist` („O każdy lek i każdy objaw możesz zapytać lekarza lub farmaceutę.”) to dosłownie ostatnie zdanie istniejącego `DOCTOR_QUESTION_COPY.note` (`src/lib/copy/doctor-question.ts:33`). Plan każe użyć `note` z S-06 w części pytań i jednocześnie zawsze pokazywać zachętę na dole, więc to samo zdanie pojawi się na ekranie dwa razy. Do tego to kopia tekstu, choć plan zakłada, że teksty S-06 są brane z ich modułów, a nie kopiowane — zmiana brzmienia w jednym miejscu rozjedzie drugie.
- **Fix A ⭐ Recommended**: W sekcji nie pokazywać `note` z S-06 przy pytaniach; zostaje zachęta na dole i nota interakcji.
  - Strength: Zdanie pada raz; zero zmian w S-06.
  - Tradeoff: Pierwsze dwa zdania `note` („Nie jest oceną ani diagnozą”) znikają z części pytań — trzeba je dać w innym tekście sekcji albo świadomie pominąć.
  - Confidence: MED — zależy, czy autorka chce zdania „nie jest diagnozą” przy pytaniach.
  - Blind spot: Brzmienie zatwierdzane w 3.11.
- **Fix B**: Rozdzielić `note` z S-06 na dwa klucze (opis + zachęta); dzienniczek pokazuje oba, sekcja bierze sam opis, a zachętę raz na dole.
  - Strength: Jedno źródło tekstu, brak duplikatu.
  - Tradeoff: Dotyka tekstów S-06 i ich testu FR-012.
  - Confidence: HIGH — mała zmiana w jednym pliku tekstów.
  - Blind spot: Smoke dzienniczka może sprawdzać pełną treść `note`.
- **Decision**: FIXED (Fix A; zdanie „nie jest oceną ani diagnozą” przeniesione do nowego `questionsNote`)

### F3 — Zakresy linii w planie nie trafiają w kod

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Faza 3 punkt 3, Current State Analysis, References
- **Detail**: Pętla pytań w dzienniczku to `src/pages/dzienniczek/index.astro:146-184`, nie `:146-178` (zakres ucina blok w połowie). `medication_interactions()` zaczyna się na `:291` (na `:289` jest nagłówek sekcji).
- **Fix**: Poprawić na `:146-184` i `:291-347`.
- **Decision**: FIXED

### F4 — Dane do pomiaru LCP na produkcji zostaną na zawsze

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Faza 4 — Pomiar
- **Detail**: Pomiar wymaga 4 leków, 5 objawów i 15 wpisów na koncie produkcyjnym. Po zamknięciu okna korekty rdzeni wpisów nie da się usunąć (nienaruszalność historii). Plan nie mówi, które konto i kto wprowadza dane (~20 minut ręcznie).
- **Fix**: Dopisać: osobne konto wyłącznie do pomiaru (nie konto smoke z `.env`, nie konto autorki), dane wpisane ręcznie przez UI, konto zostaje jako stałe konto pomiarowe.
- **Decision**: FIXED
