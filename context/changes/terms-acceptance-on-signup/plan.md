# S-01: Konto z akceptacją warunków korzystania — plan wdrożenia

## Overview

Osoba zakładająca konto akceptuje warunki korzystania w wersji 1 („prototyp”) przez zaznaczenie pola z odnośnikiem do ich treści, po czym baza zapisuje datę i wersję akceptacji (FR-001, PRD `## Access Control`, roadmapa S-01, issue #12). Przed założeniem konta dostępna jest strona prywatności, do której prowadzi pasek „wersja demonstracyjna” (MS-02). Każde wejście do wnętrza sprawdza, czy konto zaakceptowało bieżącą wersję; starsza wersja albo brak akceptacji kieruje na ekran ponownej akceptacji. Ekrany logowania, rejestracji i potwierdzenia adresu przechodzą na układ Rozkładówki z makiety, po polsku i na tokenach kolorów (MS-03). Odnośnik z maila potwierdzającego dostaje własną trasę z komunikatem o sukcesie i o wygaśnięciu.

## Current State Analysis

- **Rejestracja** to natywny formularz POST bez walidacji po stronie serwera: `email`, `password` rzutowane `as string`, `confirmPassword` ignorowane (`src/pages/api/auth/signup.ts:7-9`). `signUp` bez `options.data` (`:15`). Surowy `error.message` z Supabase trafia do adresu i na ekran (`:17-18`, `src/pages/auth/signup.astro:5`) — łamie rozstrzygnięcie #34. Sukces zawsze prowadzi na `/auth/confirm-email` (`:21`).
- **Logowanie**: ten sam wzorzec i ten sam przeciek `error.message` (`src/pages/api/auth/signin.ts:7-21`). Sukces idzie na `/`, które kieruje zalogowaną osobę na `/dashboard` (`src/pages/index.astro`).
- **Potwierdzanie adresu**: na produkcji włączone — zmierzone 2026-10-07 przez `GET /auth/v1/settings`: `mailer_autoconfirm: false`. Lokalnie wyłączone (`supabase/config.toml:213`). Skutki:
  - na produkcji `signUp` nie zakłada sesji, więc akceptacji nie zapisze zwykłe zapytanie z sesją użytkowniczki;
  - dla istniejącego adresu produkcja zwraca udawany sukces, a lokalnie przychodzi błąd `user_already_exists`;
  - w aplikacji nie ma trasy obsługującej odnośnik z maila potwierdzającego. Jedyny `verifyOtp` to odzyskiwanie hasła (`src/pages/api/auth/password-reset-verify.ts:30`).
- **Sesja z `verifyOtp`** ma w `amr` metodę `otp`. Zbiór `NORMAL_SESSION_METHODS = {"password"}` (`src/lib/auth/recovery-session.ts:22`) uznaje ją za sesję z odnośnika resetu hasła i zamyka na ekranie nowego hasła (lesson „Nowa metoda logowania wymaga wpisu w NORMAL_SESSION_METHODS”).
- **Ekrany wejściowe** mają wygląd startera (`bg-cosmic`, `text-white`, gradienty), teksty po angielsku. Na liście `EXCEPTIONS` skanera kolorów z `removedBy: "S-01"` (`scripts/tokens/hardcoded-colors.mjs:17-33`) jest pięć plików:
  - `signin.astro` (7),
  - `signup.astro` (7),
  - `confirm-email.astro` (7),
  - `SignUpForm.tsx` (1),
  - `src/styles/starter-auth.css` (3).
- `confirm-email.astro:4` przełącza treść na `import.meta.env.DEV`.
- **Komponenty z S-10**: `FormField.tsx` (wyłącznie pole tekstowe z wymaganą ikoną), `ServerError.tsx`, `SubmitButton.tsx`, `PasswordToggle.tsx` są już na tokenach. `AuthCard.astro` to karta wyśrodkowana, czyli wariant odrzucony przy makietach (`design-draft.md:250-257`) — S-01 jej nie używa.
- **Middleware** (`src/middleware.ts`):
  - na każdym żądaniu `getUser()` i `getClaims()`, bez zapytań do tabel;
  - `PROTECTED_ROUTES` obejmuje `/dashboard` oraz pozycje `NAV_ITEMS` (`/leki`, `/dzienniczek`);
  - trasy `/api/*` nie są chronione. Każda z 9 tras sprawdza sesję sama (`if (!context.locals.user || context.locals.recoverySession)`), w dwóch stylach: JSON (`api/journal`, `api/registry/search`) i formularz z przekierowaniem (7 tras `api/medications/**`).
- **Pasek** `src/components/DemoBar.astro` bez odnośnika. Komentarz: „The link to the explanation is added by S-01”. Renderuje go `Layout.astro` na każdej stronie.
- **Bramki schematu**:
  - INV1 sam rozpoznaje tabelę z kluczem obcym do `auth.users` jako tabelę konta. Tabele wspólne to ręczna lista w `schema_invariants_checks.sql:77-90`, z kopią w `account_isolation_checks.sql`.
  - INV4 (`:239-291`) wymaga czterech polityk `to authenticated`. `using (false)` przechodzi.
  - `account_isolation_checks.sql` (ISOLATION 0, 3, 4, 5) wymaga, żeby właścicielka zmieniła, przepięła i usunęła swój wiersz. Tabela tylko do dopisywania tam nie przejdzie, a sposobu na wyłączenie nie ma.
  - INV7 przepuszcza funkcje wyzwalaczy.
  - INV8 ma ręczną listę wyzwalaczy-strażników.
- **Wzorce**:
  - strażnicy historii: `security definer`, `set search_path = ''`, `raise exception` bez kodu (P0001), przepuszczanie kaskady sprawdzeniem `not exists (select 1 from auth.users …)` (`20261005130000_symptom_journal.sql:223-262`);
  - teksty jako obiekt `as const` w `src/lib/copy/*.ts`, każdy moduł z własnym testem w `scripts/fr012/*-copy.test.mjs`;
  - testy wyłącznie w `scripts/**/*.test.mjs`, importują `.ts` z `src/lib`. Middleware nie da się zaimportować pod czystym Node (`astro:middleware`, `astro:env/server`).
- **Smoke** (`scripts/smoke.mjs`):
  - konta testowe zakłada `createAccount` (`:159-167`) bezpośrednim `client.auth.signUp`, z pominięciem formularza;
  - krok rejestracji (`:1575-1579`) wysyła tylko `email` i `password`;
  - kroki logowania oczekują przekierowania na `/` (`:629-640`, `:1162-1171`, `:1591-1600`).
- **Treść warunków v1** (`context/foundation/terms-of-use-v1.md`) ma dwa miejsca do uzupełnienia: `[data wdrożenia S-01]` i `[strona prywatności]`. Dwie linie trafiają w rdzenie filtra FR-012: „podstawą … dawkowania” (`odstaw`, `dawk`) i „…jest bezpieczne” (`bezpieczn`). Pomiar 2026-10-07.
- **Sentry (F-06)** nie jest wdrożony — roadmapa: `ready`.

## Desired End State

- **Przed zalogowaniem:**
  - `/prywatnosc` i `/warunki` są publiczne;
  - pasek „wersja demonstracyjna” na każdym ekranie ma odnośnik do `/prywatnosc`;
  - logowanie, rejestracja, „sprawdź skrzynkę”, potwierdzenie adresu, wygasły odnośnik i ponowna akceptacja są w Rozkładówce: lewa kartka `bg-sidebar`, prawa `bg-card`, na telefonie jedna strefa nad drugą. Napisy są wyłącznie z załącznika A.
- **Rejestracja** wymaga zaznaczenia pola „Akceptuję warunki korzystania” z odnośnikiem do `/warunki`. Serwer odrzuca formularz bez pola.
  - Przy założeniu konta baza dopisuje wiersz `terms_acceptances(user_id, version = 1, accepted_at = chwila utworzenia konta)`.
  - Istniejący adres kończy się tym samym ekranem „sprawdź skrzynkę” co nowy, lokalnie i na produkcji.
  - Żaden surowy błąd Supabase nie trafia do adresu ani na ekran.
- **Logowanie** przy złym haśle albo nieistniejącym koncie pokazuje jeden stały komunikat. Przy niepotwierdzonym adresie pokazuje komunikat o potwierdzeniu adresu.
- **Kontrola wersji**: zalogowana osoba bez akceptacji bieżącej wersji (`CURRENT_TERMS_VERSION = 1`):
  - z każdego ekranu wnętrza trafia na `/warunki/akceptacja`;
  - na każdym `/api/*` poza `/api/auth/*` i `/api/terms/*` dostaje 403 `{"error":"termsNotAccepted"}`.
  - Ekran akceptacji ma „Akceptuję” (zapis wersji i daty, wejście do wnętrza) oraz „Wyloguj się”, a także zdanie z odnośnikiem do `/prywatnosc` o usuwaniu konta.
- **Odnośnik z maila potwierdzającego** prowadzi na `/auth/confirm`. Przycisk potwierdza adres, zamyka powstałą sesję i pokazuje „adres potwierdzony — zaloguj się”. Wygasły albo zużyty odnośnik pokazuje ekran z formularzem zamówienia nowego, z odpowiedzią niezależną od tego, czy konto istnieje.
- **Wiersz akceptacji** jest nienaruszalny: właścicielka nie zmieni go ani nie usunie (sprawdzone w bramce izolacji). Znika tylko z kontem.
- **Pięć plików** zniknęło z `EXCEPTIONS`, a `starter-auth.css` nie istnieje.

### Key Discoveries:

- Akceptacja musi powstać w bazie przy tworzeniu konta, bo na produkcji `signUp` nie daje sesji (pomiar `mailer_autoconfirm: false`).
- `options.data` z `signUp` ląduje w `auth.users.raw_user_meta_data`. To wejście wyzwalacza `after insert on auth.users`, którego w projekcie jeszcze nie było (`grep "on auth."` w migracjach: brak).
- Sesja z `verifyOtp` (`amr: otp`) jest dla aplikacji sesją resetu hasła. Potwierdzenie adresu kończy się więc wylogowaniem, a nie nową metodą w `NORMAL_SESSION_METHODS` — dopisanie `otp` otworzyłoby wnętrze sesji z odnośnika resetu.
- `account_isolation_checks.sql` nie zna tabel tylko do dopisywania. Potrzebna jest jawna lista z odwróconymi asercjami, a nie wyłączenie kroków.
- Kolor lewej kartki Rozkładówki (`#CFC9B4`) to w makiecie ta sama rola co pas boczny (`design-draft.md:30`). Używamy `sidebar` / `sidebar-foreground`, bez nowego tokenu.
- Szablon maila na produkcji trzeba przenieść ręcznie do panelu, tak jak przy odzyskiwaniu hasła (`README.md:80-84`).

## What We're NOT Doing

- Usuwania konta w aplikacji — S-09. Do tego czasu strona prywatności wskazuje mail do autorki, a ekran akceptacji odsyła do strony prywatności.
- Przeróbki ekranów odzyskiwania hasła z S-10 (`AuthCard`) na Rozkładówkę — osobna mała zmiana.
- Pełnej warstwy prawnej RODO, zgody z art. 9, listy podmiotów przetwarzających i zasad retencji — `## Parked` roadmapy.
- Wymieniania Sentry na stronie prywatności. Strona mówi o tym, co wdrożone. Dopisanie należy do F-06 (wymóg dopisany do roadmapy w fazie 2).
- Własnego nadawcy maili (F-05). Do jego wdrożenia mail potwierdzający dochodzi na produkcji tylko do członków zespołu projektu Supabase.
- Trybu „tylko do odczytu” bez akceptacji.
- Zachowania dowodu akceptacji po usunięciu konta — INV2 wymusza kaskadę, wiersze znikają z kontem.
- Uzupełniania formularza po błędzie (np. zachowania wpisanego e-maila).
- Zmian `NORMAL_SESSION_METHODS`.
- Wpisów do `PROTECTED_ROUTES` dla `/warunki` i `/prywatnosc` — są publiczne.
- Tłumaczenia polskich komentarzy z F-01 (`src/types.ts`) — osobna decyzja wg `CLAUDE.md`.

## Implementation Approach

- **Kolejność:** dane → treść → ekrany → kontrola → mail.
  - Faza 1 daje tabelę i zapis przy tworzeniu konta, zanim cokolwiek na nich polega.
  - Faza 2 tworzy strony, do których odsyłają formularz i pasek.
  - Faza 3 przebudowuje wejście i wymaga pola akceptacji.
  - Faza 4 zamyka wnętrze przed kontem bez akceptacji. Dopiero wtedy konta testowe smoke muszą nieść akceptację.
  - Faza 5 obsługuje mail, czyli jedyną część wymagającą ręcznego kroku w panelu produkcji.
- **Wdrożenie:** merge do `main` od razu wdraża na produkcję, więc całość trafia na `main` jednym merge'em, po `/10x-impl-review`. Żadna faza nie idzie na `main` osobno — inaczej konta zakładane na produkcji akceptowałyby warunki v1 bez daty, a późniejsze wpisanie daty zmieniłoby tekst wersji, która ma być niezmienna.
- **Data wejścia w życie** warunków v1 to dzień wdrożenia. Wpisuje ją osobny commit tuż przed merge'em, nie commit fazy 5 — commit fazy powstaje wcześniej i data byłaby zgadywaniem.
- **Wersje warunków:**
  - Numer wersji żyje w bazie (`terms_versions`, wspólna, tylko odczyt). Klucz obcy z `terms_acceptances.version` gwarantuje, że zaakceptować można tylko istniejącą wersję.
  - Tekst żyje w kodzie (`src/lib/copy/terms.ts`), a test pilnuje, że jest identyczny z plikiem w `context/foundation/`.
  - Bieżąca wersja to stała `CURRENT_TERMS_VERSION` w kodzie. Test pilnuje, że plik `terms-of-use-v<CURRENT>.md` istnieje, a migracje zawierają wiersz tej wersji.
  - Wersja 2 = nowy plik, nowy wiersz, zmiana stałej.
- **Kontrola wersji:**
  - decyzja w czystym module `src/lib/auth/terms-gate.ts`, testowalnym pod Node;
  - middleware tylko pyta bazę i wykonuje decyzję. Zapytanie idzie wyłącznie dla zalogowanej, nie-resetowej sesji na ścieżce objętej kontrolą;
  - błąd zapytania = brak akceptacji (fail closed), logowany sam kod.

## Critical Implementation Details

- **Wyzwalacz na `auth.users` nie może przerwać rejestracji.** Brak, nieliczbowa albo nieznana wartość `terms_version` w metadanych oznacza, że nie powstaje żaden wiersz i nie ma błędu: wyjątek w wyzwalaczu dałby 500 przy rejestracji. Brak wiersza wyłapie kontrola wersji przy pierwszym wejściu. Funkcja jest `security definer` z `set search_path = ''`, a `revoke execute` od `public, anon, authenticated`.
- **`accepted_at` ustawia baza.** Wyzwalacz `before insert` na `terms_acceptances` nadpisuje `accepted_at := now()`, więc wstawienie z poziomu klienta (polityka INSERT dla właścicielki) nie podrobi daty.
- **Kolejność w middleware.** Kontrola wersji idzie po regule sesji resetu hasła i po przekierowaniu niezalogowanych. Ścieżki zwolnione z kontroli:
  - `/warunki/akceptacja`,
  - `/api/terms/accept`,
  - `/api/auth/*`,
  - `/warunki`,
  - `/prywatnosc`,
  - ekrany `/auth/*`.

  Bez tych zwolnień powstaje pętla przekierowań albo niemożność wylogowania.

- **Potwierdzenie adresu przez POST, nie GET.** Skanery poczty otwierają odnośniki z maili, więc token zużywa dopiero przycisk — wzorzec `password-reset-verify.ts:13-14`. Po udanym `verifyOtp({ type: "email" })` od razu `signOut()`.

## Phase 1: Dane akceptacji

### Overview

Tabela wersji warunków, tabela akceptacji tylko do dopisywania, zapis akceptacji przez bazę przy tworzeniu konta i bramki SQL, które to mierzą.

### Changes Required:

#### 1. Migracja

**File**: `supabase/migrations/20261007130000_terms_acceptance.sql`

**Intent**: Baza zna wersje warunków i przechowuje nienaruszalną historię akceptacji każdego konta, zapisaną w chwili tworzenia konta.

**Contract**:

- `public.terms_versions(version smallint primary key check (version > 0), created_at timestamptz not null default now())`:
  - wiersz `version = 1`;
  - RLS włączone; polityka `SELECT` `to authenticated, anon` z `using (true)` — tabela wspólna, INV4 jej nie dotyczy, INV5 wymaga samego odczytu;
  - bez polityk zapisu, `revoke insert, update, delete, truncate` od `anon, authenticated`.
- `public.terms_acceptances`:
  - kolumny: `id uuid primary key default gen_random_uuid()`, `user_id uuid not null references auth.users(id) on delete cascade`, `version smallint not null references public.terms_versions(version)`, `accepted_at timestamptz not null default now()`;
  - `unique (user_id, version)` — jedna wersja to jeden fakt w historii, z datą pierwszej akceptacji. Podwójny klik, dwie karty albo ekran akceptacji pokazany po błędzie zapytania (fail closed) nie dopiszą drugiego wiersza, którego nie dałoby się usunąć. Ograniczenie daje też indeks dla kontroli wersji;
  - `comment on` tabeli i kolumn;
  - RLS w tej samej migracji, cztery polityki `to authenticated`:
    - `select` `using (user_id = auth.uid())`,
    - `insert` `with check (user_id = auth.uid())`,
    - `update` `using (false) with check (false)`,
    - `delete` `using (false)`;
  - `revoke truncate` od `anon, authenticated`.
- Wyzwalacz `terms_acceptances_set_accepted_at` (`before insert`): `accepted_at := now()`.
- Wyzwalacz-strażnik `terms_acceptances_guard` (`before update or delete`):
  - `raise exception` (P0001) z polskim komunikatem;
  - przy `delete` przepuszcza kaskadę, gdy wiersza `auth.users` już nie ma (wzorzec `symptom_journal.sql:258-262`).

  Druga warstwa za politykami `false` — chroni też przed rolą z obejściem RLS.

- Funkcja `public.record_terms_acceptance_on_signup()` + wyzwalacz `after insert on auth.users`:
  - gdy `new.raw_user_meta_data->>'terms_version'` pasuje do `^[0-9]+$` i istnieje w `terms_versions`, wstawia wiersz `(new.id, version)`;
  - w każdym innym przypadku nic nie robi;
  - `security definer`, `set search_path = ''`, `revoke execute … from public, anon, authenticated`.

#### 2. Bramki SQL

**File**: `supabase/tests/schema_invariants_checks.sql`, `supabase/tests/account_isolation_checks.sql`, `supabase/tests/terms_checks.sql` (nowy)

**Intent**: Bramki rozpoznają nowe tabele i mierzą, że akceptacja jest tylko do dopisywania, zamiast tego nie sprawdzać.

**Contract**:

- `terms_versions` dopisana do `shared_tables()` w obu plikach.
- Wyzwalacz `terms_acceptances_guard` dopisany do listy INV8. INV8 (`schema_invariants_checks.sql:415-480`) dostaje nowy przypadek kodu zdarzenia „UPDATE OR DELETE” (kod 24), bo żaden istniejący kod go nie obejmuje.
- `account_isolation_checks.sql` dostaje jawną listę `append_only_tables()` z `terms_acceptances`. Dla tabel z listy:
  - ISOLATION 3 i 5 wymagają, żeby właścicielka zmieniła i usunęła **0** wierszy, a wiersz pozostał bez zmian;
  - ISOLATION 4 (przepięcie) wymaga 0 wierszy i braku błędu **od obu kont** — także od konta B, które dla zwykłych tabel ma dostać błąd 42501 (`:534-617`, sprawdzenie w `:572`). Przy `using (false)` RLS nie zgłasza błędu, tylko zwraca pusty wynik;
  - przywracanie pierwotnej wartości jako `postgres` po ISOLATION 4 (`:606-613`) jest dla nich pomijane — strażnik rzuciłby P0001 przy każdym UPDATE, nawet bez zmiany wartości;
  - pozostałe kroki cudzego konta bez zmian.

  Lista wymaga komentarza z powodem („historia nie kłamie”). Tabela spoza listy dalej musi przejść stare asercje.

- Wiersz w mapie danych testowych dla `terms_acceptances`. Konto A ma w bramce trzy wiersze (`a_row`, `a_extra_row` i `c002` z ISOLATION 2), a `unique (user_id, version)` dopuszcza jeden na wersję. Dane testowe (ISOLATION 0) dopisują więc do `terms_versions` wersje testowe 2 i 3 jako `postgres`, a każdy wiersz konta A dostaje inną wersję. Plik kończy się `rollback`, więc wersje testowe nie zostają w bazie.
- `terms_checks.sql` (kończy się `GATE_COMPLETE terms_checks`, każde sprawdzenie łapie nazwany wynik, nie `when others`):
  - insert do `auth.users` z `raw_user_meta_data = {"terms_version":"1"}` tworzy dokładnie 1 wiersz akceptacji wersji 1;
  - z `{}`, z `{"terms_version":"abc"}` i z `{"terms_version":"99"}` — 0 wierszy i brak błędu;
  - `update` i `delete` wiersza akceptacji jako `postgres` kończą się `sqlstate 'P0001'`;
  - usunięcie konta z `auth.users` usuwa jego wiersze akceptacji;
  - insert z jawnym `accepted_at = '2000-01-01'` zapisuje `now()`;
  - drugi insert tej samej wersji dla tego samego konta kończy się `unique_violation`, a konto dalej ma 1 wiersz tej wersji.

#### 3. Typy

**File**: `src/types.ts`

**Intent**: Encja akceptacji dla middleware i smoke.

**Contract**: `TermsAcceptance { id: string; user_id: string; version: number; accepted_at: string }`.

#### 4. Probe bramki

**File**: `scripts/db-checks/probes/` (nowa próbka)

**Intent**: Dowód, że nowa asercja tabel tylko do dopisywania umie być czerwona.

**Contract**: Próbka dodaje politykę `update … using (user_id = auth.uid())` na `terms_acceptances` i usuwa strażnika. `account_isolation_checks.sql` musi wtedy paść. Próbka podpięta tak samo jak istniejące (`expect_invariant_failure` w workflow CI).

### Success Criteria:

#### Automated Verification:

- Migracja stosuje się na czystej bazie: `npx supabase db reset`
- Wszystkie sprawdzenia SQL przechodzą, w tym nowe `terms_checks.sql`: `npm run db:check`
- Nowa próbka wywraca `account_isolation_checks.sql`, a istniejące próbki dalej ją wywracają
- Typy i lint: `npm run typecheck && npm run lint`

#### Manual Verification:

- W Studio konto założone z `terms_version: 1` w metadanych ma wiersz akceptacji z datą równą chwili utworzenia konta (`http://localhost:54323`)

**Implementation Note**: Po automatycznych sprawdzeniach zatrzymaj się na ręczne potwierdzenie autorki. Do kroku 1.5 agent podaje gotowy snippet do SQL Editora w Studio: insert do lokalnego `auth.users` z `raw_user_meta_data = '{"terms_version":"1"}'` i unikalnym adresem testowym, a pod nim zapytanie zestawiające `auth.users.created_at` z `terms_acceptances.accepted_at` tego konta. Formularz „Add user” w Studio nie ustawia metadanych, a formularz rejestracji z polem akceptacji powstaje dopiero w fazie 3. Snippet wyłącznie dla lokalnego Studio, nigdy dla produkcji.

---

## Phase 2: Warunki i prywatność

### Overview

Publiczne strony `/warunki` i `/prywatnosc`, odnośnik na pasku, teksty w module pilnowanym testami.

### Changes Required:

#### 1. Teksty

**File**: `src/lib/copy/terms.ts`

**Intent**: Jedno źródło treści warunków v1 i strony prywatności, sprawdzane testami.

**Contract**:

- `CURRENT_TERMS_VERSION = 1`.
- `TERMS_V1` jako struktura: tytuł, linia wersji z datą, sekcje (nagłówek + punkty) — brzmienie 1:1 z `context/foundation/terms-of-use-v1.md`. Miejsca do uzupełnienia:
  - data jako stała `TERMS_V1_EFFECTIVE_ON` (ISO). Do fazy 5 ma wartość `null` i strona pokazuje „wersja 1”; datę wpisuje osobny commit tuż przed merge'em (patrz `## Implementation Approach`);
  - odnośnik jako znacznik `{privacyLink}`.
- `PRIVACY_COPY` — brzmienie z załącznika A.2.

#### 2. Strony

**File**: `src/pages/warunki.astro`, `src/pages/prywatnosc.astro`

**Intent**: Strony do czytania, publiczne, przez `Layout.astro`, z kolumną tekstu na `bg-card`, czytelne na telefonie (reguły z `design-draft.md` `## Reguły czytelności`).

**Contract**: Trasy `/warunki` i `/prywatnosc`, bez wpisu w `PROTECTED_ROUTES`, bez danych z bazy. `/warunki` renderuje `TERMS_V1` z linkiem do `/prywatnosc`. Każda strona ma odnośnik powrotu do `/auth/signin`.

#### 3. Pasek

**File**: `src/components/DemoBar.astro`

**Intent**: Pasek prowadzi do wyjaśnienia (MS-02, PRD `## Access Control`).

**Contract**: Po zdaniu odnośnik „Co to znaczy?” do `/prywatnosc` (załącznik A.1), na tokenach paska. Komentarz o S-01 usunięty.

#### 4. Testy

**File**: `scripts/fr012/terms-copy.test.mjs`, `scripts/fr012/corpus.mjs`, `scripts/terms/terms-text.test.mjs` (nowy)

**Intent**: Treść warunków w aplikacji nie odpłynie od zatwierdzonego pliku, a nowe napisy przejdą filtr języka.

**Contract**:

- `terms-copy.test.mjs`: każdy napis z `terms.ts` bez rdzeni zakazanych (wzorzec `journal-copy.test.mjs`).
- Dwie linie warunków jako nazwane wyjątki `ACCEPTED_TERMS_LINES` w `terms-copy.test.mjs` (dokładny tekst, dokładne rdzenie, powód): zdania wymagane przez PRD (`odstaw` w „podstawą”, `dawk`, `bezpieczn` w zaprzeczeniu bezpieczeństwa). Zmiana jednego słowa linii zdejmuje wyjątek.
  - Odstępstwo od pierwszej wersji planu (2026-10-07): `ACCEPTED_FALSE_POSITIVES` w `corpus.mjs` należy do opisów par i jego test wymaga frazy „może mieć związek”, więc linie warunków tam nie pasują.
  - Wyjątki wyłącznie dla warunków (v1 niezmienna). Teksty prywatności przeredagowane tak, żeby przeszły filtr — patrz A.2.
  - Wariant odłożony: wspólna lista zastrzeżeń FR-012 w `corpus.mjs` i test, że warunki każde z nich zawierają. Dokładany przy pisaniu wersji 2.
- `terms-text.test.mjs`:
  - punkty i nagłówki z `TERMS_V1` po podstawieniu znaczników są identyczne z blokiem między `---` w `terms-of-use-v1.md`;
  - plik `terms-of-use-v${CURRENT_TERMS_VERSION}.md` istnieje;
  - któraś migracja wstawia wiersz `terms_versions` o tym numerze.

#### 5. Roadmapa

**File**: `context/foundation/roadmap.md`

**Intent**: F-06 nie zapomni o stronie prywatności.

**Contract**:

- W `### F-06` dopisany wymóg: „dopisuje Sentry do `/prywatnosc` (`src/lib/copy/terms.ts`, `PRIVACY_COPY`) z informacją, że raporty błędów nie zawierają danych o zdrowiu”.
- W tabeli strumieni, wiersz `D`, zdanie „strona prywatności z `S-01` wymienia Sentry jako odbiorcę danych” zamienione na „Sentry na stronie prywatności dopisuje `F-06` przy wdrożeniu — `S-01` wymienia tylko to, co już działa”.
- Wiersz w `## At a glance` bez zmian.

### Success Criteria:

#### Automated Verification:

- Testy przechodzą, w tym nowe testy tekstów i języka: `npm test`
- Typy i lint: `npm run typecheck && npm run lint`
- Build: `npm run build`

#### Manual Verification:

- Autorka odczytuje region projektu w panelu Supabase i region na stronie prywatności się z nim zgadza (Settings → General)
- `/warunki` i `/prywatnosc` otwierają się bez logowania, na telefonie i na dużym ekranie, a odnośnik na pasku prowadzi do `/prywatnosc`
- Treść `/warunki` odpowiada słowo w słowo plikowi `terms-of-use-v1.md`

**Implementation Note**: Po automatycznych sprawdzeniach zatrzymaj się na ręczne potwierdzenie autorki.

---

## Phase 3: Logowanie i rejestracja w Rozkładówce

### Overview

Wspólny układ Rozkładówki, polskie formularze, pole akceptacji sprawdzane przez serwer, komunikaty bez zdradzania istnienia konta, wyjście ekranów z listy wyjątków kolorów.

### Changes Required:

#### 1. Układ

**File**: `src/layouts/AuthSpreadLayout.astro` (nowy)

**Intent**: Rozkładówka z makiety (`design-draft.md:99-111`) jako jedna rama wszystkich ekranów wejściowych S-01.

**Contract**:

- Opakowuje `Layout.astro`.
- Duży ekran: dwie połowy. Lewa `bg-sidebar text-sidebar-foreground` z nazwą produktu, nagłówkiem, trzema zdaniami i notą o prywatności z odnośnikiem do `/prywatnosc` na dole. Prawa `bg-card` ze slotem na treść. Krawędź z cieniem zagięcia pośrodku.
- Telefon: kolorowa strefa nad białą, trzy zdania ukryte.
- Napisy lewej kartki z A.3. Wyłącznie tokeny.

#### 2. Teksty ekranów wejściowych

**File**: `src/lib/copy/auth.ts` (nowy), `scripts/fr012/auth-copy.test.mjs` (nowy)

**Intent**: Wszystkie napisy logowania, rejestracji, ekranów potwierdzenia i akceptacji w jednym module (wzorzec `password-recovery.ts`), sprawdzonym filtrem języka.

**Contract**: `AUTH_COPY` z sekcjami:

- `spread`,
- `signIn`,
- `signUp`,
- `checkInbox`,
- `confirm`,
- `confirmExpired`,
- `acceptance`,
- `errors` (klucze = kody błędów z adresu).

Brzmienie z załącznika A.3–A.6. Test jak `journal-copy.test.mjs`.

#### 3. Formularze

**File**: `src/components/auth/SignInForm.tsx`, `src/components/auth/SignUpForm.tsx`, `src/components/auth/TermsCheckbox.tsx` (nowy)

**Intent**: Polskie formularze na tokenach. Rejestracja z wymaganym polem akceptacji.

**Contract**:

- Napisy z `AUTH_COPY`.
- `TermsCheckbox`:
  - natywny `<input type="checkbox" name="terms" value="accepted">` z etykietą zawierającą odnośnik do `/warunki` (otwierany w tej samej karcie);
  - błąd pola we wzorcu `FormField` (`role="alert"`, `aria-describedby`);
  - pole i obszar kliknięcia ≥ 44 px.
- Walidacja po stronie klienta: brak zaznaczenia blokuje wysłanie z komunikatem A.4.
- `text-blue-100/50` usunięte.

#### 4. Endpointy

**File**: `src/pages/api/auth/signup.ts`, `src/pages/api/auth/signin.ts`, `src/lib/auth/auth-errors.ts` (nowy)

**Intent**: Serwer wymaga akceptacji, przekazuje wersję do bazy i nigdy nie przepuszcza surowego błędu (#34).

**Contract**:

- `signup.ts`:
  - zod: `email` (e-mail), `password` (min `MIN_PASSWORD_LENGTH`), `confirmPassword` równe `password`, `terms` = `"accepted"`;
  - błąd walidacji → `/auth/signup?error=<kod>` z kodami `invalid`, `terms`, `password_mismatch`, `weak_password`;
  - `signUp({ email, password, options: { data: { terms_version: CURRENT_TERMS_VERSION } } })`;
  - `error.code === "user_already_exists"` → `/auth/confirm-email`, jak sukces;
  - `weak_password` → kod `weak_password`;
  - `over_email_send_rate_limit` / `over_request_rate_limit` → `rate_limit`;
  - każdy inny → `unknown`;
  - nieskonfigurowany Supabase → `unknown`.
- `signin.ts`:
  - `email_not_confirmed` → `?error=unconfirmed`;
  - każdy inny błąd → `?error=credentials`;
  - nieskonfigurowany Supabase → `?error=unknown`.
- `auth-errors.ts`: mapowanie `kod Supabase → kod adresu` jako czysta funkcja, testowana.
- Strony biorą komunikat wyłącznie z `AUTH_COPY.errors[kod]`. Nieznany kod = brak komunikatu.

#### 5. Strony

**File**: `src/pages/auth/signin.astro`, `src/pages/auth/signup.astro`, `src/pages/auth/confirm-email.astro`

**Intent**: Trzy ekrany w Rozkładówce, bez kolorów na sztywno.

**Contract**:

- Każda przez `AuthSpreadLayout`.
- `confirm-email.astro` jest ekranem „sprawdź skrzynkę” (A.5) z podpowiedzią o istniejącym koncie i odnośnikiem do `/auth/forgot-password`, bez gałęzi `import.meta.env.DEV`.
- `signin.astro` zachowuje odnośnik „Nie pamiętasz hasła?” i informację po zmianie hasła z S-10.

#### 6. Skaner kolorów

**File**: `scripts/tokens/hardcoded-colors.mjs`, `src/styles/starter-auth.css` (usunięty), `src/styles/global.css`

**Intent**: S-01 zdejmuje swoje pliki z listy wyjątków.

**Contract**: Pięć wpisów `removedBy: "S-01"` usuniętych. Import `starter-auth.css` z `global.css` usunięty, plik usunięty. Lista `EXCEPTIONS` nie dostaje nowego wpisu.

#### 7. Smoke

**File**: `scripts/smoke.mjs`

**Intent**: Bramka zna nowe zachowanie rejestracji i logowania. Formularze wysyła tak, jak przeglądarka (lesson o nagłówkach).

**Contract**:

- Krok rejestracji wysyła `confirmPassword` i `terms=accepted`.
- Nowe kroki:
  - rejestracja bez `terms` → 302 na `/auth/signup?error=terms` i brak konta w lokalnym `auth.users`;
  - rejestracja na istniejący adres → 302 na `/auth/confirm-email`, a `Location` nie zawiera `error`;
  - konto z formularza ma wiersz akceptacji wersji 1, odczytany własną sesją;
  - złe hasło → `/auth/signin?error=credentials`.

### Success Criteria:

#### Automated Verification:

- Testy przechodzą, w tym skaner kolorów bez pięciu wyjątków, kontrast i teksty: `npm test`
- Typy, lint i build: `npm run typecheck && npm run lint && npm run build`
- Smoke przeciw lokalnemu Supabase, po zatrzymaniu starego podglądu i odsunięciu `.env`: `npm run smoke`

#### Manual Verification:

- Logowanie i rejestracja wyglądają jak Rozkładówka na dużym ekranie i na telefonie (na telefonie strefa nad strefą, bez trzech zdań)
- Rejestracja bez zaznaczonego pola pokazuje komunikat przy polu, a odnośnik przy polu otwiera `/warunki`
- Rejestracja na adres, który ma już konto, kończy się tym samym ekranem co nowa
- Złe hasło i nieistniejący adres dają ten sam komunikat
- Żaden ekran wejściowy nie pokazuje przykładowego leku, objawu, daty ani godziny

**Implementation Note**: Po automatycznych sprawdzeniach zatrzymaj się na ręczne potwierdzenie autorki.

---

## Phase 4: Kontrola wersji i ponowna akceptacja

### Overview

Konto bez akceptacji bieżącej wersji nie wejdzie do wnętrza ani nie zapisze danych, dopóki nie zaakceptuje warunków albo się nie wyloguje.

### Changes Required:

#### 1. Reguła kontroli

**File**: `src/lib/auth/terms-gate.ts` (nowy), `scripts/auth/terms-gate.test.mjs` (nowy)

**Intent**: Decyzja o przekierowaniu jako czysta funkcja, testowana bez Astro.

**Contract**:

- `TERMS_ACCEPTANCE_PATH = "/warunki/akceptacja"`.
- `termsGateAction(path: string, latestAcceptedVersion: number | null, currentVersion: number): "allow" | "redirect" | "forbid"`:
  - ścieżki zwolnione: `/warunki`, `/prywatnosc`, `/warunki/akceptacja`, `/api/terms/*`, `/api/auth/*`, `/auth/*`, `/` → `allow`;
  - ścieżka chroniona (`PROTECTED_ROUTES`) przy `latest < current` albo `null` → `redirect`;
  - `/api/*` w tej samej sytuacji → `forbid`;
  - reszta → `allow`.
- `isTermsGatedPath(path)` mówi middleware, czy w ogóle pytać bazę.
- Normalizacja ścieżki jak `recovery-session.ts:45-48` (`.html`, końcowy ukośnik) — wspólna funkcja wydzielona, nie kopia.
- Testy:
  - każda ścieżka zwolniona;
  - `/leki/<uuid>`, `/dzienniczek/nowy`, `/api/journal`, `/api/medications/<uuid>/dosage`;
  - wersja `null`, `0`, równa i wyższa od bieżącej;
  - warianty `.html` i z ukośnikiem.

#### 2. Middleware

**File**: `src/middleware.ts`, `src/env.d.ts`, `src/lib/navigation.ts` (eksport `PROTECTED_ROUTES`, jeśli potrzebny do modułu)

**Intent**: Kontrola na każdym wejściu do wnętrza i każdym zapisie danych (decyzja planu: wariant „każde wejście”).

**Contract**:

- Po istniejących regułach, dla `locals.user && !locals.recoverySession && isTermsGatedPath(path)`: jedno zapytanie `terms_acceptances` o najwyższą `version` własnych wierszy, potem `termsGateAction`.
- `redirect` → `context.redirect(TERMS_ACCEPTANCE_PATH)`.
- `forbid` → `Response` 403 z `{"error":"termsNotAccepted"}` i `content-type: application/json`.
- Błąd zapytania → traktowany jak brak akceptacji; log `{ code }` bez adresu i identyfikatora.
- `/warunki/akceptacja` bez zalogowania → `/auth/signin` (wpis w `PROTECTED_ROUTES`).
- `Locals` bez nowego pola, chyba że ekran akceptacji go potrzebuje.

#### 3. Ekran i endpoint akceptacji

**File**: `src/pages/warunki/akceptacja.astro` (nowy), `src/pages/api/terms/accept.ts` (nowy)

**Intent**: Osoba bez akceptacji bieżącej wersji akceptuje ją albo się wylogowuje.

**Contract**:

- Ekran w `AuthSpreadLayout`, napisy z A.6:
  - odnośnik do `/warunki`;
  - formularz POST `/api/terms/accept` z przyciskiem „Akceptuję”;
  - formularz POST `/api/auth/signout` z przyciskiem „Wyloguj się”;
  - zdanie z odnośnikiem do `/prywatnosc` o usuwaniu konta.
- Wejście z już zaakceptowaną bieżącą wersją → przekierowanie na `/`.
- `accept.ts`:
  - `export const prerender = false`;
  - wymaga `locals.user` i braku sesji resetu, inaczej 401;
  - `insert` `{ user_id, version: CURRENT_TERMS_VERSION }` własną sesją (RLS) — wersja zawsze ze stałej, nigdy z formularza;
  - sukces → 303 na `/`;
  - błąd `23505` (wersja już zaakceptowana — podwójny klik, druga karta) → 303 na `/`, jak sukces;
  - każdy inny błąd → 303 na `/warunki/akceptacja?error=unknown`.

#### 4. Smoke

**File**: `scripts/smoke.mjs`

**Intent**: Konta testowe przechodzą kontrolę, a kontrola jest zmierzona w obu kierunkach. Tabela ma swoje cztery kroki izolacji (README `### Migracje`).

**Contract**:

- `createAccount` przekazuje `options.data.terms_version = 1` (konta z wierszem akceptacji).
- Tryb `SMOKE_EMAIL`: przed krokami konto musi mieć akceptację. Brak = krok czerwony z komunikatem, co zrobić — bez automatycznego dopisywania na koncie produkcyjnym.
- Nowe kroki:
  - konto bez metadanych: `/leki` → 302 na `/warunki/akceptacja`; `POST /api/journal` → 403 z `termsNotAccepted`; `/prywatnosc` → 200;
  - `POST /api/terms/accept` → 303 na `/`, potem `/leki` → 200;
  - wylogowanie z ekranu akceptacji działa;
  - izolacja `terms_acceptances`:
    - konto widzi wyłącznie własne wiersze;
    - nie odczyta cudzego po `id`;
    - nie zmieni ani nie usunie własnego ani cudzego (0 wierszy, każdy błąd = porażka kroku — lesson „Bramka musi odróżnić blokadę od niewykonania”);
    - klucz publiczny bez sesji zwraca 0 wierszy.

### Success Criteria:

#### Automated Verification:

- Testy reguły kontroli i całość: `npm test`
- Typy, lint i build: `npm run typecheck && npm run lint && npm run build`
- Smoke przeciw lokalnemu Supabase (stary podgląd zatrzymany, `.env` odsunięty): `npm run smoke`
- Sprawdzenia SQL: `npm run db:check`

#### Manual Verification:

- Konto bez akceptacji trafia na ekran akceptacji z każdego ekranu wnętrza, a pasek i `/prywatnosc` dalej działają (`/leki`, `/dzienniczek`, `/dashboard`)
- „Akceptuję” otwiera wnętrze, a w Studio jest nowy wiersz z bieżącą datą
- „Wyloguj się” z ekranu akceptacji wylogowuje i nie zapisuje akceptacji
- Konto z akceptacją nie widzi ekranu akceptacji i nie odczuwa spowolnienia ekranów wnętrza

**Implementation Note**: Po automatycznych sprawdzeniach zatrzymaj się na ręczne potwierdzenie autorki.

---

## Phase 5: Odnośnik potwierdzający adres

### Overview

Mail potwierdzający prowadzi do aplikacji, która potwierdza adres przyciskiem, wylogowuje powstałą sesję i mówi, co dalej. Wygasły odnośnik ma drogę do nowego. Faza kończy się datą wejścia w życie warunków v1 i krokami w panelu produkcji.

### Changes Required:

#### 1. Szablon i konfiguracja

**File**: `supabase/templates/confirmation.html` (nowy), `supabase/config.toml`

**Intent**: Odnośnik z `token_hash` działa na każdym urządzeniu i trafia do trasy aplikacji (wzorzec recovery).

**Contract**:

- `[auth.email.template.confirmation]` z tematem z A.7 i `content_path`.
- Odnośnik `{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=email`.
- `additional_redirect_urls` z `http://localhost:4321/auth/confirm` i `http://127.0.0.1:4321/auth/confirm`.
- `signup.ts` przekazuje `emailRedirectTo` = `<origin>/auth/confirm`.
- `enable_confirmations` lokalnie zostaje `false` — smoke i konta testowe zależą od sesji po rejestracji.

#### 2. Trasa potwierdzenia

**File**: `src/pages/auth/confirm.astro` (nowy), `src/pages/api/auth/email-confirm.ts` (nowy), `src/pages/api/auth/email-resend.ts` (nowy)

**Intent**: Token zużywa dopiero przycisk. Po potwierdzeniu nie zostaje sesja z `amr: otp`. Wygasły odnośnik ma drogę do nowego, bez zdradzania istnienia konta.

**Contract**:

- `confirm.astro` (Rozkładówka, A.7) ma trzy stany:
  - z `token_hash` i `type=email` — formularz POST z ukrytymi polami i przyciskiem „Potwierdź adres”;
  - `?confirmed=1` — „adres potwierdzony” z odnośnikiem do logowania;
  - `?expired=1` albo brak tokenu — ekran wygasłego odnośnika z formularzem e-maila POST `/api/auth/email-resend`.
- `email-confirm.ts`:
  - zod `{ token_hash: string.min(1), type: literal("email") }`;
  - `verifyOtp({ type: "email", token_hash })`;
  - sukces → `signOut()` → `/auth/confirm?confirmed=1`;
  - każdy błąd → `/auth/confirm?expired=1`.
- `email-resend.ts`: zod e-mail, `auth.resend({ type: "signup", email, options: { emailRedirectTo } })`. Zawsze → `/auth/confirm-email`, niezależnie od wyniku. Log sam kod błędu.
- Obie trasy: `export const prerender = false`, wpis ścieżek w zwolnieniach z kontroli wersji (`/auth/*`, `/api/auth/*` — już objęte).

#### 3. Smoke

**File**: `scripts/smoke.mjs`

**Intent**: Gałęzie dające się zmierzyć lokalnie są w bramce.

**Contract**:

- `POST /api/auth/email-confirm` ze złym `token_hash` → 302 na `/auth/confirm?expired=1`.
- `POST /api/auth/email-resend` na nieistniejący i istniejący adres → ten sam 302 na `/auth/confirm-email`.
- `GET /auth/confirm?token_hash=x&type=email` nie zużywa tokenu (200, formularz).

#### 4. Data wejścia w życie i dokumenty

**File**: `src/lib/copy/terms.ts`, `context/foundation/terms-of-use-v1.md`, `README.md`, `CLAUDE.md`

**Intent**: Warunki v1 dostają niezmienną datę. Ręczne kroki produkcji i nowe trasy są opisane tam, gdzie ich szukać.

**Contract**:

- `TERMS_V1_EFFECTIVE_ON` = dzień merge'a, wpisany osobnym commitem tuż przed merge'em, nie w commicie tej fazy. Ten sam dzień wpisany w miejsce `[data wdrożenia S-01]` w pliku foundation — test z fazy 2 pilnuje zgodności.
- `README.md` `## Supabase`:
  - kroki panelu dla szablonu potwierdzenia, analogiczne do recovery: temat, treść, Redirect URL `https://<adres produkcji>/auth/confirm`, ponowne otwarcie szablonu i sprawdzenie `token_hash … type=email`;
  - informacja, że produkcja ma potwierdzanie włączone, a lokalnie wyłączone.
- `CLAUDE.md` `### Auth`:
  - nowe endpointy i strony;
  - reguła: potwierdzenie adresu wylogowuje zamiast dopisywać `otp` do `NORMAL_SESSION_METHODS`;
  - kontrola wersji warunków w middleware i miejsce stałej `CURRENT_TERMS_VERSION`.

### Success Criteria:

#### Automated Verification:

- Testy: `npm test`
- Typy, lint i build: `npm run typecheck && npm run lint && npm run build`
- Smoke przeciw lokalnemu Supabase: `npm run smoke`
- Sprawdzenia SQL: `npm run db:check`

#### Manual Verification:

- Szablon potwierdzenia i Redirect URL wpisane w panelu produkcji, a ponownie otwarty szablon zawiera `token_hash` i `type=email`
- Po wdrożeniu pełna ścieżka maila na produkcji kończy się logowaniem do wnętrza bez ekranu akceptacji (rejestracja adresem członka zespołu Supabase, mail, przycisk, „adres potwierdzony”, logowanie)
- Ten sam odnośnik użyty drugi raz pokazuje ekran wygasłego odnośnika, a zamówienie nowego kończy się ekranem „sprawdź skrzynkę”
- Konto autorki na produkcji (bez wiersza akceptacji) po zalogowaniu trafia na ekran akceptacji, a „Akceptuję” zapisuje wersję 1 z datą
- `/warunki` na produkcji pokazuje datę wejścia w życie równą dniowi wdrożenia (data ostatniego biegu joba `deploy` w CI)

**Implementation Note**: Kroki w panelu produkcji wykonuje autorka ręcznie (infrastructure.md: operacje na produkcji wykonuje człowiek). Agent podaje dokładną treść do wklejenia.

---

## Testing Strategy

### Unit Tests:

- `terms-gate.test.mjs`: każda ścieżka zwolniona, ścieżki wnętrza i API, wersje `null` / niższa / równa / wyższa, normalizacja ścieżki.
- `auth-errors` (w `scripts/auth/`): `user_already_exists` → sukces, `email_not_confirmed` → `unconfirmed`, nieznany kod → `unknown` / `credentials`. Żaden wynik nie zawiera tekstu z Supabase.
- `terms-text.test.mjs`: tekst v1 w kodzie = plik foundation; plik i wiersz migracji dla bieżącej wersji istnieją.
- `terms-copy.test.mjs`, `auth-copy.test.mjs`: filtr FR-012 na każdym napisie.

### Integration Tests:

- `terms_checks.sql`: zapis przy tworzeniu konta (poprawne, brakujące, złe i nieznane metadane), strażnik `P0001`, kaskada, data nadpisana przez bazę, druga akceptacja tej samej wersji odrzucona.
- `account_isolation_checks.sql`: tabela tylko do dopisywania z odwróconymi asercjami + próbka, która musi ją wywrócić.
- Smoke: rejestracja z polem i bez, istniejący adres, stałe komunikaty logowania, kontrola wersji (302 / 403 / przejście po akceptacji), izolacja `terms_acceptances`, gałęzie potwierdzenia adresu dostępne lokalnie.

### Manual Testing Steps:

1. Otwórz `/prywatnosc` i `/warunki` bez logowania, na telefonie i na dużym ekranie.
2. Załóż konto bez zaznaczenia pola, potem z zaznaczeniem. Sprawdź wiersz akceptacji w Studio.
3. Zaloguj się kontem bez akceptacji i przejdź po `/leki`, `/dzienniczek`, `/dashboard`.
4. Zaakceptuj; potem w drugim koncie wyloguj się z ekranu akceptacji.
5. Na produkcji przejdź pełną ścieżkę maila potwierdzającego, w tym drugi klik w ten sam odnośnik.

## Performance Considerations

Kontrola wersji dokłada jedno zapytanie PostgREST na każdy ekran wnętrza i każde `/api/*` zalogowanej osoby — po indeksie `(user_id, version)`, bez renderowania. Na trzech ekranach z progiem LCP ≤ 2,5 s to jedno zapytanie więcej. Pomiar LCP należy do S-08. W fazie 4 autorka ocenia ręcznie, czy wnętrze nie zwolniło.

## Migration Notes

- Istniejące konta (autorki, testowe na produkcji) nie mają wiersza akceptacji. Po wdrożeniu przy pierwszym wejściu do wnętrza trafiają na ekran akceptacji — to zamierzone zachowanie, bez uzupełniania danych wstecz.
- Migracja nie usuwa ani nie zmienia istniejących danych. Wycofanie wymaga usunięcia wyzwalacza z `auth.users` przed tabelami.
- `npx supabase db push` dopiero po zielonym `smoke` w CI dla commita z migracją (README).

## References

- Roadmapa: `context/foundation/roadmap.md` `### S-01` (issue #12), `### F-06`, `### S-09`
- PRD: FR-001, FR-002, `## Access Control`, `## Non-Goals`, Open Questions 8 i 9
- Treść warunków: `context/foundation/terms-of-use-v1.md`
- Makieta: `context/changes/auth-login-design/design-draft.md` (`## Układy`, `## Zasady treści`, `## Treści do ustalenia`, `## Odrzucone i dlaczego`)
- Wzorce: `src/pages/api/auth/password-reset-verify.ts`, `src/lib/auth/recovery-session.ts`, `src/lib/copy/password-recovery.ts`, `supabase/migrations/20261005130000_symptom_journal.sql`, `scripts/fr012/journal-copy.test.mjs`
- Plan S-10: `context/changes/password-recovery/plan.md`

## Załącznik A: Projekt napisów

> Do zatwierdzenia przy przeglądzie planu. Implementacja przenosi zatwierdzone brzmienie bez zmian. Zasady: makieta `### Ton i język oznaczeń`, FR-012, komunikaty mówią, co poszło nie tak i co zrobić. Forma bezosobowa albo 2. osoba bez rodzaju gramatycznego tam, gdzie się da.

### A.1 Pasek

- Treść: „**Wersja demonstracyjna.** Nie wpisuj prawdziwych danych o zdrowiu.” (bez zmian, F-04)
- Odnośnik: „Co to znaczy?” → `/prywatnosc`

### A.2 Strona prywatności (`/prywatnosc`)

> Zmiana 2026-10-07 (faza 2): trzy sformułowania przeredagowane, bo trafiały w rdzenie filtra FR-012 (`prowadz`, `dawk`); region wpisany z panelu Supabase.

- Tytuł: „Prywatność w lekomapie”
- Wstęp: „Lekomapa jest prototypem w wersji demonstracyjnej. Wpisuj wyłącznie dane przykładowe.”
- **Kto odpowiada za serwis**
  - „testFit Anna Kryśko.”
  - „Kontakt: krysko.anna@gmail.com”
- **Jakie dane zbieramy**
  - „Adres e-mail i hasło konta. Hasło zapisujemy w postaci, z której nie da się go odczytać.”
  - „Datę i wersję zaakceptowanych warunków korzystania.”
  - „Wpisy, które sama lub sam dodajesz: leki, okresy ich przyjmowania i wpisy o samopoczuciu.”
  - „Adres e-mail jest daną osobową niezależnie od tego, że to prototyp.”
- **Gdzie leżą dane**
  - „Konta i wpisy przechowuje Supabase, w regionie Frankfurt nad Menem (Niemcy).”
  - „Aplikację uruchamia Cloudflare. Przy każdym połączeniu Cloudflare przetwarza dane techniczne, takie jak adres IP.”
  - „Maile z odnośnikami wysyła Supabase.”
- **Kto widzi twoje wpisy**
  - „Inne konta nie widzą twoich wpisów, a ty nie widzisz cudzych.”
  - „Osoba odpowiedzialna za serwis ma techniczny dostęp do bazy danych.”
- **Ciasteczka**
  - „Używamy wyłącznie ciasteczek potrzebnych do logowania. Nie ma reklam ani statystyk odwiedzin.”
- **Jak usunąć konto**
  - „Napisz z adresu konta na krysko.anna@gmail.com. Usunę konto razem ze wszystkimi wpisami, bez kopii.”
- **Na czas prototypu**
  - „Prototyp może zostać wyczyszczony albo wyłączony bez uprzedzenia, razem z kontami i wpisami.”
- Odnośniki na dole: „Warunki korzystania” → `/warunki`, „Wróć do logowania” → `/auth/signin`

### A.3 Lewa kartka Rozkładówki (wszystkie ekrany wejściowe)

> Zmiana 2026-10-07 (faza 3): zdanie 1 przeredagowane, bo trafiało w rdzeń filtra FR-012 (`dawk`); nota na dole zmieniona na prośbę autorki.

- Nazwa: „lekomapa”
- Nagłówek: „Dzienniczek leków i samopoczucia”
- Trzy zdania (tylko duży ekran):
  1. „Zapisuj leki, które przyjmujesz, i okresy ich przyjmowania.”
  2. „Notuj samopoczucie z datą i godziną.”
  3. „Przygotuj pytania na rozmowę z lekarzem.”
- Nota na dole: „Swoje wpisy widzisz tylko Ty.” + odnośnik „Prywatność” → `/prywatnosc`

### A.4 Logowanie i rejestracja

**Logowanie (`signIn`)**

- Nagłówek: „Witaj w lekomapie”
- Pola: „Adres e-mail”, „Hasło”
- Przycisk: „Zaloguj się” (w trakcie: „Logowanie...”)
- Odnośniki: „Nie pamiętasz hasła?”, „Nie masz konta? Załóż je”

**Rejestracja (`signUp`)**

- Nagłówek: „Załóż konto”
- Wstęp: „Konto zakładasz adresem e-mail i hasłem.”
- Pola: „Adres e-mail”, „Hasło”, „Powtórz hasło”. Podpowiedź pod hasłem: „Co najmniej 6 znaków.”
- Pole akceptacji: „Akceptuję [warunki korzystania].” (odnośnik → `/warunki`)
- Przycisk: „Załóż konto” (w trakcie: „Zakładanie konta...”)
- Odnośnik: „Masz już konto? Zaloguj się”

**Błędy (`errors`)**

- `credentials`: „Nieprawidłowy adres e-mail lub hasło. Sprawdź oba pola albo ustaw nowe hasło.”
- `unconfirmed`: „Ten adres nie jest jeszcze potwierdzony. Kliknij odnośnik z wiadomości, którą wysłaliśmy po rejestracji.”
- `terms`: „Zaznacz akceptację warunków korzystania, żeby założyć konto.”
- `invalid`: „Wpisz poprawny adres e-mail i hasło.”
- `password_mismatch`: „Hasła się różnią. Wpisz to samo hasło w obu polach.”
- `weak_password`: „Hasło jest za krótkie albo za proste. Użyj co najmniej 6 znaków.”
- `rate_limit`: „Za dużo prób w krótkim czasie. Spróbuj ponownie za kilka minut.”
- `unknown`: „Nie udało się wykonać tej operacji. Spróbuj ponownie za chwilę.”

### A.5 Sprawdź skrzynkę (`checkInbox`, `/auth/confirm-email`)

- Nagłówek: „Sprawdź skrzynkę”
- Treść: „Wysłaliśmy wiadomość z odnośnikiem potwierdzającym adres. Kliknij go, a potem zaloguj się.”
- Podpowiedź (zmiana 2026-10-07, faza 3 — dwie sytuacje rozdzielone, bo jedno zdanie sugerowało związek między nimi):
  - „Nie widzisz wiadomości? Sprawdź folder ze spamem.”
  - „Ten adres ma już konto? Zaloguj się albo [ustaw nowe hasło].” (→ `/auth/forgot-password`)
- Odnośnik: „Wróć do logowania”

### A.6 Ponowna akceptacja (`acceptance`, `/warunki/akceptacja`)

- Nagłówek: „Zaakceptuj warunki korzystania” — neutralny, bo w wersji 1 nikt na tym ekranie nie akceptował wcześniejszej wersji (konta sprzed S-01, konta bez metadanych). Wariant „Zmieniły się warunki” dopiero przy wersji 2, gdy ekran rozróżni brak akceptacji od starszej wersji.
- Treść: „Przeczytaj [warunki korzystania] w wersji {version}. Żeby korzystać dalej, zaakceptuj je.”
- Przycisk główny: „Akceptuję”
- Przycisk drugi: „Wyloguj się”
- Zdanie: „Jeśli nie chcesz ich akceptować, możesz usunąć konto — zobacz [Prywatność].”
- Błąd zapisu: komunikat `unknown` z A.4

### A.7 Potwierdzenie adresu (`confirm`, `confirmExpired`, `/auth/confirm`) i mail

- Temat maila: „Lekomapa: potwierdź adres e-mail”
- Treść maila: „Kliknij odnośnik, żeby potwierdzić adres konta w lekomapie.” + przycisk „Potwierdź adres” + „Jeśli to nie ty zakładasz konto, zignoruj tę wiadomość.”
- Ekran z tokenem:
  - nagłówek „Potwierdź adres e-mail”;
  - treść „Kliknij przycisk, żeby potwierdzić adres. Odnośnik działa tylko raz.”;
  - przycisk „Potwierdź adres”.
- Po potwierdzeniu:
  - nagłówek „Adres potwierdzony”;
  - treść „Możesz się teraz zalogować.”;
  - przycisk-odnośnik „Zaloguj się”.
- Wygasły odnośnik:
  - nagłówek „Odnośnik wygasł albo został już użyty”;
  - treść „Wpisz adres e-mail konta, a wyślemy nowy odnośnik.”;
  - pole „Adres e-mail”;
  - przycisk „Wyślij nowy odnośnik”;
  - odnośnik „Wróć do logowania”.

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Dane akceptacji

#### Automated

- [x] 1.1 Migracja stosuje się na czystej bazie: `npx supabase db reset` — aab040b
- [x] 1.2 Wszystkie sprawdzenia SQL przechodzą, w tym nowe `terms_checks.sql`: `npm run db:check` — aab040b
- [x] 1.3 Nowa próbka wywraca `account_isolation_checks.sql`, a istniejące próbki dalej ją wywracają — aab040b
- [x] 1.4 Typy i lint: `npm run typecheck && npm run lint` — aab040b

#### Manual

- [x] 1.5 W Studio konto założone z `terms_version: 1` w metadanych ma wiersz akceptacji z datą równą chwili utworzenia konta — aab040b

### Phase 2: Warunki i prywatność

#### Automated

- [x] 2.1 Testy przechodzą, w tym nowe testy tekstów i języka: `npm test` — 718e6c4
- [x] 2.2 Typy i lint: `npm run typecheck && npm run lint` — 718e6c4
- [x] 2.3 Build: `npm run build` — 718e6c4

#### Manual

- [x] 2.4 Autorka odczytuje region projektu w panelu Supabase i region na stronie prywatności się z nim zgadza — 718e6c4
- [x] 2.5 `/warunki` i `/prywatnosc` otwierają się bez logowania, na telefonie i na dużym ekranie, a odnośnik na pasku prowadzi do `/prywatnosc` — 718e6c4
- [x] 2.6 Treść `/warunki` odpowiada słowo w słowo plikowi `terms-of-use-v1.md` — 718e6c4

### Phase 3: Logowanie i rejestracja w Rozkładówce

#### Automated

- [x] 3.1 Testy przechodzą, w tym skaner kolorów bez pięciu wyjątków, kontrast i teksty: `npm test` — a350394
- [x] 3.2 Typy, lint i build: `npm run typecheck && npm run lint && npm run build` — a350394
- [x] 3.3 Smoke przeciw lokalnemu Supabase, po zatrzymaniu starego podglądu i odsunięciu `.env`: `npm run smoke` — a350394

#### Manual

- [x] 3.4 Logowanie i rejestracja wyglądają jak Rozkładówka na dużym ekranie i na telefonie — a350394
- [x] 3.5 Rejestracja bez zaznaczonego pola pokazuje komunikat przy polu, a odnośnik przy polu otwiera `/warunki` — a350394
- [x] 3.6 Rejestracja na adres, który ma już konto, kończy się tym samym ekranem co nowa — a350394
- [x] 3.7 Złe hasło i nieistniejący adres dają ten sam komunikat — a350394
- [x] 3.8 Żaden ekran wejściowy nie pokazuje przykładowego leku, objawu, daty ani godziny — a350394

### Phase 4: Kontrola wersji i ponowna akceptacja

#### Automated

- [x] 4.1 Testy reguły kontroli i całość: `npm test` — 34315ba
- [x] 4.2 Typy, lint i build: `npm run typecheck && npm run lint && npm run build` — 34315ba
- [x] 4.3 Smoke przeciw lokalnemu Supabase (stary podgląd zatrzymany, `.env` odsunięty): `npm run smoke` — 34315ba
- [x] 4.4 Sprawdzenia SQL: `npm run db:check` — 34315ba

#### Manual

- [x] 4.5 Konto bez akceptacji trafia na ekran akceptacji z każdego ekranu wnętrza, a pasek i `/prywatnosc` dalej działają — 34315ba
- [x] 4.6 „Akceptuję” otwiera wnętrze, a w Studio jest nowy wiersz z bieżącą datą — 34315ba
- [x] 4.7 „Wyloguj się” z ekranu akceptacji wylogowuje i nie zapisuje akceptacji — 34315ba
- [x] 4.8 Konto z akceptacją nie widzi ekranu akceptacji i nie odczuwa spowolnienia ekranów wnętrza — 34315ba

### Phase 5: Odnośnik potwierdzający adres

#### Automated

- [x] 5.1 Testy: `npm test`
- [x] 5.2 Typy, lint i build: `npm run typecheck && npm run lint && npm run build`
- [x] 5.3 Smoke przeciw lokalnemu Supabase: `npm run smoke`
- [x] 5.4 Sprawdzenia SQL: `npm run db:check`

#### Manual

- [ ] 5.5 Szablon potwierdzenia i Redirect URL wpisane w panelu produkcji, a ponownie otwarty szablon zawiera `token_hash` i `type=email`
- [ ] 5.6 Po wdrożeniu pełna ścieżka maila na produkcji kończy się logowaniem do wnętrza bez ekranu akceptacji
- [ ] 5.7 Ten sam odnośnik użyty drugi raz pokazuje ekran wygasłego odnośnika, a zamówienie nowego kończy się ekranem „sprawdź skrzynkę”
- [ ] 5.8 Konto autorki na produkcji trafia na ekran akceptacji, a „Akceptuję” zapisuje wersję 1 z datą
- [ ] 5.9 `/warunki` na produkcji pokazuje datę wejścia w życie równą dniowi wdrożenia
