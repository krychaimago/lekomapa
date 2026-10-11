# Usunięcie konta (S-09) — plan wdrożenia

## Overview

Użytkowniczka może sama usunąć konto z ekranu „Konto”, potwierdzając hasłem. Usunięcie kasuje bezpowrotnie wszystkie dane konta: leki, skład, okresy dawkowania, wpisy dzienniczka z objawami i zapis akceptacji warunków. Nie zostaje żadna kopia. Realizuje NFR usunięcia konta z PRD (`context/foundation/prd.md:167`) i zastępuje dzisiejszą ścieżkę „napisz maila” jako drogę podstawową (roadmapa S-09, issue #20).

## Current State Analysis

- **Kaskada w bazie już działa.** `delete from auth.users where id = X` usuwa wiersze konta z 6 tabel (`medications`, `medication_substances`, `dosage_periods`, `symptom_entries`, `symptom_entry_items`, `terms_acceptances`), także przy zamkniętym oknie korekty. Każda blokada usuwania przepuszcza kaskadę, gdy nie ma już wiersza rodzica:
  - `supabase/migrations/20260922120000_medication_schema.sql:377` (leki),
  - `supabase/migrations/20261005130000_symptom_journal.sql:260` (wpisy dzienniczka),
  - `supabase/migrations/20261007130000_terms_acceptance.sql:146` (akceptacje warunków).
- **Kaskadę sprawdzają testy SQL.** ISOLATION 6 (`supabase/tests/account_isolation_checks.sql:791-919`) i TERMS 4 (`supabase/tests/terms_checks.sql:183-206`). INVARIANT 2 (`supabase/tests/schema_invariants_checks.sql:140-212`) pilnuje, że każda nowa tabela konta jest osiągalna kaskadą.
- **Złożone pytania (S-06) nie są zapisywane.** Liczą się przy każdym wyświetleniu (`context/foundation/roadmap.md:292`), więc nie ma czego dla nich kasować.
- **Z aplikacji nie da się uruchomić usunięcia.** Nie ma funkcji, trasy ani ekranu. W konfiguracji nie ma klucza `service_role`. Aplikacja zna tylko `SUPABASE_URL` i `SUPABASE_KEY` (anon) z `astro.config.mjs:20-21`, a `context/deployment/deploy-plan.md:65` zabrania klucza `service_role` w kodzie.
- **Strona prywatności** odsyła dziś do maila: `src/lib/copy/terms.ts:91-92`.
- **Menu wnętrza** ma trzy pozycje (`src/lib/navigation.ts:8-12`). Usuwanie zawsze idzie przez osobną stronę potwierdzenia z formularzem HTML, bez okien dialogowych (`src/pages/leki/[id]/usun.astro`).

## Desired End State

- Menu ma czwartą pozycję „Konto”. Ekran pokazuje adres e-mail konta i prowadzi do „Usuń konto”.
- `/konto/usun` mówi, co zniknie i że nie da się tego cofnąć, i prosi o hasło.
  - Złe hasło: komunikat, konto zostaje.
  - Dobre hasło: konto i wszystkie dane znikają, ciasteczka sesji są czyszczone, użytkowniczka trafia na publiczną stronę „Konto usunięte”.
- Funkcji w bazie nie da się użyć z pominięciem hasła. Odmawia sesji bez świeżego logowania hasłem: sesji starszej niż 5 minut, sesji z odnośnika resetu hasła albo z potwierdzenia adresu.
- Strona prywatności wskazuje najpierw „Konto → Usuń konto”, a mail tylko jako drogę awaryjną: gdy nie da się zalogować albo osoba nie akceptuje nowej wersji warunków.
- Weryfikacja: `npm run db:check`, `npm test`, `npm run smoke` (lokalny Supabase) są zielone; ręczne przejście ścieżki w przeglądarce.

### Key Discoveries:

- Wszystkie blokady rozpoznają kaskadę po braku wiersza rodzica, nie po fladze sesji. Funkcja musi więc fizycznie usuwać wiersz `auth.users`. Miękkie usunięcie nie przeszłoby przez blokady (`20260922120000_medication_schema.sql:377`).
- INVARIANT 7 zabrania `anon` i `authenticated` wykonywania funkcji `security definer`. Wyjątek przewiduje sam komentarz testu (`schema_invariants_checks.sql:357`): funkcja wołana z przeglądarki sprawdza `auth.uid()` i dostaje jawny wyjątek.
- Wzorzec funkcji: `set search_path = ''`, `revoke execute … from public, anon, authenticated`. Samo `from public` nie wystarcza (`20261005130000_symptom_journal.sql:213-215`). Nazwane kody błędów, mapowane w trasie przez `DB_ERROR_CODES` (`src/pages/api/medications/[id]/delete.ts:14-17`).
- Wzorzec trasy usuwania: strażnik sesji odrzucający sesję z odnośnika resetu, zod, `Cache-Control: private, no-store`, przekierowanie 303 z kluczem błędu (`src/pages/api/journal/[id]/delete.ts`).
- Middleware woła `getUser()` (`src/middleware.ts:26-29`). Po usunięciu konta stare ciasteczko nie otwiera wnętrza, bo serwer auth nie zna już użytkownika. Kod błędu nie jest zmierzony.
- `scripts/auth/route-coverage.test.mjs:16-17` wymaga, by każda strona była publiczna, ekranem akceptacji albo wnętrzem. Prefiks `/auth/` jest publiczny, więc strona „Konto usunięte” leży pod `/auth/`. Pod `/konto/…` byłaby wnętrzem i przekierowywałaby na logowanie.
- Lekcje stosowane w tym planie:
  - **Bramka odróżnia blokadę od niewykonania:** łap nazwane kody, nie `when others`.
  - **Weryfikuj wartość, mierz przed poprawką:** kształt `amr` zmierzyć przed ustawieniem warunku.
  - **Żadnej nazwy leku ani dawki w URL.**
  - **Smoke wysyła nagłówki jak przeglądarka.**
  - **Po merge'u migracji `db push`.**

## What We're NOT Doing

- Klucz `service_role` i `auth.admin.deleteUser`: odrzucone, bo klucz omija izolację kont.
- Okno dialogowe (shadcn AlertDialog): zostaje wzorzec osobnej strony potwierdzenia.
- Mail potwierdzający usunięcie: bez F-05 maile z produkcji docierają tylko do zespołu projektu Supabase.
- Okres karencji, kosz, „przywróć konto” czy jakakolwiek kopia: NFR wprost tego zabrania.
- Wyjątek dla `/konto/usun` w bramce warunków (`src/lib/auth/terms-gate.ts`): zamiast tego mail awaryjny na stronie prywatności.
- Zmiana treści warunków w wersji 1 (`context/foundation/terms-of-use-v1.md`). Jest niezmienna i odsyła tylko do strony prywatności.
- Test E2E (Playwright).
- Ręczne usuwanie kont już zgłoszonych mailem: nie dotyczy kodu.
- Inne ustawienia na ekranie „Konto”, np. tryb ciemny: należą do S-11.
- Tłumaczenie polskich komentarzy F-01: osobna decyzja.

## Implementation Approach

Baza najpierw, potem cienka warstwa aplikacji, na końcu tekst, smoke i dokumenty.

Sprawdzanie hasła jest rozdzielone celowo:

- Trasa weryfikuje hasło oficjalnym API Supabase (`signInWithPassword` z adresem bieżącego konta). Supabase liczy próby i nakłada swój limit.
- Funkcja w bazie żąda dowodu tego logowania: wpisu `password` w `amr` tokenu, nie starszego niż 5 minut.

Dzięki temu bezpośrednie wywołanie funkcji z przeglądarki (klucz anon jest publiczny) nie omija hasła. Sesja z odnośnika resetu hasła też jest odrzucana, bo jej `amr` nie ma metody `password`.

## Critical Implementation Details

- **Kolejność w trasie.** Najpierw `signInWithPassword`, potem sprawdzenie, że zwrócony `user.id` równa się `locals.user.id`, potem `rpc("delete_own_account")` tym samym klientem (ma już nową sesję). Na końcu wyczyszczenie ciasteczek sesji. `signOut` po usunięciu może zwrócić błąd, bo sesji już nie ma — wtedy trzeba usunąć ciasteczka `sb-*` przez adapter niezależnie od wyniku. Faza 2 mierzy, co faktycznie wraca.
- **Kształt `amr` przed warunkiem.** Faza 1 zaczyna od pomiaru na lokalnym Supabase: jak wygląda `auth.jwt() -> 'amr'` po logowaniu hasłem (oczekiwane `[{"method":"password","timestamp":<unix s>}]`). Warunek funkcji pisze się pod zmierzony kształt, nie pod założenie.

## Faza 1: Funkcja usuwania konta w bazie

### Overview

Funkcja `delete_own_account()` usuwa konto wywołującej osoby, wyłącznie przy świeżym logowaniu hasłem. Testy SQL dowodzą odmów i zakresu usunięcia. INVARIANT 7 dostaje jawny wyjątek.

### Changes Required:

#### 1. Pomiar `amr`

**File**: brak zmian w repozytorium (wynik zapisany w `## Notes` w `context/changes/account-deletion-cascade/change.md`)

**Intent**: Zmierzyć na lokalnym Supabase, jakie `amr` ma token po `signInWithPassword` i po sesji z odnośnika resetu, zanim powstanie warunek w funkcji.

**Contract**: Notatka z kształtem `amr` dla obu sesji (metody i jednostka `timestamp`). Bez wartości tokenów.

#### 2. Migracja

**File**: `supabase/migrations/20261010120000_delete_own_account.sql`

**Intent**: Funkcja dla zalogowanej osoby, która fizycznie usuwa jej wiersz `auth.users`, żeby zadziałała istniejąca kaskada. Odmawia bez świeżego dowodu logowania hasłem.

**Contract**:

- `public.delete_own_account() returns void`, `security definer`, `set search_path = ''`, komentarz `comment on function` po angielsku.
- Brak `auth.uid()` → `raise … using errcode = '28000'`.
- W `auth.jwt() -> 'amr'` nie ma wpisu `method = 'password'` z `timestamp` ≥ `now() - interval '5 minutes'` → `errcode = 'AD001'` (komunikat po angielsku: fresh password sign-in required).
- `delete from auth.users where id = auth.uid()`. Zero usuniętych wierszy → `errcode = 'AD002'`.
- `revoke execute on function … from public, anon, authenticated; grant execute … to authenticated;`
- Okno 5 minut jako stała w treści funkcji, z komentarzem dlaczego: trasa wykonuje logowanie i usunięcie w jednym żądaniu, a zapas pokrywa rozjazd zegarów.

#### 3. Testy SQL

**File**: `supabase/tests/account_deletion_checks.sql` (nowy)

**Intent**: Dowieść, że funkcja usuwa tylko własne konto i tylko przy świeżym logowaniu hasłem, a każda odmowa zwraca konkretny kod.

**Contract**: Układ jak w `terms_checks.sql`: `begin … rollback`, bloki `do $$` z `raise notice '<NAME> OK'`, końcowy `GATE_COMPLETE`, własna pula UUID. Funkcje `pg_temp.*` żyją tylko w obrębie jednego pliku, więc plik definiuje własne:

- `pg_temp.create_account` — wzorem `terms_checks.sql:33-42`.
- `pg_temp.act_as(uid, amr jsonb)` — wzorem `correction_window_checks.sql:55-66`, z `amr` dołożonym do `request.jwt.claims`.
- `pg_temp.account_data_tables()` — trzecia kopia z `account_isolation_checks.sql:44-57`. Komentarz „keep identical” we wszystkich trzech plikach (`account_isolation_checks.sql`, `schema_invariants_checks.sql`, nowy) wymienia wszystkie trzy. Bez filtra po kolumnie `user_id`: `medication_substances`, `dosage_periods` i `symptom_entry_items` należą do konta przez `medication_id` / `entry_id` i filtr by je pominął.
  Sprawdzenia:
- DELETION 1: `anon` i rola bez sesji → `28000`. Łapany kod `28000`, nie `when others`.
- DELETION 2: `amr` bez metody `password` (np. `recovery`, `otp`) → `AD001`.
- DELETION 3: `amr` z `password` starszym niż 5 minut → `AD001`.
- DELETION 4: świeże `password` przy zamkniętych oknach korekty (technika `backdate` z `correction_window_checks.sql:81-112`). Konto A ma lek z okresem i wpis dzienniczka z objawem: wiersz A w `auth.users` znika, przed usunięciem test zapisuje `id` każdego wiersza konta A z każdej tabeli z `pg_temp.account_data_tables()` (wszystkie mają `id uuid primary key`), po usunięciu żaden z tych `id` nie istnieje; tak samo zapisane `id` konta B wszystkie istnieją. Zaraz po usunięciu `set constraints public.symptom_entries_require_item, public.symptom_entry_items_require_item immediate;`, potem z powrotem `deferred` (wzorzec `symptom_journal_checks.sql:128-134`) — plik kończy się `rollback`, więc bez tego odroczone wyzwalacze dzienniczka nigdy się nie wykonają.
- DELETION 5: `anon` nie ma `EXECUTE` (`has_function_privilege`), `authenticated` ma.

#### 4. Wyjątek w INVARIANT 7

**File**: `supabase/tests/schema_invariants_checks.sql`

**Intent**: Dopuścić `public.delete_own_account()` jako jedyną świadomą funkcję `security definer` wykonywalną przez `authenticated`, z uzasadnieniem w komentarzu.

**Contract**: Listy wyjątków dziś nie ma — komentarz `schema_invariants_checks.sql:351-357` ją tylko zapowiada, a funkcje okna korekty są sprawdzane na obecność (`:378-389`), nie wyłączane. Trzy zmiany:

1. Krok uprawnień (`:391-399`): sygnatura `public.delete_own_account()` wyłączona wyłącznie z warunku `has_function_privilege('authenticated', …)`. Warunek `anon` obejmuje ją dalej.
2. Nowy krok przed krokiem uprawnień: pada, gdy `to_regprocedure('public.delete_own_account()')` nie istnieje albo nie ma `prosecdef` — wzorzec kroku funkcji okna korekty.
3. Krok `search_path` (`:401-408`) bez zmian: wyjątek z niego nie zwalnia.
   Komentarz nad INVARIANT 7 dostaje uzasadnienie wyjątku: funkcja sprawdza `auth.uid()` i świeże `password` w `amr`.

### Success Criteria:

#### Automated Verification:

- Migracja wchodzi na czystą lokalną bazę: `npx supabase db reset`
- Wszystkie bramki SQL zielone, w tym nowe `account_deletion_checks.sql`: `npm run db:check`
- Testy jednostkowe zielone: `npm test`

#### Manual Verification:

- Kształt `amr` zmierzony i zapisany w `change.md`, a warunek funkcji mu odpowiada
- Przegląd migracji: brak `when others`, `search_path` pusty, grant tylko dla `authenticated`

**Implementation Note**: Po zielonych bramkach automatycznych zatrzymaj się na ręczne potwierdzenie przed fazą 2.

---

## Faza 2: Ekran „Konto”, potwierdzenie hasłem i trasa

### Overview

Pozycja „Konto” w menu, strona potwierdzenia z hasłem, trasa API wywołująca funkcję i publiczna strona „Konto usunięte”.

### Changes Required:

#### 1. Menu

**File**: `src/lib/navigation.ts`

**Intent**: Czwarta pozycja menu. Chroni `/konto` i `/konto/usun` automatycznie, razem z kontrolą akceptacji warunków.

**Contract**: `{ href: "/konto", label: "Konto" }` na końcu `NAV_ITEMS`. W `scripts/navigation/navigation.test.mjs` (obowiązkowo — test `:43-50` porównuje dokładną listę `["/leki", "/dzienniczek", "/wizyta"]` i bez zmiany padnie): dopisać `"/konto"` na końcu oczekiwanej listy oraz nowy test, że `NAV_ITEMS[3]` to `{ href: "/konto", label: "Konto" }` i `INTERIOR_ROUTES` zawiera `/konto`.

#### 2. Teksty

**File**: `src/lib/copy/account.ts` (nowy)

**Intent**: Wszystkie teksty ekranu konta, potwierdzenia, strony „Konto usunięte” i komunikaty błędów w jednym miejscu, wzorem `src/lib/copy/journal.ts`.

**Contract**:

- `ACCOUNT_COPY` z `apiErrors`, `AccountApiErrorCode = keyof …`, `apiErrorMessage(code)`.
- Klucze błędów: `wrongPassword`, `rateLimit`, `sessionExpired`, `deleteGeneric`.
- Treść potwierdzenia wymienia, co zniknie: leki razem z całą historią zmian, wpisy dzienniczka i zapis akceptacji warunków. Mówi, że pytania do lekarza powstają z tych danych i znikną razem z nimi, że nie zostaje kopia i że tego nie da się cofnąć.
- Teksty omijają rdzenie z `FORBIDDEN_WORDS` (`scripts/rpl/pairs.mjs:24-60`), w tym `dawk` (także „dawkowania”), `przesta`, `skutk`, `prowadz`, `wynikaj`, `bezpieczn`, `przyczyn`.
- Bez czerwieni (`destructive*` zakazane dla treści o lekach): przycisk w wariancie `outline`, jak `src/pages/leki/[id]/usun.astro:116-127`.

#### 3. Ekran „Konto”

**File**: `src/pages/konto.astro` (nowy)

**Intent**: Pokazuje adres e-mail zalogowanej osoby i link „Usuń konto” do `/konto/usun`. Przez `AppLayout`.

**Contract**: Strona SSR, bez React.

#### 4. Strona potwierdzenia

**File**: `src/pages/konto/usun.astro` (nowy)

**Intent**: Opis skutków, pole hasła (`type="password"`, `autocomplete="current-password"`), przycisk „Usuń konto”, link „Anuluj” do `/konto`. Błąd z `?error=<klucz>` w ramce `role="alert"`, wzorem `src/pages/leki/[id]/usun.astro:102-109`.

**Contract**: Formularz HTML `method="post"` na `/api/account/delete`. Hasło nigdy nie jest wypełniane ponownie ani nie trafia do URL.

#### 5. Trasa API

**File**: `src/pages/api/account/delete.ts` (nowy)

**Intent**: Weryfikuje hasło, usuwa konto funkcją z fazy 1, czyści ciasteczka sesji i przekierowuje na stronę „Konto usunięte”.

**Contract**:

- `export const prerender = false`, `POST`.
- Strażnik jak w `src/pages/api/journal/[id]/delete.ts`: brak użytkownika albo sesja z odnośnika resetu → 401.
- zod: `password` jako niepusty string z treści formularza.
- `Cache-Control: private, no-store` na każdej odpowiedzi.
- Kolejność według `## Critical Implementation Details`.
- Mapowanie błędów:
  - `invalid_credentials` → `wrongPassword`
  - 429 / `over_request_rate_limit` → `rateLimit`
  - `28000` / `AD001` → `sessionExpired`
  - reszta → `deleteGeneric`
- Błąd: 303 na `/konto/usun?error=<klucz>`. Sukces: 303 na `/auth/konto-usuniete`.
- Logowany tylko kod błędu, nigdy hasło ani adres e-mail.

#### 6. Strona „Konto usunięte”

**File**: `src/pages/auth/konto-usuniete.astro` (nowy)

**Intent**: Publiczne potwierdzenie, że konto i dane zostały usunięte, z linkiem do strony głównej. Publiczna przez prefiks `/auth/`, bez zmian w `route-coverage.test.mjs`.

**Contract**: Layout ekranów wejściowych (jak `src/pages/auth/signin.astro`), tylko tokeny kolorów. Strona jest nowa, więc nie trafia na listę `EXCEPTIONS` w `scripts/tokens/hardcoded-colors.mjs`.

#### 7. Testy jednostkowe

**File**: `scripts/account/account-copy.test.mjs` (nowy) oraz istniejące testy FR-012 w `scripts/fr012/`

**Intent**: Teksty konta przechodzą filtr słów zakazanych FR-012. Każdy klucz błędu z trasy ma tekst. `/konto` jest wnętrzem chronionym przez bramkę warunków.

**Contract**: `node --test`, asercje na obserwowalnym wyniku: tekst istnieje, filtr go przepuszcza, `termsGateAction("/konto/usun", null, 1)` zwraca `redirect`.

### Success Criteria:

#### Automated Verification:

- Typy: `npm run typecheck`
- Lint: `npm run lint`
- Testy jednostkowe, w tym pokrycie tras, menu, kolory na sztywno, FR-012 dla nowych tekstów: `npm test`
- Build: `npm run build`

#### Manual Verification:

- Na lokalnym Supabase: „Konto” widoczne w pasie bocznym i na pasku zakładek telefonu; ekran pokazuje adres e-mail
- Złe hasło na `/konto/usun` daje komunikat, a konto dalej się loguje
- Dobre hasło prowadzi na „Konto usunięte”; wejście na `/leki` przekierowuje na logowanie; ponowne logowanie tym kontem nie działa
- Zmierzone i zapisane w `change.md`: co zwraca `signOut` po usunięciu i że ciasteczka `sb-*` znikają

**Implementation Note**: Po zielonych bramkach automatycznych zatrzymaj się na ręczne potwierdzenie przed fazą 3.

---

## Faza 3: Strona prywatności, smoke i dokumenty

### Overview

Nowy tekst „Jak usunąć konto”, krok smoke przechodzący usunięcie przez aplikację i wpisy w dokumentach.

### Changes Required:

#### 1. Strona prywatności

**File**: `src/lib/copy/terms.ts` (sekcja „Jak usunąć konto”, linie 91-92)

**Intent**: Pierwszy punkt: „Konto → Usuń konto”, potwierdzenie hasłem, usunięcie natychmiastowe razem ze wszystkimi wpisami, bez kopii. Drugi punkt: gdy nie możesz się zalogować albo nie akceptujesz nowej wersji warunków, napisz z adresu konta na krysko.anna@gmail.com.

**Contract**: Ta sama struktura `PRIVACY_COPY.sections`. Brzmienie zatwierdza autorka w ręcznej weryfikacji. Tekst omija rdzenie z `FORBIDDEN_WORDS` (`scripts/rpl/pairs.mjs:24-60`), m.in. `dawk`, `przesta`, `skutk`, `prowadz`, `wynikaj` — `scripts/fr012/terms-copy.test.mjs` filtruje `PRIVACY_COPY`. Aktualizacja `scripts/terms/terms-text.test.mjs` i `scripts/fr012/terms-copy.test.mjs`, jeśli sprawdzają tę sekcję.

#### 2. Krok smoke

**File**: `scripts/smoke.mjs`

**Intent**: Przejść usunięcie konta przez aplikację na osobnym koncie jednorazowym, które ma dane. To jedyny test, który sprawdza prawdziwy zapis w bazie po usunięciu, łącznie z odroczonym wyzwalaczem wpisu dzienniczka.

**Contract**: Grupa `accountDeletionSteps` na końcu tablicy `steps`, po `passwordRecoverySteps`. Kroki:

1. Rejestracja nowego konta `smoke-deletion-<Date.now()>@example.com` i logowanie.
2. Dodanie leku i wpisu dzienniczka przez trasy aplikacji, tak jak robią to istniejące kroki.
3. POST `/api/account/delete` ze złym hasłem → 303 na `/konto/usun?error=wrongPassword`, potem logowanie dalej działa.
4. POST z dobrym hasłem → 303 na `/auth/konto-usuniete`.
5. Stare ciasteczko: GET `/leki` → 302 na `/auth/signin`.
6. Logowanie tym kontem → `/auth/signin?error=credentials`.

Pozostałe wymagania:

- Nagłówek `Origin` wyprowadzony tak, jak wysłałaby go przeglądarka ze strony `/konto/usun`.
- W trybie `SMOKE_EMAIL` (`usesExistingAccount`) oraz przy zapisach zdalnych cała grupa idzie jako `{ skip: … }` z powodem. Stałego konta nie wolno usunąć.

#### 3. Dokumenty

**File**: `CLAUDE.md` (sekcja `### Auth`), `README.md` (jeśli opisuje trasy lub ręczne usuwanie kont), `context/deployment/deploy-plan.md:109,139`

**Intent**:

- Dopisać trasę `src/pages/api/account/delete.ts`, strony `src/pages/konto.astro`, `src/pages/konto/usun.astro` i `src/pages/auth/konto-usuniete.astro`.
- Zapisać regułę: funkcja `delete_own_account` żąda świeżego `amr` z metodą `password`; nowa metoda logowania nie daje prawa do usunięcia konta bez decyzji.
- Ręczne usuwanie w panelu Supabase zostaje jako droga awaryjna i dla kont smoke.

**Contract**: Edycje prozy w istniejących sekcjach, bez nowych plików.

### Success Criteria:

#### Automated Verification:

- Testy jednostkowe, w tym tekst strony prywatności i FR-012: `npm test`
- Smoke na lokalnym Supabase z odsuniętym `.env`, przy zatrzymanym starym podglądzie: `npm run smoke`, z zielonymi krokami grupy usunięcia konta
- Typy i lint: `npm run typecheck` i `npm run lint`

#### Manual Verification:

- Autorka zatwierdza brzmienie sekcji „Jak usunąć konto” na `/prywatnosc`
- Pomiar przed smoke: konto testowe powstało w lokalnym `auth.users`, nie na produkcji
- Po merge'u: `npx supabase db push` na produkcję i lista migracji pokazuje `20261010120000_delete_own_account`
- Po wdrożeniu: usunięcie świeżo założonego konta testowego na produkcji przechodzi i konto znika z panelu Supabase

**Implementation Note**: Po zielonych bramkach automatycznych zatrzymaj się na ręczne potwierdzenie. Krok `db push` należy do czasu po merge'u.

---

## Testing Strategy

### Unit Tests:

- Teksty konta: każdy klucz błędu ma tekst, teksty przechodzą filtr FR-012.
- Bramka warunków: `/konto` i `/konto/usun` są wnętrzem objętym kontrolą akceptacji.
- Pokrycie tras: nowa strona publiczna pod `/auth/`, strony konta przez `NAV_ITEMS`.

### Integration Tests:

- SQL (`account_deletion_checks.sql`):
  - odmowy `28000` i `AD001` z nazwanymi kodami,
  - usunięcie własnego konta przy zamkniętych oknach,
  - nietknięte konto B,
  - uprawnienia `EXECUTE`.
- Smoke (`accountDeletionSteps`): pełna ścieżka przez aplikację na koncie z danymi, z prawdziwym zatwierdzeniem w bazie.

### Manual Testing Steps:

1. Zaloguj się na lokalnym Supabase, dodaj lek i wpis dzienniczka.
2. Otwórz „Konto” i sprawdź adres e-mail. Kliknij „Usuń konto”.
3. Wpisz złe hasło. Sprawdź komunikat i to, że konto zostało.
4. Wpisz dobre hasło. Sprawdź stronę „Konto usunięte”.
5. Wejdź na `/leki` — powinno przekierować na logowanie. Spróbuj zalogować się tym kontem — powinno się nie udać.
6. Sprawdź `/prywatnosc` — nowy tekst sekcji „Jak usunąć konto”.

## Performance Considerations

Brak. Usunięcie to jedno żądanie i kaskada na danych jednego konta.

## Migration Notes

- Migracja dodaje wyłącznie funkcję. Nie zmienia tabel ani danych.
- Wycofanie: `drop function public.delete_own_account()` w nowej migracji i usunięcie wyjątku z INVARIANT 7.
- Konta usunięte przed wycofaniem nie wracają. To zamierzone.
- Po merge'u `npx supabase db push` (lekcja „Po merge'u migracji wykonaj db push”). Bez tego trasa na produkcji zwraca `deleteGeneric` mimo zielonego CI.

## References

- Roadmapa: `context/foundation/roadmap.md` (S-09)
- PRD: `context/foundation/prd.md:167`, `:205`
- Plan S-01 (obietnica strony prywatności): `context/archive/2026-10-07-terms-acceptance-on-signup/plan.md:76`, `:763-764`
- Plan F-01 (kaskada i blokada usuwania leku): `context/archive/2026-09-22-medication-schema-rls/plan.md:100`, `:182`
- Wzorzec trasy usuwania: `src/pages/api/journal/[id]/delete.ts`
- Wzorzec strony potwierdzenia: `src/pages/leki/[id]/usun.astro`
- Kaskada w testach: `supabase/tests/account_isolation_checks.sql:791-919`
- Test-plan, ryzyko #6: `context/foundation/test-plan.md:45`, `:61`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Funkcja usuwania konta w bazie

#### Automated

- [x] 1.1 Migracja wchodzi na czystą lokalną bazę: `npx supabase db reset` — 072446b
- [x] 1.2 Wszystkie bramki SQL zielone, w tym nowe `account_deletion_checks.sql`: `npm run db:check` — 072446b
- [x] 1.3 Testy jednostkowe zielone: `npm test` — 072446b

#### Manual

- [x] 1.4 Kształt `amr` zmierzony i zapisany w `change.md`, a warunek funkcji mu odpowiada — 072446b
- [x] 1.5 Przegląd migracji: brak `when others`, `search_path` pusty, grant tylko dla `authenticated` — 072446b

### Phase 2: Ekran „Konto”, potwierdzenie hasłem i trasa

#### Automated

- [x] 2.1 Typy: `npm run typecheck` — a54e64f
- [x] 2.2 Lint: `npm run lint` — a54e64f
- [x] 2.3 Testy jednostkowe, w tym pokrycie tras, menu, kolory na sztywno, FR-012 dla nowych tekstów: `npm test` — a54e64f
- [x] 2.4 Build: `npm run build` — a54e64f

#### Manual

- [x] 2.5 Na lokalnym Supabase: „Konto” widoczne w pasie bocznym i na pasku zakładek telefonu; ekran pokazuje adres e-mail — a54e64f
- [x] 2.6 Złe hasło na `/konto/usun` daje komunikat, a konto dalej się loguje — a54e64f
- [x] 2.7 Dobre hasło prowadzi na „Konto usunięte”; wejście na `/leki` przekierowuje na logowanie; ponowne logowanie tym kontem nie działa — a54e64f
- [x] 2.8 Zmierzone i zapisane w `change.md`: co zwraca `signOut` po usunięciu i że ciasteczka `sb-*` znikają — a54e64f

### Phase 3: Strona prywatności, smoke i dokumenty

#### Automated

- [x] 3.1 Testy jednostkowe, w tym tekst strony prywatności i FR-012: `npm test`
- [x] 3.2 Smoke na lokalnym Supabase z odsuniętym `.env`, przy zatrzymanym starym podglądzie: `npm run smoke`, z zielonymi krokami grupy usunięcia konta
- [x] 3.3 Typy i lint: `npm run typecheck` i `npm run lint`

#### Manual

- [x] 3.4 Autorka zatwierdza brzmienie sekcji „Jak usunąć konto” na `/prywatnosc`
- [x] 3.5 Pomiar przed smoke: konto testowe powstało w lokalnym `auth.users`, nie na produkcji
- [ ] 3.6 Po merge'u: `npx supabase db push` na produkcję i lista migracji pokazuje `20261010120000_delete_own_account`
- [ ] 3.7 Po wdrożeniu: usunięcie świeżo założonego konta testowego na produkcji przechodzi i konto znika z panelu Supabase
