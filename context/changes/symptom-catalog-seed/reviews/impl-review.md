<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Zamknięta lista objawów

- **Plan**: context/changes/symptom-catalog-seed/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2
- **Date**: 2026-09-26
- **Verdict**: APPROVED
- **Findings**: 0 critical, 1 warning, 4 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | PASS    |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | WARNING |

Sprawdzenia automatyczne powtórzone 2026-09-26:

- `npx supabase db reset` OK.
- `rls_checks.sql` CHECK 1–18 OK; CHECK 18 stoi przed CHECK 17 (34 objawy, podział 8/7/3/3/3/3/2/5, 82 słowa).
- Ponowne uruchomienie migracji z danymi: 34/82 przed i po.
- `npm run smoke` przeciw własnemu podglądowi na porcie 4331 (port 4321 zajmował podgląd z innego worktree): wszystkie kroki PASS, w tym cztery kroki dla `symptoms` i `symptom_search_terms` z `42501`. `.env` i `.dev.vars` wskazują `127.0.0.1:54321`; lokalne `auth.users` 0 → 3, więc bieg szedł do lokalnej bazy.
- `npm run typecheck` 0 błędów, `npm run lint` OK.

Porównanie skryptem `symptom-list.md` z migracją z danymi: 34 objawy (klucz, nazwa, kategoria, kolejność) i 82 pary (klucz, słowo) identyczne. Wszystkie słowa spełniają ograniczenie schematu (małe litery, NFC, pojedyncze spacje). Żadna nazwa ani słowo nie stwierdza przyczyny (FR-012).

Findingi F1–F10 z przeglądu fazy 1 są naprawione w kodzie i nie są tu powtarzane. Zmiany roadmapy (status F-03, wymogi S-05) pochodzą z fazy 1 i z findingu F10 — nie są wyjściem poza zakres.

Punkty ręczne 2.6 i 2.7 zaznaczone; 2.6 ma ślad w `symptom-list.md` (status zatwierdzenia), 2.7 z natury nie zostawia śladu w diffie.

## Findings

### F1 — CHECK 18 liczy wiersze, ale nie sprawdza treści

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Success Criteria
- **Location**: supabase/tests/rls_checks.sql:873-951
- **Detail**: CHECK 18 sprawdza liczności (34, podział kategorii, 82 słowa), ciąg 1..n i puste kolumny źródła. Przepuści: słowo przypięte do złego objawu (byle każdy miał choć jedno), dwa słowa zamienione między objawami, literówkę w nazwie lub słowie, dwa objawy zamienione miejscami w kategorii. Dziś zgodność bazy z zatwierdzoną listą pilnuje tylko ręczny punkt 2.7. Przy kolejnych migracjach doładowujących listę to samo dotyczy literówki w kluczu w części ze słowami: złączenie po `key` po cichu zgubi te słowa, a wyłapie to tylko liczba 82 (lekcja „Bramka musi odróżnić blokadę od niewykonania” — test wymaga konkretnego wyniku).
- **Fix A ⭐ Recommended**: Dopisać 18g: `md5(string_agg(key||'|'||name||'|'||category||'|'||sort_order, ',' order by key))` porównane z literałem, i to samo dla par `(key, term)`; komunikat błędu wypisuje otrzymany skrót.
  - Strength: ~15 linii; każda zmiana treści listy czerwieni bramkę, a nagłówek CHECK 18 już wymaga aktualizacji liczb w tym samym commicie.
  - Tradeoff: Przy niezgodności bramka mówi tylko „różni się”, nie który wiersz; skrót trzeba przeliczyć przy każdej zmianie listy.
  - Confidence: HIGH — dane są statyczne, porównanie deterministyczne przy `order by`.
  - Blind spot: Kolacja `order by` musi być ta sama lokalnie i w CI (ten sam obraz Supabase — nie sprawdzono na CI).
- **Fix B**: Dopisać 18g jako listę `values (key, name, category, sort_order)` i `(key, term)` porównaną z tabelami przez `except` w obie strony.
  - Strength: Błąd wskazuje dokładnie brakujący lub nadmiarowy wiersz — czytelne bez znajomości SQL.
  - Tradeoff: ~120 linii powielających dane z migracji; każda zmiana listy w trzech miejscach (plik, migracja, sprawdzenie).
  - Confidence: HIGH — wzorzec `except` prosty.
  - Blind spot: None significant.
- **Decision**: FIXED via Fix A — CHECK 18g, md5 with `collate "C"`; negative test (term moved to another symptom) fails with the fingerprint message

### F2 — Ochrona klucza obejmuje tylko `UPDATE`

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20260926120000_symptom_catalog_schema.sql:78-97
- **Detail**: `symptoms_guard_key` blokuje tylko zmianę `key`. Późniejsza migracja może usunąć objaw (słowa znikają kaskadą) i wstawić go pod nowym kluczem, a `update ... where key = '<literówka>'` zmienia 0 wierszy bez błędu. Dopóki S-05 nie doda klucza obcego `on delete restrict`, usunięcie objawu nie jest niczym blokowane. Pisać mogą tylko migracje, więc to zabezpieczenie przed własną pomyłką, nie przed atakiem.
- **Fix**: Dopisać w nagłówku migracji z danymi zasadę dla kolejnych migracji katalogu: po każdym `update`/`delete` po `key` sprawdzić liczbę zmienionych wierszy (`get diagnostics` + `raise`).
- **Decision**: FIXED — row-count rule for later catalog migrations added to the seed migration header (comment only)

### F3 — Dokumenty zmiany nie nadążyły za poprawkami

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: context/changes/symptom-catalog-seed/plan.md:72,79; context/changes/symptom-catalog-seed/symptom-list.md:9
- **Detail**: Plan nadal opisuje `name ... unique` i `symptom_id` „z indeksem”, choć poprawki F3 i F6 z fazy 1 zmieniły to na unikalność `lower(name)` i brak osobnego indeksu. `symptom-list.md:9` mówi „Na razie wg numerów z issue #3; do ustawienia »od najczęstszych«”, choć plik ma status zatwierdzonego — nie wiadomo, czy kolejność została przejrzana.
- **Fix**: Poprawić dwie linie kontraktu w planie; linię 9 listy przepisać na stan końcowy (autorka potwierdza, czy kolejność zostaje wg issue #3).
- **Decision**: FIXED — plan contract updated (lower(name) unique index, no separate symptom_id index); symptom-list.md: order per issue #3 kept, approved 2026-09-26

### F4 — Typ kategorii i ograniczenie w bazie zsynchronizowane tylko komentarzem

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Architecture
- **Location**: src/types.ts:190-192
- **Detail**: `SymptomCategory` i `symptoms_category_check` to dwie osobne listy tych samych ośmiu wartości. `Record<SymptomCategory, string>` pilnuje etykiet wewnątrz TypeScriptu, ale nic nie wiąże typu z bazą — nowa kategoria dodana tylko w migracji da w S-05 objaw bez etykiety.
- **Fix**: Zostawić; ewentualnie przy S-05 odrzucać w kodzie kategorię spoza `SYMPTOM_CATEGORIES` z widocznym błędem zamiast pustej etykiety.
- **Decision**: FIXED — requirement added to S-05 in roadmap.md (category outside SYMPTOM_CATEGORIES read from the database gives a visible error)

### F5 — Smoke dla słów wyszukiwania nie sprawdza, że ma objaw-rodzica

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: scripts/smoke.mjs:334
- **Detail**: Gdy odczyt `symptoms` się nie uda, `symptom_id` jest `undefined` i znika z wstawianego wiersza. Postgres sprawdza prawa przed `not null`, więc krok wstawiania nadal dostaje `42501` i przechodzi. Nie daje to fałszywie zielonego biegu (krok odczytu `symptoms` i tak pada), a `registry_substances` działa tak samo — zgodne z istniejącym wzorcem.
- **Fix**: Opcjonalnie zwracać `{ ok: false, detail: "no parent row" }`, gdy `sharedRows.symptoms` jest puste.
- **Decision**: FIXED — optional `parent` on shared targets; insert step fails with "check did not run" when the parent row was not read (also applied to registry_substances, same pattern); smoke all PASS on port 4331, local auth.users 0 → 3

## Triage (2026-09-27)

- Fixed: F1 (Fix A), F2, F3, F4, F5 (5)
- Verification after fixes: `npx supabase db reset` OK; `rls_checks.sql` CHECK 1–18 OK, CHECK 18g fails on a term moved to another symptom (rolled back); `npm run smoke` all PASS against a fresh preview on port 4331 (local `auth.users` 0 → 3); `npm run typecheck` 0 errors; `npm run lint` OK.
