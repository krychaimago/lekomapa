# Przyklejony nagłówek na telefonie — plan wdrożenia

## Overview

Na telefonie (poniżej `lg`) nagłówek wnętrza — znak, przełącznik trybu, „Wyloguj się” — przewija się razem z treścią, więc po przewinięciu wylogowanie i przełącznik znikają. Plan wkłada pasek wersji demonstracyjnej i nagłówek do jednego przyklejonego kontenera i dodaje margines przewijania, żeby element z fokusem nie chował się pod paskami. Roadmapa: S-12 (#120), MS-13.

## Current State Analysis

- Pasek demo: `src/components/DemoBar.astro:8` — `sticky top-0 z-50`; renderuje go `src/layouts/Layout.astro:38` na każdej stronie (także logowanie i strony publiczne).
- Nagłówek telefonu: `src/layouts/AppLayout.astro:56` — `<header … lg:hidden>`, bez `sticky`, w przepływie strony pod paskiem demo.
- Pasek boczny od `lg`: `AppLayout.astro:27` — `lg:sticky lg:top-(--demo-bar-height)`. `--demo-bar-height` (2.75rem) istnieje tylko od `lg` (`src/styles/global.css:154`).
- Dolne menu telefonu: `AppLayout.astro:76` — `fixed bottom-0 z-40`; treść ma pod nim zapas `pb-24` (`AppLayout.astro:71`).
- Zmierzona wysokość paska demo (16.10.2026, build lokalny, `/auth/signin`): 320 px → 85 px (3 wiersze), 360 / 375 / 390 px → 62 px (2 wiersze), 740 px (telefon poziomo) → 40 px. Stała wysokość na telefonie nie istnieje.
- Nagłówek: `py-2` + przycisk `h-12` (`src/components/ui/button.tsx:22`) + ramka ≈ 65 px. Razem u góry przy 320 px ≈ 150 px; dolne menu ≈ 57 px.
- Nigdzie w `src/` nie ma `scroll-padding` ani `scroll-margin` — także dolne menu może dziś zasłonić element z fokusem.

## Desired End State

- Na telefonie pasek demo i nagłówek tworzą jeden blok przyklejony do góry ekranu. Nagłówek zaczyna się dokładnie pod paskiem demo przy każdej szerokości (320, 360, 375 px) — bez szczeliny i bez zachodzenia, także gdy pasek zawija się do trzech wierszy.
- Po przewinięciu „Wyloguj się” i przełącznik trybu są widoczne i działają.
- Pole, do którego przechodzi fokus (Tab), nie ląduje pod górnym blokiem ani pod dolnym menu.
- Od `lg` układ bez zmian: pasek demo przyklejony, pasek boczny tuż pod nim, nagłówka telefonu brak.
- Strony bez `AppLayout` (logowanie, `/prywatnosc`): pasek demo przyklejony jak dziś.

Weryfikacja: nowy test E2E w widoku telefonu (pada na dzisiejszym `main`), istniejące testy E2E i galeria trybu ciemnego zielone, ręczne sprawdzenie 320 / 360 / 375 px i 1280 px w obu trybach.

### Key Discoveries:

- Element `sticky` przykleja się tylko w obrębie swojego rodzica. Pasek demo jest dzieckiem `<body>`, nagłówek siedzi w `<div>` z `AppLayout` — dlatego wspólny kontener musi powstać w `Layout.astro`, a nagłówek trafia do niego przez nazwany slot.
- Komentarz w `Layout.astro` (style `body { min-height: 100% }`) opisuje zasięg przyklejenia paska demo — dotyczy teraz kontenera, nie samego paska.
- `tests/e2e/dark-gallery.spec.ts:24-30` przy zrzutach całej strony przestawia `nav` i `aside` na `static`. Górny kontener przy przewinięciu 0 stoi na górze strony, więc zrzut go nie przestawia — galeria powinna zostać bez zmian; sprawdzić.

## What We're NOT Doing

- Bez zmiany treści, kolorów ani wysokości paska demo (skrócenie tekstu do jednego wiersza to osobna decyzja).
- Bez JS do mierzenia pasków — odrzucone przy wyborze podejścia.
- Bez zmian układu od `lg`.
- Bez chowania nagłówka przy przewijaniu w dół (wzorzec „pokazuj przy przewinięciu w górę”).
- Bez osobnego układu dla telefonu poziomo — działa ta sama reguła, tylko z mniejszą ilością miejsca na treść.

## Implementation Approach

Jeden przyklejony kontener zamiast dwóch przyklejonych pasków: przeglądarka sama układa nagłówek pod paskiem demo, więc nie trzeba znać wysokości paska. Margines przewijania (`scroll-padding-top` / `-bottom`) to stała w `rem` ustawiona pod najwyższy przypadek (320 px), tylko na ekranach wnętrza poniżej `lg` — `rem` rośnie razem z powiększonym tekstem, więc zapas skaluje się z paskami.

## Critical Implementation Details

- **Zakres marginesu przewijania**: reguła ma działać wyłącznie na stronach z `AppLayout` i wyłącznie poniżej `lg`. Na stronach logowania jest tylko pasek demo, a od `lg` nagłówka nie ma — tam 150 px zapasu odsuwałoby przewijanie bez potrzeby. Najprościej: globalny styl emitowany przez `AppLayout.astro` (`<style is:global>` z regułą na `html` w zapytaniu `max-width` poniżej `64rem`).

## Faza 1: Wspólny przyklejony kontener

### Overview

Pasek demo i nagłówek telefonu w jednym przyklejonym bloku; margines przewijania na ekranach wnętrza poniżej `lg`.

### Changes Required:

#### 1. Kontener w Layout

**File**: `src/layouts/Layout.astro`

**Intent**: Owinąć `<DemoBar />` w przyklejony kontener (`sticky top-0 z-50`) z nazwanym slotem tuż pod paskiem, żeby układ wnętrza mógł dołożyć do niego swój nagłówek. Zaktualizować komentarz przy `body { min-height: 100% }`, że mówi o kontenerze.

**Contract**: Nowy nazwany slot (np. `sticky-top`) wewnątrz kontenera, po `DemoBar`. Strona bez treści w slocie renderuje sam pasek jak dziś. Banery `missingConfigs` zostają poza kontenerem.

#### 2. Pasek demo bez własnego przyklejenia

**File**: `src/components/DemoBar.astro`

**Intent**: Usunąć `sticky top-0 z-50` — przyklejenie należy teraz do kontenera. Reszta klas (kolory, `lg:h-(--demo-bar-height)`) bez zmian. Zaktualizować komentarz pliku, że pasek stoi w przyklejonym kontenerze `Layout`.

**Contract**: Jedyny użytkownik `DemoBar` to `Layout.astro` — sprawdzić grepem przed zmianą.

#### 3. Nagłówek w slocie i margines przewijania

**File**: `src/layouts/AppLayout.astro`

**Intent**: Przenieść `<header … lg:hidden>` do slotu kontenera (`slot="sticky-top"`), bez zmiany jego treści i klas. Dodać globalny styl z `scroll-padding-top` (zapas na pasek demo przy 320 px + nagłówek) i `scroll-padding-bottom` (zapas na dolne menu) na `html`, tylko poniżej `lg`. Wartości w `rem`, z komentarzem, skąd pochodzą (pomiar z 16.10.2026) i że trzeba je zmienić razem z wysokością pasków.

**Contract**: Na `lg` kontener ma wysokość `--demo-bar-height` (nagłówek ukryty), więc `aside` z `lg:top-(--demo-bar-height)` zostaje bez zmian. `z-50` kontenera nad `z-40` dolnego menu. Wartość `scroll-padding-bottom` nie mniejsza niż wysokość dolnego menu.

### Success Criteria:

#### Automated Verification:

- Lint przechodzi: `npm run lint`
- Typy przechodzą: `npm run typecheck`
- Testy jednostkowe przechodzą: `npm test`
- Build przechodzi: `npm run build`

#### Manual Verification:

- Przy 320, 360 i 375 px na `/leki` i `/dzienniczek`, w trybie jasnym i ciemnym: górny blok przyklejony, nagłówek dokładnie pod paskiem, treść nie chowa się pod paskami
- Po przewinięciu „Wyloguj się” wylogowuje, a przełącznik zmienia tryb
- Tab przez formularz na `/dzienniczek/nowy` przy 360 px: pole z fokusem nie ląduje pod paskami
- Przy 1280 px układ jak przed zmianą
- `/auth/signin` przy 360 px: pasek demo przyklejony jak dziś

**Implementation Note**: Po zielonych bramkach automatycznych zatrzymaj się na ręczne potwierdzenie autorki przed fazą 2.

---

## Faza 2: Test E2E w widoku telefonu

### Overview

Test ryzyka „nagłówek z wylogowaniem znika po przewinięciu”, który pada na dzisiejszym `main` i przechodzi po fazie 1.

### Changes Required:

#### 1. Test

**File**: `tests/e2e/mobile-header-sticky.spec.ts`

**Intent**: Uruchamiany przez `npx playwright test` (cofnięcie fazy 1: `git stash` albo `main`; galeria w `test-results/dark-gallery/`). Dla szerokości 320, 360 i 375 px (wysokość np. 568): zalogowany (zapisana sesja z `auth.setup.ts`), wejść na ekran wnętrza, przewinąć na dół strony i sprawdzić, że „Wyloguj się” i przełącznik trybu są w widoku, a górna krawędź nagłówka równa się dolnej krawędzi paska demo (bez szczeliny i zachodzenia, z tolerancją 1 px). Warunek wstępny w teście: strona faktycznie się przewinęła (`scrollY > 0`) — inaczej test nic nie mierzy (lesson „Bramka musi odróżnić blokadę od niewykonania”).

**Contract**: Wzorzec widoku telefonu: `tests/e2e/severity-on-phone.spec.ts:15` (`test.use({ viewport })`). Selektory przez `getByRole` (`button` „Wyloguj się”, `note` paska demo, `banner` nagłówka). Czekanie na stan, bez `waitForTimeout`. Test tylko czyta — nie tworzy danych; jeśli treść ekranu na wspólnym koncie E2E jest za krótka do przewinięcia, wybrać niską wysokość widoku zamiast dopisywać dane.

### Success Criteria:

#### Automated Verification:

- Nowy test przechodzi: `npx playwright test tests/e2e/mobile-header-sticky.spec.ts`
- Nowy test pada po cofnięciu zmian fazy 1
- Wszystkie testy E2E przechodzą, w tym galeria trybu ciemnego
- Lint i typy przechodzą

#### Manual Verification:

- Zrzuty galerii trybu ciemnego dla telefonu: górny blok na górze strony

---

## Testing Strategy

### Unit Tests:

- Brak — zmiana wyłącznie układu, bez logiki.

### Integration Tests:

- `tests/e2e/mobile-header-sticky.spec.ts` — przewinięcie przy 320 / 360 / 375 px, widoczność wylogowania i przełącznika, styk nagłówka z paskiem demo.
- Istniejące testy E2E (`theme.spec.ts`, `severity-on-phone.spec.ts`, `dark-gallery.spec.ts`) jako regresja.

### Manual Testing Steps:

1. DevTools, tryb urządzenia 320 px, zalogować się, `/leki` z kilkoma lekami — przewinąć w dół, sprawdzić górny blok i dolne menu.
2. To samo przy 360 i 375 px, potem w trybie ciemnym.
3. `/dzienniczek/nowy` przy 360 px — przejść Tab przez pola, pole z fokusem zawsze widoczne.
4. 1280 px — układ jak przed zmianą.
5. `/auth/signin` przy 360 px — pasek demo przyklejony.

## Performance Considerations

Brak — same klasy CSS, bez JS.

## Migration Notes

Brak migracji i zmian danych.

## References

- Issue: #120
- Roadmapa: `context/foundation/roadmap.md` → S-12
- Wzorzec testu w widoku telefonu: `tests/e2e/severity-on-phone.spec.ts`
- Przyklejony pasek boczny: `src/layouts/AppLayout.astro:27`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Wspólny przyklejony kontener

#### Automated

- [x] 1.1 Lint przechodzi: `npm run lint` — 15e8e67
- [x] 1.2 Typy przechodzą: `npm run typecheck` — 15e8e67
- [x] 1.3 Testy jednostkowe przechodzą: `npm test` — 15e8e67
- [x] 1.4 Build przechodzi: `npm run build` — 15e8e67

#### Manual

- [x] 1.5 Przy 320, 360 i 375 px na `/leki` i `/dzienniczek`, w trybie jasnym i ciemnym: górny blok przyklejony, nagłówek dokładnie pod paskiem, treść nie chowa się pod paskami — 15e8e67
- [x] 1.6 Po przewinięciu „Wyloguj się” wylogowuje, a przełącznik zmienia tryb — 15e8e67
- [x] 1.7 Tab przez formularz na `/dzienniczek/nowy` przy 360 px: pole z fokusem nie ląduje pod paskami — 15e8e67
- [x] 1.8 Przy 1280 px układ jak przed zmianą — 15e8e67
- [x] 1.9 `/auth/signin` przy 360 px: pasek demo przyklejony jak dziś — 15e8e67

### Phase 2: Test E2E w widoku telefonu

#### Automated

- [x] 2.1 Nowy test przechodzi: `npx playwright test tests/e2e/mobile-header-sticky.spec.ts`
- [x] 2.2 Nowy test pada po cofnięciu zmian fazy 1
- [x] 2.3 Wszystkie testy E2E przechodzą, w tym galeria trybu ciemnego
- [x] 2.4 Lint i typy przechodzą

#### Manual

- [x] 2.5 Zrzuty galerii trybu ciemnego dla telefonu: górny blok na górze strony
