<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Okno korekty wpisu dzienniczka (S-07)

- **Plan**: context/changes/journal-correction-window/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3
- **Date**: 2026-10-09
- **Verdict**: APPROVED
- **Findings**: 0 critical, 1 warning, 4 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | WARNING |
| Safety & Quality    | PASS    |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | PASS    |

## Success criteria (zmierzone 2026-10-09)

- `npm test` — 385/385 pass
- `npm run typecheck` — 0 errors
- `npm run lint` — 0 errors; ostrzeżenia `no-console` w nowych stronach i trasach takie same jak w istniejących (`nowy.astro`, `index.ts`)
- `npm run build` — Complete
- `npm run db:check` — 13/13 plików PASS, w tym `journal_correction_checks.sql` (CORRECTION 1–7) i INTERACTION 11 z szesnastoma funkcjami
- `npm run smoke` — nie uruchamiany ponownie: `.env` wskazuje produkcję (lesson „Lokalne bramki sprawdź…”), a od `8df53f3` (zielony smoke fazy 3) zmieniły się tylko pliki w `context/`
- Manual 1.4, 2.5, 3.6–3.12 — potwierdzone przez autorkę przy fazach

## Potwierdzone bez uwag

- Kolejność kodów w `correct_symptom_entry`: 28000 → SE006 (`for update`) → SE007 → SE001/SE004/SE005; SE002/SE003 z wyzwalaczy osiągalne i zmapowane.
- Wiersze niezmienionych objawów zostają (update nasilenia, bez kasowania i ponownego wstawiania).
- Wszystkie trzy funkcje `security invoker`, `search_path = ''`, `revoke … from public, anon`, `grant … to authenticated`.
- Sprawdzenia SQL łapią wyłącznie nazwane kody, bez `when others`; `set constraints … immediate` przed SE001.
- Trasy: 401 także dla sesji z odnośnika resetu hasła, `z.uuid()` bez echa, `private, no-store`, logowany wyłącznie kod.
- W URL wyłącznie uuid, `?error=<klucz>`, `?usunieto=1`; smoke sprawdza wyciek także dla objawu z poprawki i obu notatek.
- Przycisk usunięcia `outline`, tylko tokeny kolorów, Origin w smoke z Referrer-Policy strony.

## Findings

### F1 — Roadmapa: S-09 przestawione na „ready” w commicie fazy 1

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: context/foundation/roadmap.md (commit 0275d39)
- **Detail**: Commit fazy 1 zmienia nie tylko S-07 na `in-progress`, ale też S-09 `account-deletion-cascade` z `proposed` na `ready` (tabela statusów, sekcja S-09 i wiersz „Uruchom `/10x-plan account-deletion-cascade`”). Plan tego nie przewiduje. Zmiana jest merytorycznie poprawna — S-01, S-02, S-05 i S-06 są `done` — i opisana w treści commita, ale nie należy do S-07.
- **Fix**: Zostawić i odnotować w `change.md` (Notes), że S-09 odblokowane przy okazji; bez przepisywania historii gita.
- **Decision**: FIXED — notka w `change.md` (Notes)

### F2 — SE004 porównuje uuid jako tekst

- **Severity**: 💡 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20261009120000_journal_correction.sql:107
- **Detail**: `count(distinct item ->> 'symptom_id')` liczy tekst, a `z.uuid()` przyjmuje wielkie litery. Ręcznie spreparowane żądanie z tym samym uuid w dwóch wielkościach liter przechodzi SE004. Nowy objaw: dwa inserty, `23505` niezmapowane → 500 `unknown`. Objaw już na wpisie: `update … from` trafia wiersz dwa razy i po cichu wybiera jedno nasilenie. Formularz nigdy tego nie wyśle; ta sama luka jest w `add_symptom_entry` od S-05. Dotyczy wyłącznie własnych danych konta.
- **Fix**: W obu funkcjach porównywać `(item ->> 'symptom_id')::uuid` w SE004 — nowa migracja `create or replace` dla obu, plus przypadek w sprawdzeniach SQL.
  - Strength: Naprawia u źródła, w obu kopiach naraz; plan każe trzymać kopie równe.
  - Tradeoff: Nowa migracja i zmiana `add_symptom_entry`, której plan celowo nie ruszał.
  - Confidence: HIGH — rzutowanie na uuid normalizuje wielkość liter.
  - Blind spot: Nie zmierzone na bazie, wniosek z odczytu kodu.
- **Decision**: FIXED — migracja `20261009130000_symptom_duplicate_uuid.sql` (obie funkcje), przypadek w JOURNAL 2 i CORRECTION 5; zmierzone: przed poprawką oba czerwone, po niej db:check 13/13, npm test 385/385. Po merge’u db push.

### F3 — Dotknięte pole daty wysyła wartość nawet bez zmiany

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/journal/EditEntryForm.tsx:131
- **Detail**: `occurredLocal` idzie jako `null` tylko gdy pole nie było dotknięte. Dotknięte i przywrócone wysyła wartość z dokładnością do minuty: ucina sekundy wpisu zapisanego jako „teraz”, więc baza traktuje to jako nowe datowanie i ponownie sprawdza SE002/SE003. Przy cofnięciu zegara (25.10.2026, godzina 02:00–02:59 dwa razy) wpis z 02:30 CEST po wysłaniu przesunie się o godzinę albo dostanie SE002.
- **Fix**: Wysyłać `null`, gdy wartość pola równa się propowi `occurred` (nie tylko gdy pole nietknięte).
- **Decision**: FIXED — `occurredLocal` = null także gdy wartość pola równa się zapisanej (`occurred`); typecheck, lint, prettier czyste. Bez testu automatycznego (komponent React, brak runnera dla tsx).

### F4 — „Popraw wpis” także na kartach z zamkniętym oknem

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/pages/dzienniczek/index.astro:242
- **Detail**: Link w obu stanach okna to decyzja P1 z planu. Brzmienie „Popraw wpis” na karcie, gdzie da się zmienić tylko notatkę, sugeruje, że historię wciąż można poprawić; ekran wpisu wyjaśnia to dopiero po otwarciu.
- **Fix**: Przy zamkniętym oknie (brak `deadline`) inna etykieta z `JOURNAL_COPY.entry`, np. „Zobacz wpis i notatkę”.
- **Decision**: FIXED — `JOURNAL_COPY.entry.openClosed` = „Zobacz wpis i notatkę” przy zamkniętym oknie (brak `deadline`); typecheck, lint (tylko istniejące `no-console`), npm test 385/385.

### F5 — Przykład testu `minOccurredLocal` w planie jest błędny arytmetycznie

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: scripts/journal/journal.test.mjs:129-138
- **Detail**: Plan: wpis z 26.09.2026 08:00 poprawiany 09.10.2026 → `min` = zapisana wartość. Ale 09.10.2026 minus 14 dni to 25.09.2026, wcześniej niż 26.09 — funkcja słusznie zwróciłaby granicę. Test używa poprawy 10.10.2026 09:00, co sprawdza zamierzony przypadek. Kod poprawny, błąd w planie.
- **Fix**: Poprawić przykład w planie (Phase 3, kontrakt `minOccurredLocal` i Testing Strategy) na 10.10.2026.
- **Decision**: FIXED — przykład w plan.md:199 poprawiony na zapis 09.10.2026 i poprawę 10.10.2026 09:00.
