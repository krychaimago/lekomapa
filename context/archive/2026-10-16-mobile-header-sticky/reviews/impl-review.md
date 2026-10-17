<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Przyklejony nagłówek na telefonie

- **Plan**: context/changes/mobile-header-sticky/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2
- **Date**: 2026-10-17
- **Verdict**: APPROVED
- **Findings**: 0 critical, 1 warning, 3 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | WARNING |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | WARNING |
| Pattern Consistency | WARNING |
| Success Criteria    | PASS    |

Bramki automatyczne (17.10.2026, po commicie `132b787`): `npm run lint` — 0 błędów (10 ostrzeżeń, jak przed zmianą); `npm run typecheck` — 0 błędów; `npm test` — 509 pass, 0 fail; `npx playwright test` — 17 passed, 6 skipped (galeria, uruchomiona osobno z `DARK_GALLERY=1`: 7 passed). Punkty ręczne 1.5–1.9 i 2.5 potwierdzone przez autorkę w sesji.

## Findings

### F1 — Zapas przewijania u góry to stała pod 3 wiersze paska demo

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/layouts/AppLayout.astro:119
- **Detail**: `scroll-padding-top: 9.5rem` (152 px) pokrywa zmierzone 150 px przy 320 px i zwykłym rozmiarze tekstu. Przy powiększonym tekście `rem` rośnie, ale pasek demo może się zawinąć do 4 i więcej wierszy — wtedy zapas jest za mały i pole z fokusem może schować się pod górnym blokiem. Nie zmierzone.
- **Fix A ⭐ Recommended**: Zmierzyć przy 320 px i tekście 200% (DevTools, rozmiar czcionki przeglądarki); jeśli blok jest wyższy niż 9.5rem, podnieść wartość do zmierzonej i dopisać pomiar w komentarzu.
  - Strength: Pomiar zamiast hipotezy (lesson „Zmierz, zanim wdrożysz poprawkę”); jedna linia CSS.
  - Tradeoff: Większy zapas przy 360/375 px — przewijanie do pola zatrzyma się niżej niż trzeba.
  - Confidence: MED — nie wiadomo, czy przy 200% pasek zawija się do 4 wierszy.
  - Blind spot: Inne ustawienia powiększenia niż 200%.
- **Fix B**: Zaakceptować — komentarz w kodzie już każe zmieniać wartość razem z wysokością pasków.
  - Strength: Zero pracy; dotyczy tylko powiększonego tekstu przy najwęższym ekranie.
  - Tradeoff: Ryzyko zostaje niezmierzone.
  - Confidence: MED — przypadek brzegowy.
  - Blind spot: Jak często użytkowniczki powiększają tekst.
- **Decision**: FIXED (Fix A) — pomiar 17.10.2026 (`/konto`, ekran 568 px): przy 320 px blok 9.34rem (100%), 9.71rem (150%), 12.25rem (200%); przy 360/375 px i 200% — 10.84rem. 9.5rem nie wystarczało od 150% tekstu. Wartość podniesiona do 12.5rem, pomiar w komentarzu `AppLayout.astro`. Uboczne odkrycie: przy 320 px i 200% górny blok zajmuje 392 z 568 px wysokości ekranu (zostaje 176 px na treść) — do backlogu jako osobna sprawa.

### F2 — Bez dolnego zapasu przewijania (udokumentowane odstępstwo)

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/layouts/AppLayout.astro:109-122
- **Detail**: Plan wymagał `scroll-padding-bottom` nie mniejszego niż dolne menu. Usunięte decyzją autorki (zapis w `change.md`), bo wypychało nasilenie objawu poza ekran w `severity-on-phone.spec.ts`. Luka sprzed zmiany zostaje: pole z fokusem (Tab) może schować się pod dolnym menu, a nasilenie przy objawie na dole ekranu też (pomiar: przed zmianą ok. 40 px pod menu).
- **Fix**: Dopisać lukę jako osobną pozycję do roadmapy / backlogu, żeby nie zginęła.
- **Decision**: FIXED — dopisane do `## Parked` w `context/foundation/roadmap.md` (razem z odkryciem z F1 o wysokości górnego bloku przy tekście 200%).

### F3 — Krótka strona na telefonie przewija się o ok. 65 px dalej

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Architecture
- **Location**: src/layouts/AppLayout.astro:42
- **Detail**: Nagłówek wyszedł z kontenera `min-h-dvh`, więc wysokość strony to teraz pasek demo + nagłówek + pełny ekran. Pusta przestrzeń ma tło `bg-background`, nic nie wygląda na zepsute. Wysokości bloku nie da się odjąć w CSS bez jej znajomości — a plan celowo jej nie zna.
- **Fix**: Zaakceptować jako kosmetykę.
- **Decision**: ACCEPTED — kosmetyka, pusta przestrzeń ma tło `bg-background`.

### F4 — Komentarz testu mówi, że /konto „jest dość długie”, a przewinięcie gwarantuje układ

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: tests/e2e/mobile-header-sticky.spec.ts:7-8
- **Detail**: Po F3 każda strona wnętrza na telefonie przewija się niezależnie od treści. Warunek `scrollY > 0` dalej robi swoje, ale komentarz wprowadza w błąd przyszłą osobę, która zmieni ekran testu.
- **Fix**: Przeredagować komentarz: przewinięcie gwarantuje wysokość górnego bloku poza `min-h-dvh`, a warunek wstępny pilnuje, że faktycznie nastąpiło.
- **Decision**: FIXED — komentarz przeredagowany, test bez zmian.

## Triage (17.10.2026)

- Fixed: F1 (Fix A, 12.5rem), F2 (wpisy w `## Parked`), F4
- Accepted: F3

Bramki po poprawkach: `npm run lint` — 0 błędów (10 ostrzeżeń); `npm run typecheck` — 0 błędów; `npm test` — 509 pass, 0 fail; `npx playwright test` — 17 passed, 6 skipped.
