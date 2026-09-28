# Odzyskiwanie dostępu przez ustawienie nowego hasła — plan wdrożenia

## Overview

S-10 z roadmapy (issue #36, FR-002, MS-03). Użytkowniczka, która nie pamięta hasła, prosi o odnośnik na adres konta, ustawia nowe hasło i loguje się nim. Wygasły albo zużyty odnośnik kończy się zrozumiałym komunikatem z drogą do nowego. Odnośnik jest jednorazowy, wygasa i nie otwiera dostępu do danych o zdrowiu bez ustawienia hasła.

## Current State Analysis

- W `src/` nie ma żadnej trasy resetu hasła ani odnośnika „nie pamiętasz hasła” (`src/pages/auth/signin.astro:15-20`).
- Endpointy auth to wyłącznie `src/pages/api/auth/{signin,signup,signout}.ts`. Błędy wracają przekierowaniem z `?error=` (`signin.ts:13,18`).
- Klient serwerowy `@supabase/ssr` wymusza `flowType: "pkce"` (`node_modules/@supabase/ssr/dist/main/createServerClient.js:37`). Domyślny link z maila zadziała więc tylko w przeglądarce, w której poproszono o reset.
- W aplikacji nie ma trasy wymieniającej kod lub token z maila na sesję (brak `verifyOtp`, `exchangeCodeForSession`).
- `src/middleware.ts:10-25` ustala użytkownika przez `getUser()` i chroni `PROTECTED_ROUTES`. Nie rozróżnia rodzaju sesji.
- Wspólne komponenty formularza mają kolory na sztywno i są na liście `EXCEPTIONS` (`scripts/tokens/hardcoded-colors.mjs:17-57`): `FormField.tsx` (10), `SubmitButton.tsx` (5), `ServerError.tsx` (3), `PasswordToggle.tsx` (2). Test (`hardcoded-colors.test.mjs:189-208`) wymaga, żeby plik bez kolorów na sztywno zniknął z listy.
- Ekrany auth są po angielsku, na tle `bg-cosmic` (`src/styles/starter-auth.css`), w `src/layouts/Layout.astro` z paskiem „wersja demonstracyjna”.
- Lokalny Supabase (`supabase/config.toml`): `site_url = "http://127.0.0.1:3000"` (:154), brak adresów `:4321` w `additional_redirect_urls` (:156), brak własnych szablonów maili, `otp_expiry = 3600` (:217), `minimum_password_length = 6` (:175).
- CI uruchamia Supabase z wyłączonym mailpitem (`.github/workflows/ci.yml:42`). `scripts/smoke.mjs` nie czyta maili.
- Produkcja: domyślny nadawca Supabase — dostarcza tylko na adresy członków zespołu projektu. Poza zakresem, pozycja F-05 w roadmapie.
- `zod` nie jest zainstalowany.

## Desired End State

- Na `/auth/signin` jest odnośnik „Nie pamiętasz hasła?” prowadzący do `/auth/forgot-password`.
- Po podaniu adresu użytkowniczka widzi zawsze ten sam ekran „jeśli konto istnieje, wysłaliśmy wiadomość” — niezależnie od tego, czy konto istnieje.
- Mail zawiera odnośnik do `/auth/reset-password/confirm?token_hash=…&type=recovery`. Otwarcie odnośnika na dowolnym urządzeniu pokazuje stronę z przyciskiem; samo otwarcie niczego nie zużywa.
- Kliknięcie przycisku zużywa odnośnik i przenosi na `/auth/reset-password`. Do czasu ustawienia hasła każda trasa wnętrza przekierowuje na ten ekran.
- Po zapisaniu hasła wszystkie sesje konta są zamknięte, użytkowniczka trafia na `/auth/signin` z informacją o zmianie hasła i loguje się nowym. Stare hasło nie działa.
- Odnośnik użyty drugi raz albo po czasie ważności pokazuje komunikat o wygasłym odnośniku z drogą do nowego.
- Nowe ekrany i cztery wspólne komponenty są na tokenach; komponenty zniknęły z `EXCEPTIONS`.
- `npm run smoke` na lokalnym Supabase przechodzi całą ścieżkę przez mailpit; CI ma mailpit włączony.

Weryfikacja: `npm test`, `npm run lint`, `npm run typecheck`, `npm run build`, `npm run smoke` na lokalnym Supabase oraz kroki ręczne z faz 2 i 3.

### Key Discoveries:

- `createServerClient` nadpisuje `flowType` na `"pkce"` bez względu na opcje (`createServerClient.js:37`). Ścieżka `token_hash` + `verifyOtp({ type: "recovery", token_hash })` działa niezależnie od przeglądarki, bo nie potrzebuje ciasteczka z weryfikatorem PKCE.
- `resetPasswordForEmail(email, { redirectTo })` udostępnia w szablonie `{{ .RedirectTo }}` i `{{ .TokenHash }}`. `redirectTo` musi być na liście dozwolonych adresów — lokalnie `additional_redirect_urls`, na produkcji „Redirect URLs” w panelu.
- Ograniczenie częstotliwości (`max_frequency`, `supabase/config.toml:213`) działa per adres. Błąd „za często” pojawia się tylko dla istniejącego konta, więc przekazany do UI zdradzałby istnienie konta.
- `@supabase/auth-js` 2.116.0 ma `getClaims()`, zwracające podpisane roszczenia sesji z `amr` (metody uwierzytelnienia). Lista `AMRMethods` w typach (`lib/types.d.ts:314`) nie wymienia `recovery`, więc to, co serwer wpisuje po `verifyOtp` typu recovery, trzeba zmierzyć, zanim powstanie bramka.
- W aplikacji sesje powstają dziś wyłącznie z logowania hasłem i z rejestracji. Każda inna metoda w `amr` oznacza w tej aplikacji sesję z odnośnika.
- Wzorzec formularza: `<form method="POST">` + wyspa React z walidacją po stronie klienta i `ServerError` z `?error=` (`SignInForm.tsx:18-80`).
- Smoke ma listę kroków `[nazwa, akcja, oczekiwany wynik]` (`scripts/smoke.mjs:441-464`), jeden słoik ciasteczek i wykrywanie lokalnego Supabase (`isLocalSupabase`, :38).

## What We're NOT Doing

- Własnego nadawcy maili (Resend, DNS, SMTP w Supabase) — pozycja F-05 w roadmapie. Do tego czasu mail dochodzi na produkcji tylko do członków zespołu projektu Supabase.
- Przebudowy ekranów logowania, rejestracji i potwierdzenia adresu ani ich tłumaczenia — S-01. Na `signin.astro` dochodzi wyłącznie odnośnik i informacja po zmianie hasła, bez nowych kolorów.
- Zmiany reguł siły hasła — S-10 stosuje te same co rejestracja (min. 6 znaków, `SignUpForm.tsx:8`, `config.toml:175`).
- Ostatecznych treści — napisy są robocze, zebrane w jednym pliku do podmiany. Pytanie #34 (czy ekrany zdradzają istnienie konta) zostaje formalnie otwarte; S-10 wdraża wariant „zawsze ten sam komunikat”.
- Zmiany hasła przez zalogowaną użytkowniczkę z poziomu ustawień konta.
- Automatycznego testu wygaśnięcia po czasie — sprawdzane ręcznie na skróconym `otp_expiry`.
- Maila z powiadomieniem o zmianie hasła (`auth.email.notification.password_changed`).
- Zdejmowania z `EXCEPTIONS` plików innych niż cztery wspólne komponenty (`SignUpForm.tsx`, strony auth i `starter-auth.css` należą do S-01).

## Implementation Approach

Trzy fazy od serwera do bramki. Faza 1 buduje mechanizm odnośnika i blokadę wnętrza bez ekranów — sprawdzalny ręcznie przez `curl` i lokalny mailpit. Faza 2 przepina wspólne komponenty na tokeny i dokłada ekrany. Faza 3 zamyka ścieżkę w smoke i CI oraz opisuje ręczną konfigurację produkcji.

Link z maila prowadzi na stronę, a nie od razu do zużycia tokenu: GET pokazuje przycisk, POST wywołuje `verifyOtp`. Skanery linków w skrzynkach pocztowych (np. Outlook) otwierają odnośniki GET-em i zużyłyby jednorazowy token, zanim użytkowniczka go kliknie.

Bramka „tylko ekran nowego hasła” opiera się na podpisanym roszczeniu `amr` sesji, nie na ciasteczku, które osoba z przechwyconym mailem mogłaby usunąć.

## Critical Implementation Details

- **Pomiar przed bramką.** Pierwszym krokiem fazy 1 jest zmierzenie `amr` z `getClaims()` dla trzech sesji na lokalnym Supabase: po logowaniu hasłem, po rejestracji (potwierdzenia wyłączone) i po `verifyOtp` typu recovery. Bramka rozpoznaje sesję z odnośnika regułą domykającą się bezpiecznie: sesją z odnośnika jest każda sesja, której `amr` zawiera metodę spoza zbioru zmierzonego dla logowania hasłem i rejestracji (oczekiwane: tylko `password`). Nie dopasowuje dokładnie nazwy metody z odnośnika — gdyby serwer nazwał ją inaczej niż w pomiarze, dokładne dopasowanie przepuściłoby sesję do wnętrza. Jeśli pomiar pokaże, że sesji z odnośnika nie da się odróżnić, implementacja staje i wraca do planowania — nie przechodzi po cichu na ciasteczko. W tym samym kroku zapisz algorytm podpisu tokenu: lokalnie z nagłówka tokenu, na produkcji z publicznego `https://<projekt>.supabase.co/auth/v1/.well-known/jwks.json` (pusta lista kluczy = HS256). Wynik pomiaru trafia do `change.md` w `## Notes`.
- **Pomiar limitu maili.** `supabase/config.toml:182` ma `email_sent = 2` na godzinę, a komentarz mówi, że limit wymaga SMTP — lokalnie może nie działać. W tym samym kroku pomiaru wyślij trzy prośby o odnośnik w ciągu godziny i sprawdź, czy trzeci mail dochodzi do mailpitu. Jeśli nie, podnieś `email_sent` lokalnie w `config.toml`. Wynik trafia do `change.md` razem z pomiarem `amr`. Bez tego smoke padnie na „brak maila”, bo trasa celowo połyka błąd.
- **Kolejność w zapisie hasła.** Najpierw `updateUser({ password })`, dopiero po sukcesie `signOut({ scope: "global" })`. Odwrotna kolejność zostawi konto ze starym hasłem i bez sesji do ponowienia.
- **Żaden błąd z `resetPasswordForEmail` nie trafia do UI.** Poza błędem walidacji adresu i brakiem konfiguracji Supabase każdy wynik kończy się tym samym przekierowaniem na ekran „wysłaliśmy”; błąd idzie do `console.error` bez adresu e-mail.

## Phase 1: Mechanizm odnośnika i blokada wnętrza

### Overview

Serwer potrafi wysłać mail z odnośnikiem działającym na każdym urządzeniu, wymienić go na sesję, zablokować wnętrze do czasu ustawienia hasła, zapisać nowe hasło i zamknąć wszystkie sesje. Bez ekranów — trasy API przekierowują na ścieżki, które powstaną w fazie 2.

### Changes Required:

#### 1. Konfiguracja lokalnego Supabase i szablon maila

**File**: `supabase/config.toml`, `supabase/templates/recovery.html`

**Intent**: Lokalny Supabase wysyła mail resetu z odnośnikiem `token_hash` zamiast domyślnego odnośnika PKCE i akceptuje adres przekierowania aplikacji na porcie 4321.

**Contract**:

- `additional_redirect_urls` zawiera `http://localhost:4321/auth/reset-password/confirm` i `http://127.0.0.1:4321/auth/reset-password/confirm`. `site_url` bez zmian.
- `[auth.rate_limit] email_sent` podniesione tylko wtedy, gdy pomiar limitu maili (Critical Implementation Details) pokaże, że limit działa lokalnie.
- Nowa sekcja `[auth.email.template.recovery]` z polskim `subject` i `content_path = "./supabase/templates/recovery.html"`.
- Szablon: krótki polski tekst (robocze), odnośnik `{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=recovery`, zdanie o ważności 1 godziny i o tym, że mail można zignorować, jeśli to nie Ty prosiłaś. Bez kolorów wymagających tokenów — plik jest poza `src/`, skaner go nie obejmuje, ale szablon zostaje minimalny.

#### 2. Zależność zod

**File**: `package.json`, `package-lock.json`

**Intent**: Pierwsze trasy z walidacją wejścia — zgodnie z konwencją w `CLAUDE.md` dociągają `zod`.

**Contract**: `zod` w `dependencies` przez `npm i zod`.

#### 3. Rozpoznanie sesji z odnośnika

**File**: `src/lib/auth/recovery-session.ts` (nowy)

**Intent**: Jedno miejsce z regułą „ta sesja powstała z odnośnika resetu” i listą tras dozwolonych w tym stanie, używane przez middleware i trasę zapisu hasła.

**Contract**:

- `isRecoverySession(claims): boolean` — `true`, gdy `amr` zawiera metodę spoza zbioru dozwolonych dla zwykłych sesji (zmierzonego w kroku pomiaru, patrz Critical Implementation Details). Komentarz w pliku: każda nowa metoda logowania (link magiczny, OAuth) musi trafić do tego zbioru, inaczej zamknie użytkowniczkę na ekranie nowego hasła.
- `RECOVERY_ALLOWED_PATHS` — `/auth/reset-password`, `/api/auth/password-update`, `/api/auth/signout`.
- `RESET_PASSWORD_PATH = "/auth/reset-password"`.

#### 4. Prośba o odnośnik

**File**: `src/pages/api/auth/password-reset-request.ts` (nowy)

**Intent**: Przyjmuje adres, wysyła mail przez Supabase i zawsze kończy tym samym ekranem, żeby nie zdradzać istnienia konta.

**Contract**:

- `POST`, `export const prerender = false`. Pole formularza `email`, walidacja zod (niepusty, format adresu).
- Zły format → 302 na `/auth/forgot-password?error=invalidEmail`. Brak konfiguracji Supabase → 302 na `/auth/forgot-password?error=notConfigured`. W adresie wyłącznie kod z `apiErrors`; strona bierze tekst z modułu treści i ignoruje nieznany kod (impl-review fazy 2, F2).
- `resetPasswordForEmail(email, { redirectTo: \`${context.url.origin}/auth/reset-password/confirm\` })`. Każdy wynik, także błąd → 302 na `/auth/forgot-password/sent`. Błąd logowany przez `console.error` bez adresu.

#### 5. Wymiana odnośnika na sesję

**File**: `src/pages/api/auth/password-reset-verify.ts` (nowy)

**Intent**: Zużywa jednorazowy token wyłącznie na świadome kliknięcie (POST), nigdy przy samym otwarciu linku.

**Contract**:

- `POST`, `export const prerender = false`. Pola `token_hash` (niepusty) i `type` (dokładnie `recovery`), walidacja zod.
- `verifyOtp({ type: "recovery", token_hash })`. Sukces → 302 na `/auth/reset-password`. Każdy błąd, także walidacji → 302 na `/auth/reset-password/confirm?expired=1`.

#### 6. Zapis nowego hasła

**File**: `src/pages/api/auth/password-update.ts` (nowy)

**Intent**: Ustawia nowe hasło wyłącznie w sesji z odnośnika, potem zamyka wszystkie sesje konta.

**Contract**:

- `POST`, `export const prerender = false`. Pola `password` i `password_confirm`, walidacja zod: min. 6 znaków, oba równe.
- Brak użytkownika albo sesja inna niż z odnośnika (`isRecoverySession` = false) → 302 na `/auth/reset-password/confirm?expired=1`.
- Błąd walidacji albo błąd `updateUser` (np. hasło takie jak poprzednie) → 302 na `/auth/reset-password?error=<kod z apiErrors>`. Kod z mapy błędów, nigdy surowy `error.message` z Supabase; strona zamienia kod na tekst i ignoruje nieznany (impl-review fazy 2, F2).
- Sukces `updateUser({ password })` → `signOut({ scope: "global" })` → 302 na `/auth/signin?reset=done`.
- Błąd `signOut` (hasło już zmienione, lokalna sesja usunięta przez `auth-js`, inne sesje mogą żyć) → `console.error` bez adresu e-mail, to samo 302 na `/auth/signin?reset=done`. Powtarzalną awarię łapie krok 12 smoke.

#### 7. Blokada wnętrza w trybie odzyskiwania

**File**: `src/middleware.ts`

**Intent**: Sesja z odnośnika nie otwiera wnętrza ani stron innych niż ekran nowego hasła — odnośnik z przechwyconego maila nie jest furtką do danych o zdrowiu.

**Contract**:

- Po ustaleniu użytkownika, gdy użytkownik istnieje: `getClaims()` i `isRecoverySession`. Wynik w `context.locals.recoverySession: boolean` (typ w `src/env.d.ts`).
- Sesja z odnośnika i ścieżka spoza `RECOVERY_ALLOWED_PATHS` → 302 na `/auth/reset-password`.
- Brak sesji z odnośnika i ścieżka `/auth/reset-password` → 302 na `/auth/reset-password/confirm?expired=1`.
- Zwykłe sesje i trasy publiczne — bez zmian w zachowaniu.

### Success Criteria:

#### Automated Verification:

- Lint przechodzi: `npm run lint`
- Typy przechodzą: `npm run typecheck`
- Build przechodzi: `npm run build`
- Testy tokenów przechodzą bez zmian: `npm test`

#### Manual Verification:

- Pomiar `amr` dla trzech rodzajów sesji zapisany w `change.md` i pokazuje rozróżnialną sesję z odnośnika
- Na lokalnym Supabase `curl` prośby o odnośnik dla istniejącego i nieistniejącego adresu daje identyczne przekierowanie; mail dla istniejącego konta widać w mailpicie z odnośnikiem `token_hash` na port 4321
- `curl` POST weryfikacji z tokenem z maila daje 302 na `/auth/reset-password`; drugi POST tym samym tokenem daje 302 na `/auth/reset-password/confirm?expired=1`
- W sesji z odnośnika `/dashboard` przekierowuje na `/auth/reset-password`; po zapisie hasła logowanie starym hasłem pada, nowym przechodzi

**Implementation Note**: Po automatycznej weryfikacji zatrzymaj się na ręczne potwierdzenie, zanim ruszy faza 2.

---

## Phase 2: Ekrany odzyskiwania i wspólne komponenty na tokenach

### Overview

Użytkowniczka przechodzi całą ścieżkę w przeglądarce, po polsku, w palecie z F-04. Cztery wspólne komponenty formularza przechodzą na tokeny i znikają z listy wyjątków skanera.

### Changes Required:

#### 1. Wspólne komponenty formularza na tokenach

**File**: `src/components/auth/FormField.tsx`, `SubmitButton.tsx`, `ServerError.tsx`, `PasswordToggle.tsx`, `scripts/tokens/hardcoded-colors.mjs`

**Intent**: Nowe ekrany mogą użyć istniejących komponentów bez kolorów na sztywno. S-01 dostaje je gotowe.

**Contract**:

- Wszystkie kolory przez tokeny z `src/styles/global.css` (np. `text-foreground`, `border-input`, `bg-primary`, `text-destructive`, `bg-destructive-surface`, `border-destructive-border`), łączone przez `cn()`. Czerwień (`destructive*`) wyłącznie w błędzie pola i `ServerError`.
- Błąd pola i `ServerError` mają słowo w treści poza kolorem (np. „Uwaga:”), zgodnie z `design-draft.md:144`.
- Cztery wpisy usunięte z `EXCEPTIONS`. Brak nowego wpisu.
- Tekst na przyciskach komponentów zostaje przekazywany przez rodzica. Angielskie napisy wewnątrz komponentów (np. `aria-label` w `PasswordToggle.tsx:14`) dostają prop z polskim domyślnym tekstem, żeby logowanie i rejestracja zachowały działanie.

#### 2. Napisy robocze

**File**: `src/lib/copy/password-recovery.ts` (nowy)

**Intent**: Wszystkie polskie napisy S-10 w jednym miejscu, do podmiany bez szukania po ekranach.

**Contract**: Eksportowany obiekt z napisami trzech ekranów, stanu wygasłego odnośnika, komunikatów błędów tras API i informacji po zmianie hasła. Ekran „wysłaliśmy” mówi zawsze: jeśli konto o tym adresie istnieje, wysłaliśmy wiadomość z odnośnikiem ważnym 1 godzinę. Trasy API z fazy 1 przechodzą na komunikaty z tego pliku.

#### 3. Karta ekranu wejściowego

**File**: `src/components/auth/AuthCard.astro` (nowy)

**Intent**: Wspólna rama ekranów odzyskiwania na tokenach — bez `bg-cosmic`. S-01 może ją przejąć albo zastąpić układem z makiety.

**Contract**: Props `title`. Tło strony `bg-background`, karta `bg-card text-card-foreground border-border`, slot na treść. Pasek „wersja demonstracyjna” zostaje z `Layout.astro`.

#### 4. Ekrany

**File**: `src/pages/auth/forgot-password.astro`, `src/pages/auth/forgot-password/sent.astro`, `src/pages/auth/reset-password/confirm.astro`, `src/pages/auth/reset-password.astro`, `src/components/auth/ForgotPasswordForm.tsx`, `src/components/auth/ResetPasswordForm.tsx` (nowe)

**Intent**: Trzy ekrany z roadmapy (prośba o adres, potwierdzenie wysłania, nowe hasło) plus strona pośrednia odnośnika z komunikatem o wygasłym odnośniku.

**Contract**:

- `/auth/forgot-password` — `ForgotPasswordForm` (`client:load`): pole adresu, walidacja jak w `SignInForm`, POST na `/api/auth/password-reset-request`, `ServerError` z `?error=`.
- `/auth/forgot-password/sent` — statyczny tekst z pliku napisów, odnośnik do logowania i do ponownej prośby.
- `/auth/reset-password/confirm` — z `token_hash` i `type=recovery` w adresie: zwykły formularz HTML (bez React) z ukrytymi polami i przyciskiem „Ustaw nowe hasło”, POST na `/api/auth/password-reset-verify`. Z `expired=1` albo bez tokenu: komunikat o wygasłym lub użytym odnośniku i odnośnik do `/auth/forgot-password`. Komunikat o wygaśnięciu bez czerwieni — to stan, nie błąd formularza.
- `/auth/reset-password` — `ResetPasswordForm` (`client:load`): nowe hasło i powtórzenie, `PasswordToggle`, podpowiedź o minimum 6 znaków, POST na `/api/auth/password-update`, `ServerError` z `?error=`. Pod formularzem osobny formularz POST na `/api/auth/signout` z przyciskiem „Anuluj i wyloguj” — jedyne wyjście z trybu odzyskiwania dla osoby, która przypomniała sobie stare hasło.
- Wszystkie cztery strony przez `Layout.astro` + `AuthCard.astro`, zero kolorów na sztywno.

#### 5. Logowanie: odnośnik i informacja po zmianie hasła

**File**: `src/pages/auth/signin.astro`

**Intent**: Wejście do ścieżki z ekranu logowania i potwierdzenie, że hasło zostało zmienione.

**Contract**:

- Odnośnik „Nie pamiętasz hasła?” do `/auth/forgot-password`, bez klas kolorów (dziedziczy kolor karty). Liczba naruszeń pliku w `EXCEPTIONS` zostaje 7.
- Przy `?reset=done` akapit `role="status"` z napisem z pliku napisów, bez klas kolorów. Napis mówi, że hasło zostało zmienione, i nie twierdzi, że wylogowano ze wszystkich urządzeń — przy błędzie `signOut` to nie byłaby prawda.

### Success Criteria:

#### Automated Verification:

- Skaner i kontrast przechodzą z czterema komponentami zdjętymi z `EXCEPTIONS`: `npm test`
- Lint przechodzi: `npm run lint`
- Typy przechodzą: `npm run typecheck`
- Build przechodzi: `npm run build`

#### Manual Verification:

- Cała ścieżka w przeglądarce na lokalnym Supabase: logowanie → „Nie pamiętasz hasła?” → adres → „wysłaliśmy” → odnośnik z mailpitu → przycisk → nowe hasło → logowanie z informacją o zmianie → logowanie nowym hasłem
- Odnośnik z maila otwarty w innej przeglądarce niż prośba działa
- Ekrany czytelne na szerokości telefonu (375 px): tekst co najmniej 15 px, pola i przyciski wyższe niż 44 px, bez poziomego przewijania
- Logowanie i rejestracja nadal działają i są czytelne z przepiętymi komponentami na tle `bg-cosmic`
- Brak angielskich napisów na nowych ekranach
- W sesji z odnośnika „Anuluj i wyloguj” kończy sesję; potem `/auth/signin` otwiera się normalnie, a logowanie starym hasłem przechodzi

**Implementation Note**: Po automatycznej weryfikacji zatrzymaj się na ręczne potwierdzenie, zanim ruszy faza 3.

---

## Phase 3: Bramka smoke, CI i konfiguracja produkcji

### Overview

CI mierzy całą ścieżkę przy każdym pushu, łącznie z jednorazowością odnośnika i zamknięciem starych sesji. Produkcja dostaje szablon maila i adres przekierowania.

### Changes Required:

#### 1. Mailpit w CI

**File**: `.github/workflows/ci.yml`

**Intent**: Lokalny Supabase w jobie `smoke` dostarcza maile do mailpitu, z którego czyta smoke.

**Contract**: `mailpit` usunięty z listy `-x` w `supabase start` (:42). Nic więcej w workflow.

#### 2. Kroki odzyskiwania w smoke

**File**: `scripts/smoke.mjs`

**Intent**: Bramka dowodzi każdej gwarancji S-10 konkretnym wynikiem, nie „brakiem błędu”.

**Contract**:

- Kroki działają tylko w trybie konta jednorazowego i przy lokalnym Supabase (`isLocalSupabase`). W innych trybach smoke wypisuje, że kroki odzyskiwania pominięto — nigdy nie zmienia hasła prawdziwego konta.
- `request(path, { method, form, jar })` — nowy parametr `jar`, domyślnie słoik główny; istniejące kroki bez zmian.
- `MAILPIT_URL` z domyślnym `http://127.0.0.1:54324`. Pobieranie maila przez API mailpitu z odpytywaniem do skutku z limitem czasu; brak maila po limicie = porażka kroku. Komunikat porażki wskazuje możliwe przyczyny: limit `email_sent` i błąd `resetPasswordForEmail` w `console.error` serwera — trasa zwraca ten sam 302 niezależnie od wyniku, więc sam status niczego nie mówi.
- Kroki, dołożone po istniejących:
  1. Prośba dla nieistniejącego adresu → 302 na `/auth/forgot-password/sent`, a w mailpicie brak wiadomości dla tego adresu.
  2. Prośba dla konta jednorazowego → ten sam 302; w mailpicie wiadomość z odnośnikiem na `/auth/reset-password/confirm` z `token_hash` i `type=recovery`.
  3. Równoległa sesja: logowanie tego konta przez supabase-js poza słoikiem ciasteczek (sesja „na innym urządzeniu”).
  4. GET odnośnika → 200. Samo otwarcie nie zużywa tokenu (dowodzi tego krok 5).
  5. POST weryfikacji → 302 na `/auth/reset-password`.
  6. `/dashboard` w sesji z odnośnika → 302 na `/auth/reset-password`.
  7. POST weryfikacji tym samym tokenem w osobnym, pustym słoiku (`new Map()`) → 302 na `/auth/reset-password/confirm?expired=1`. Słoik główny zostaje nietknięty — kroki 8–9 potrzebują sesji z odnośnika.
  8. POST zapisu z różnymi hasłami → 302 na `/auth/reset-password?error=`.
  9. POST zapisu z nowym hasłem → 302 na `/auth/signin?reset=done`.
  10. `/dashboard` → 302 na `/auth/signin`.
  11. Logowanie starym hasłem → 302 na `/auth/signin?error=`; nowym → 302 na `/`.
  12. Odświeżenie sesji równoległej z kroku 3 → błąd. Każdy inny wynik, także sukces, jest porażką kroku.

#### 3. Dokumentacja konfiguracji

**File**: `CLAUDE.md`, `README.md`

**Intent**: Szablon maila żyje w dwóch miejscach (repozytorium i panel produkcji) — bez zapisu ktoś zmieni jedno i nie zauważy drugiego.

**Contract**:

- `CLAUDE.md`, sekcja `### Auth`: nowe endpointy i strony, reguła sesji z odnośnika w `src/lib/auth/recovery-session.ts`, zdanie, że `supabase/templates/recovery.html` trzeba ręcznie przenieść do panelu produkcji przy każdej zmianie.
- `README.md`: w części o Supabase kroki produkcyjne z punktu 4 poniżej.

#### 4. Konfiguracja produkcji (ręcznie, w panelu Supabase)

**File**: — (panel produkcyjnego projektu Supabase)

**Intent**: Produkcja wysyła ten sam odnośnik co lokalnie i akceptuje adres przekierowania.

**Contract**:

- Authentication → Email Templates → Reset Password: temat i treść z `supabase/templates/recovery.html`.
- Authentication → URL Configuration → Redirect URLs: `https://<adres produkcji>/auth/reset-password/confirm`.
- Po zapisie w panelu odczytaj szablon z powrotem i potwierdź, że odnośnik zawiera `{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=recovery` — obecność szablonu nie jest dowodem jego treści.

### Success Criteria:

#### Automated Verification:

- Smoke przechodzi na lokalnym Supabase z mailpitem, łącznie z 12 krokami odzyskiwania: `npm run smoke` (po odsunięciu `.env` i ze świeżym `npm run preview`, zgodnie z `lessons.md`)
- Lint przechodzi: `npm run lint`
- Typy przechodzą: `npm run typecheck`
- Testy tokenów przechodzą: `npm test`
- Job `smoke` w CI przechodzi na pull requeście

#### Manual Verification:

- Wygaśnięcie: lokalnie `otp_expiry = 60`, restart Supabase, odnośnik kliknięty po ponad minucie pokazuje komunikat o wygasłym odnośniku; `otp_expiry` przywrócone do 3600
- Szablon i adres przekierowania ustawione w panelu produkcji i odczytane z powrotem
- Po wdrożeniu: reset na koncie autorki na produkcji — mail dochodzi, odnośnik prowadzi na adres produkcji, nowe hasło działa

**Implementation Note**: Po automatycznej weryfikacji zatrzymaj się na ręczne potwierdzenie. Kroki w panelu produkcji wykonuje autorka.

---

## Testing Strategy

### Unit Tests:

- Brak nowych testów jednostkowych — w repozytorium są tylko testy tokenów (`node:test`). Reguła `isRecoverySession` jest sprawdzana przez smoke na prawdziwych sesjach, bo jej wejście pochodzi z pomiaru serwera.

### Integration Tests:

- Smoke (faza 3): 12 kroków od prośby o odnośnik po unieważnienie równoległej sesji, na lokalnym Supabase w CI.

### Manual Testing Steps:

1. Pełna ścieżka w przeglądarce na lokalnym Supabase (faza 2).
2. Odnośnik otwarty w innej przeglądarce niż prośba (faza 2).
3. Wygaśnięcie na skróconym `otp_expiry` (faza 3).
4. Reset na koncie autorki na produkcji po wdrożeniu (faza 3).

## Performance Considerations

Middleware woła `getClaims()` tylko wtedy, gdy użytkownik jest zalogowany. Koszt zależy od algorytmu klucza: przy HS256 (lokalnie — brak `signing_keys_path`, `supabase/config.toml:162`) `getClaims()` woła `getUser()` przez sieć, więc zalogowane żądanie to dwa wywołania serwera auth zamiast jednego. Przy kluczu asymetrycznym weryfikacja idzie lokalnie po pobraniu JWKS. Algorytm lokalnie i na produkcji zapisuje pomiar z fazy 1; podwójne wywołanie na tym etapie akceptowane.

## Migration Notes

Brak migracji bazy. Zmiana konfiguracji: lokalnie w `supabase/config.toml`, na produkcji ręcznie w panelu (faza 3). Wycofanie: usunięcie szablonu z panelu przywraca domyślny odnośnik PKCE, który przestaje pasować do trasy `/auth/reset-password/confirm` — przy wycofaniu kodu wycofaj też szablon.

## References

- Roadmapa: `context/foundation/roadmap.md` — S-10 (issue #36), F-05 (nadawca maili), pytanie #34
- PRD: `context/foundation/prd.md:112` (FR-002)
- Makieta: `context/changes/auth-login-design/design-draft.md:144, 227-242`
- F-04: `context/archive/2026-09-26-app-shell-visual-foundation/plan.md`
- Wzorzec formularza: `src/components/auth/SignInForm.tsx`, `src/pages/api/auth/signin.ts`
- Lista wyjątków: `scripts/tokens/hardcoded-colors.mjs:17-57`, test `hardcoded-colors.test.mjs:189-208`
- Smoke: `scripts/smoke.mjs:441-464`; CI: `.github/workflows/ci.yml:28-56`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Mechanizm odnośnika i blokada wnętrza

#### Automated

- [x] 1.1 Lint przechodzi: `npm run lint` — f97d255
- [x] 1.2 Typy przechodzą: `npm run typecheck` — f97d255
- [x] 1.3 Build przechodzi: `npm run build` — f97d255
- [x] 1.4 Testy tokenów przechodzą bez zmian: `npm test` — f97d255

#### Manual

- [x] 1.5 Pomiar `amr` dla trzech rodzajów sesji zapisany w `change.md` i pokazuje rozróżnialną sesję z odnośnika — f97d255
- [x] 1.6 Na lokalnym Supabase `curl` prośby o odnośnik dla istniejącego i nieistniejącego adresu daje identyczne przekierowanie; mail dla istniejącego konta widać w mailpicie z odnośnikiem `token_hash` na port 4321 — f97d255
- [x] 1.7 `curl` POST weryfikacji z tokenem z maila daje 302 na `/auth/reset-password`; drugi POST tym samym tokenem daje 302 na `/auth/reset-password/confirm?expired=1` — f97d255
- [x] 1.8 W sesji z odnośnika `/dashboard` przekierowuje na `/auth/reset-password`; po zapisie hasła logowanie starym hasłem pada, nowym przechodzi — f97d255

### Phase 2: Ekrany odzyskiwania i wspólne komponenty na tokenach

#### Automated

- [x] 2.1 Skaner i kontrast przechodzą z czterema komponentami zdjętymi z `EXCEPTIONS`: `npm test` — 54b175f
- [x] 2.2 Lint przechodzi: `npm run lint` — 54b175f
- [x] 2.3 Typy przechodzą: `npm run typecheck` — 54b175f
- [x] 2.4 Build przechodzi: `npm run build` — 54b175f

#### Manual

- [x] 2.5 Cała ścieżka w przeglądarce na lokalnym Supabase: logowanie → „Nie pamiętasz hasła?” → adres → „wysłaliśmy” → odnośnik z mailpitu → przycisk → nowe hasło → logowanie z informacją o zmianie → logowanie nowym hasłem — 54b175f
- [x] 2.6 Odnośnik z maila otwarty w innej przeglądarce niż prośba działa — 54b175f
- [x] 2.7 Ekrany czytelne na szerokości telefonu (375 px): tekst co najmniej 15 px, pola i przyciski wyższe niż 44 px, bez poziomego przewijania — 54b175f
- [x] 2.8 Logowanie i rejestracja nadal działają i są czytelne z przepiętymi komponentami na tle `bg-cosmic` — 54b175f
- [x] 2.9 Brak angielskich napisów na nowych ekranach — 54b175f
- [x] 2.10 W sesji z odnośnika „Anuluj i wyloguj” kończy sesję; potem `/auth/signin` otwiera się normalnie, a logowanie starym hasłem przechodzi — 54b175f

### Phase 3: Bramka smoke, CI i konfiguracja produkcji

#### Automated

- [x] 3.1 Smoke przechodzi na lokalnym Supabase z mailpitem, łącznie z 12 krokami odzyskiwania: `npm run smoke` (po odsunięciu `.env` i ze świeżym `npm run preview`, zgodnie z `lessons.md`) — 8d76504
- [x] 3.2 Lint przechodzi: `npm run lint` — 8d76504
- [x] 3.3 Typy przechodzą: `npm run typecheck` — 8d76504
- [x] 3.4 Testy tokenów przechodzą: `npm test` — 8d76504
- [x] 3.5 Job `smoke` w CI przechodzi na pull requeście — 8d76504

#### Manual

- [x] 3.6 Wygaśnięcie: lokalnie `otp_expiry = 60`, restart Supabase, odnośnik kliknięty po ponad minucie pokazuje komunikat o wygasłym odnośniku; `otp_expiry` przywrócone do 3600 — 8d76504
- [ ] 3.7 Szablon i adres przekierowania ustawione w panelu produkcji i odczytane z powrotem
- [ ] 3.8 Po wdrożeniu: reset na koncie autorki na produkcji — mail dochodzi, odnośnik prowadzi na adres produkcji, nowe hasło działa
