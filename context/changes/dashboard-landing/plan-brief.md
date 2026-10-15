# Start na liście leków zamiast pustego `/dashboard` — Plan Brief

> Full plan: `context/changes/dashboard-landing/plan.md`

## What & Why

Po zalogowaniu użytkowniczka widzi dziś pusty ekran ze startera („Tu pojawią się ekrany aplikacji.”). Zmiana kieruje ją od razu na listę leków i usuwa pusty ekran. Pozycja roadmapy S-03 (MS-08, issue #106).

## Starting Point

Logowanie i akceptacja warunków kierują na `/`, a `src/pages/index.astro` przekierowuje zalogowaną na `/dashboard`. `/dashboard` jest ręcznie wpisany w `INTERIOR_ROUTES` i pojawia się w smoke, teście kontroli warunków, galerii trybu ciemnego i `CLAUDE.md`.

## Desired End State

Zalogowana osoba startuje na `/leki`. Stary adres `/dashboard` z zakładki prowadzi na listę leków (albo do logowania, gdy sesji brak). Bramki sprawdzają ochronę wnętrza na istniejących trasach, a test w przeglądarce potwierdza, że logowanie kończy się na liście leków.

## Key Decisions Made

| Decision                    | Choice                                         | Why (1 sentence)                                                                            | Source                |
| --------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------- | --------------------- |
| Ekran startowy              | `/leki`, bez osobnego ekranu „Start”           | Najszybszy wariant; „Start” byłby piątą zakładką i trzecią kopią listy leków                | Roadmapa (14.10.2026) |
| Stary adres `/dashboard`    | Przekierowanie w `astro.config.mjs`            | Zakładki działają, a bez pliku strony nie trzeba go chronić ani trzymać w galerii           | Plan                  |
| Kod przekierowania          | 302                                            | 301 przeglądarka zapamiętuje na stałe — 302 zostawia adres do ewentualnego ponownego użycia | Plan (decyzja agenta) |
| Kroki bramek z `/dashboard` | Przepięte na `/leki` / `/wizyta`, nie usunięte | Sprawdzały ochronę wnętrza, nie sam ekran                                                   | Plan                  |
| Test E2E                    | Tak, jeden test logowania                      | Sprawdza drogę tak, jak przechodzi ją przeglądarka                                          | Plan                  |
| `CLAUDE.md:90`              | Poprawka w tej zmianie                         | Agent nie będzie szukał nieistniejącego pliku ani przywracał `/dashboard`                   | Plan                  |

## Scope

**In scope:**

- `index.astro` → `/leki`, usunięcie `dashboard.astro`, przekierowanie w konfiguracji, `INTERIOR_ROUTES`
- smoke, `terms-gate.test.mjs`, galeria trybu ciemnego, `CLAUDE.md`
- nowy test E2E logowania

**Out of scope:**

- własna strona 404
- osobny ekran „Start”, start na `/wizyta`
- zmiany tras API logowania i akceptacji warunków
- inne nieaktualne zdania w `CLAUDE.md`

## Architecture / Approach

Jedno miejsce decyduje o starcie (`index.astro`). Stary adres obsługuje `redirects` w `astro.config.mjs`, więc trasa nie ma pliku strony; cel `/leki` jest już chroniony przez `NAV_ITEMS`, więc przekierowanie niczego nie omija.

## Phases at a Glance

| Phase                                         | What it delivers                                          | Key risk                                                                   |
| --------------------------------------------- | --------------------------------------------------------- | -------------------------------------------------------------------------- |
| 1. Start na `/leki` i sprzątanie `/dashboard` | Nowy start, przekierowanie, przepięte bramki, `CLAUDE.md` | Krok smoke usunięty zamiast przepięty — bramka przestaje sprawdzać ochronę |
| 2. Test E2E                                   | Test „logowanie kończy się na liście leków”               | Brak konta testowego po resecie lokalnej bazy                              |

**Prerequisites:** lokalny Supabase, konto z `.env.e2e`, `.env` odsunięty na czas smoke i E2E.
**Estimated effort:** ok. 1 sesja (2–3 h) na obie fazy.

## Open Risks & Assumptions

- Zakładam, że `redirects` w Astro 7 przy `output: "server"` zwraca 302 z `Location: /leki` — krok smoke zmierzy to przed ustawieniem oczekiwania.
- `/dashboard.html` nie będzie przekierowany (konfiguracja zna tylko `/dashboard`) — dostanie domyślne 404 Astro. Akceptowalne: adres `.html` trafia tylko z `astro dev`.

## Success Criteria (Summary)

- Po zalogowaniu od razu lista leków.
- Stara zakładka `/dashboard` nie kończy się błędem.
- Wszystkie bramki zielone i dalej sprawdzają ochronę wnętrza.
