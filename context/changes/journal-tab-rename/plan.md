# Zakładka „Dziennik” — plan wdrożenia

## Overview

Zakładka „Dzienniczek” nie mieści się w menu na małym ekranie (MS-02, roadmapa S-02, issue #105). Zmieniamy nazwę widoczną w interfejsie na „Dziennik” — w menu, w nagłówku ekranu i w zdaniach, które odsyłają do tej części aplikacji — żeby wewnątrz aplikacji ta sama rzecz miała jedną nazwę.

## Current State Analysis

- Etykieta menu: `src/lib/navigation.ts:10` (`{ href: "/dzienniczek", label: "Dzienniczek" }`).
- Nagłówek i tytuł ekranu listy: `src/lib/copy/journal.ts:10` (`JOURNAL_COPY.list.title`).
- Odmiany w zdaniach widocznych dla użytkowniczki (10 tekstów):
  - `src/lib/copy/journal.ts:20` `loadError`, `:31` `entry.title`, `:47` `notFound`, `:64` `backToList`, `:105` `entryNotFound`,
  - `src/lib/copy/visit-summary.ts:12` `intro`, `:20` `noQuestions`, `:21` `journalLink`, `:24` `questionsNote`,
  - `src/lib/copy/doctor-question.ts:33` `note`,
  - `src/lib/copy/account.ts:23` `journal` (opis tego, co znika przy usunięciu konta).
- Hasło produktu na ekranie logowania: `src/lib/copy/auth.ts:11` „Dzienniczek leków i samopoczucia” — opis produktu, nie nazwa zakładki.
- Testy sprawdzają adresy `/dzienniczek/*`, nie etykietę. Jedyny test zależny od słowa: `scripts/account/account-copy.test.mjs:53` szuka fragmentu „dzienniczka”.
- Teksty z `src/lib/copy/*` przechodzą filtr FR-012 (`scripts/fr012/*-copy.test.mjs`); zmiana „dzienniczek” → „dziennik” nie wprowadza nowych słów o zdrowiu.

## Desired End State

- Menu pokazuje „Dziennik”; na telefonie (360 px) wszystkie pozycje mieszczą się w jednej linii.
- Nagłówek i tytuł ekranu listy brzmią „Dziennik”.
- Żaden tekst wnętrza aplikacji nie zawiera „dziennicz…”; wyjątek to hasło `AUTH_COPY.spread.heading`.
- Adresy `/dzienniczek/*` działają bez zmian.
- Test pilnuje nazwy, więc powrót do starej formy w nowym tekście wywraca `npm test`.

### Key Discoveries:

- Wszystkie teksty wnętrza żyją w `src/lib/copy/*` i `src/lib/navigation.ts` — w plikach `.astro` / `.tsx` nie ma wpisanej na sztywno nazwy (sprawdzone grepem; trafienia tam to adresy).
- `scripts/account/account-copy.test.mjs` ma helper `collectTexts`, który zbiera wszystkie teksty z obiektu copy — wzorzec do nowego testu.
- Roadmapa (S-02, Risk): adresy zostają, PRD i dokumenty dalej mówią „dzienniczek”.

## What We're NOT Doing

- Nie zmieniamy adresów `/dzienniczek/*`, przekierowań ani tras API.
- Nie zmieniamy hasła „Dzienniczek leków i samopoczucia” na ekranie logowania (`src/lib/copy/auth.ts:11`).
- Nie zmieniamy PRD, roadmapy, dokumentów ani komentarzy w kodzie.
- Nie zmieniamy nazw w kodzie (`journal`, `JOURNAL_COPY`) ani w bazie.

## Implementation Approach

Podmiana tekstów w obiektach copy i w `NAV_ITEMS` plus jeden test, który pilnuje nazwy. Formy odmiany: „dziennik” / „dziennika” / „w dzienniku”.

## Phase 1: Nazwa „Dziennik” w interfejsie

### Overview

Wszystkie teksty wnętrza aplikacji mówią „Dziennik”; test pilnuje, żeby tak zostało.

### Changes Required:

#### 1. Etykieta menu

**File**: `src/lib/navigation.ts`

**Intent**: Krótsza nazwa zakładki, która mieści się w menu na telefonie.

**Contract**: `NAV_ITEMS` — pozycja `href: "/dzienniczek"` dostaje `label: "Dziennik"`; `href` bez zmian.

#### 2. Teksty dziennika

**File**: `src/lib/copy/journal.ts`

**Intent**: Nagłówek ekranu i zdania odsyłające do listy mówią tą samą nazwą co menu.

**Contract**: `list.title` = „Dziennik”; `list.loadError` = „Nie udało się wczytać dziennika. Odśwież stronę.”; `entry.title` = „Wpis w dzienniku”; `notFound` = „Nie ma takiego wpisu w dzienniku.”; `backToList` = „Wróć do dziennika”; `entryNotFound` = „Nie ma takiego wpisu w dzienniku. Odśwież stronę.” Reszta treści bez zmian.

#### 3. Teksty Wizyty, pytania do lekarza i konta

**File**: `src/lib/copy/visit-summary.ts`, `src/lib/copy/doctor-question.ts`, `src/lib/copy/account.ts`

**Intent**: Odnośniki i noty spoza ekranu dziennika używają nowej nazwy — przycisk w Wizycie prowadzi do zakładki o tej samej nazwie.

**Contract**: w każdym zdaniu z listy w Current State Analysis wyłącznie „dzienniczka” → „dziennika”, „dzienniczku” → „dzienniku”; `journalLink` = „Przejdź do dziennika”. Reszta zdań słowo w słowo.

#### 4. Testy

**File**: `scripts/account/account-copy.test.mjs`, nowy `scripts/navigation/journal-name.test.mjs`

**Intent**: Zaktualizować fragment, którego szuka test usuwania konta, i dodać test pilnujący nazwy.

**Contract**:

- `account-copy.test.mjs:53` — fragment „dzienniczka” → „dziennika”.
- Nowy test: (a) pozycja `NAV_ITEMS` z `href: "/dzienniczek"` ma `label` „Dziennik”; (b) żaden tekst z `JOURNAL_COPY`, `VISIT_SUMMARY_COPY`, `DOCTOR_QUESTION_COPY`, `ACCOUNT_COPY` ani `AUTH_COPY` nie zawiera `/dziennicz/i` — z wyjątkiem `AUTH_COPY.spread.heading`, wyłączonego jawnie po kluczu. Teksty zbierane rekurencyjnie jak w `collectTexts`.
- Poprawka po impl-review (F1): pierwotnie plan podawał `/dzienniczk/i`, który nie pasuje do mianownika „Dzienniczek” (dziennicz-ek). Wspólny rdzeń wszystkich form to `dziennicz`.

### Success Criteria:

#### Automated Verification:

- Nowy test nazwy przechodzi, a przed zmianą tekstów pada: `node --test scripts/navigation/journal-name.test.mjs`
- Testy przechodzą: `npm test`
- Typy: `npm run typecheck`
- Lint: `npm run lint`

#### Manual Verification:

- Menu na telefonie (szerokość 360 px, tryb jasny i ciemny) pokazuje „Dziennik”, wszystkie pozycje w jednej linii
- Ekran `/dzienniczek` ma nagłówek „Dziennik”, a karta przeglądarki tytuł „Dziennik”
- W Wizycie przycisk „Przejdź do dziennika” prowadzi do `/dzienniczek`
- Ekran logowania dalej pokazuje „Dzienniczek leków i samopoczucia”

**Implementation Note**: Po automatycznej weryfikacji zatrzymaj się na ręczne potwierdzenie autorki.

---

## Testing Strategy

### Unit Tests:

- Etykieta menu „Dziennik”.
- Brak „dziennicz…” w tekstach wnętrza; jedyny wyjątek po kluczu.

### Manual Testing Steps:

1. Zaloguj się na telefonie albo w podglądzie 360 px; sprawdź menu w trybie jasnym i ciemnym.
2. Otwórz Dziennik, wpis, Wizytę — przeczytaj nagłówki i odnośniki.
3. Wyloguj się i sprawdź hasło na ekranie logowania.

## References

- Roadmapa: `context/foundation/roadmap.md` — S-02, MS-02, issue #105
- Wzorzec zbierania tekstów: `scripts/account/account-copy.test.mjs`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Nazwa „Dziennik” w interfejsie

#### Automated

- [x] 1.1 Nowy test nazwy przechodzi, a przed zmianą tekstów pada — 9e9e9c5
- [x] 1.2 Testy przechodzą: `npm test` — 9e9e9c5
- [x] 1.3 Typy: `npm run typecheck` — 9e9e9c5
- [x] 1.4 Lint: `npm run lint` — 9e9e9c5

#### Manual

- [x] 1.5 Menu na telefonie (360 px, jasny i ciemny) pokazuje „Dziennik”, pozycje w jednej linii — 9e9e9c5
- [x] 1.6 Ekran `/dzienniczek` ma nagłówek i tytuł karty „Dziennik” — 9e9e9c5
- [x] 1.7 W Wizycie „Przejdź do dziennika” prowadzi do `/dzienniczek` — 9e9e9c5
- [x] 1.8 Ekran logowania dalej pokazuje „Dzienniczek leków i samopoczucia” — 9e9e9c5
