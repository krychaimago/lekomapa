<!-- PLAN-REVIEW-REPORT -->

# Plan Review: Nazwy leków i substancji poza adresami URL

- **Plan**: context/changes/medication-names-out-of-urls/plan.md
- **Mode**: Deep
- **Date**: 2026-10-12
- **Verdict**: SOUND
- **Findings**: 0 critical, 2 warnings, 2 observations

## Verdicts

| Dimension             | Verdict |
| --------------------- | ------- |
| End-State Alignment   | PASS    |
| Lean Execution        | PASS    |
| Architectural Fitness | PASS    |
| Blind Spots           | WARNING |
| Plan Completeness     | WARNING |

## Grounding

15/15 ścieżek ✓, 4/4 symboli ✓, brief↔plan ✓, Progress↔fazy ✓

Potwierdzone w kodzie: `?wariant=` to id z `registry_products`, a zapis z rejestru nie używa pola `nazwa` (`api/medications/index.ts:36-41`). Ciasteczka z `context.cookies` docierają do przeglądarki także przy `new Response(303)` (Astro 7.3.2, `attachCookiesToResponse`). Domyślny `checkOrigin` sprawdza formularz wysłany do trasy szkicu, a nie sprawdza zapytania `fetch` z JSON.

## Findings

### F1 — Główne ryzyko z briefu sprawdzane tylko ręcznie

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Faza 1, punkt 8 (Testy i smoke)
- **Detail**: Brief wskazuje jako główne ryzyko fazy 1 sytuację, w której `cookies.delete` z niewłaściwą ścieżką nie usuwa ciasteczka. Sprawdza to tylko krok ręczny 1.10. Smoke trzyma ciasteczka w zwykłym słowniku bez atrybutu `Path` (`scripts/smoke.mjs:85-96`), więc złej ścieżki nie wychwyci. Test jednostkowy obejmuje tylko czyste funkcje odczytu. Szkic czyszczą trzy miejsca: wylogowanie, usunięcie konta i udany zapis leku.
- **Fix**: Dopisać krok smoke, który sprawdza nagłówki `Set-Cookie` odpowiedzi z wylogowania i z udanego zapisu leku. Każda ma usuwać oba ciasteczka, z `Path=/leki/nowy` i `Path=/leki/nowy/z-ulotki` oraz `Max-Age=0`.
- **Decision**: FIXED — krok smoke sprawdzający `Set-Cookie` przy wylogowaniu i udanym zapisie (Faza 1, punkt 8)

### F2 — Lista wzorców strażnika nie pokrywa obecnego kodu

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Completeness
- **Location**: Faza 3, punkt 1 (`scripts/pages/url-params.test.mjs`)
- **Detail**: Lista wzorców w planie nie widzi helperów `uuidParam("notatka")` i `readParam("…")` (`src/pages/dzienniczek/index.astro:47`, `src/pages/leki/nowy/z-ulotki.astro:20-23`) ani szablonu z dynamicznym kluczem `?${successParam}=` (`EditEntryForm.tsx:106`). Literały `?x=` występują w komentarzach (`src/lib/copy/*`, `src/lib/auth/confirm-link.ts`), więc skaner bez pomijania komentarzy da fałszywe alarmy. Tymczasowa lista dozwolonych nie ma `confirmed` (`src/pages/api/auth/email-confirm.ts:7`, odczyt w `src/lib/auth/confirm-link.ts:13`).
- **Fix**: W kontrakcie dopisać wzorce `*Param("x")`, pomijanie komentarzy i zasadę dla kluczy dynamicznych: test pada na `?${…}=`, chyba że plik jest na krótkiej, opisanej liście. Dodać `confirmed` do listy dozwolonych.
  - Strength: Strażnik pokrywa obecny kod, a nie tylko wzorce znane z planu; klucz dynamiczny nie przejdzie po cichu.
  - Tradeoff: Druga lista wyjątków (pliki z kluczem dynamicznym) do utrzymania.
  - Confidence: HIGH — każdy brakujący wzorzec ma wskazane miejsce w kodzie.
  - Blind spot: Inne wzorce dynamiczne poza wskazanymi nie zostały przeszukane.
- **Decision**: FIXED — wzorce `*Param("x")`, pomijanie komentarzy, `DYNAMIC_KEY_FILES`, `confirmed` w `ALLOWED_URL_PARAMS` (Faza 3, punkt 1)

### F3 — Krok 3.5 da się wykonać dopiero po wdrożeniu

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Faza 3, Manual Verification / Progress 3.5
- **Detail**: `/10x-implement` kończy fazę bramką ręczną i commitem. Logi Workera istnieją dopiero po merge'u, a merge to wdrożenie na produkcję. Krok 3.5 albo blokuje zamknięcie fazy, albo zostaje pusty.
- **Fix**: Przenieść 3.5 z Progress do notatki „Po merge'u” w sekcji Implementation Note fazy 3.
- **Decision**: FIXED — 3.5 przeniesione do notatki „Po merge'u” w fazie 3, usunięte z Progress

### F4 — Krok smoke „brak dopasowania” opisany jak zmiana istniejącego

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Faza 2, punkt 4 (Smoke)
- **Detail**: Dziś żaden krok smoke nie wchodzi w ścieżkę braku dopasowania ani błędu formularza z ulotki. Każdy zapis z ulotki wysyła `confirmUnverified: "1"` i sprawdza tylko sukces (`scripts/smoke.mjs:623-660`). Plan pisze o tym kroku tak, jakby już istniał.
- **Fix**: Oznaczyć oba kroki (brak dopasowania, pusta nazwa) jako nowe.
- **Decision**: FIXED — oba kroki smoke oznaczone jako nowe (Faza 2, punkt 4)
