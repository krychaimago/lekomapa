# Wyróżniony przycisk „Usuń konto” — plan wdrożenia

## Overview

S-01 z M-2 (issue #104, MS-01, FR-001). Użytkowniczka ma od razu rozpoznać „Usuń konto” jako akcję nieodwracalną: na `/konto` (przycisk prowadzący do potwierdzenia) i na `/konto/usun` (przycisk, który faktycznie usuwa). Zmiana otwiera wąski, jawnie zapisany wyjątek od reguły `destructive*` i dokłada test, który ten wyjątek pilnuje.

## Current State Analysis

- Oba przyciski mają neutralny wariant `outline`: `src/pages/konto.astro:63-69` (odnośnik do `/konto/usun`) i `src/pages/konto/usun.astro:64-70` (przycisk `submit` formularza). Przy obu stoi komentarz „Outline, not destructive: destructive tokens are for form and technical errors only.”
- Reguła brzmi tak samo w dwóch miejscach: `CLAUDE.md:107` („`destructive*` wyłącznie dla błędów formularzy i techniki, nigdy dla treści o lekach i objawach”) i komentarz `src/styles/global.css:31-32`.
- `src/components/ui/button.tsx:13` ma już wariant `destructive` (pełna czerwień: `bg-destructive text-destructive-foreground`, po najechaniu `/90`). Wariantu z czerwonym obramowaniem nie ma.
- Ekran potwierdzenia ma już pogrubione zdanie o skutku: `ACCOUNT_COPY.deletion.irreversible` („Nie zostaje żadna kopia. Tego nie da się cofnąć.”).
- Tokeny `destructive*` są dziś używane wyłącznie w komunikatach błędów (`text-destructive` na `bg-destructive-surface`) — w żadnym przycisku.

## Desired End State

- `/konto`: odnośnik „Usuń konto” ma czerwone obramowanie i czerwony tekst; po najechaniu tło `destructive-surface`.
- `/konto/usun`: przycisk „Usuń konto” ma pełną czerwień (`variant: "destructive"`).
- Reguła w `CLAUDE.md` i w `src/styles/global.css` nazywa wyjątek: czerwony przycisk wyłącznie dla nieodwracalnej akcji na koncie (dziś: usunięcie konta), nigdy dla treści o lekach i objawach.
- `npm test` odrzuca czerwony wariant przycisku w każdym pliku `src/` poza listą dozwolonych i pada, gdy na dozwolonych ekranach czerwonego przycisku nie ma.
- Kontrast trzyma 7 : 1 bez nowych tokenów i bez nowych wpisów w `EXPLICIT_PAIRS`.

### Key Discoveries:

- Kontrast policzony dla obu trybów (sesja planowania, 14.10.2026): pełna czerwień 9,31 (jasny) / 10,44 (ciemny), po najechaniu `/90` 7,28 / 8,75; czerwony tekst na `card` 9,31 / 9,44; na `destructive-surface` 7,92 / 9,14. Pary `destructive`–`card` i `destructive`–`destructive-surface` są już w `EXPLICIT_PAIRS` (`scripts/tokens/contrast.mjs:29-31`), `destructive-foreground`–`destructive` łączy się sam. Założenie roadmapy, że potrzebna jest nowa para, nie potwierdziło się.
- Wzorzec testu skanującego `src/`: moduł z logiką + plik testu (`scripts/tokens/hardcoded-colors.mjs` + `.test.mjs`), z przypadkami pozytywnymi i negatywnymi dla samego dopasowania.
- `tests/e2e/dark-gallery.spec.ts:239-247` robi zrzuty `/konto` i `/konto/usun` (także ze stanem błędu) w trybie ciemnym — gotowe narzędzie do ręcznego obejrzenia.

## What We're NOT Doing

- Usuwanie leku (`src/pages/leki/[id]/usun.astro`) i każdy inny przycisk: to treść o lekach, wyjątek jej nie obejmuje.
- Ikona przy przycisku i nowe zdanie o skutku na `/konto` (wariant „najlepszy” z roadmapy — odrzucony w planie).
- Nowe tokeny kolorów i nowe pary w `EXPLICIT_PAIRS`.
- Zmiana tekstów w `src/lib/copy/account.ts`.
- Nieaktualne zdania w `CLAUDE.md` o `src/types.ts` i katalogach — osobna decyzja.

## Implementation Approach

Faza 1 robi zmianę widoczną i przepisuje regułę. Faza 2 dokłada bramkę: test zna listę plików, w których czerwony przycisk wolno użyć, i wymaga, żeby oba ekrany konta go miały — inaczej test „blokady” przeszedłby także wtedy, gdy skan niczego nie znalazł (lekcja „Bramka musi odróżnić blokadę od niewykonania”).

## Phase 1: Przyciski i brzmienie reguły

### Overview

Nowy wariant przycisku, oba ekrany konta na czerwieni, wyjątek zapisany w regule i w komentarzach.

### Changes Required:

#### 1. Wariant przycisku

**File**: `src/components/ui/button.tsx`

**Intent**: Dodać wariant z czerwonym obramowaniem i tekstem dla przycisku, który prowadzi do nieodwracalnej akcji, ale sam jej nie wykonuje.

**Contract**: Nowy klucz `"destructive-outline"` w `variants.variant`: obramowanie `border-destructive`, tekst `text-destructive`, tło `bg-background`, po najechaniu `bg-destructive-surface` (tekst zostaje `text-destructive`). Bez klas `dark:` — tryb ciemny należy do tokenów. Istniejące warianty bez zmian.

#### 2. Ekran konta

**File**: `src/pages/konto.astro`

**Intent**: Odnośnik „Usuń konto” na nowym wariancie; komentarz przy nim mówi, dlaczego wolno.

**Contract**: `buttonVariants({ variant: "destructive-outline" })` zamiast `"outline"`; reszta klas bez zmian. Komentarz: obramowanie, nie pełna czerwień, bo ten przycisk tylko prowadzi do potwierdzenia; wyjątek opisany w `CLAUDE.md`.

#### 3. Ekran potwierdzenia

**File**: `src/pages/konto/usun.astro`

**Intent**: Przycisk, który faktycznie usuwa konto, na pełnej czerwieni.

**Contract**: `buttonVariants({ variant: "destructive" })` zamiast `"outline"`; reszta klas bez zmian. Komentarz: pełna czerwień tylko tu, bo kliknięcie usuwa konto nieodwracalnie; wyjątek opisany w `CLAUDE.md`.

#### 4. Brzmienie reguły

**File**: `CLAUDE.md` (sekcja `### Konwencje kodu`, punkt o `destructive*`), `src/styles/global.css` (komentarz przy `--destructive` w `:root`)

**Intent**: Wpisać wąski wyjątek jawnie, żeby kolejny agent nie uznał czerwonego przycisku za naruszenie ani nie potraktował go jako otwarcia czerwieni dla innych akcji.

**Contract**: Reguła zostaje: `destructive*` dla błędów formularzy i techniki, nigdy dla treści o lekach i objawach. Dopisany wyjątek: przycisk nieodwracalnej akcji na koncie (dziś wyłącznie usunięcie konta, `/konto` i `/konto/usun`); pełna czerwień tylko na przycisku, który faktycznie wykonuje akcję. W `CLAUDE.md` dodatkowo: lista dozwolonych plików żyje w teście z fazy 2 i nowy wpis wymaga osobnej decyzji.

### Success Criteria:

#### Automated Verification:

- Testy przechodzą (w tym kontrast tokenów i bramka kolorów na sztywno): `npm test`
- Typy przechodzą: `npm run typecheck`
- Lint przechodzi: `npm run lint`
- Build przechodzi: `npm run build`

#### Manual Verification:

- `/konto` w trybie jasnym i ciemnym: odnośnik „Usuń konto” ma czerwone obramowanie i tekst, po najechaniu jasnoczerwone tło, fokus z klawiatury widoczny
- `/konto/usun` w trybie jasnym i ciemnym: przycisk „Usuń konto” na pełnej czerwieni, tekst czytelny także po najechaniu
- `/konto/usun?error=wrongPassword`: komunikat błędu i czerwony przycisk dają się od siebie odróżnić
- Żaden inny ekran (w tym usuwanie leku) nie zmienił wyglądu

**Implementation Note**: Po fazie 1 i zielonych sprawdzeniach automatycznych zatrzymaj się na ręczne potwierdzenie autorki.

---

## Phase 2: Test pilnujący wyjątku

### Overview

Bramka w `npm test`, która pozwala na czerwony przycisk wyłącznie w plikach z listy i wymaga go na obu ekranach konta.

### Changes Required:

#### 1. Logika skanu

**File**: `scripts/tokens/destructive-scope.mjs` (nowy)

**Intent**: Znaleźć w `src/` każde użycie czerwonego wariantu przycisku i porównać z listą dozwolonych plików.

**Contract**: Eksportuje listę dozwolonych plików (`src/components/ui/button.tsx` i `src/components/ui/badge.tsx` — definicje wariantów; `src/pages/konto.astro`; `src/pages/konto/usun.astro`), listę plików, które muszą zawierać czerwony przycisk (oba ekrany konta), funkcję dopasowania dla treści pliku i funkcję skanu `src/`. Dopasowanie łapie wybór wariantu `destructive` i `destructive-outline` (`variant: "…"` w `buttonVariants`, `variant="…"` w JSX) oraz klasę `bg-destructive` bez przyrostka. Nie łapie tokenów komunikatów błędów: `text-destructive`, `bg-destructive-surface`, `border-destructive-border`, `aria-invalid:*-destructive*`. Wzorzec: `scripts/tokens/hardcoded-colors.mjs`.

#### 2. Test

**File**: `scripts/tokens/destructive-scope.test.mjs` (nowy)

**Intent**: Dowieść, że dopasowanie łapie to, co ma, przepuszcza tokeny błędów i że stan repozytorium jest zgodny z listą.

**Contract**: Przypadki dopasowania (pozytywne: oba warianty w obu składniach, `bg-destructive`; negatywne: klasy komunikatu błędu z `src/pages/leki/[id]/usun.astro`, `aria-invalid:border-destructive`). Skan `src/`: zero użyć poza listą dozwolonych; każdy plik z listy „muszą zawierać” ma co najmniej jedno dopasowanie; każdy plik z listy dozwolonych istnieje (lista nie gnije po przeniesieniu pliku). Komunikat porażki podaje plik i dopasowanie oraz wskazuje regułę w `CLAUDE.md`.

### Success Criteria:

#### Automated Verification:

- Nowy test przechodzi w `npm test`
- Test pada, gdy do `src/pages/leki/[id]/usun.astro` wpisać `variant: "destructive"` (sprawdzone ręcznie i cofnięte)
- Test pada, gdy na `src/pages/konto/usun.astro` wrócić do `variant: "outline"` (sprawdzone ręcznie i cofnięte)
- Typy przechodzą: `npm run typecheck`
- Lint przechodzi: `npm run lint`

#### Manual Verification:

- Komunikat porażki testu jest zrozumiały bez czytania kodu testu (autorka czyta jeden z wywołanych celowo komunikatów)

**Implementation Note**: Po fazie 2 i zielonych sprawdzeniach automatycznych zatrzymaj się na ręczne potwierdzenie autorki.

---

## Testing Strategy

### Unit Tests:

- Dopasowanie: oba warianty w obu składniach, klasa pełnej czerwieni; klasy komunikatów błędów nie są łapane.
- Skan repozytorium: poza listą zero użyć, oba ekrany konta mają czerwony przycisk, lista nie wskazuje nieistniejących plików.

### Manual Testing Steps:

1. Zaloguj się, otwórz `/konto` w trybie jasnym, potem ciemnym; najedź na „Usuń konto”, przejdź do niego klawiszem Tab.
2. Kliknij „Usuń konto”, na `/konto/usun` obejrzyj przycisk w obu trybach i po najechaniu.
3. Wpisz złe hasło i sprawdź ekran z komunikatem błędu.
4. Otwórz ekran usuwania leku i sprawdź, że przycisk został neutralny.
5. Opcjonalnie: zrzuty z `tests/e2e/dark-gallery.spec.ts` dla `konto` i `konto/usun`.

## References

- Roadmapa: `context/foundation/roadmap.md` (S-01)
- Lekcja: „Bramka musi odróżnić blokadę od niewykonania” (`context/foundation/lessons.md`)
- Wzorzec testu: `scripts/tokens/hardcoded-colors.mjs`, `scripts/tokens/hardcoded-colors.test.mjs`
- Kontrast: `scripts/tokens/contrast.mjs:20-31`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Przyciski i brzmienie reguły

#### Automated

- [x] 1.1 Testy przechodzą (w tym kontrast tokenów i bramka kolorów na sztywno): `npm test` — f566304
- [x] 1.2 Typy przechodzą: `npm run typecheck` — f566304
- [x] 1.3 Lint przechodzi: `npm run lint` — f566304
- [x] 1.4 Build przechodzi: `npm run build` — f566304

#### Manual

- [x] 1.5 `/konto` w trybie jasnym i ciemnym: odnośnik „Usuń konto” ma czerwone obramowanie i tekst, po najechaniu jasnoczerwone tło, fokus z klawiatury widoczny — f566304
- [x] 1.6 `/konto/usun` w trybie jasnym i ciemnym: przycisk „Usuń konto” na pełnej czerwieni, tekst czytelny także po najechaniu — f566304
- [x] 1.7 `/konto/usun?error=wrongPassword`: komunikat błędu i czerwony przycisk dają się od siebie odróżnić — f566304
- [x] 1.8 Żaden inny ekran (w tym usuwanie leku) nie zmienił wyglądu — f566304

### Phase 2: Test pilnujący wyjątku

#### Automated

- [x] 2.1 Nowy test przechodzi w `npm test`
- [x] 2.2 Test pada, gdy do `src/pages/leki/[id]/usun.astro` wpisać `variant: "destructive"` (sprawdzone ręcznie i cofnięte)
- [x] 2.3 Test pada, gdy na `src/pages/konto/usun.astro` wrócić do `variant: "outline"` (sprawdzone ręcznie i cofnięte)
- [x] 2.4 Typy przechodzą: `npm run typecheck`
- [x] 2.5 Lint przechodzi: `npm run lint`

#### Manual

- [x] 2.6 Komunikat porażki testu jest zrozumiały bez czytania kodu testu (autorka czyta jeden z wywołanych celowo komunikatów)
