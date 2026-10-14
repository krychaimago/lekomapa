# Wyróżniony przycisk „Usuń konto” — Plan Brief

> Full plan: `context/changes/delete-account-button-emphasis/plan.md`

## What & Why

S-01 z M-2 (issue #104). Przycisk „Usuń konto” wygląda dziś jak każdy inny, a usunięcie konta kasuje na stałe wszystkie dane. Użytkowniczka ma od razu rozpoznać, że to akcja nieodwracalna.

## Starting Point

Oba przyciski (`/konto` i `/konto/usun`) mają neutralny wariant `outline`, bo reguła projektu rezerwuje czerwień (`destructive*`) dla błędów formularzy i techniki. Przycisk shadcn ma już wariant pełnej czerwieni; wariantu z czerwonym obramowaniem nie ma.

## Desired End State

Na `/konto` odnośnik „Usuń konto” ma czerwone obramowanie i tekst; na `/konto/usun` przycisk, który faktycznie usuwa, ma pełną czerwień. Reguła w `CLAUDE.md` i `global.css` nazywa ten wąski wyjątek, a `npm test` odrzuca czerwony przycisk w każdym innym miejscu.

## Key Decisions Made

| Decision              | Choice                                                              | Why (1 sentence)                                                                |
| --------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Wygląd                | Optymalny: obramowanie na `/konto`, pełna czerwień na `/konto/usun` | Pełna czerwień tylko tam, gdzie kliknięcie naprawdę usuwa.                      |
| Pilnowanie wyjątku    | Test w `npm test` z listą dozwolonych plików                        | Komentarz nie powstrzyma agenta przy kolejnych ekranach.                        |
| Test wymaga obecności | Oba ekrany konta muszą mieć czerwony przycisk                       | Inaczej test przechodzi także wtedy, gdy nic nie sprawdził.                     |
| Kontrast              | Bez nowych tokenów i par                                            | Policzone: najniższy wynik 7,28 : 1 (pełna czerwień po najechaniu, tryb jasny). |
| Zakres wyjątku        | Tylko usunięcie konta                                               | Usuwanie leku to treść o lekach — tam czerwieni nie ma.                         |

## Scope

**In scope:**

- nowy wariant `destructive-outline` w `src/components/ui/button.tsx`,
- `src/pages/konto.astro`, `src/pages/konto/usun.astro`,
- brzmienie reguły w `CLAUDE.md` i `src/styles/global.css`,
- `scripts/tokens/destructive-scope.mjs` + `.test.mjs`.

**Out of scope:**

- usuwanie leku i inne przyciski,
- ikona i nowe zdanie o skutku,
- nowe tokeny, zmiany w `EXPLICIT_PAIRS`, zmiany tekstów.

## Architecture / Approach

Wariant przycisku w komponencie shadcn, wybierany na dwóch ekranach przez `buttonVariants`. Bramka to skan `src/` w stylu `hardcoded-colors`: lista plików, w których czerwony przycisk wolno użyć, plus lista plików, które muszą go mieć.

## Phases at a Glance

| Phase                 | What it delivers                                           | Key risk                                                                    |
| --------------------- | ---------------------------------------------------------- | --------------------------------------------------------------------------- |
| 1. Przyciski i reguła | Czerwone przyciski na obu ekranach konta, wyjątek zapisany | Komunikat błędu i czerwony przycisk zlewają się na `/konto/usun?error=…`    |
| 2. Test pilnujący     | Bramka w `npm test`                                        | Dopasowanie zbyt szerokie (łapie klasy komunikatów błędów) albo zbyt wąskie |

**Prerequisites:** brak.
**Estimated effort:** ok. 1,5–2 h, jedna sesja, jeden PR.

## Open Risks & Assumptions

- Zakładam, że roadmapa myliła się co do nowej pary kontrastu — liczby są w planie; test kontrastu w `npm test` potwierdzi.

## Success Criteria (Summary)

- „Usuń konto” na obu ekranach rozpoznawalne jako akcja nieodwracalna, w obu trybach.
- Czerwony przycisk w innym pliku `src/` wywraca `npm test` z czytelnym komunikatem.
