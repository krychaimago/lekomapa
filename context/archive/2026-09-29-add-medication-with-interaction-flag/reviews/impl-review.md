<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: S-02 Dodanie leku po nazwie handlowej ze znacznikiem możliwej kolizji

- **Plan**: context/changes/add-medication-with-interaction-flag/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3, 4, 5, 6
- **Date**: 2026-10-01
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 3 warnings, 7 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | WARNING |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | WARNING |
| Pattern Consistency | WARNING |
| Success Criteria    | WARNING |

## Evidence

- Diff: `d158284..HEAD`, 35 plików, fazy 1–6 (`da38bed` … `aa659f5`).
- `npm test`: 200/200 PASS.
- `npm run lint`: 0 błędów, 13 ostrzeżeń `no-console` (logi `{ code }`, ten sam wzorzec co `middleware.ts` i trasy auth).
- `npm run typecheck`: 0 błędów. `npm run build`: OK.
- `npm run db:check`: 5/5 plików PASS, INVARIANT 8 z 6 strażnikami.
- CI na PR #56: `ci` i `smoke` zielone dla `3e8e7e7` (do fazy 5). Faza 6 i epilog (`78a61e0`, `aa659f5`) nie są wypchnięte.
- `npm run smoke` nie był uruchomiony w przeglądzie: `.env` wskazuje produkcję (lekcja „Lokalne bramki sprawdź…”).
- Rozszerzenia poza planem (`registry-search.ts`, `AddLeafletMedicationForm.tsx`, `likeLiteral` z `*`, 400/503 w trasie podpowiedzi, `rulesIncomplete` w szczegółach, natywne radio zamiast `radio-group`) wspierają kontrakt planu — bez findingu.

## Findings

### F1 — „Ten lek nie należy do żadnej ze sprawdzanych par” bywa nieprawdą

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/copy/interactions.ts:13, użycie src/pages/leki/[id].astro:219-223
- **Detail**: Tekst pokazuje się, gdy `medication_interactions()` nie zwraca wiersza dla leku. Dzieje się tak też wtedy, gdy kod leku należy do pary, ale wśród bieżących leków nie ma drugiego leku z tej pary. Przykład: sam Acenocumarol (B01AA07) — B01AA jest w parze z M01AE, a strona mówi, że lek nie należy do żadnej sprawdzanej pary. To samo dla leku odstawionego (funkcja go pomija). Zdanie o samym leku brzmi uspokajająco i jest fałszywe, co osłabia regułę „brak ostrzeżenia ≠ bezpieczne” (FR-012).
- **Fix**: Zmienić brzmienie na zakres faktycznie sprawdzony, np. „Wśród Twoich bieżących leków nie znaleziono sprawdzanej pary z tym lekiem.”; test FR-012 pilnuje nowej wersji.
- **Decision**: FIXED — tekst zawężony do bieżących leków; nowy test w scripts/fr012/interaction-copy.test.mjs

### F2 — `discontinued_on` można zmieniać po zamknięciu okna korekty

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20260930120000_medication_write_and_interactions.sql:107-143 (`medications_guard_core`)
- **Detail**: Strażnik celowo przepuszcza `discontinued_on` (plan.md:97, 128 — „S-04”). Po zamknięciu okna datę odstawienia da się wyczyścić, cofnąć albo przesunąć, a to zmienia oś czasu, na którą FR-010/011 nałożą objawy („Historia nie kłamie”). Zgodne z planem, ale dług nie jest zapisany nigdzie poza planem tej zmiany, więc S-04 może go nie zobaczyć.
- **Fix A ⭐ Recommended**: Dopisać do bloku S-04 w roadmapie kryterium: po zamknięciu okna `discontinued_on` ustawione raz nie może być wyczyszczone ani przesunięte.
  - Strength: Nie zmienia zakresu S-02; dług trafia tam, gdzie powstaje ekran odstawienia.
  - Tradeoff: Do czasu S-04 baza dopuszcza zmianę (dziś bez UI, tylko przez PostgREST).
  - Confidence: HIGH — plan sam przypisuje to S-04.
  - Blind spot: Nie sprawdzono, czy S-04 w roadmapie już o tym mówi.
- **Fix B**: Już teraz w strażniku dopuścić wyłącznie przejście `null → data` po zamknięciu okna, z blokiem w `rls_checks.sql`.
  - Strength: Gwarancja w bazie od dziś.
  - Tradeoff: Nowa migracja i przesądzenie reguł S-04 (np. czy wolno poprawić pomyłkowe odstawienie) przed jego planowaniem.
  - Confidence: MED — reguła S-04 nie jest jeszcze ustalona.
  - Blind spot: Odstawienie z datą w przyszłości i jego późniejsza korekta.
- **Decision**: FIXED (Fix A) — kryterium dopisane do bloku S-04 w context/foundation/roadmap.md

### F3 — INTERACTION 4 nie sprawdza nazwy istniejącej wyłącznie bez kodu

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: supabase/tests/medication_interaction_checks.sql:225-275
- **Detail**: Kontrakt planu (plan.md:139) wymaga nazwanego błędu także wtedy, gdy nazwa jest w słowniku wyłącznie w wierszach bez kodu. Funkcja to robi, ale test sprawdza tylko nazwę nieistniejącą (`substantia ignota`). W seedzie są 4 takie nazwy (np. sakubitryl), więc regresja „szukaj we wszystkich wierszach” zapisałaby lek z `p_verified = true` bez kodu i bramka by przeszła. Przy okazji: `p_verified is null` jest dziś traktowane jak `false` (cichy zapis bez kodu); trasa zawsze wysyła boolean.
- **Fix**: Dodać do INTERACTION 4 przypadek z nazwą tylko-bez-kodu wybraną z seeda zapytaniem (nie na sztywno), oczekujący `P0002`; opcjonalnie w funkcji `p_verified is null` → nazwany błąd.
- **Decision**: FIXED — INTERACTION 4 sprawdza nazwę tylko-bez-kodu z seeda (P0002); db:check 5/5 PASS. Zaostrzenie `p_verified is null` pominięte.

### F4 — „Zapis tylko przez funkcje” to konwencja, nie gwarancja bazy

- **Severity**: 💡 OBSERVATION
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: Architecture
- **Location**: supabase/migrations/20260922120000_medication_schema.sql:118,144,186 (polityki INSERT), src/types.ts (komentarz)
- **Detail**: Polityki INSERT z F-01 zostały. Zalogowana osoba może przez PostgREST wstawić lek bez składu lub okresu, substancję z dowolnym `atc_code` i `started_on` w przyszłości (tylko zod pilnuje `<= todayInWarsaw()`). Dotyczy wyłącznie własnego konta — izolacja nie cierpi — ale atomowość i „kod zawsze z danych” trzymają się tylko na ścieżce aplikacji.
- **Fix A ⭐ Recommended**: Zapisać jako świadome ograniczenie (plan/addendum albo lekcja) i dodać `check (started_on <= …)` dopiero, gdy pojawi się realny klient poza aplikacją.
  - Strength: Zero zmian schematu przed S-03/S-04, które i tak dotkną ścieżki zapisu.
  - Tradeoff: Gwarancja dalej zależy od tego, że jedynym klientem jest aplikacja.
  - Confidence: MED — skutki ograniczone do własnych danych.
  - Blind spot: Przyszłe ekrany mogą zacząć pisać bezpośrednio do tabel.
- **Fix B**: Odebrać INSERT od `authenticated` na trzech tabelach; funkcje zapisu jako `security definer` z jawnym `auth.uid()` i `search_path = ''`.
  - Strength: Atomowość i pochodzenie kodu stają się gwarancją bazy.
  - Tradeoff: Nowa migracja, zmiana INVARIANT 7 (więcej funkcji definer), przepisanie części sprawdzeń RLS.
  - Confidence: MED — wzorzec definer już jest (strażnicy), ale to szerszy ruch.
  - Blind spot: Wpływ na S-03 (zmiana dawki) i S-04, które też potrzebują zapisu.
- **Decision**: FIXED (Fix A) — sekcja `## Known Limitations` w plan.md

### F5 — Kopia składu gubi nazwę soli; komentarz migracji mówi co innego

- **Severity**: 💡 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20260930120000_medication_write_and_interactions.sql:35, 63-66, 187-203
- **Detail**: Zmierzone: 3 z 4 produktów z dublem kodu mają _różne_ nazwy pod tym samym kodem — Coroswera ×2 (`Rosuvastatinum` / `Rosuvastatinum calicum`), Dexak (`Dexketoprofenum` / `DExketoprofenum Trometamolum`). Tylko Ibuprofen Zentiva to prawdziwy dubel. `distinct on (atc_code)` zostawia pierwszą nazwę, a komentarz opisuje to jako „ta sama substancja dwa razy”. Dopasowanie kolizji bez zmian (ten sam kod), ale zapisany skład jest węższy niż źródło (lekcja „Niepełny zbiór reguł…” — tu dotyczy treści, nie reguł).
- **Fix A ⭐ Recommended**: Poprawić komentarz migracji i funkcji tak, by mówił prawdę (różne nazwy soli, zachowana pierwsza) i nazwać decyzję jawnie.
  - Strength: Bez zmiany schematu; decyzja widoczna dla S-08 i późniejszych.
  - Tradeoff: Nazwa soli dalej ginie w składzie leku (jest w rejestrze przez `registry_medication_id`).
  - Confidence: HIGH — dane źródłowe dostępne przez powiązanie z rejestrem.
  - Blind spot: Czy jakikolwiek ekran ma pokazywać nazwę soli.
- **Fix B**: Zmienić klucz/model, by zachować wszystkie nazwy pod jednym kodem.
  - Strength: Pełna treść ze źródła.
  - Tradeoff: Zmiana F7 tuż po decyzji; „jedna substancja liczona dwa razy” wraca jako problem.
  - Confidence: LOW — koszt przewyższa zysk przy 3 produktach.
  - Blind spot: Skutki dla S-08.
- **Decision**: FIXED (Fix A) — komentarze migracji (bloki B, E) i `comment on function add_medication_from_registry` nazywają decyzję o nazwie soli; działanie bez zmian. Lokalna baza i ewentualnie produkcja mają stary tekst komentarza funkcji do czasu `supabase db reset`.

### F6 — Nazwa leku i substancja w adresach URL; komentarz twierdzi inaczej

- **Severity**: 💡 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/medications/index.ts:74-110
- **Detail**: Komentarz: „health data does not travel in URLs”. Przekierowania błędu i braku dopasowania niosą jednak `nazwa`, `substancja`, `niedopasowana` i datę; ścieżka rejestru też `nazwa` (bez limitu długości, linia ~96). To trafia do historii przeglądarki i logów żądań Cloudflare. Informacja, jaki lek ktoś bierze, jest co najmniej tak wrażliwa jak dawka, której celowo nie przenoszono.
- **Fix A ⭐ Recommended**: Poprawić komentarz (dawka poza URL; nazwa i substancja świadomie w URL, żeby formularz działał bez JS) i dodać limit długości do `nazwa` na ścieżce rejestru.
  - Strength: Mała zmiana; decyzja zapisana uczciwie.
  - Tradeoff: Nazwy leków dalej w historii i logach.
  - Confidence: HIGH.
  - Blind spot: Retencja logów Cloudflare dla tego Workera.
- **Fix B**: Przenosić stan formularza w krótkotrwałym ciasteczku HttpOnly zamiast w URL.
  - Strength: Żadnych danych o lekach w adresach.
  - Tradeoff: Więcej kodu, stan po stronie serwera, trudniejsze testy smoke.
  - Confidence: MED.
  - Blind spot: Wpływ na `?nazwa=` w kroku wyboru wariantu (to też URL).
- **Decision**: ACCEPTED-AS-RULE: Żadna nazwa leku ani dawka w adresie URL — naprawa w kodzie odłożona do issue #57

### F7 — Wyjątek od lekcji „Filtr języka wymaga formuły” zapisany tylko w teście

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: scripts/fr012/interaction-copy.test.mjs:4-5; src/lib/copy/medications.ts
- **Detail**: Test celowo nie wymaga „może mieć związek” (teksty o parze leków, nie o objawie) — zgodnie z planem, ale wbrew dosłownemu brzmieniu lekcji, a uzasadnienie żyje tylko w komentarzu. `medications.ts` nie przechodzi przez żaden filtr, choć zawiera podpowiedzi o lekach (np. `hints.fixedComposition`).
- **Fix**: Doprecyzować lekcję przez `/10x-lesson` (formuła dotyczy tekstów lek–objaw) i dodać test `forbiddenWordsIn` dla `medications.ts` z wąskim wyjątkiem `dawk`.
- **Decision**: FIXED (inaczej) — lekcja „Filtr języka…” poprawiona w miejscu (cel: neutralność, formuła tylko przy łączeniu leku z objawem/skutkiem połączenia); nowy test scripts/fr012/medication-copy.test.mjs (jedyny wyjątek: rdzeń `dawk`); podpowiedź hints.fixedComposition przeredagowana przez autorkę, żeby nie trafiała w rdzeń `przesta`

### F8 — Formularz z ulotki czyta cały słownik przy każdym wyświetleniu

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/leki/nowy/z-ulotki.astro:36-71
- **Detail**: Plan: `datalist` ze 100 nazwami. Strona czyta wszystkie wiersze `registry_substances` z kodem (4212) stronami po 1000 — 5 zapytań po kolei — przy każdym wyświetleniu, także po przekierowaniu z błędem, żeby zebrać 100 różnych nazw.
- **Fix**: Funkcja SQL `stable` (albo widok `security_invoker`) zwracająca `distinct normalized_name where atc_code is not null` — jedno zapytanie, ~100 wierszy.
- **Decision**: FIXED — migracja 20261001120000_coded_substance_names.sql (funkcja zwraca jedną tablicę, odporną na max_rows), z-ulotki.astro jednym `rpc`, testy w INTERACTION 4 i 11; db:check, lint (0 błędów), typecheck, build OK. Strona nie sprawdzona w przeglądarce. Wdrożenie: `supabase db push` przed merge.

### F9 — Typy współdzielone poza `src/types.ts`

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/components/medications/AddMedicationForm.tsx:12
- **Detail**: `RegistryVariantOption` używany przez `nowy.astro` i formularz jest eksportowany z komponentu (CLAUDE.md: typy współdzielone w `src/types.ts`). Typy w `src/lib/services/medications.ts` mają uzasadnienie (plik bez `@/` dla `node --test`).
- **Fix**: Przenieść `RegistryVariantOption` do `src/types.ts`.
- **Decision**: FIXED — RegistryVariantOption w src/types.ts; typecheck, lint, build OK

### F10 — Faza 6 bez biegu CI

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: N/A (gałąź `ahead 2` względem `origin`)
- **Detail**: Kryterium 5.4 (CI zielone) dotyczy `3e8e7e7`. Commity fazy 6 (`78a61e0`, nowy krok smoke dla `/api/registry/search`) i epilogu nie są wypchnięte, więc CI ich nie widział; PR #56 ma w tytule „fazy 1–5”. Smoke nie był też uruchomiony w tym przeglądzie (`.env` → produkcja).
- **Fix**: `git push`, zaktualizować tytuł PR na „fazy 1–6” i potwierdzić zielone `ci` i `smoke`.
- **Decision**: FIXED — poprawki z triage zacommitowane, branch wypchnięty, tytuł PR #56 na „fazy 1–6”; CI dla 0ca4e9b: `ci` i `smoke` zielone

## Triage (2026-10-01)

- Fixed: F1, F2 (Fix A), F3, F4 (Fix A), F5 (Fix A), F7 (inaczej: lekcja poprawiona w miejscu + test), F8, F9, F10
- Rule: F6 (lekcja „Żadna nazwa leku ani dawka w adresie URL”; naprawa w kodzie odłożona do issue #57)
- Skipped: —
