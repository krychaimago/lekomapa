<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Niezmienniki schematu dla każdej tabeli

- **Plan**: context/changes/testing-schema-invariants/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3
- **Date**: 2026-09-29
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 3 warnings, 6 observations

Uwaga o zakresie: fazy 1 i 2 mają otwarte pozycje, które z definicji czekają na PR i merge (1.6 i 2.6: CI na PR, 1.9 i 1.10: `db push` na produkcję). Poza nimi wszystkie pozycje są odhaczone, dlatego przegląd obejmuje wszystkie trzy fazy.

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | WARNING |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | PASS    |

## Weryfikacja kryteriów (2026-09-29, lokalnie)

- `npm run db:check`: 3 z 3 plików PASS, w tym `INVARIANT 1–8 OK`, `ISOLATION 0–6 OK` i oba `GATE_COMPLETE`.
- 4 nowe próbki (`--probe`): każda pada z oczekiwanym tekstem, czyli kolejno `INVARIANT 3`, `INVARIANT 2`, `INVARIANT 1` i `ISOLATION 0 … probe_account_without_fixture`. Po próbkach w `pg_class` nie ma tabel `probe_%`, a pełny `db:check` dalej przechodzi.
- `npm test`: 144/144 PASS. `npm run typecheck`: 0 błędów. `npm run lint`: 0 błędów; 4 ostrzeżenia `no-console` pochodzą z plików spoza diffa.
- W `supabase/tests/` nie ma `when others`. `prettier --check` przechodzi. Linie z `TBD` w test-plan należą do §6.1 i §6.3, nie do §6.4.
- Pozycje czekające: 1.6 i 2.6 (CI na PR, PR jeszcze nie istnieje) oraz 1.9 i 1.10 (produkcja po merge'u). Żadnej z nich nie odhaczono przedwcześnie.

## Findings

### F1 — Widok na dane konta omija obie bramki

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: supabase/tests/schema_invariants_checks.sql:57 (oraz każda reguła z `relkind in ('r','p')`); account_isolation_checks.sql, ta sama kopia predykatu
- **Detail**:
  - Zmierzone: próbka `create view public.probe_leak as select * from public.medications;` przechodzi na PASS zarówno `schema_invariants_checks`, jak i `account_isolation_checks`.
  - Widok bez `security_invoker = true` czyta dane z uprawnieniami właściciela (`postgres`), więc RLS go nie obejmuje.
  - `pg_default_acl` w `public` daje `anon` i `authenticated` pełne uprawnienia na każdej nowej relacji, także na widoku.
  - Skutek: jeden `create view` wystawia leki wszystkich kont przez PostgREST, a bramka zostaje zielona.
  - Dziś w bazie nie ma żadnego widoku. Checklista §6.4 nie wspomina o widokach.
- **Fix**: Dodać INVARIANT 9. Każdy widok i widok zmaterializowany (`relkind in ('v','m')`) w `public` musi spełniać jeden z dwóch warunków: ma `security_invoker=true` w `reloptions` albo `anon`/`authenticated` nie mają na nim `SELECT`. Widok zmaterializowany nie obsługuje `security_invoker`, więc dla niego zostaje tylko drugi warunek. Do tego próbka w CI i jeden bullet w §6.4.
  - Strength: zamyka jedyną zmierzoną drogę obejścia RLS, której bramka nie widzi, zanim S-02 albo S-05 dodadzą widok, np. dla listy leków z okresami.
  - Tradeoff: jedna reguła więcej, jedna próbka i jeden bullet w §6.4.
  - Confidence: HIGH — obejście zmierzone lokalnie na obu plikach.
  - Blind spot: nie sprawdzono tabel obcych (`relkind 'f'`) ani funkcji zwracających `setof` tabeli konta jako `security definer`. Te drugie łapie jednak INVARIANT 7, o ile nie mają `EXECUTE` dla `anon`.
- **Decision**: FIXED — INVARIANT 9 w schema_invariants_checks.sql (widok `v`/`m`: security_invoker albo brak SELECT/INSERT/UPDATE/DELETE dla anon/authenticated), próbka view-without-security-invoker.sql w CI, bullet w §6.4. Zmierzone: próbka pada z `INVARIANT 9 FAILED`, widok z security_invoker i widok z revoke przechodzą, `db:check` 3/3 PASS.

### F2 — INVARIANT 2 wymusza kaskadę także na kluczach między tabelami konta

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality (błąd planu)
- **Location**: supabase/tests/schema_invariants_checks.sql:150-156; plan.md, INVARIANT 2
- **Detail**:
  - Reguła wymaga `on delete cascade` od każdego klucza, którego cel należy do domknięcia. Obejmuje to też klucz tabeli do samej siebie, który plan przewiduje wprost („okres wskazujący poprzedni okres”), oraz każdy przyszły klucz między dwiema tabelami konta, np. wpis dzienniczka wskazujący lek w S-05.
  - Zmierzone: `previous_period_id … references dosage_periods(id) on delete set null` daje `INVARIANT 2 FAILED … (confdeltype n)`.
  - Dla usunięcia konta taki klucz nie ma znaczenia, bo wiersz i tak odchodzi własną ścieżką kaskady od `auth.users`. ISOLATION 6 dowodzi tego zachowaniem.
  - Wymuszona kaskada sprawia natomiast, że usunięcie jednej pomyłki zabiera po cichu wiersze, które na nią wskazują. To stoi w sprzeczności z zasadą „historia nie kłamie”.
- **Fix A ⭐ Recommended**: Zawęzić INVARIANT 2 do trzech warunków:
  - każda tabela z domknięcia ma co najmniej jedną ścieżkę kaskady od `auth.users`,
  - klucze bezpośrednio do `auth.users` mają `cascade`,
  - pozostałe klucze do tabel konta mogą mieć `cascade`, `set null` albo `no action`, ale nie `restrict`, bo `restrict` sprawdzany natychmiast może zablokować usunięcie konta.

  Próbka `account-fk-set-null` dalej pada, bo jej klucz prowadzi do `auth.users`. Wymaga to dopisku w planie i w §6.4.
  - Strength: zostawia decyzję o kaskadzie między tabelami konta autorce migracji (S-02, S-05), a reguła dalej chroni cel ryzyka #6.
  - Tradeoff: rekurencja z flagą „ścieżka kaskadowa” jest bardziej złożona niż dzisiejsze proste sprawdzenie. Trzeba też zmienić obie kopie komentarza predykatu.
  - Confidence: MED — `restrict` kontra `no action` przy kaskadzie z dwóch stron wymaga pomiaru przed ustawieniem warunku.
  - Blind spot: nie zmierzono, czy `no action` między dwiema tabelami konta przechodzi `delete from auth.users` przy zamkniętym oknie. Pokaże to ISOLATION 6 po dodaniu takiego klucza.

- **Fix B**: Zostawić regułę i dopisać do §6.4 świadomą decyzję: „klucz między tabelami konta zawsze z `cascade`”.
  - Strength: zero zmian w kodzie, reguła zostaje prosta.
  - Tradeoff: S-05 będzie musiało kaskadowo usuwać wpisy dzienniczka razem z usuniętym lekiem-pomyłką. Blokują to strażnicy historii, ale przy otwartym oknie dane znikną po cichu.
  - Confidence: MED — zależy od modelu danych S-05, którego jeszcze nie ma.
  - Blind spot: model danych S-05.
- **Decision**: FIXED via Fix A — INVARIANT 2 rozbity na trzy warunki: klucze do `auth.users` z `cascade`, ścieżka kaskady od `auth.users` dla każdej tabeli z domknięcia, zakaz `set default` na kluczach do tabel konta. Pomiar: `no action`, `set null` i `restrict` między tabelami konta nie blokują usunięcia konta (obie kolejności wyzwalaczy), więc `restrict` dopuszczony. Nowa próbka `account-table-without-cascade-path.sql` w CI. Dopisek w planie i §6.4.

### F3 — `authenticated` dalej ma wyrocznię okna korekty dla cudzych leków

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality (błąd planu)
- **Location**: supabase/migrations/20260929120000_revoke_account_truncate_and_window_execute.sql:25; schema_invariants_checks.sql:329; 20260922120000_medication_schema.sql:247
- **Detail**:
  - Zmierzone `proacl`: `{postgres=X, authenticated=X, service_role=X}`.
  - Funkcja przyjmuje dowolny `p_medication_id` i nie sprawdza właściciela. Konto B po zalogowaniu może więc wołać `/rpc/medication_correction_window_open` z id leku konta A.
  - Uzasadnienie w samej migracji brzmi: „po S-05 wywołujący dowie się, czy istnieją wpisy”. To samo dotyczy `authenticated`, nie tylko `anon`. INVARIANT 7 sprawdza wyłącznie `anon`.
  - Dziś nic nie wycieka, bo treść funkcji to `return true`. Kod w `src/` funkcji nie woła (grep jest pusty).
  - Plan świadomie zostawił `EXECUTE` dla `authenticated`, więc to luka planu, nie dryf implementacji.
- **Fix A ⭐ Recommended**: Zapisać wymaganie w §6.4 i w roadmapie S-05: przed nadaniem funkcji prawdziwej treści albo sprawdzić właściciela (`auth.uid()` wobec `medications.user_id`), albo odebrać `EXECUTE` od `authenticated`. Rozszerzenie INVARIANT 7 wejdzie razem z S-05.
  - Strength: rozstrzyga sprawę tam, gdzie powstaje treść funkcji, i dziś nie dotyka produkcji.
  - Tradeoff: ryzyko przeniesione na S-05, pilnowane tylko dokumentem.
  - Confidence: HIGH — dziś funkcja zwraca stałą.
  - Blind spot: nie sprawdzono, czy któryś strażnik historii wymaga `EXECUTE` wywołującego. Podagent twierdzi, że strażnicy są `security definer`, ale nie zweryfikowano tego tutaj.
- **Fix B**: Już teraz odebrać `EXECUTE` od `authenticated` w tej samej migracji, póki nie trafiła na produkcję, i rozszerzyć INVARIANT 7 na `authenticated`.
  - Strength: zamyka lukę, zanim powstanie.
  - Tradeoff: wymaga pomiaru, czy strażnicy dalej działają dla `authenticated` (ISOLATION 6, sprawdzenia 5–7), a S-05 może potem potrzebować wywołania z przeglądarki.
  - Confidence: MED — zależy od tego, jak strażnicy wołają funkcję.
  - Blind spot: przyszły interfejs S-05 (czy ekran pokazuje stan okna przez RPC).
- **Decision**: FIXED via Fix B — migracja `20260929120000` odbiera `EXECUTE` od `anon, authenticated` (nie jest jeszcze na produkcji), INVARIANT 7 sprawdza obie role, próbka `window-execute-for-authenticated.sql` w CI. Zweryfikowane: strażnicy są `security definer` (`medication_schema.sql:256,278,324,344,373`); po `db reset` `proacl = {postgres=X, service_role=X}`, `db:check` 3/3 PASS (ISOLATION 1–6 jako authenticated). Krok 1.9 planu sprawdza też `authenticated`, nota w roadmapie S-05.

### F4 — §6.2 opisuje próbkę jako „`begin;` i DDL”, a pliki próbek nie mają `begin;`

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: context/foundation/test-plan.md:129
- **Detail**: `begin;` dokleja runner (`composeProbe`), jak mówią nagłówki próbek. Osoba pisząca kolejną próbkę według §6.2 doda własne `begin;`, co jest nieszkodliwe, ale wprowadza w błąd co do mechanizmu.
- **Fix**: W §6.2 zamienić „`begin;` i DDL psujące jedną regułę” na „samo DDL psujące jedną regułę — `begin;` dokleja runner”.
- **Decision**: FIXED — §6.2: próbka to samo DDL bez `begin;`/`commit;`, `begin;` dokleja runner.

### F5 — Próbka uruchomiona bez `--probe` zatwierdza DDL w bazie

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: scripts/db-checks.mjs:89-91, 202-216
- **Detail**: Wywołanie `node scripts/db-checks.mjs <próbka>` albo `expect_probe_failure` na próbce schematu wykonuje DDL w trybie autocommit. `composeProbe` nie odrzuca też `commit;` ani `end;` w próbce. Chronią przed tym tylko komentarze w nagłówkach. Skutek jest ograniczony: w CI końcowy `db:check` zmieni się na czerwony, a lokalnie wystarczy `npx supabase db reset`.
- **Fix**: Runner odrzuca pliki z `scripts/db-checks/probes/` w trybie zwykłym, jeśli nie są jedną z dwóch próbek runnera, oraz odrzuca `commit`/`end`/`rollback` w treści próbki schematu. Do tego test jednostkowy.
- **Decision**: FIXED — runner odrzuca próbkę schematu (plik z `scripts/db-checks/probes/` spoza `RUNNER_PROBES`) w trybie zwykłym i `commit`/`end`/`rollback`/`abort` w treści próbki (poza komentarzami i ciałami `$$`). 3 nowe testy jednostkowe; oba odrzucenia zmierzone.

### F6 — INVARIANT 4–8 nie mają próbki w CI

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: .github/workflows/ci.yml:79-82
- **Detail**: CI pokazuje czerwień tylko dla INVARIANT 1–3 i ISOLATION 0. INVARIANT 6 i 7 pilnują dokładnie dwóch luk, które zamyka ta migracja, a dowodzi ich tylko ręczny kontrprzykład 1.8, który dotyczy zresztą INVARIANT 4. Plan przewidywał 3 próbki, więc to nie dryf. Zasada planu brzmi jednak: „bramka, której nikt nie widział na czerwono, niczego nie dowodzi”.
- **Fix**: Dodać dwie próbki: `grant truncate on public.medications to anon` (oczekiwany `INVARIANT 6 FAILED`) i `grant execute on function public.medication_correction_window_open(uuid) to anon` (oczekiwany `INVARIANT 7 FAILED`).
- **Decision**: FIXED (tylko INVARIANT 6, wybór autorki) — próbka `account-table-truncate-for-anon.sql` w CI. INVARIANT 7 i 9 mają próbki z F3 i F1. INVARIANT 4, 5, 8 dalej bez próbki.

### F7 — INVARIANT 7 nie sprawdza `search_path` funkcji `security definer`

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/tests/schema_invariants_checks.sql:315-329
- **Detail**: Dziś wszystkie funkcje `security definer` mają `search_path=""`. Przyszła funkcja bez `set search_path` to klasyczna droga podmiany obiektów. Reguła tego nie łapie.
- **Fix**: Rozszerzyć INVARIANT 7 o wymóg, żeby `proconfig` każdej funkcji `security definer` w `public`, także wyzwalaczy, zawierał `search_path=`.
- **Decision**: FIXED — INVARIANT 7 wymaga `search_path=` w `proconfig` każdej funkcji `security definer` w `public`, także wyzwalaczy (dziś 6 z 6 spełnia). Próbka `definer-without-search-path.sql` w CI, bullet w §6.4.

### F8 — Reguła podziału w ISOLATION 0 nie sprawdza, czy nazwy z listy wspólnych istnieją

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: supabase/tests/account_isolation_checks.sql:166-188
- **Detail**: Plan każe użyć „tej samej reguły podziału”. Kopia sprawdza trzy warunki (niepuste domknięcie, żadna tabela w obu zbiorach, żadna poza oboma), ale nie sprawdza istnienia 5 nazw z listy wspólnych. Robi to INVARIANT 1 w drugim pliku, więc szkoda jest niska. Obie kopie nie są jednak identyczne.
- **Fix**: Dopisać w ISOLATION 0 sprawdzenie istnienia nazw z listy wspólnych, tak jak w INVARIANT 1.
- **Decision**: FIXED — ISOLATION 0 sprawdza istnienie nazw z listy wspólnych, tak jak INVARIANT 1; obie kopie reguły podziału są teraz równe.

### F9 — Kontrprzykład właściciela dla `medications` nie zmienia wartości

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/tests/account_isolation_checks.sql:141 (`owner_target` = A dla `user_id`)
- **Detail**: Dla tabeli-korzenia A „przepina” `user_id` z A na A. `row_count = 1` dowodzi, że `with check` przepuszcza właściciela, ale nie tego, że blokada B pochodzi z RLS, a nie z czegoś blokującego każdą zmianę kolumny. Plan tak to zapisał („`medications`: `user_id` na A”), a legalnego celu innego niż A dla korzenia nie ma. Dla tabel podrzędnych dowód jest pełny.
- **Fix**: Nie zmieniać kodu. Dopisać w komentarzu mapy, że dla korzenia kontrprzykład jest z natury słabszy, a dowód dla korzenia daje ISOLATION 3 (UPDATE właściciela na `product_name`).
- **Decision**: FIXED — komentarz przy `repoint_owner_target` w mapie danych testowych: dla korzenia kontrprzykład jest z natury słabszy, dowód daje ISOLATION 3. Kod bez zmian.

## Triage (2026-09-29)

- **Fixed**: F1, F2 (Fix A), F3 (Fix B), F4, F5, F6 (tylko INVARIANT 6), F7, F8, F9 (9)
- **Skipped / accepted / rule**: brak
- Weryfikacja po triage'u (lokalnie, po `npx supabase db reset`): `npm run db:check` 3/3 PASS; 5 nowych próbek pada z oczekiwanym tekstem (`INVARIANT 9`, `INVARIANT 2: account tables not reached`, `INVARIANT 7` ×2, `INVARIANT 6`); runner odrzuca próbkę schematu bez `--probe` i próbkę z `commit;`; `npm test` 147/147; `npm run typecheck` 0 błędów; `npm run lint` 0 błędów.
- Do zrobienia przy PR: pozycje 1.6 i 2.6 (CI na PR) obejmą teraz 11 próbek zamiast 6. Pozycja 1.9 sprawdza dodatkowo `has_function_privilege('authenticated', …)` = `false`.
