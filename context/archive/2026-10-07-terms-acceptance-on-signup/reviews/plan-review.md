<!-- PLAN-REVIEW-REPORT -->

# Plan Review: S-01 Konto z akceptacją warunków korzystania

- **Plan**: context/changes/terms-acceptance-on-signup/plan.md
- **Mode**: Deep
- **Date**: 2026-10-07
- **Verdict**: REVISE → SOUND (after triage)
- **Findings**: 0 critical, 3 warnings, 3 observations

## Verdicts

| Dimension             | Verdict |
| --------------------- | ------- |
| End-State Alignment   | PASS    |
| Lean Execution        | PASS    |
| Architectural Fitness | PASS    |
| Blind Spots           | WARNING |
| Plan Completeness     | WARNING |

## Grounding

16/16 ścieżek ✓, 7/7 symboli ✓ (`MIN_PASSWORD_LENGTH` jest w `src/lib/copy/password-recovery.ts`), brief↔plan ✓, Progress↔Phase ✓

Sprawdzone i trzyma się:

- Polityki `terms_acceptances` przechodzą INV4: UPDATE ma `with check (false)`, a polityka INSERT jest.
- Wyzwalacz na `auth.users` nic nie robi przy braku metadanych. To warunek konieczny: 8 plików SQL wstawia do `auth.users` bez metadanych.
- Bramka podchwyci `terms_checks.sql` sama, bez rejestracji.
- `matchesNavHref` dopasowuje prefiks, więc `/leki/<uuid>` jest objęte kontrolą.
- Smoke: plan aktualizuje zarówno `createAccount`, jak i krok rejestracji formularzem.

## Findings

### F1 — Bramka izolacji: odwrócenie asercji niepełne

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Completeness
- **Location**: Faza 1 — §2 Bramki SQL
- **Detail**: Plan mówi: „kroki cudzego konta bez zmian”. Kod mówi inaczej w trzech miejscach:
  - ISOLATION 4 wymaga od konta B błędu 42501 (`account_isolation_checks.sql:534-617`). Przy `using(false)` B dostaje cicho 0 wierszy, więc krok pada w linii 572, jeszcze przed sprawdzeniem właścicielki.
  - Po kroku 4 postgres przywraca pierwotną wartość przez UPDATE (606-613). Strażnik `terms_acceptances_guard` rzuci wtedy P0001, nawet bez zmiany wartości.
  - INV8 (415-480) nie ma kodu zdarzenia „UPDATE OR DELETE”. Strażnik na obu zdarzeniach nie przejdzie, dopóki ktoś nie dopisze nowego przypadku.
- **Fix A ⭐ Recommended**: Doprecyzuj kontrakt fazy 1:
  - dla tabel z `append_only_tables()` ISOLATION 4 wymaga 0 wierszy i braku błędu, także od konta B;
  - przywracanie z 606-613 jest dla nich pomijane;
  - INV8 dostaje przypadek „UPDATE OR DELETE” (kod 24) i wpis strażnika.
  - Strength: Jeden strażnik, jak w kontrakcie; bramka mierzy blokadę po obu stronach.
  - Tradeoff: Więcej gałęzi w pliku izolacji.
  - Confidence: HIGH — linie zweryfikowane.
  - Blind spot: Nie sprawdzono, czy inne miejsca bramki robią UPDATE jako postgres.
- **Fix B**: Dwa strażniki (osobno `before update` i `before delete`) zamiast jednego.
  - Strength: INV8 bez nowego kodu zdarzenia.
  - Tradeoff: Krok 4 i przywracanie i tak trzeba zmienić jak w A.
  - Confidence: HIGH.
  - Blind spot: None significant.
- **Decision**: FIXED (Fix A)

### F2 — Duplikaty akceptacji tej samej wersji

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Faza 1 (indeks), Faza 4 (`accept.ts`)
- **Detail**: Indeks `(user_id, version)` nie jest unikalny. Trzy drogi prowadzą do kilku wierszy tej samej wersji, a żadnego z nich nie da się usunąć, bo tabela jest tylko do dopisywania:
  - podwójny klik „Akceptuję”;
  - dwie karty przeglądarki naraz;
  - zapytanie kontroli wersji pada, plan każe wtedy przyjąć brak akceptacji, więc osoba z akceptacją widzi ekran akceptacji i dopisuje drugi wiersz.

  Plan nie mówi, czy powtórna akceptacja tej samej wersji jest osobnym faktem w historii, czy błędem.

- **Fix A ⭐ Recommended**: `unique (user_id, version)`. `accept.ts` traktuje błąd `23505` jak sukces (303 na `/`). Nowy krok w `terms_checks.sql`: drugi insert tej samej wersji daje `unique_violation`.
  - Strength: Jedna wersja to jeden fakt, z datą pierwszej akceptacji.
  - Tradeoff: Dodatkowa gałąź w `accept.ts` i w danych testowych izolacji (`insert_statement` musi wstawiać inną wersję albo inne konto).
  - Confidence: MED — dane testowe izolacji wstawiają `a_row` i `c002` dla tego samego konta, więc albo w `terms_versions` musi istnieć druga wersja, albo trzeba zmienić dane testowe.
  - Blind spot: Nie sprawdzono szczegółowo wpływu na dane testowe ISOLATION 2 i 6.
- **Fix B**: Duplikaty dozwolone. Zapisz w planie, że każdy wiersz to osobne kliknięcie, a kontrola bierze `max(version)`.
  - Strength: Bramki bez zmian.
  - Tradeoff: Historia ma szum, a „data akceptacji” staje się niejednoznaczna (pierwsza czy ostatnia?).
  - Confidence: HIGH.
  - Blind spot: None significant.
- **Decision**: FIXED (Fix A)

### F3 — Merge oznacza wdrożenie, a plan nie mówi, czy fazy idą jednym merge'em

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Faza 2 (`TERMS_V1_EFFECTIVE_ON = null`), Faza 5 (data = „dzień merge'a”)
- **Detail**: Merge do `main` od razu wdraża na produkcję. Gdyby faza 3 trafiła na `main` osobno:
  - konta zakładane na produkcji akceptowałyby warunki v1 bez daty;
  - faza 5 zmieniłaby potem tekst wersji, która ma być niezmienna.

  Do tego commit fazy 5 powstaje przed merge'em, więc „dzień merge'a” jest zgadywaniem. Data może się rozjechać o kilka dni z datą pierwszych akceptacji.

- **Fix**: Dopisz do Implementation Approach:
  - całość trafia na `main` jednym merge'em, po `/10x-impl-review`;
  - datę wpisuje osobny commit tuż przed merge'em, a nie commit fazy 5;
  - kryterium 5.9 sprawdza, że data jest równa dniowi wdrożenia.
- **Decision**: FIXED

### F4 — „Zmieniły się warunki” dla kont, które nigdy nie akceptowały

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Załącznik A.6
- **Detail**: Konto autorki na produkcji i konto ze złymi metadanymi trafią na ekran z nagłówkiem „Zmieniły się warunki korzystania”. Żadne z nich nigdy nie zaakceptowało wcześniejszej wersji, więc nagłówek mówi nieprawdę.
- **Fix**: Neutralny nagłówek „Zaakceptuj warunki korzystania” albo dwa warianty: przy `null` i przy starszej wersji.
- **Decision**: FIXED

### F5 — Ręczny krok 1.5 niewykonalny w Studio

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Faza 1 — Manual Verification
- **Detail**: Formularz „Add user” w Studio nie ustawia metadanych, a formularz rejestracji z polem akceptacji powstaje dopiero w fazie 3. Autorka nie ma jak założyć takiego konta bez SQL.
- **Fix**: Agent podaje gotowy snippet do SQL Editora w Studio (insert do `auth.users` z `terms_version`) albo krok przechodzi do fazy 3, gdzie konto powstaje formularzem.
- **Decision**: FIXED

### F6 — Roadmapa: notka strumienia D dalej obiecuje Sentry na stronie prywatności

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Faza 2 — §5 Roadmapa
- **Detail**: `roadmap.md` (tabela Streams, wiersz D) mówi: „strona prywatności z S-01 wymienia Sentry”. Faza 2 zmienia tylko `### F-06`, więc sprzeczność w roadmapie zostaje.
- **Fix**: Faza 2 poprawia też notkę strumienia D.
- **Decision**: FIXED
