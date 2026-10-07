<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: S-06 Złożone pytanie do lekarza po zapisaniu objawu

- **Plan**: context/changes/symptom-question-composer/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3
- **Date**: 2026-10-07
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 3 warnings, 3 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | PASS    |

## Weryfikacja

- `npm test` — 339/339 pass
- `npm run lint` — 0 błędów (39 ostrzeżeń `no-console` w plikach spoza zmiany)
- `npm run typecheck` — 0 błędów
- `npm run build` — OK
- `npx supabase db reset` + `npm run db:check` — wszystkie bramki `GATE_COMPLETE`, w tym `dosage_undo_checks`
- `npm run smoke` — nie uruchomiony ponownie w przeglądzie (wymaga odsunięcia `.env` z produkcją); Progress 1.5 i 3.4 odhaczone przy 9ed5929 i 7989eb0
- Kryteria ręczne 1.6–1.8, 2.3–2.4, 3.5–3.11 odhaczone; dowody w diffie są spójne (odnośnik cofnięcia, `<details>`, `noQuestion`, tokeny bez `destructive*`/`interaction*`)

Zmiany spoza planu, wszystkie uzasadnione: `lessons.md` (korekta 07.10.2026 — „mogą mieć związek” dla objawów w liczbie mnogiej), `scripts/fr012/corpus.mjs` (`REQUIRED_PHRASE_PLURAL`), `scripts/medications/medications.test.mjs` (test przeniesionego `variantText`), `supabase/tests/correction_window_checks.sql` (usunięta asercja sprzeczna z nową regułą cofnięcia; przypadek pokryty w `dosage_undo_checks.sql`).

## Findings

### F1 — Zapytanie o wystąpienia objawu bez granicy i bez kolejności

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/doctor-question-data.ts:49-56
- **Detail**: Zapytanie pobiera wszystkie wystąpienia objawów z wpisu, także późniejsze niż bieżący wpis (odrzucane dopiero w JS), bez `order`. PostgREST obcina wynik do `max_rows = 1000` (`supabase/config.toml:18`) w dowolnym miejscu, więc po przekroczeniu limitu `firstEntryOn` — a z nim początek okna 90 dni — i `entryCount` zmieniają się po cichu. Pytanie pokazałoby wtedy złe okno bez żadnego błędu. Próg realny: wpis z 3 objawami codziennie przekracza 1000 wierszy po ok. roku. Plan zapisał limit jako ryzyko S-08, ale dotyczy on już S-06.
- **Fix**: Zawęź zapytanie do wpisów z `occurred_at <= occurred_at` bieżącego wpisu i pobierz per objaw tylko najwcześniejszy wpis (`order` rosnąco, `limit 1`) oraz liczbę (`count: "exact"`, `head: true`), zamiast wszystkich wierszy.
  - Strength: Wynik nie zależy od limitu wierszy; mniej danych na stronie.
  - Tradeoff: Dwa małe zapytania na objaw zamiast jednego (przy 3 objawach — 6), test z `max_rows` trudny do napisania jednostkowo.
  - Confidence: MED — filtr i sortowanie po osadzonym `symptom_entries!inner` trzeba zmierzyć w PostgREST przed wdrożeniem.
  - Blind spot: Nie zmierzono, od jakiej liczby wpisów lokalnie zaczyna się obcinanie.
- **Decision**: SKIPPED

### F2 — Cofnięcie zmiany nie sprawdza, że poprzedni okres przylega

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20261007120000_undo_dosage_change.sql:66-70 (strażnik) i RPC `undo_dosage_change` (~325-343)
- **Detail**: Strażnik i RPC wymagają tylko, żeby istniał jakikolwiek wcześniejszy okres. Wyzwalacz ponownego otwarcia otwiera wyłącznie okres z `ended_on = old.started_on`. Gdy między okresami jest przerwa, cofnięcie przechodzi i nic nie otwiera — lek zostaje bez trwającego okresu i bez daty odstawienia, czyli w stanie, przed którym komentarz strażnika ma chronić. Przerwa powstaje tylko przez bezpośredni zapis przez API (zamknięcie okresu `ended_on = d`, potem okres od daty późniejszej), nie przez ekran. Żaden test tego nie pokrywa.
- **Fix**: W strażniku i RPC wymagaj poprzednika z `ended_on = old.started_on` (w RPC nowy nazwany kod błędu); dopisz przypadek w `dosage_undo_checks.sql`.
- **Decision**: FIXED — strażnik i RPC wymagają poprzednika z `ended_on = started_on`; RPC zwraca nowy kod DP014 (endpoint mapuje go na `undoGeneric`, z ekranu nieosiągalny); przypadek przerwy w UNDO 2 i UNDO 3 `dosage_undo_checks.sql`. Pomiar przed poprawką: przerwa zapisana bezpośrednio, cofnięcie przechodziło i zostawiało lek bez trwającego okresu i bez daty odstawienia. Test pada na starej migracji (`UNDO 2 FAILED … gave ok, expected DP014`), `db:check` 10/10 zielone.

### F3 — Bezpośrednie usunięcie okresu nie blokuje leku (wyścig, niezmierzony)

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20261007120000_undo_dosage_change.sql:66-83
- **Detail**: RPC blokuje lek (`for update`) przed sprawdzeniami; bezpośredni `delete from dosage_periods` przez PostgREST przechodzi przez sam strażnik, który czyta `discontinued_on` bez blokady. Hipoteza (niezmierzona, wymaga dwóch równoległych sesji): równoległy bezpośredni `update medications set discontinued_on` może zamknąć usuwany okres zamiast ponownie otwartego poprzednika, a wyzwalacz synchronizacji nie sprawdza liczby zmienionych wierszy. Wynik: lek zakończony z trwającym okresem — naruszenie niezmiennika S-04. Ścieżka przez ekran (RPC `discontinue_medication`) jest bezpieczna.
- **Fix A ⭐ Recommended**: Zablokuj lek w gałęzi cofnięcia strażnika (`perform 1 from public.medications where id = old.medication_id for update`).
  - Strength: Obie ścieżki (RPC i bezpośrednia) dostają tę samą kolejność blokad co RPC; reguła bazy, nie tylko RPC — zgodnie z lekcją o całej ścieżce zapisu.
  - Tradeoff: Jedna linia, ale bez testu współbieżności dowód zostaje rozumowaniem.
  - Confidence: MED — wzorzec blokady już istnieje w RPC.
  - Blind spot: Nie sprawdzono kolejności blokad z innymi wyzwalaczami (ryzyko zakleszczenia).
- **Fix B**: W `medications_sync_discontinuation` zgłaszaj błąd, gdy aktualizacja okresu zmieni 0 wierszy.
  - Strength: Łapie każdą przyczynę rozjazdu, nie tylko ten wyścig.
  - Tradeoff: Zmienia wyzwalacz z S-04; trzeba sprawdzić, czy 0 wierszy nie jest gdzieś prawidłowym przypadkiem.
  - Confidence: LOW — nie przejrzano wszystkich ścieżek wywołania wyzwalacza.
  - Blind spot: Przypadki, w których lek nie ma okresu do zamknięcia.
- **Decision**: FIXED (Fix A) — strażnik usuwania blokuje lek (`for update`) przed sprawdzeniami gałęzi cofnięcia, w tej samej kolejności co `undo_dosage_change`. Bez testu współbieżności; `db:check` 10/10 zielone. Możliwe zakleszczenie z równoległym odstawieniem kończy się błędem jednej transakcji, nie złym stanem.

### F4 — Etykieta zmiany wariantu gubi się w dwóch przypadkach brzegowych

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/doctor-question.ts:44; src/lib/services/doctor-question-data.ts:74-80; src/pages/leki/[id]/okresy/[periodId]/cofniecie.astro:85
- **Detail**: (1) Dawki porównywane z rozróżnieniem wielkości liter, a baza (DP004) porównuje `lower(btrim)` — zmiana „1 Tabletka” → „1 tabletka” z nową mocą daje zdanie „1 tabletka, zamiast 1 Tabletka” bez mocy. (2) Okres z `registry_product_id = null` (tylko sprzed migracji 20261004130000) nie dostaje wariantu leku jako zapasowego, w przeciwieństwie do `leki/[id].astro` — zdanie może brzmieć „1 tabletka (Moc: 100 mg), zamiast 1 tabletka”.
- **Fix**: Porównuj `doseText` po `trim().toLowerCase()`; w odczycie i na ekranie cofnięcia użyj wariantu leku, gdy okres go nie ma.
- **Decision**: FIXED — dawki porównywane po `trim().toLowerCase()` jak w bazie (DP004), z testem w `doctor-question.test.mjs` (czerwony przed zmianą); okres bez wariantu bierze wariant leku w `doctor-question-data.ts` i `cofniecie.astro` (bez testu jednostkowego — odczyt z bazy). `npm test` 340/340, lint i typecheck czyste.

### F5 — `fill()` podmienia znaczniki po kolei i interpretuje `$`

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/doctor-question.ts:144-146
- **Detail**: `String.replace` ze stringiem interpretuje `$&`, `$$` itp. w wartości, a kolejne podmiany działają na już wstawionym tekście. Nazwa leku z ulotki lub dawka wpisana ręcznie z `$&` albo `{po}` zniekształci zdanie. Tylko kosmetyka u tej samej użytkowniczki; Astro escapuje wynik, więc bez XSS.
- **Fix**: Jedno przejście z funkcją: `template.replace(/\{([^}]+)\}/gu, (m, k) => (k in values ? String(values[k]) : m))`.
- **Decision**: FIXED — `fill()` w jednym przejściu z funkcją (`Object.hasOwn`), test z nazwą „Krople $& {po}” (czerwony przed zmianą). `npm test` 341/341, lint i typecheck czyste.

### F6 — PRD węższy niż ustalenie (1) z fazy 2

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: context/foundation/prd.md:84 i :154
- **Detail**: PRD: „Pytanie nie powstaje, gdy w oknie objawu nie był przyjmowany żaden lek”. Ustalenie z 06.10.2026 (plan, Faza 2 §1): odstawienie w dniu `początekOkna` jest zdarzeniem i pytanie powstaje, choć w oknie nie było dnia z lekiem. Kod i test (fixture Furagin) idą za ustaleniem, PRD nie.
- **Fix**: Dopisz w US-02 i FR-010: „…żaden lek i nie było w nim zdarzenia leku (odstawienie w pierwszym dniu okna liczy się jako zdarzenie)”.
- **Decision**: FIXED — US-02 i FR-010 w PRD dopisane: „i nie było w nim zdarzenia leku (odstawienie w pierwszym dniu okna liczy się jako zdarzenie)”.
