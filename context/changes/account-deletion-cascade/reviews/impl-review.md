<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Usunięcie konta (S-09)

- **Plan**: context/changes/account-deletion-cascade/plan.md
- **Scope**: Full plan (punkty 3.6 i 3.7 należą do czasu po merge'u i są otwarte)
- **Reviewed phases**: 1, 2, 3
- **Date**: 2026-10-11
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 2 warnings, 2 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | WARNING |
| Scope Discipline    | WARNING |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | WARNING |

## Bramki automatyczne (uruchomione przy przeglądzie, 11.10.2026)

- `npm run typecheck`: 0 błędów.
- `npm run lint`: 0 błędów; ostrzeżenia `no-console` w trasie jak w trasach-rodzeństwie.
- `npm test`: 392/392.
- `npm run db:check` (lokalne Supabase): wszystkie bramki `GATE_COMPLETE`, DELETION 1–5 OK, INVARIANT 7 OK.
- `npm run build`: przechodzi.
- `npm run smoke`: nie powtórzony przy przeglądzie (wymaga odsunięcia `.env`); wynik z 8bbfeac w `## Progress` (3.2).

## Findings

### F1 — Okno 5 minut pozwala usunąć konto bez hasła tuż po zwykłym logowaniu

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20261010120000_delete_own_account.sql:15-17, :41, :53-60
- **Detail**: Funkcja przyjmuje każdy wpis `password` w `amr` nie starszy niż 5 minut. Nie odróżnia logowania wykonanego przez trasę od zwykłego logowania na `/auth/signin`. Przez 5 minut po każdym logowaniu ktoś, kto ma token sesji (np. przez XSS — ciasteczka `@supabase/ssr` nie są HttpOnly, `src/lib/supabase.ts` nie zmienia domyślnych opcji), może wywołać `rpc('delete_own_account')` publicznym kluczem anon bez znajomości hasła. Komentarz migracji twierdzi, że sprawdzenie zamyka tę drogę — zamyka ją tylko poza oknem. Okno pochodzi z planu (plan go przewidział, kod jest zgodny). Pomiar w `change.md`: rozjazd zegarów lokalnie 0 s; nie zmierzone, czy odświeżenie tokenu zachowuje czas logowania.
- **Fix A ⭐ Recommended**: Skrócić okno do 60 sekund, poprawić komentarz w migracji (nowa migracja `create or replace`) i przesunąć granice w DELETION 3 / teście 4 min 59 s.
  - Strength: Trasa loguje i usuwa w jednym żądaniu (pomiar: 0 s różnicy), więc 60 s zostawia duży zapas, a okno ataku po zwykłym logowaniu spada pięciokrotnie.
  - Tradeoff: Nowa migracja i zmiana testów SQL; rozjazd zegarów powyżej 60 s dałby `sessionExpired` przy poprawnym haśle.
  - Confidence: MED — rozjazd zmierzony lokalnie, nie na produkcji.
  - Blind spot: Zegar serwera auth względem bazy na hostowanym Supabase; zachowanie `timestamp` po odświeżeniu tokenu.
- **Fix B**: Zostawić 5 minut, poprawić tylko komentarz, żeby uczciwie nazywał to okno jako ryzyko przyjęte.
  - Strength: Bez zmiany zachowania i testów; dokument mówi prawdę.
  - Tradeoff: Okno ataku zostaje; kto ma token, i tak czyta wszystkie dane konta, ale usunięcie jest nieodwracalne.
  - Confidence: HIGH — zmiana samego tekstu.
  - Blind spot: None significant.
- **Decision**: FIXED (Fix A) — okno 60 s; migracja poprawiona w miejscu, bo `supabase migration list --linked` pokazał, że `20261010120000` nie jest na produkcji. Granice testów: 59 s / 61 s. Zmienione: migracja, `account_deletion_checks.sql`, `CLAUDE.md:87`, sprostowanie w `plan.md`. `db reset` + `db:check` zielone; smoke nie powtórzony.

### F2 — Kolejność push / db push i niesprawdzone uprawnienia na produkcji

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Success Criteria
- **Location**: N/A (Progress 3.6, 3.7; gałąź `main` ahead 4 względem `origin/main`)
- **Detail**: Cztery commity zmiany leżą lokalnie na `main`. Push na `main` wdraża od razu na produkcję (CLAUDE.md, sekcja CI), a `db push` plan przewiduje dopiero po merge'u. Między wdrożeniem a `db push` trasa zwraca `deleteGeneric` (plan sam to nazywa w Migration Notes). Do tego lokalnie `postgres` jest superużytkownikiem, więc DELETION 4 nie wykryje braku uprawnień do `auth.users` na hostowanym Supabase. Wzorzec jest powszechny i najpewniej działa, ale jedynym dowodem będzie 3.7.
- **Fix A ⭐ Recommended**: Najpierw `npx supabase db push` i sprawdzenie listy migracji, potem push kodu, potem 3.7.
  - Strength: Funkcja na produkcji nikomu nie szkodzi przed wdrożeniem trasy (nic jej nie woła, `anon` nie ma `EXECUTE`), więc nie ma okna z niedziałającym ekranem.
  - Tradeoff: Odwraca kolejność z lekcji „Po merge'u migracji wykonaj db push” — trzeba to świadomie odnotować.
  - Confidence: HIGH — migracja dodaje wyłącznie funkcję, nie zmienia tabel.
  - Blind spot: Gdyby push kodu się opóźnił, funkcja wisi na produkcji bez trasy (nieszkodliwie).
- **Fix B**: Zgodnie z planem: push, zaraz po zielonym deployu `db push`, potem 3.7.
  - Strength: Trzyma się lekcji i planu bez wyjątku.
  - Tradeoff: Kilka minut, w których „Usuń konto” na produkcji zwraca błąd.
  - Confidence: HIGH.
  - Blind spot: None significant.
- **Decision**: FIXED (Fix A) — kolejność `db push` → push kodu → 3.7 zapisana w `plan.md` (Migration Notes). Sam `db push` i push kodu czekają na osobne polecenie autorki.

### F3 — DELETION 1: `anon` dostaje `42501`, nie `28000` jak w planie

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: supabase/tests/account_deletion_checks.sql:350
- **Detail**: Plan mówił „`anon` i rola bez sesji → `28000`”. `anon` nie ma `EXECUTE`, więc odpada wcześniej z `42501`; test łapie ten kod po nazwie. Kod jest poprawny, plan się mylił.
- **Fix**: Dopisać w planie przy DELETION 1 sprostowanie: `anon` → `42501` (brak `EXECUTE`), `28000` dla roli bez `sub`.
- **Decision**: FIXED — sprostowanie przy DELETION 1 w `plan.md`.

### F4 — Drobne dodatki spoza planu

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: src/pages/konto/usun.astro:20-22, :71-73; src/pages/api/account/delete.ts:70-74; README.md:214
- **Detail**: Dwa linki „Anuluj” na `/konto/usun` (plan: jeden); puste hasło mapowane na `wrongPassword`; akapit w README o krokach smoke usunięcia. Wszystko nieszkodliwe i spójne z resztą.
- **Fix**: Bez zmian w kodzie; ewentualnie usunąć górny link „Anuluj”, jeśli autorka woli jeden.
- **Decision**: DISMISSED — dwa linki to wzorzec stron usuwania leku i wpisu (`leki/[id]/usun.astro:70`, `dzienniczek/[id]/usun.astro:90`); zostaje dla spójności.
