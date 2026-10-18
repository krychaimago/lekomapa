# S-08 Ekrany, które nie są puste — plan wdrożenia

## Overview

Puste stany `/leki`, `/dzienniczek`, wstęp `/wizyta`, notatka w karcie wpisu dzienniczka i lewa strona rozkładówki ekranów wejściowych dostają wygląd **F · Karteczki**: papierowa karteczka z paskiem taśmy i lekkim obrotem. Kierunek wybrany przez autorkę 18.10.2026 na makietach https://claude.ai/artifact/67bdzF6SH5KYRcYrf22QbZ (plansze F, F-leki, F-dziennik, F-wizyta, F-notatka). Roadmapa S-08, issue #111.

## Current State Analysis

- Trzy puste stany powtarzają ten sam blok `section.rounded-xl.border.bg-card.p-6.shadow-sm` z tekstem i przyciskiem (`src/pages/leki/index.astro:192-197`, `src/pages/dzienniczek/index.astro:206-211`, `src/pages/wizyta.astro:48-58`). Wspólnego komponentu nie ma.
- Notatka we wpisie to `p.break-words` z wyciszoną etykietą `Notatka:` (`src/pages/dzienniczek/index.astro:241-245`), wewnątrz `li[data-entry-id]`.
- Rozkładówka `src/layouts/AuthSpreadLayout.astro:20-31`: lewa strona na `bg-sidebar`, trzy zdania `copy.points` jako `ul.hidden.lg:flex`, na telefonie zdania znikają. Układ obsługuje 6 ekranów: `auth/signin`, `auth/signup`, `auth/confirm`, `auth/confirm-email`, `auth/konto-usuniete`, `warunki/akceptacja`.
- Kolory makiet = istniejące tokeny (`card`, `accent`, `accent-border`, `sidebar-border`) w obu trybach. Jedyna wartość spoza tokenów w makietach to cień `rgba(0,0,0,0.10)` — bramka kolorów go odrzuci.
- Teksty makiet = teksty w repo (`AUTH_COPY.spread`, `MEDICATION_COPY.list.empty`, `JOURNAL_COPY.list.empty`, `VISIT_SUMMARY_COPY.intro`). Żaden nowy tekst.

## Desired End State

- Na pustej liście leków, pustym dzienniczku i pustej Wizycie zamiast białej karty z tekstem jest karteczka (lub układ karteczek) jak na makietach, w trybie jasnym i ciemnym.
- Notatka we wpisie dzienniczka wygląda jak mała akcentowa karteczka z taśmą w lewym górnym rogu, z etykietą „Notatka:”.
- Na dużym ekranie wszystkie 6 ekranów rozkładówki pokazuje trzy zdania jako trzy karteczki; na telefonie nagłówek stoi na karteczce.
- Na pustej Wizycie oba przyciski („Dodaj lek”, „Zapisz objaw”) są pełne, każdy na osobnej karteczce.
- Jedna reguła w `CLAUDE.md` mówi kolejnemu agentowi, że karteczka = `PaperNote.astro`.
- Weryfikacja: `npm test`, `npm run lint`, `npm run typecheck`, `npm run build`, istniejące E2E zielone; ręczne porównanie z makietami w obu trybach.

### Key Discoveries:

- Bramka `scripts/tokens/hardcoded-colors.mjs` skanuje cały `src/` z pustą listą `EXCEPTIONS` (`:17`). Dopuszcza klasy tokenów, przezroczystość na tokenach nietekstowych (`bg-accent-border/85`) i `var(--token)` w wartości dowolnej (precedens `AuthSpreadLayout.astro:37`). Odrzuca `rgba(`, hex, klasy palety i kolorowe `dark:`.
- `tests/e2e/severity-on-phone.spec.ts:111-113`: `li[data-entry-id]` ma dokładnie jedną wewnętrzną pozycję listy na objaw. `tests/e2e/dark-gallery.spec.ts:526-530` szuka wpisu po tekście notatki wewnątrz `li`.
- Na pasie bocznym tekst wyłącznie `sidebar-foreground` (`CLAUDE.md`, Kolory). Tekst _na karteczce_ stoi na `card` albo `accent`, więc używa `card-foreground` / `accent-foreground` — pary sprawdzane automatycznie przez `scripts/tokens/contrast.mjs`.
- Dekoracja w `.astro`: `aria-hidden="true"`, klasy tokenów (`src/components/BrandName.astro:26-42`).
- Para przycisków pełny + obrys zostaje we wstępie osi czasu (`src/components/timeline/TimelineView.astro:109-120`) — poza zakresem.

## What We're NOT Doing

- Puste stany spoza makiet: `/leki/zakonczone` (`zakonczone.astro:81-84`), wstęp i stany częściowe osi czasu (`TimelineView.astro`), puste sekcje Wizyty (`currentMedicationsEmpty`, kolizje 0/1/2+, `noQuestions`), `/leki/[id]` bez kolizji, `graphTooFewMedications`. Każdy z nich wymaga najpierw własnej makiety i osobnej zmiany.
- Pole notatki w formularzach (`NewEntryForm.tsx`, `EditEntryForm.tsx`) — makieta F-notatka obejmuje tylko wyświetlanie.
- Ekrany odzyskiwania hasła (zwykły `Layout`, nie rozkładówka).
- Nowe tokeny, nowe teksty, ilustracje rysowane (SVG, obrazki), animacje.
- Wykresy i graf (S-09, S-10).

## Implementation Approach

Jeden bezstanowy komponent `src/components/PaperNote.astro` opisuje karteczkę; każda plansza F składa się z jego wariantów. Faza 1 wprowadza komponent i podmienia powierzchnie wnętrza. Faza 2 używa go na rozkładówce i zapisuje decyzję w dokumentach. Kolejność: wnętrze najpierw, bo tam powstaje komponent, a rozkładówka obejmuje 6 ekranów i warto ją sprawdzić osobno.

## Critical Implementation Details

- **Obrót a czytelność**: obroty z makiet mieszczą się w ±3°. Większy obrót pogarsza czytanie tekstu — nie przekraczać. Obrót statyczny nie jest animacją, więc `motion-reduce` niepotrzebny.
- **Struktura karty wpisu**: karteczka notatki to `div`/`p`, nigdy `li` ani `role="listitem"`, i stoi wewnątrz `li[data-entry-id]` — inaczej padają `severity-on-phone` i `dark-gallery`.

## Faza 1: Karteczki we wnętrzu

### Overview

Komponent `PaperNote` i podmiana pustych stanów `/leki`, `/dzienniczek`, wstępu `/wizyta` oraz notatki w karcie wpisu.

### Changes Required:

#### 1. Komponent karteczki

**File**: `src/components/PaperNote.astro` (nowy)

**Intent**: Jedno miejsce opisujące karteczkę z makiet F, żeby pięć powierzchni nie powtarzało klas i nie dryfowało.

**Contract**: Props:

- `paper: "card" | "accent"` — tło i kolor tekstu (`bg-card text-card-foreground` / `bg-accent text-accent-foreground`),
- `tape?: "accent" | "sidebar" | "none"` — pasek taśmy `span aria-hidden="true"` ok. 80×22 px, `-top-[11px]`, wyśrodkowany, `bg-accent-border/85` albo `bg-sidebar-border/85`; domyślnie `accent`,
- `tapePosition?: "center" | "start"` — `start` dla notatki we wpisie (lewy górny róg),
- `tilt?` — obrót z dozwolonego zbioru w zakresie ±3° (np. klasy `-rotate-1`, `rotate-2`, `rotate-[1.5deg]`),
- `ruled?: boolean` — linie jak w zeszycie: `repeating-linear-gradient` w `var(--accent-border)` co 30 px (F-dziennik),
- `backSheet?: boolean` — druga, akcentowa kartka za karteczką, obrócona ok. +3°, `aria-hidden="true"` (F-leki),
- `class?` łączone przez `cn()`, `<slot />` na treść.
  Wspólne: `relative`, `rounded-[4px]`, cień `shadow-md` (Tailwind) zamiast `rgba` z makiety. Żadnych kolorów spoza tokenów, żadnego `destructive*` ani `interaction*`. Komentarz na górze pliku po angielsku, z odwołaniem do makiet.

#### 2. Pusty stan listy leków

**File**: `src/pages/leki/index.astro`

**Intent**: Zastąpić kartę `:192-197` karteczką z planszy F-leki.

**Contract**: `PaperNote paper="card"`, obrót ok. −1,5°, `backSheet`, wewnątrz `copy.empty` i link „Dodaj lek” z `buttonVariants()` — tekst i adres bez zmian. Warunek renderowania (`items.length === 0`) bez zmian; noty o kolizjach, graf i link „Zakończone leki” poniżej bez zmian.

#### 3. Pusty stan dzienniczka

**File**: `src/pages/dzienniczek/index.astro`

**Intent**: Zastąpić kartę `:206-211` karteczką z planszy F-dziennik.

**Contract**: `PaperNote paper="accent" ruled`, obrót ok. +1,5°, `copy.empty` i link „Nowy wpis” z `buttonVariants()` bez zmian.

#### 4. Notatka w karcie wpisu

**File**: `src/pages/dzienniczek/index.astro`

**Intent**: Notatka `:241-245` wygląda jak mała akcentowa karteczka z planszy F-notatka.

**Contract**: `PaperNote paper="accent" tapePosition="start"`, obrót ok. −1°, wewnątrz dotychczasowy `p.break-words` z wyciszoną etykietą `{copy.noteLabel}:` i tekstem notatki. Element bez `li`/`role="listitem"`, wewnątrz `li[data-entry-id]`. Etykieta zostaje `text-muted-foreground` tylko wtedy, gdy para `muted-foreground` na `accent` po dopisaniu do `EXPLICIT_PAIRS` w `scripts/tokens/contrast.mjs` przechodzi 7 : 1 w obu trybach; jeśli nie przechodzi — etykieta `text-accent-foreground` bez dopisywania pary.

#### 5. Wstęp Wizyty

**File**: `src/pages/wizyta.astro`

**Intent**: Zastąpić kartę `:48-58` układem z planszy F-wizyta; oba przyciski pełne (decyzja autorki 18.10.2026).

**Contract**: `PaperNote paper="card"` (ok. −1°) z `copy.intro`, pod nią dwie małe `PaperNote paper="accent"` (ok. +2° i −2°), każda z jednym linkiem `buttonVariants()`: `copy.introAddMedication` → `/leki/nowy`, `copy.introAddSymptom` → `/dzienniczek/nowy`. Wariant `outline` znika z „Zapisz objaw”. Warunek `summary.showIntro` i pozostałe sekcje bez zmian.

### Success Criteria:

#### Automated Verification:

- Bramka kolorów i reszta testów jednostkowych przechodzą: `npm test`
- Lint przechodzi: `npm run lint`
- Typy przechodzą: `npm run typecheck`
- Build przechodzi: `npm run build`
- E2E karty wpisu i Wizyty zielone przeciw lokalnemu Supabase: `npx playwright test severity-on-phone visit-readable`

#### Manual Verification:

- Pusta lista leków, pusty dzienniczek i pusta Wizyta wyglądają jak plansze F-leki, F-dziennik, F-wizyta w trybie jasnym
- Te same trzy ekrany w trybie ciemnym: karteczki odróżniają się od tła, taśma widoczna, tekst czytelny
- Wpis z notatką (także z notatką 200 znaków) wygląda jak plansza F-notatka w obu trybach, tekst się nie wylewa
- Na telefonie (ok. 375 px) karteczki mieszczą się bez poziomego przewijania, obrót nie ucina tekstu
- Czytnik ekranu nie odczytuje taśmy ani tylnej kartki

**Implementation Note**: Po zielonych bramkach automatycznych zatrzymaj się na ręczne potwierdzenie autorki przed fazą 2.

---

## Faza 2: Karteczki na rozkładówce i zapis decyzji

### Overview

Trzy zdania lewej strony rozkładówki jako karteczki (plansza F), na telefonie nagłówek na karteczce; decyzja i reguła zapisane w dokumentach.

### Changes Required:

#### 1. Lewa strona rozkładówki

**File**: `src/layouts/AuthSpreadLayout.astro`

**Intent**: Na dużym ekranie trzy `copy.points` stają się trzema karteczkami na lewej stronie; na telefonie nagłówek `copy.heading` stoi na karteczce. Dotyczy wszystkich 6 ekranów układu (decyzja autorki 18.10.2026).

**Contract**: Lista `ul` zostaje (semantyka listy), każdy `li` zawiera `PaperNote` — kolejno `card`, `accent`, `card`, obroty ok. −2°, +2°, −1°, taśma `sidebar`. Lista dalej `hidden lg:flex`. Nagłówek: `PaperNote` tylko poniżej `lg`, na dużym ekranie nagłówek jak dziś (wg planszy F na telefon i na komputer). Tekst na karteczkach w kolorze papieru (`card-foreground` / `accent-foreground`), tekst poza karteczkami dalej `sidebar-foreground`. Prawa strona i formularz bez zmian. Zaktualizować komentarz na górze pliku.

#### 2. Reguła dla agentów

**File**: `CLAUDE.md`

**Intent**: Następny agent ma użyć komponentu zamiast kopiować klasy.

**Contract**: Nowy punkt w `### Konwencje kodu`, np. **Karteczki (S-08)**: karteczka = `src/components/PaperNote.astro`; papier `card`/`accent`, taśma `accent-border`/`sidebar-border`, obrót do ±3°, dekoracja `aria-hidden`; nowy pusty stan w tym wyglądzie wymaga makiety.

#### 3. Zapis decyzji w dokumentach

**File**: `context/changes/auth-login-design/design-draft.md`, `context/foundation/roadmap.md`

**Intent**: Decyzja z 18.10.2026 jest dziś tylko w `change.md`. Rozkładówka z karteczkami odchodzi od zasady „treść na bieli, paleta tylko na ramie” (`design-draft.md:92-95`).

**Contract**: `design-draft.md` — krótka notka w `### Logowanie na dużym ekranie: Rozkładówka` i `### Logowanie na telefonie`: od S-08 zdania i nagłówek na karteczkach, świadome odstępstwo zaakceptowane 18.10.2026. `roadmap.md` S-08 — w `Unknowns` rozstrzygnięcie: źródło ilustracji = kształty CSS bez zewnętrznych zasobów; ekrany = leki, dzienniczek, wstęp Wizyty, notatka, rozkładówka (6 ekranów).

### Success Criteria:

#### Automated Verification:

- Testy jednostkowe, w tym kontrast i bramka kolorów: `npm test`
- Lint przechodzi: `npm run lint`
- Typy przechodzą: `npm run typecheck`
- Build przechodzi: `npm run build`
- E2E ścieżek wejściowych zielone przeciw lokalnemu Supabase: `npx playwright test signin-lands-on-medications theme seed`

#### Manual Verification:

- Logowanie na dużym ekranie wygląda jak plansza F (komputer) w trybie jasnym i ciemnym
- Logowanie na telefonie wygląda jak plansza F (telefon), pierwszy ekran nadal krótki
- Pozostałe 5 ekranów rozkładówki (rejestracja, sprawdź skrzynkę, potwierdzenie, konto usunięte, akceptacja warunków) pokazuje te same karteczki bez rozjechania formularza
- Formularz logowania wysłany w prawdziwej przeglądarce działa (zalogowanie przechodzi)
- Reguła w `CLAUDE.md` i notki w `design-draft.md` oraz roadmapie są zgodne z decyzjami tego planu

**Implementation Note**: Po zielonych bramkach automatycznych zatrzymaj się na ręczne potwierdzenie autorki.

---

## Testing Strategy

### Unit Tests:

- Brak nowych testów jednostkowych: zmiana nie ma logiki. Kolory pilnuje istniejąca bramka `hardcoded-colors`, pary tekstu `contrast.mjs`.

### Integration Tests:

- Istniejące E2E pilnują struktury karty wpisu (`severity-on-phone`), regionów Wizyty (`visit-readable`) i ścieżki logowania. Bieg wyłącznie do lokalnego Supabase, po zatrzymaniu starego podglądu (lessons).

### Manual Testing Steps:

1. Konto bez leków i wpisów: otwórz `/leki`, `/dzienniczek`, `/wizyta` w trybie jasnym, porównaj z planszami.
2. Przełącz tryb ciemny, powtórz krok 1.
3. Dodaj wpis z notatką, sprawdź `/dzienniczek` w obu trybach.
4. Wyloguj się, sprawdź logowanie i rejestrację na komputerze i telefonie w obu trybach.
5. Opcjonalnie: galeria ciemna `DARK_GALLERY=1 npx playwright test dark-gallery` dla przeglądu wszystkich ekranów.

## Performance Considerations

Brak — kilka klas CSS, bez obrazków i skryptów.

## Migration Notes

Brak migracji bazy.

## References

- Research: `context/changes/friendly-visuals/research.md`
- Makiety: https://claude.ai/artifact/67bdzF6SH5KYRcYrf22QbZ
- Dekoracja `aria-hidden` w `.astro`: `src/components/BrandName.astro:26-42`
- `var(--token)` w wartości dowolnej: `src/layouts/AuthSpreadLayout.astro:37`
- Zasady układu logowania: `context/changes/auth-login-design/design-draft.md:88-111`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Karteczki we wnętrzu

#### Automated

- [x] 1.1 Bramka kolorów i reszta testów jednostkowych przechodzą: `npm test`
- [x] 1.2 Lint przechodzi: `npm run lint`
- [x] 1.3 Typy przechodzą: `npm run typecheck`
- [x] 1.4 Build przechodzi: `npm run build`
- [x] 1.5 E2E karty wpisu i Wizyty zielone przeciw lokalnemu Supabase: `npx playwright test severity-on-phone visit-readable`

#### Manual

- [x] 1.6 Pusta lista leków, pusty dzienniczek i pusta Wizyta wyglądają jak plansze F-leki, F-dziennik, F-wizyta w trybie jasnym
- [x] 1.7 Te same trzy ekrany w trybie ciemnym: karteczki odróżniają się od tła, taśma widoczna, tekst czytelny
- [x] 1.8 Wpis z notatką (także z notatką 200 znaków) wygląda jak plansza F-notatka w obu trybach, tekst się nie wylewa
- [x] 1.9 Na telefonie (ok. 375 px) karteczki mieszczą się bez poziomego przewijania, obrót nie ucina tekstu
- [x] 1.10 Czytnik ekranu nie odczytuje taśmy ani tylnej kartki

### Phase 2: Karteczki na rozkładówce i zapis decyzji

#### Automated

- [ ] 2.1 Testy jednostkowe, w tym kontrast i bramka kolorów: `npm test`
- [ ] 2.2 Lint przechodzi: `npm run lint`
- [ ] 2.3 Typy przechodzą: `npm run typecheck`
- [ ] 2.4 Build przechodzi: `npm run build`
- [ ] 2.5 E2E ścieżek wejściowych zielone przeciw lokalnemu Supabase: `npx playwright test signin-lands-on-medications theme seed`

#### Manual

- [ ] 2.6 Logowanie na dużym ekranie wygląda jak plansza F (komputer) w trybie jasnym i ciemnym
- [ ] 2.7 Logowanie na telefonie wygląda jak plansza F (telefon), pierwszy ekran nadal krótki
- [ ] 2.8 Pozostałe 5 ekranów rozkładówki (rejestracja, sprawdź skrzynkę, potwierdzenie, konto usunięte, akceptacja warunków) pokazuje te same karteczki bez rozjechania formularza
- [ ] 2.9 Formularz logowania wysłany w prawdziwej przeglądarce działa (zalogowanie przechodzi)
- [ ] 2.10 Reguła w `CLAUDE.md` i notki w `design-draft.md` oraz roadmapie są zgodne z decyzjami tego planu
