# Przyklejony nagłówek na telefonie — Plan Brief

> Full plan: `context/changes/mobile-header-sticky/plan.md`

## What & Why

Na telefonie nagłówek wnętrza (znak, przełącznik trybu, „Wyloguj się”) przewija się z treścią i po przewinięciu znika. Użytkowniczka traci z oczu wylogowanie i przełącznik. Zgłoszenie autorki z 15.10.2026: S-12, #120, MS-13.

## Starting Point

Pasek demo jest przyklejony (`DemoBar.astro`, renderowany przez `Layout.astro` na każdej stronie). Nagłówek telefonu w `AppLayout.astro` nie jest przyklejony. Wysokość paska demo na telefonie zależy od szerokości: 85 px przy 320 px, 62 px przy 360–390 px (pomiar 16.10.2026).

## Desired End State

Na telefonie pasek demo i nagłówek tworzą jeden blok na górze ekranu. Nagłówek zaczyna się dokładnie pod paskiem przy każdej szerokości. „Wyloguj się” i przełącznik są zawsze widoczne. Pole z fokusem nie chowa się pod paskami. Duży ekran bez zmian.

## Key Decisions Made

| Decision                           | Choice                                                                     | Why (1 sentence)                                                                       |
| ---------------------------------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Jak przykleić nagłówek pod paskiem | Wspólny przyklejony kontener w `Layout.astro`, nagłówek przez nazwany slot | Bez JS i bez liczenia wysokości; działa przy 3 wierszach paska i powiększonym tekście. |
| Fokus pod paskami                  | `scroll-padding` góra i dół, tylko wnętrze poniżej `lg`                    | Jedna reguła CSS; naprawia też istniejącą lukę przy dolnym menu.                       |
| Fazy                               | Układ, potem test E2E                                                      | Osobny commit pozwala pokazać, że test pada bez poprawki.                              |

Przesądza na później: każdy przyszły pasek przyklejony u góry trafia do tego samego kontenera. Wartości `scroll-padding` trzeba zmieniać razem z wysokością pasków.

## Scope

**In scope:**

- kontener sticky ze slotem w `Layout.astro`,
- `DemoBar.astro` bez własnego `sticky`,
- nagłówek w slocie i `scroll-padding` w `AppLayout.astro`,
- test E2E przy 320 / 360 / 375 px.

**Out of scope:**

- zmiana treści i wysokości paska demo,
- pomiar w JS,
- zmiany od `lg`,
- chowanie nagłówka przy przewijaniu w dół,
- osobny układ dla telefonu poziomo.

## Architecture / Approach

`Layout.astro` owija pasek demo w przyklejony kontener ze slotem. `AppLayout.astro` wkłada tam swój nagłówek (`lg:hidden`). Przeglądarka sama układa nagłówek pod paskiem, więc nie trzeba znać wysokości paska. Od `lg` kontener zawiera tylko pasek, więc pasek boczny zostaje pod nim bez zmian.

## Phases at a Glance

| Phase                           | What it delivers                                        | Key risk                                                     |
| ------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------ |
| 1. Wspólny przyklejony kontener | Nagłówek przyklejony pod paskiem demo, `scroll-padding` | Regresja układu od `lg` albo stron logowania                 |
| 2. Test E2E w widoku telefonu   | Test pada bez poprawki, przechodzi z nią                | Za krótka treść na wspólnym koncie — strona się nie przewija |

**Prerequisites:** lokalne Supabase dla E2E, wolny port 4321.
**Estimated effort:** ~1 sesja, 2 fazy.

## Open Risks & Assumptions

- Przy 320×568 górny blok (~150 px) i dolne menu (~57 px) zostawiają ok. 360 px na treść. Przyjęte świadomie.
- `scroll-padding` ustawiony pod 320 px daje przy 375 px ok. 23 px nadmiaru.

## Success Criteria (Summary)

- Po przewinięciu na telefonie „Wyloguj się” i przełącznik są widoczne i działają.
- Nagłówek przylega do paska demo przy 320, 360 i 375 px, w obu trybach.
- Duży ekran i strony logowania wyglądają jak przed zmianą.
