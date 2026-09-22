<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Schemat leków i okresów dawkowania z RLS

- **Plan**: context/changes/medication-schema-rls/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3
- **Date**: 2026-09-22
- **Verdict**: REJECTED → APPROVED po triage'u 2026-09-22
- **Findings**: 1 critical, 6 warnings, 3 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | WARNING |
| Scope Discipline    | PASS    |
| Safety & Quality    | FAIL    |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | PASS    |

Wszystkie bramki automatyczne przebiegły na nowo i są zielone: `npm run typecheck`, `npm run lint`, `npm run build`, `npx supabase db reset`, `supabase/tests/rls_checks.sql` (7/7), `npm run smoke` przeciw lokalnemu Supabase (21 kroków, w tym 12 kroków izolacji). Werdykt REJECTED wynikał wyłącznie z luk w gwarancjach schematu, nie z niedziałającego kodu.

## Triage — 2026-09-22

Dziewięć z dziesięciu findingów naprawione, jeden świadomie odłożony (F10). Werdykt po triage'u: **APPROVED**. Bramki po wszystkich poprawkach: `typecheck`, `lint`, `build` zielone; `npx supabase db reset` + `supabase/tests/rls_checks.sql` — **8/8** (sprawdzenia rozszerzone o okres zerowej długości, przepięcie pod inny lek, usunięcie leku przy zamkniętym i otwartym oknie korekty); `npm run smoke` przeciw lokalnemu Supabase — 21 kroków PASS, a przeciw adresowi spoza `localhost` krok izolacji wypisuje `SKIP` z powodem.

F1 obniżone z CRITICAL do WARNING po weryfikacji z FR-005: usunięcie pozycji dodanej przez pomyłkę jest w zakresie produktu, brakowało wyłącznie ograniczenia go oknem korekty — tak jak na tabelach podrzędnych. F6 rozwiązane inaczej, niż proponował raport: pomiar pokazał, że RLS w PostgREST nie zwraca błędu, więc warunek na kod `42501` wywróciłby bramkę fałszywie.

## Findings

### F1 — Usunięcie leku nie jest ograniczone oknem korekty, choć tabele podrzędne są

- **Severity**: ⚠️ WARNING (obniżone z CRITICAL po weryfikacji z FR-005 — usuwanie pozycji dodanej przez pomyłkę jest w zakresie; brakowało wyłącznie ograniczenia go oknem korekty, tak jak na tabelach podrzędnych)
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20260922120000_medication_schema.sql:121, :289-335
- **Detail**: Polityka `medications_delete_authenticated` pozwala usunąć własny lek, a na `medications` nie ma wyzwalacza `before delete`. Wyzwalacze `*_guard_delete` na tabelach podrzędnych celowo przepuszczają kaskadę (rozpoznanie po braku wiersza nadrzędnego), więc `delete from medications` kasuje skład i wszystkie okresy dawkowania także przy zamkniętym oknie korekty. Zweryfikowane empirycznie: po podmianie funkcji okna na `false` usunięcie leku przeszło, a `dosage_periods` dla tego leku zostało zero wierszy. `rls_checks.sql:343-355` utrwala to jako zachowanie oczekiwane. Narusza regułę „lek się kończy z datą odstawienia, nie usuwa" (CLAUDE.md `### Nienaruszalność historii`, FR-005).
- **Fix A ⭐ Recommended**: Dołóż `before delete on public.medications` pytający `medication_correction_window_open(old.id)`; przy zamkniętym oknie wyjątek, przy otwartym przejście. Kasowanie konta (S-09) dostaje osobną ścieżkę — funkcja rozpoznająca kaskadę z `auth.users` albo `security definer` wołana z migracji S-09.
  - Strength: Ochrona siedzi tam, gdzie reszta gwarancji — w bazie, więc obowiązuje każdą przyszłą trasę API.
  - Tradeoff: S-09 musi jawnie obejść ten wyzwalacz, inaczej usunięcie konta się zablokuje.
  - Confidence: HIGH — ten sam wzorzec rozpoznawania kaskady już działa na tabelach podrzędnych.
  - Blind spot: Nie sprawdzono, czy `on delete cascade` z `auth.users` da się odróżnić od kasowania ręcznego bez dodatkowej flagi sesyjnej.
- **Fix B**: Zostaw schemat, zablokuj usuwanie dopiero w warstwie serwisów w S-02/S-03.
  - Strength: Zero zmian w migracji, która już jest wdrożona lokalnie i zweryfikowana.
  - Tradeoff: Gwarancja przestaje być gwarancją bazy — omija ją każde zapytanie spoza serwisu, także ręczna poprawka w Studio.
  - Confidence: MED — działa, dopóki nikt nie sięgnie do tabeli inaczej.
  - Blind spot: Plan świadomie wybrał bazę jako miejsce ochrony historii; to odwrócenie tej decyzji.
- **Decision**: FIXED via Fix A — `public.medications_guard_delete()` + wyzwalacz `medications_guard_delete` w `supabase/migrations/20260922120000_medication_schema.sql`; kaskada z `auth.users` rozpoznawana po braku wiersza użytkownika (ścieżka S-09). Sprawdzenie 7 w `supabase/tests/rls_checks.sql` odwrócone (przy zamkniętym oknie usunięcie leku pada), dołożone sprawdzenie 8 (przy otwartym oknie usunięcie pomyłki przechodzi wraz z kaskadą). `npx supabase db reset` + `rls_checks.sql` — 8/8 zielone.

### F2 — Kroki izolacji w smoke mogą zapisać zmyślone dane zdrowotne do produkcji

- **Severity**: ❌ CRITICAL
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: scripts/smoke.mjs:38-48, :101-151
- **Detail**: W trybie kont jednorazowych skrypt zakłada dwa konta i zapisuje wymyślone leki pod adres z `SUPABASE_URL`. Jedynym warunkiem wejścia w ten tryb jest brak `SMOKE_EMAIL` — zmienna, która nic nie mówi o docelowej bazie. `npm run smoke` ładuje `.env`, a `.env` w tym repozytorium wskazuje produkcyjne Supabase. Dziś nie strzela, bo `.env` niesie `SMOKE_EMAIL`, więc krok jest pomijany; wystarczy jednak usunąć tę zmienną, żeby bieg zapisał zmyślone dane zdrowotne do produkcji. Dokładnie scenariusz z `context/foundation/lessons.md` („Lokalne bramki sprawdź pod kątem tego, do której bazy faktycznie idą").
- **Fix**: Bramkuj kroki izolacji adresem: uruchamiaj tylko gdy `SUPABASE_URL` wskazuje `localhost` albo `127.0.0.1`, inaczej `SKIP` z powodem; furtka przez jawne `SMOKE_ALLOW_REMOTE_WRITES=1`.
  - Strength: Warunek mierzy to, co faktycznie decyduje o ryzyku — adres bazy, a nie niepowiązaną zmienną.
  - Tradeoff: Kilkanaście linii w skrypcie i jedno zdanie w README.
  - Confidence: HIGH — CI chodzi przeciw lokalnemu Supabase, więc bramka nie wywróci jobu `smoke`.
  - Blind spot: Nie sprawdzono, czy jakieś przyszłe środowisko przejściowe miałoby adres spoza localhost i wymagałoby furtki na stałe.
- **Decision**: FIXED — `isLocalSupabase()` i `writesAreSafe` w `scripts/smoke.mjs`; kroki izolacji idą tylko przy `SUPABASE_URL` na `localhost`/`127.0.0.1`/`::1`, inaczej `SKIP` z powodem, furtka przez `SMOKE_ALLOW_REMOTE_WRITES=1`. Nagłówek skryptu i `README.md` (sekcja `## Testy`, tabela zmiennych) opisują bramkę. Sprawdzone dwoma biegami: lokalny adres — 21 kroków PASS z izolacją; adres zdalny — `SKIP` z powodem.

### F3 — Okres zerowej długości omija ograniczenie przeciw nakładkom

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20260922120000_medication_schema.sql:83-88
- **Detail**: `check (ended_on is null or ended_on >= started_on)` dopuszcza `ended_on = started_on`, a `daterange(d, d, '[)')` jest pusty. Pusty zakres nigdy nie przecina się operatorem `&&`, więc `exclude using gist` go nie widzi. Zweryfikowane empirycznie: wstawienie okresu `2026-03-01 … 2026-03-01` w środek okresu trwającego przeszło bez błędu.
- **Fix**: Zmień kontrolę na `ended_on > started_on` albo dopisz `check (not isempty(period))`.
- **Decision**: FIXED — `dosage_periods_dates_check` wymaga teraz `ended_on > started_on`, z komentarzem wyjaśniającym pusty `daterange` i zapisem okresu jednodniowego jako `started_on = d, ended_on = d + 1`. Sprawdzenie 3 w `rls_checks.sql` rozszerzone o 3b: okres zerowej długości musi zostać odrzucony (`check_violation`).

### F4 — Wyzwalacze niemodyfikowalności nie chronią `medication_id`

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20260922120000_medication_schema.sql:240-287
- **Detail**: Guardy pilnują `substance_name`, `atc_code`, `dose_text`, `started_on` i podmiany `ended_on`, ale nie `medication_id`. Przy zamkniętym oknie korekty da się przepiąć okres dawkowania albo substancję pod inny własny lek — polityka `with check` potwierdza tylko właściciela. Zweryfikowane empirycznie: przy funkcji okna zwracającej `false` `update ... set medication_id = <inny lek>` przeszło.
- **Fix**: Dopisz `new.medication_id is distinct from old.medication_id` do warunku w obu funkcjach `*_guard_core`.
- **Decision**: FIXED — `medication_id` dołączone do rdzenia w `medication_substances_guard_core()` i `dosage_periods_guard_core()`, z osobnym komunikatem wyjątku. Sprawdzenie 5 rozszerzone o 5f: przepięcie okresu i składu pod drugi własny lek musi paść (fixture'y dostały drugi lek).

### F5 — Funkcja okna korekty jest `security definer` wykonywalna dla `public`

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20260922120000_medication_schema.sql:217-234
- **Detail**: Brak `revoke execute`. Dziś funkcja zwraca stałą, więc szkody nie ma, ale jej własny komentarz zapowiada, że w S-05 będzie czytała tabelę dzienniczka z prawami właściciela. Wtedy każda rola, łącznie z `anon`, dostanie wyrocznię o istnieniu cudzych wpisów objawów po `medication_id`.
- **Fix**: Dopisz `revoke execute on function public.medication_correction_window_open(uuid) from public;` oraz `grant execute ... to authenticated;` — teraz, dopóki funkcja jest nieszkodliwa.
- **Decision**: FIXED — `revoke execute ... from public` + `grant execute ... to authenticated` zaraz za `comment on function`, z komentarzem o wyroczni w S-05 i o tym, że wyzwalacze wołają funkcję jako własny definer.

### F6 — Kroki smoke mogą przejść, nie mierząc niczego

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: scripts/smoke.mjs:228-232, :199-224
- **Detail**: W kroku „klucz publiczny bez sesji" `if (error) return { ok: data === null, ... }` uznaje każdy błąd za sukces — zły adres, timeout czy nieistniejąca tabela dają PASS zamiast FAIL. W kroku „konto A nie zmieni ani nie usunie cudzego wiersza" błędy zapisu trafiają wyłącznie do `notes`, a o wyniku decyduje liczba wierszy; błąd z innego powodu niż RLS (literówka w nazwie kolumny) też daje zero wierszy. Krok mający dowodzić braku wycieku przechodzi wtedy, nie sprawdzając wycieku.
- **Fix**: Akceptuj wyłącznie zero wierszy albo błąd o oczekiwanym kodzie (`error.code === "42501"`); każdy inny wynik to `ok: false`.
  - Strength: Zamienia „nic się nie stało" w „blokada zadziałała z konkretnego powodu" — bramka mierzy to, co deklaruje.
  - Tradeoff: Trzeba potwierdzić, które kody Supabase faktycznie zwraca przy odcięciu politykami, inaczej bramka zacznie fałszywie padać.
  - Confidence: MED — kod `42501` to standardowe `insufficient_privilege`, ale PostgREST bywa, że zwraca pustą odpowiedź zamiast błędu.
  - Blind spot: Nie zmierzono, jaki dokładnie kod wraca dzisiaj w każdym z tych czterech kroków.
- **Decision**: FIXED, ale inaczej niż proponował Fix — pomiar zmienił rozwiązanie. Sonda przeciw lokalnemu Supabase pokazała, że RLS w PostgREST **nie zwraca żadnego błędu**: zablokowany odczyt, update i delete wracają z zerem wierszy i `error: none`. Warunek na `42501` nigdy by nie trafił i wywróciłby bramkę. Zastosowane: każdy błąd w kroku izolacji to `ok: false` z opisem `check did not run`, a przejście wymaga zera wierszy bez błędu (`scripts/smoke.mjs`, kroki anon oraz update/delete).

### F7 — Sprawdzenia SQL maskują błędy i nie wykryją polityki dla roli `public`

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/tests/rls_checks.sql:93, :167, :251-329
- **Detail**: Dwie rzeczy w jednym pliku. Po pierwsze, każde sprawdzenie „ma być zablokowane" łapie `exception when others` i ustawia wynik na sukces — literówka w nazwie kolumny wygląda wtedy tak samo jak działająca ochrona. Po drugie, warunek `'anon' = any (p.roles)` (:93) przepuści politykę założoną dla roli `public`, która obejmuje także `anon`; sprawdzenie byłoby zielone, a dane dostępne bez sesji.
- **Fix**: Łap konkretnie — `when sqlstate 'P0001'` dla wyjątków z wyzwalaczy i `when exclusion_violation` w sprawdzeniu 3 — oraz wymagaj `p.roles = '{authenticated}'` dla wszystkich dwunastu polityk.
- **Decision**: FIXED — sześć `exception when others` zamienione na `when sqlstate 'P0001'`, sprawdzenie 3 łapie `exclusion_violation`, a sprawdzenie 2 wymaga teraz `p.roles = array['authenticated']::name[]` dla każdej z dwunastu polityk (warunek odwrócony, więc polityka dla roli `public` też się nie prześlizgnie). Cały plik przechodzi 8/8 po zawężeniu, co potwierdza, że wyjątki faktycznie pochodzą z wyzwalaczy.

### F8 — W F-01 niemodyfikowalność rdzenia jest w praktyce nieaktywna

- **Severity**: 📋 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Architecture
- **Location**: supabase/migrations/20260922120000_medication_schema.sql:217-231
- **Detail**: Zaślepka okna zawsze zwraca `true`, więc wszystkie cztery wyzwalacze są dziś no-opem; sprawdzenia 5 i 6 w `rls_checks.sql` przechodzą tylko dlatego, że test sam podmienia treść funkcji. To zgodne z planem i świadome, ale dług jest zapisany wyłącznie w `## Migration Notes` planu — nie ma go w `change.md` ani w roadmapie, więc łatwo uznać gwarancję za dostarczoną.
- **Fix**: Dopisz dług „treść `medication_correction_window_open()` do podmiany w S-05" do pozycji S-05 w `context/foundation/roadmap.md`.
- **Decision**: FIXED — pozycja S-05 w `context/foundation/roadmap.md` dostała punkt **Dług przejęty z F-01**: migracja S-05 podmienia treść funkcji okna, a do tego czasu wszystkie pięć wyzwalaczy niemodyfikowalności jest bezczynnych, mimo zielonych sprawdzeń w `rls_checks.sql`.

### F9 — Bramka pustych sekretów jest warunkowa wbrew kontraktowi planu

- **Severity**: 📋 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: scripts/smoke.mjs:38-48
- **Detail**: Plan (Faza 3, punkt 1) mówi: „Brak `SUPABASE_URL` albo `SUPABASE_KEY` kończy bieg błędem z nazwą brakującej zmiennej — nigdy cichym pominięciem kroku". Faktycznie walidacja jest owinięta w `if (!usesExistingAccount)`, więc w trybie istniejącego konta brak tych zmiennych przechodzi bez słowa. Skutek praktyczny dziś zerowy — kroki izolacji są wtedy i tak pomijane — ale bezwarunkowej bramki z kontraktu nie ma.
- **Fix**: Wyjmij pętlę walidacji poza `if (!usesExistingAccount)` albo popraw kontrakt w planie, jeśli warunkowość była świadoma.
- **Decision**: FIXED — walidacja `SUPABASE_URL` i `SUPABASE_KEY` jest bezwarunkowa, zgodnie z kontraktem planu. Po poprawce F2 jest też spójna z resztą: bramka adresu i tak potrzebuje `SUPABASE_URL` w każdym trybie.

### F10 — Drobne koszty wydajności i nazewnictwa w migracji

- **Severity**: 📋 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20260922120000_medication_schema.sql:61-62, :91-92, :110-209, :357-366
- **Detail**: Trzy rzeczy bez znaczenia przy dzisiejszej skali z PRD. `auth.uid()` w politykach wołane per wiersz zamiast `(select auth.uid())`, które planer policzyłby raz. `medication_substances_medication_id_idx` powiela wiodącą kolumnę unikalnego ograniczenia, a `dosage_periods_medication_id_idx` powiela indeks GiST tworzony przez `dosage_periods_no_overlap` — koszt zapisu bez zysku na odczycie. Funkcja `set_updated_at()` ma nazwę generyczną pod `create or replace`, więc przyszła migracja z tą samą sygnaturą cicho podmieni ją wszystkim tabelom.
- **Fix**: Odłożyć do zmiany, która dotknie tych tabel z innego powodu — teraz nie ma czego mierzyć.
- **Decision**: SKIPPED — świadomie odłożone. Przy skali z PRD (jedna użytkowniczka, mały wolumen) nie ma czego mierzyć; do podjęcia przy zmianie, która dotknie tych tabel z innego powodu.
