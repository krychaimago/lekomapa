---
date: 2026-09-29T11:47:00+02:00
researcher: Claude (Opus 5.5) dla Krycha Imago
git_commit: 823b3d089059f23d43eed23ebe28fa5325984a5c
branch: main
repository: krychaimago/lekomapa
topic: "Rollout testów, faza 2 — niezmienniki schematu dla każdej tabeli: ugruntowanie ryzyk #1, #3, #6 z test-plan.md §2"
tags: [research, supabase, rls, catalog, history-triggers, account-deletion, test-plan-phase-2]
status: complete
last_updated: 2026-09-29
last_updated_by: Claude (Opus 5.5)
---

# Research: Niezmienniki schematu dla każdej tabeli (faza 2)

**Date**: 2026-09-29T11:47:00+02:00
**Researcher**: Claude (Opus 5.5) dla Krycha Imago
**Git Commit**: 823b3d089059f23d43eed23ebe28fa5325984a5c (drzewo robocze: niezacommitowana zmiana statusów w `context/foundation/test-plan.md` §3)
**Branch**: main
**Repository**: krychaimago/lekomapa

## Research Question

Ugruntuj fazę 2 rolloutu z `context/foundation/test-plan.md` („Niezmienniki schematu dla każdej tabeli”). Zweryfikuj ryzyka #1 (izolacja per konto), #3 (nienaruszalność historii po migracji) i #6 (dane zostają po usunięciu konta) z §2, wraz z kontekstem, który tabela „Risk Response Guidance” każe ugruntować.

## Summary

- **Dziś każda lista tabel w bramkach jest wpisana ręcznie.** Żadne sprawdzenie nie wyprowadza zbioru tabel z danymi konta z katalogu bazy. Nowa tabela z S-02/S-05 bez RLS albo bez kaskady od konta przejdzie obecne bramki na zielono (`supabase/tests/rls_checks.sql:39-52`, `account_isolation_checks.sql:92+`, `scripts/smoke.mjs:193-207`).
- **Predykat z katalogu działa na obecnym schemacie (zmierzone).** Rekurencyjne domknięcie kluczy obcych do `auth.users` w schemacie `public` daje dokładnie 3 tabele: `medications`, `medication_substances`, `dosage_periods`. Pozostałe 5 tabel `public` to tabele wspólne. Każda krawędź na ścieżce do `auth.users` ma `on delete cascade`.
- **#1, luka zmierzona w lokalnej bazie:** `anon` i `authenticated` mają pełne uprawnienia tabelowe na 3 tabelach konta, łącznie z `TRUNCATE`. `TRUNCATE` omija RLS. Tabele wspólne mają te uprawnienia odebrane w migracji, tabele konta nie. To ten sam finding F5 pominięty w fazie 1 z adnotacją „na fazę 2”.
- **#6, zmierzone:** usunięcie wiersza z `auth.users` przy oknie korekty zastubowanym na `false` kasuje wszystkie wiersze w 3 tabelach (wynik 0/0/0). Ręczne usunięcie leku w tej samej transakcji jest blokowane (P0001). Kaskada działa dziś, ale żadna bramka tego nie sprawdza.
- **#1, druga luka zmierzona:** `anon` ma `EXECUTE` na `medication_correction_window_open`, mimo `revoke … from public`. Po S-05 funkcja stanie się wyrocznią istnienia cudzych wpisów dzienniczka.
- **#3:** wyzwalacze historii (5 sztuk) są sprawdzane wyłącznie zachowaniem. Nic nie sprawdza w katalogu ich obecności ani `tgenabled`. Okno korekty jest zaślepką `return true`. Zamknięte okno testuje się wyłącznie podmianą na `return false`, podmiana jest cofana i weryfikowana odciskiem md5. „Zmiana dawki zamyka okres i otwiera nowy” nie jest egzekwowana w bazie jako operacja. Baza pilnuje tylko skutków (brak nadpisania po oknie, brak nakładania, `ended_on` zapisywalne wyłącznie z NULL).

## Detailed Findings

### Inwentarz tabel (8 w `public`, wszystkie z migracji)

Źródła: `supabase/migrations/20260922120000_medication_schema.sql` (dalej **MS**), `20260924120000_registry_schema.sql` (**RS**), `20260926120000_symptom_catalog_schema.sql` (**SC**). Migracje seed nie zawierają DDL (grep).

| Tabela                                                          | Rodzaj                                                   | RLS / FORCE      | Polityki                                                               | Odebrane uprawnienia                                                  | Powiązanie z kontem                                     |
| --------------------------------------------------------------- | -------------------------------------------------------- | ---------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------- |
| `medications`                                                   | konto, bezpośrednio                                      | tak MS:106 / nie | 4 × `authenticated`, `user_id = auth.uid()` (MS:113-126)               | brak                                                                  | `user_id → auth.users on delete cascade` (MS:19)        |
| `medication_substances`                                         | konto, przez rodzica, bez `user_id` (celowo, MS:130-132) | tak MS:107 / nie | 4 × `authenticated`, `exists(... m.user_id = auth.uid())` (MS:134-167) | brak                                                                  | `medication_id → medications on delete cascade` (MS:47) |
| `dosage_periods`                                                | konto, przez rodzica                                     | tak MS:108 / nie | 4 × `authenticated` (MS:176-209)                                       | brak                                                                  | `medication_id → medications on delete cascade` (MS:73) |
| `registry_products`, `registry_substances`, `interaction_pairs` | wspólne                                                  | tak RS:136-138   | 1 × SELECT `using (true)` (RS:143-151)                                 | insert/update/delete/truncate od `anon`, `authenticated` (RS:157-159) | brak                                                    |
| `symptoms`, `symptom_search_terms`                              | wspólne                                                  | tak SC:127-128   | 1 × SELECT (SC:133-137)                                                | jak wyżej (SC:143-144)                                                | brak                                                    |

Tabel konta jest dokładnie 3, wspólnych 5 (zmierzone w `pg_class`, `relkind in ('r','p')`).

- `anon` nie ma polityki na żadnej tabeli. Komentarze mówią, że celowo (MS:110-111, RS:140-141, SC:130-131).
- `force row level security` nie występuje w żadnej migracji. Zmierzone: `relforcerowsecurity = f` na wszystkich 8 tabelach.

### Ryzyko #1: izolacja per konto

**Pomiar uprawnień tabelowych** (`information_schema.role_table_grants`, lokalna baza, 6 z 6 migracji zastosowanych):

- `anon` i `authenticated` na `medications`, `medication_substances`, `dosage_periods`: `DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE`.
- Te same role na 5 tabelach wspólnych: `REFERENCES, SELECT, TRIGGER`.
- Uprawnienia na tabelach konta pochodzą z domyślnych uprawnień Supabase, nie z repozytorium. Na tych 3 tabelach izolacja opiera się wyłącznie na RLS.
- `TRUNCATE` nie podlega RLS ani wyzwalaczom `for each row`. PostgREST nie wystawia `TRUNCATE`, więc przez API ta luka jest dziś nieosiągalna. Jest osiągalna dla każdego kodu wykonującego SQL w roli `authenticated` (funkcja `security invoker`, przyszłe RPC).

**Co bramki sprawdzają dziś:**

- `rls_checks.sql` sprawdzenie 1 (:29-58): RLS włączone, lista 3 nazw wpisana ręcznie (:40, :50).
- Sprawdzenie 2 (:60-112): 12 polityk, role = `{authenticated}`, lista ręczna.
- Sprawdzenia 9-10 i 15-16: tabele wspólne, listy ręczne.
- `account_isolation_checks.sql` ISOLATION 1-5 (:80-426): zachowanie per operacja na dwóch kontach i `anon`, pętla po liście `values` wpisanej ręcznie (:92+). Blokada UPDATE/DELETE mierzona jako `row_count = 0` plus wiersz nietknięty. Blokada INSERT i przepięcia mierzona jako `sqlstate '42501'`. Żadnego `when others` w obu plikach.
- `scripts/smoke.mjs` `isolationTargets` (:193-207): lista ręczna. `README.md:92` każe dopisywać 4 kroki smoke na każdą nową tabelę.

**Zmierzony stan polityk** (`pg_policies`): 3 tabele konta × 4 komendy (SELECT/INSERT/UPDATE/DELETE) × `{authenticated}`, 5 tabel wspólnych × 1 SELECT × `{authenticated}`. Razem 17 polityk.

**Czego katalog nie powie:** czy wyrażenie polityki faktycznie wiąże wiersz z `auth.uid()`. Polityka `using (true)` na tabeli konta przejdzie sprawdzenie „jest polityka na każdą operację”. Dowód izolacji wymaga zachowania na dwóch kontach (ISOLATION). Katalog może jedynie wymusić, żeby każda tabela z domknięcia trafiła do testu zachowania. Zgadza się to z „Must challenge” dla #1 w test-plan §2.

### Ryzyko #6: dane po usunięciu konta

**Pomiar kaskady** (lokalna baza, jedna transakcja z `rollback`, stałe UUID `dddddddd-…`):

1. Wstawione konto w `auth.users`, lek, wiersz składu, okres.
2. `medication_correction_window_open` podmieniona na `return false`.
3. `delete from public.medications …` → `ERROR` z `medications_guard_delete` („Nie można usunąć leku: okno korekty jest już zamknięte…”). Kontrprzykład: wyzwalacz działa.
4. `rollback to savepoint`, potem `delete from auth.users …` → `DELETE 1`, liczniki w 3 tabelach: `0|0|0`.
5. Po `rollback`: treść funkcji okna z powrotem `return true`, konta testowego brak.

Wniosek: przy zamkniętym oknie usunięcie konta przechodzi przez wszystkie 3 wyzwalacze usuwania i kasuje całą historię. Rozpoznanie kaskady: `medications_guard_delete` sprawdza brak wiersza w `auth.users` (MS:377). Wyzwalacze podrzędne sprawdzają brak rodzica (MS:328, MS:348). `pg_trigger_depth` nie jest używane nigdzie.

**Zmierzone domknięcie kluczy obcych** (rekurencyjne CTE po `pg_constraint`, `contype='f'`, start od `confrelid = 'auth.users'`, bez schematów `auth` i `storage`):

- W domknięciu: `medications`, `medication_substances`, `dosage_periods`. Na każdej ścieżce `confdeltype = 'c'`.
- Poza domknięciem: `registry_products`, `registry_substances`, `interaction_pairs`, `symptoms`, `symptom_search_terms`.
- Poza `public` do `auth.users` wskazuje 10 tabel ze schematu `auth` (identities, sessions, mfa_factors…). Należą do Supabase i nie są przedmiotem tej bramki.
- `medications.registry_medication_id → registry_products on delete restrict` (RS:187-191) wskazuje od tabeli konta do wspólnej. Nie blokuje usunięcia konta i nie wciąga tabeli wspólnej do domknięcia.

**Przypadki brzegowe predykatu domknięcia** (dziś żaden nie występuje):

- Tabela z kolumną `user_id` bez klucza obcego wypadnie z domknięcia po cichu. Potrzebna reguła: tabela `public` spoza domknięcia i spoza jawnej listy tabel wspólnych oblewa bramkę.
- Klucz obcy `on delete set null`, `restrict` albo `no action` na ścieżce do konta zostawi wiersze albo zablokuje usunięcie konta. Reguła: każda krawędź w domknięciu `confdeltype = 'c'`.
- Tabela wspólna z kluczem obcym do tabeli konta zostałaby błędnie wciągnięta. Takich dziś nie ma.
- Planowany w S-05 klucz obcy wpisu dzienniczka do `symptoms` `on delete restrict` (roadmap.md:247-248) wskazuje od tabeli konta do wspólnej. Nie psuje predykatu.

**Sama kaskada w katalogu nie wystarcza jako dowód #6:** wyzwalacz `before delete` może ją zablokować (dokładnie to robiłby `medications_guard_delete` bez rozpoznania kaskady). Pełny dowód to zachowanie jak w pomiarze wyżej: usunięcie konta przy zamkniętym oknie zeruje każdą tabelę z domknięcia.

### Ryzyko #3: nienaruszalność historii

**Wyzwalacze strażnicze** (wszystkie w MS, `plpgsql`, `security definer`, `search_path=''`, `for each row`, zmierzone `tgenabled = 'O'`):

| Wyzwalacz                                                 | Zdarzenie     | Chroni                                                               | Błąd                      |
| --------------------------------------------------------- | ------------- | -------------------------------------------------------------------- | ------------------------- |
| `medications_guard_delete` (MS:390, funkcja MS:370-388)   | BEFORE DELETE | usunięcie leku                                                       | P0001, MS:383             |
| `medication_substances_guard_core` (MS:394, MS:253-273)   | BEFORE UPDATE | `substance_name`, `atc_code`, `medication_id`                        | P0001, MS:268             |
| `medication_substances_guard_delete` (MS:398, MS:321-339) | BEFORE DELETE | usunięcie składu                                                     | P0001, MS:334             |
| `dosage_periods_guard_core` (MS:402, MS:275-311)          | BEFORE UPDATE | `dose_text`, `started_on`, `medication_id`, `ended_on` po ustawieniu | P0001, MS:285/290/297/305 |
| `dosage_periods_guard_delete` (MS:406, MS:341-359)        | BEFORE DELETE | usunięcie okresu                                                     | P0001, MS:354             |

- Żaden wyzwalacz nie ustawia własnego `ERRCODE`, więc wszystkie zwracają P0001, a bramka rozróżnia je po treści komunikatu (`rls_checks.sql:277-289`).
- Poza ochroną: UPDATE na `medications` (w tym `user_id`, `registry_medication_id`), INSERT do tabel podrzędnych, `TRUNCATE`. S-02 planuje wyzwalacz UPDATE na `medications` (roadmap.md:205-206).

**Okno korekty:** `public.medication_correction_window_open(uuid)` (MS:222-236), STABLE, SECURITY DEFINER, treść `return true` (MS:234). Komentarz MS:239: S-05 podmienia treść. `execute` odebrane `public`, nadane `authenticated` (MS:246-247).

**Jak testy podmieniają okno** (`rls_checks.sql`):

- odcisk `md5(pg_get_functiondef(...))` (:268-269),
- `savepoint before_window_closed` (:289),
- `create or replace … return false` (:291-301),
- sprawdzenia 5, 6, 7, 19 przy zamkniętym oknie,
- `rollback to savepoint` (:586),
- sprawdzenie końcowe porównuje odcisk (:1362-1375), cały plik w `begin … rollback`.

Zastrzeżenie z „Must challenge” dla #3 potwierdzone w węższym brzmieniu: podmiana jest cofana i weryfikowana, ale zachowanie przy zamkniętym oknie mierzy się wyłącznie na zaślepce `false`. Prawdziwa logika okna nie istnieje (zawsze `true`). Po S-05 treść z błędem, która zawsze zwraca `true`, przejdzie każde obecne sprawdzenie. Odcisk md5 łapie tylko funkcję zostawioną zmienioną przez sam skrypt, nie zmianę w nowej migracji.

**Wykrywanie w katalogu:** `pg_trigger` (`tgrelid`, `tgname`, `tgenabled`, `not tgisinternal`) pozwala stwierdzić obecność i włączenie strażnika. Nic tego dziś nie robi (grep `pg_trigger`/`tgenabled` w `supabase/tests/` i `scripts/`: brak). Wyłączony lub usunięty strażnik wywróci dziś sprawdzenia zachowania 5-7 i 19. Nie wywróci ich usunięcie strażnika razem z dopasowaną zmianą testu w tym samym PR.

**„Zmiana dawki zamyka okres i otwiera nowy”:** brak funkcji ani RPC do tej operacji. `src/` nie zapisuje jeszcze do `dosage_periods`. Baza wymusza:

- ograniczenie `dosage_periods_dates_check` `ended_on > started_on` (MS:88-89),
- wykluczenie `dosage_periods_no_overlap` `(medication_id with =, period with &&)` (MS:92-93),
- `ended_on` zapisywalne wyłącznie z NULL po zamknięciu okna (MS:300-306).

Pozytywna ścieżka (zamknij P1, otwórz sąsiedni P2, nadpisanie P1 zablokowane) jest dowiedziona jedynie przez sprawdzenie 19 (`rls_checks.sql:484-579`).

### Jak bramka biegnie (dla #3 „stan bazy po odtworzeniu migracji”)

- CI, job `smoke`: `supabase start` na świeżym runnerze stosuje wszystkie migracje do pustej bazy. `db reset` nie jest wołane (`.github/workflows/ci.yml:42`). Potem dwie próby, które muszą paść, i `npm run db:check` (:64).
- `scripts/db-checks.mjs`: sprawdza, że każda wersja migracji jest w `supabase_migrations.schema_migrations`. Zielony plik wymaga kodu 0 i `GATE_COMPLETE <nazwa>` (:82-88). Nowy plik w `supabase/tests/` biegnie bez rejestracji.
- `supabase/config.toml:60-65` wskazuje `./seed.sql`, którego nie ma. Wszystkie dane seed żyją w migracjach.
- Deploy wykonuje wyłącznie `wrangler deploy`. Migracje na produkcję idą ręcznie przez `db push` (README:107). Rollback kodu nie cofa migracji (infrastructure.md:84, :116).

## Code References

- `supabase/migrations/20260922120000_medication_schema.sql:19,47,73` — kaskady od konta
- `supabase/migrations/20260922120000_medication_schema.sql:106-209` — RLS i 12 polityk tabel konta
- `supabase/migrations/20260922120000_medication_schema.sql:222-247` — zaślepka okna korekty i uprawnienia
- `supabase/migrations/20260922120000_medication_schema.sql:253-406` — funkcje i wyzwalacze strażnicze
- `supabase/migrations/20260924120000_registry_schema.sql:157-159` — `revoke … truncate` na tabelach wspólnych (wzorzec brakujący na tabelach konta)
- `supabase/migrations/20260926120000_symptom_catalog_schema.sql:143-144` — to samo dla katalogu objawów
- `supabase/tests/rls_checks.sql:29-112` — sprawdzenia 1-2 z ręczną listą tabel
- `supabase/tests/rls_checks.sql:260-301,586,1362-1375` — podmiana okna, cofnięcie, odcisk
- `supabase/tests/rls_checks.sql:588-614` — sprawdzenie 8, kaskada od leku (nie od konta)
- `supabase/tests/account_isolation_checks.sql:80-426` — ISOLATION 1-5
- `scripts/db-checks.mjs:82-88` — warunek zielonego pliku
- `scripts/smoke.mjs:193-207` — `isolationTargets`, lista ręczna
- `.github/workflows/ci.yml:42,64` — start bazy i bramka SQL w CI
- `README.md:90-92` — reguła „4 kroki smoke na nową tabelę”

## Architecture Insights

- Własność wiersza wyrażona jest dwojako: `user_id` na rodzicu, `exists(...)` przez rodzica na tabelach podrzędnych (decyzja F-01, jedno źródło prawdy). Predykat „ma kolumnę `user_id`” łapie 1 z 3 tabel konta. Predykat „domknięcie kluczy obcych do `auth.users`” łapie 3 z 3.
- Tabele wspólne mają podwójną blokadę zapisu (brak polityk plus `revoke`). Tabele konta mają pojedynczą (RLS). Asymetria pochodzi z kolejności: F-01 powstało przed wzorcem `revoke` z F-02.
- Katalog odpowiada na pytania strukturalne: czy tabela jest w domknięciu, czy ma RLS, polityki na 4 komendy, uprawnienia, kaskady, obecne strażniki. Na pytania semantyczne (czy polityka wiąże z `auth.uid()`, czy strażnik blokuje, czy kaskada przechodzi przez strażniki) odpowiada wyłącznie zachowanie. Faza 2 potrzebuje obu warstw: katalog wyznacza zbiór, zachowanie dowodzi dla każdego elementu zbioru.

## Historical Context (from prior changes)

- `context/archive/2026-09-28-testing-sql-gate-in-ci/plan.md:55-60` — odłożone do fazy 2: lista tabel z katalogu, `TRUNCATE` dla `anon`/`authenticated`, `EXECUTE` okna dla `anon`, kaskada usunięcia konta przy zamkniętym oknie. Wszystkie cztery punkty nadal aktualne. Trzeci potwierdzony pomiarem: `proacl` funkcji okna to `{postgres=X, anon=X, authenticated=X, service_role=X}`. `revoke … from public` (MS:246) nie odbiera bezpośrednich nadań z domyślnych uprawnień Supabase, więc `anon` ma `EXECUTE` mimo komentarza MS:241-245. Dziś nieszkodliwe (funkcja zwraca stałą). Po S-05 funkcja czyta wpisy dzienniczka prawami właściciela i staje się wyrocznią istnienia wpisów dla `anon` przez `/rpc/medication_correction_window_open`, a także dla każdego zalogowanego konta (nadanie MS:247).
- `context/archive/2026-09-28-testing-sql-gate-in-ci/reviews/impl-review.md:79-87` — F5 (`TRUNCATE`) pominięty „na fazę 2 (migracja `revoke truncate` + sprawdzenie)”. Potwierdzony pomiarem wyżej.
- `context/archive/2026-09-28-testing-sql-gate-in-ci/reviews/impl-review.md:59-67` — F3: ISOLATION 4 (przepięcie) bez kontrprzykładu właściciela. Nadal otwarte.
- `context/archive/2026-09-28-testing-sql-gate-in-ci/research.md:102` — znana luka schematu: brak ochrony UPDATE na `medications` i INSERT do tabel podrzędnych przy zamkniętym oknie. Nadal aktualne. UPDATE na `medications` zaplanowany w S-02.
- `context/archive/2026-09-22-medication-schema-rls/reviews/impl-review.md:33-50` — F1 dodał `medications_guard_delete` z rozpoznaniem kaskady po braku wiersza w `auth.users`. Ślepa plamka zapisana tam (:46) jest dziś zamknięta pomiarem: kaskada z `auth.users` przechodzi przy zamkniętym oknie, ręczne usunięcie jest blokowane.
- `context/archive/2026-09-22-medication-schema-rls/plan.md:219` — punkt 1.8 („usunięcie leku przechodzi przy zamkniętym oknie”) jest nieaktualny od F1. Sprawdzenie 7 zostało odwrócone.

Planowane tabele (roadmap.md): S-05 wpisy dzienniczka i ich objawy (:247-248), S-06 złożone pytania (:302), S-01 akceptacja regulaminu (:170, :177, miejsce zapisu nierozstrzygnięte). S-09 (:292-303) nie ma zaplanowanego mechanizmu usuwania konta poza kaskadą ze schematu. Ryzyko z :302 („zakres kasowania rośnie z każdą nową tabelą”) jest dokładnie tym, co ma zamknąć predykat domknięcia.

Wymagania: PRD `prd.md:154` (dane nieczytelne dla innych), `:155` (usunięcie konta kasuje wszystko, bez kopii), `:184` (płaski model uprawnień, zbiory wspólne tylko do odczytu).

## Related Research

- `context/archive/2026-09-28-testing-sql-gate-in-ci/research.md` — faza 1 rolloutu, stan bramki SQL przed tą fazą.

## Open Questions

Decyzje dla `/10x-plan`, nie luki w dowodach:

1. **Lista tabel wspólnych:** jawna lista w teście (5 nazw) czy znacznik w katalogu (`comment on table`, osobny schemat)? Lessons „Zakres zbioru … to filtr przy wczytywaniu, nie flaga w bazie” dotyczy wierszy, nie klasyfikacji tabel, więc go nie rozstrzyga. Lista jawna jest najtańsza. Przesądza, że dodanie tabeli wspólnej wymaga świadomego wpisu w teście. Tego właśnie chcemy.
2. **`revoke truncate` na tabelach konta i `revoke execute … from anon` na funkcji okna:** migracja w tej fazie (zmiana schematu przy fazie testowej) czy sprawdzenie katalogowe, które dziś oblewa i czeka na migrację? Sprawdzenie bez migracji zostawi bramkę czerwoną.
3. **Test zachowania dla każdej tabeli z domknięcia:** generowany z katalogu (dynamiczny SQL, wymaga danych testowych dla dowolnej tabeli) czy sprawdzenie katalogowe „każda tabela z domknięcia występuje w `account_isolation_checks.sql`”? Drugie jest tańsze, ale sprawdza obecność nazwy, nie pokrycie 4 operacji.
4. **Strażniki historii w katalogu:** lista oczekiwanych wyzwalaczy (nazwa, tabela, `tgenabled = 'O'`) wpisana w test. Lista ręczna jest tu właściwa, bo strażnik nie wynika z żadnej struktury, którą da się wyprowadzić.
5. **Okno korekty po S-05:** sprawdzenie prawdziwej treści okna należy do S-05, nie do tej fazy. Faza 2 może jedynie przygotować miejsce (sprawdzenie 8 i ISOLATION 0 zakładają otwarte okno).
6. **`smoke.mjs` `isolationTargets`:** zostaje ręczne czy dostaje sprawdzenie zgodności z domknięciem? Zależy od punktu 3.
