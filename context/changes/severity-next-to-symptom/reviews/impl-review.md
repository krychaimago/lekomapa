<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Nasilenie przy samym objawie

- **Plan**: context/changes/severity-next-to-symptom/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3
- **Date**: 2026-10-16
- **Verdict**: APPROVED
- **Findings**: 0 critical, 2 warnings, 3 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | WARNING |

Automatyczne kryteria (16.10.2026): `npm test` (509 pass), `npm run typecheck` (0 błędów), `npm run lint` (0 błędów), `npm run build`, skan kolorów — zielone. E2E (`severity-on-phone`, pełny zestaw, galeria `DARK_GALLERY=1`) zielone przeciw lokalnemu Supabase na tym samym kodzie. Wszystkie pozycje ręczne potwierdzone przez autorkę.

Poza findingami: roadmapa ma S-06 jako `in-progress` — `/10x-archive` przestawi na `done`.

## Findings

### F1 — Test na telefonie nie sprawdza, gdzie stoi nasilenie

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: tests/e2e/severity-on-phone.spec.ts:82-84
- **Detail**: `toBeInViewport()` wystarcza jeden widoczny piksel. Ostatni objaw ostatniej grupy stoi tuż nad podsumowaniem „Wybrane objawy”. Gdyby ktoś przeniósł nasilenie do podsumowania, grupa „Nasilenie: spadek libido” pewnie dalej byłaby na ekranie i test by przeszedł. Łapie stary błąd (sprawdzone: viewport ratio 0), ale nie każdy powrót do „nasilenia gdzie indziej”.
- **Fix**: Szukać grupy nasilenia w wierszu listy z zaznaczonym polem (`getByRole("listitem").filter({ has: checkbox })`) i wymagać `toBeInViewport({ ratio: 1 })`.
- **Decision**: FIXED

### F2 — Odznaczenie przypiętego objawu gubi fokus

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/components/journal/SymptomPicker.tsx:176-183
- **Detail**: Podczas wyszukiwania odznaczenie objawu z sekcji „Zaznaczone” usuwa go z listy (a ostatni — całą sekcję). Pole z fokusem znika, fokus spada na `<body>`, osoba z klawiaturą lub czytnikiem ekranu traci miejsce. Ten sam mechanizm był już przy przycisku usunięcia w podsumowaniu.
- **Fix A ⭐ Recommended**: Po odznaczeniu przypiętego objawu przenieść fokus do pola wyszukiwania.
  - Strength: Mała zmiana w jednym komponencie; osoba wraca tam, skąd szukała.
  - Tradeoff: Potrzebny `ref` do pola i rozróżnienie „odznaczono z sekcji przypiętych”.
  - Confidence: MED — wzorzec częsty, w repo nie ma jeszcze precedensu.
  - Blind spot: Nie sprawdzono z prawdziwym czytnikiem ekranu.
- **Fix B**: Zostawić odznaczony wiersz w sekcji „Zaznaczone” do zmiany tekstu wyszukiwania.
  - Strength: Fokus zostaje na polu; można od razu cofnąć odznaczenie.
  - Tradeoff: Sekcja „Zaznaczone” pokazuje chwilowo niezaznaczony objaw; zmiana `searchSymptoms` i jej testów.
  - Confidence: MED — logika bardziej złożona.
  - Blind spot: Jak to wygląda dla osoby widzącej — nie sprawdzono na szkicu.
- **Decision**: FIXED via Fix A — `SymptomPicker.tsx` przenosi fokus do pola wyszukiwania po odznaczeniu objawu z sekcji „Zaznaczone”; nowy test w `tests/e2e/severity-on-phone.spec.ts` (konto per test, bo `fullyParallel`).

### F3 — Licznik zlewa się z nazwą grupy w czytniku ekranu

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/journal/SymptomPicker.tsx:160-161, tests/e2e/dark-gallery.spec.ts:248
- **Detail**: Między `<span>{group.label}</span>` a `<Badge>` nie ma tekstu, odstęp daje tylko CSS. Dostępna nazwa przycisku to prawdopodobnie „pokarmowy1 wybrany”. Regex w galerii `\s*` przyjmuje obie wersje, więc tego nie wyłapie.
- **Fix**: Dodać `{" "}` przed `Badge` i zaostrzyć regex do `\s+`.
- **Decision**: FIXED

### F4 — Objaw zaznaczony w wyszukiwaniu zostaje w zwiniętej grupie

- **Severity**: 💡 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Adherence
- **Location**: src/components/journal/SymptomPicker.tsx:51
- **Detail**: Zaznaczenie przez wyszukiwarkę i wyczyszczenie pola zostawia grupę zwiniętą. Przyciski nasilenia są schowane, podsumowanie pokazuje objaw bez możliwości zmiany nasilenia; jedyną wskazówką jest licznik. Zgodne z planem („grupy wracają do stanu sprzed wyszukiwania”) — decyzja produktowa autorki.
- **Fix**: Rozwijać grupę objawu zaznaczonego podczas wyszukiwania.
- **Decision**: FIXED — zaznaczenie w wynikach rozwija grupę objawu (odznaczenie jej nie zwija); galeria oczekuje rozwiniętej „pokarmowy”; dopisek w `plan.md`.

### F5 — Powielone pomocniki w testach E2E

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: tests/e2e/severity-on-phone.spec.ts:16-36
- **Detail**: `UUID`, `originOf`, `waitForIslands` skopiowane z `visit-readable.spec.ts` (`waitForIslands` także w `dark-gallery.spec.ts`).
- **Fix**: Przenieść do `tests/e2e/journal-helpers.ts` (albo osobnego wspólnego pliku) osobną zmianą.
- **Decision**: SKIPPED

## Triage (16.10.2026)

- Fixed: F1, F2 (Fix A), F3, F4
- Skipped: F5
- Bramki po poprawkach: `npm test` 509 pass, `npm run typecheck` 0 błędów, `npm run lint` 0 błędów (10 starych ostrzeżeń `no-console` w `src/lib/observability/*`), E2E pełny zestaw z `DARK_GALLERY=1` — 19 pass przeciw lokalnemu Supabase.
- Testy F2 i F4 sprawdzone na czerwono: po cofnięciu poprawek w `SymptomPicker.tsx` padają `severity-on-phone` (fokus) i galeria (`aria-expanded`).
- Do sprawdzenia ręcznie przez autorkę: zrzut galerii `dzienniczek_nowy--with-selected` (grupa „pokarmowy” zwinięta z licznikiem, jak wcześniej) i odznaczenie przypiętego objawu klawiaturą na `/dzienniczek/nowy`.
