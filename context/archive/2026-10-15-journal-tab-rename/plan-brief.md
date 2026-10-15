# Zakładka „Dziennik” — Plan Brief

> Full plan: `context/changes/journal-tab-rename/plan.md`

## What & Why

Zakładka „Dzienniczek” nie mieści się w menu na małym ekranie (MS-02, issue #105). Zmieniamy nazwę widoczną w interfejsie na „Dziennik” — w menu, nagłówku i zdaniach odsyłających do tej części aplikacji — żeby wewnątrz aplikacji była jedna nazwa.

## Starting Point

Nazwa żyje w `src/lib/navigation.ts:10`, `src/lib/copy/journal.ts:10` i w 10 zdaniach w `src/lib/copy/{journal,visit-summary,doctor-question,account}.ts`. Adresy `/dzienniczek/*` używają starej formy; testy sprawdzają adresy, nie etykietę.

## Desired End State

Menu i nagłówek mówią „Dziennik”, zdania „dziennika / w dzienniku”, menu na telefonie mieści się w jednej linii. Adresy działają bez zmian, a hasło na ekranie logowania zostaje.

## Key Decisions Made

| Decision       | Choice                                    | Why (1 sentence)                                                      | Source  |
| -------------- | ----------------------------------------- | --------------------------------------------------------------------- | ------- |
| Adresy         | `/dzienniczek/*` zostają                  | Zmiana psułaby zakładki, smoke i testy bez zysku dla użytkowniczki.   | Roadmap |
| Dokumenty      | PRD i dokumenty dalej mówią „dzienniczek” | Zmiana dotyczy tekstu w interfejsie.                                  | Roadmap |
| Zakres tekstów | Całe UI bez hasła z ekranu logowania      | Jedna nazwa wewnątrz aplikacji; hasło to opis produktu, nie zakładka. | Plan    |
| Ochrona nazwy  | Nowy test: etykieta + brak „dziennicz…”   | Nowy tekst w starej formie wywróci `npm test`.                        | Plan    |

## Scope

**In scope:**

- Etykieta menu, nagłówek ekranu listy
- 10 zdań z odmianami w `src/lib/copy/*`
- Aktualizacja `scripts/account/account-copy.test.mjs:53`, nowy test nazwy

**Out of scope:**

- Adresy, przekierowania, trasy API
- Hasło „Dzienniczek leków i samopoczucia” (`src/lib/copy/auth.ts:11`)
- PRD, roadmapa, komentarze, nazwy w kodzie i bazie

## Architecture / Approach

Podmiana tekstów w obiektach copy i `NAV_ITEMS`. Test zbiera teksty rekurencyjnie (wzorzec `collectTexts`) i odrzuca rdzeń „dziennicz…” (wspólny dla „Dzienniczek”, „dzienniczka”, „dzienniczku”), z jednym wyjątkiem wskazanym po kluczu.

## Phases at a Glance

| Phase                             | What it delivers                 | Key risk                              |
| --------------------------------- | -------------------------------- | ------------------------------------- |
| 1. Nazwa „Dziennik” w interfejsie | Nowa nazwa w UI + test pilnujący | Przeoczony tekst — łapie go nowy test |

**Prerequisites:** brak.
**Estimated effort:** jedna krótka sesja, jeden PR.

## Open Risks & Assumptions

- Zakładam, że „Dziennik” wystarczy, by menu zmieściło się na 360 px — sprawdzenie ręczne 1.5. Jeśli nie, potrzebna osobna zmiana układu menu.

## Success Criteria (Summary)

- Na telefonie menu pokazuje „Dziennik” w jednej linii.
- W aplikacji ta sama część ma jedną nazwę; adresy i ekran logowania bez zmian.
