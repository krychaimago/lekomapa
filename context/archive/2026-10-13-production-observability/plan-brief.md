# Śledzenie błędów i monitor dostępności (F-06) — Plan Brief

> Full plan: `context/changes/production-observability/plan.md`

## What & Why

Produkcja lekomapy dziś milczy, gdy coś się psuje. Logi Cloudflare żyją 3 dni i nikt ich nie przegląda, a darmowe Supabase usypia po tygodniu bez ruchu. F-06 sprawia, że:

- nieoczekiwany błąd serwera, w tym przerwanie przez limit CPU (1102), dociera do autorki mailem przez Sentry,
- przerwa w działaniu dociera mailem w ciągu 15 minut,
- baza nie usypia.

Raport błędu nie niesie danych o zdrowiu (PRD, `## Non-Functional Requirements`).

## Starting Point

- Kod łapie błędy bazy sam i zamienia je w przekierowanie, kod JSON albo ekran „nie udało się wczytać” z odpowiedzią 200. Zostawia po sobie tylko około 57 wywołań `console.error` z kodem błędu.
- Nie ma śledzenia błędów ani publicznej strony kontrolnej.
- Żadna funkcja w bazie nie jest dostępna dla `anon`.

## Desired End State

- Nowy rodzaj błędu albo błąd, który wraca, daje mail z Sentry. Zgłoszenie zawiera etykietę miejsca, kod, trasę według wzorca i ślad w kodzie, nigdy treści błędu ani adresu.
- `/api/health` co 5 minut sprawdza bazę. Dwie porażki z rzędu dają mail.
- Zadanie co 15 minut wyłapuje 1102 ze statystyk Cloudflare i melduje się w Sentry, więc także jego zatrzymanie daje mail.
- Strona prywatności wymienia Sentry.
- LCP dwóch ekranów jest zmierzone.

## Key Decisions Made

| Decision                              | Choice                                                                        | Why (1 sentence)                                                                                     |
| ------------------------------------- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| 1102                                  | Zadanie co 15 min pyta statystyki Cloudflare                                  | Dotrzymuje obietnicy PRD bez stałego kosztu; pomiar dostępności na darmowym planie na starcie fazy 4 |
| Zakres zgłoszeń                       | Wywrotki i 5xx w middleware + każdy dawny `console.error` przez `reportError` | Ekran „nie udało się wczytać” odpowiada 200, więc bez tego awaria bazy nie dałaby maila              |
| Wysyłka                               | Własna funkcja z listą dozwolonych pól, bez SDK Sentry                        | Prywatność z konstrukcji i zero narzutu paczki na limit 10 ms CPU                                    |
| Monitor                               | Co 5 min, alarm po 2 porażkach                                                | Mail ok. 10 min po przerwie, ok. 290 żądań dziennie                                                  |
| Maile Sentry                          | Nowe i powracające zgłoszenie                                                 | Każdy rodzaj błędu dociera, skrzynka nie tonie                                                       |
| Dowód prywatności                     | Test w `npm test` + jednorazowy podgląd JSON prawdziwego zgłoszenia           | Reguła pilnowana testem, zgodność z rzeczywistością zmierzona raz                                    |
| Szybkość                              | Jednorazowy ręczny Lighthouse Mobile na produkcji                             | F-06 zamyka się z dowodem; przekroczenie to nowa pozycja roadmapy                                    |
| Strona kontrolna w bazie              | Funkcja `health_ping()` zwracająca `1`, dostępna dla `anon`, bez tabel        | Kierunek z roadmapy; katalog i rejestr nie dostają polityk dla `anon`                                |
| Check-in Sentry Crons (decyzja planu) | Zadanie 1102 melduje każdy bieg                                               | Odróżnia „nie było 1102” od „zadanie nie działa” i dowodzi, że sekrety w produkcji są niepuste       |

## Scope

**In scope:**

- Moduł `src/lib/observability/` (część czysta i runtime).
- Warstwa middleware.
- Podmiana `console.error` i test zakazu.
- Migracja `health_ping`, trasa `/api/health` i krok smoke.
- `src/worker.ts` z zadaniem co 15 min.
- Wpis na stronie prywatności.
- Konfiguracja Sentry i sekretów.
- Pomiar LCP.

**Out of scope:**

- Sentry w przeglądarce, paczki SDK Sentry, spany, wersja wdrożenia, mapy źródeł.
- Zgłaszanie oczekiwanych błędów (walidacja, okno korekty, nieudane logowanie) i ciche ścieżki bez logu. To zakres `/10x-observability-audit`.
- Płatny plan Workers, Lighthouse w CI, poprawki szybkości.

## Architecture / Approach

Każde miejsce w kodzie woła `reportError(etykieta, { code, error })`. Funkcja loguje kod jak dziś. Gdy jest sekret `SENTRY_DSN`, składa zgłoszenie wyłącznie z pól dozwolonych i wysyła je w tle przez `waitUntil`. Middleware dokłada zewnętrzną warstwę łapiącą wywrotki i odpowiedzi 5xx. Własny plik startowy Workera przekazuje żądania do adaptera Astro bez zmian i dokłada zadanie co 15 minut. Zadanie czyta statystyki Cloudflare i zgłasza 1102 tą samą funkcją. Monitor Sentry odpytuje `/api/health`, która woła `health_ping()` w bazie, więc ten sam ruch utrzymuje Supabase przy życiu.

## Phases at a Glance

| Phase                               | What it delivers                                                    | Key risk                                                                               |
| ----------------------------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| 1. Funkcja zgłaszająca i middleware | `reportError`, lista dozwolonych pól, test prywatności              | Pole spoza listy przemycone przez ślad w kodzie; pilnuje test                          |
| 2. Podmiana `console.error`         | ~57 miejsc zgłasza, test zakazu                                     | Mechaniczna zmiana w ~30 plikach; zachowanie UI ma zostać bez zmian                    |
| 3. Strona kontrolna                 | `health_ping()`, `/api/health`, krok smoke                          | Pierwszy grant dla `anon` w repozytorium; test SQL pilnuje braku tabel                 |
| 4. Zadanie 1102                     | `src/worker.ts`, cron, odczyt statystyk                             | Statystyki niedostępne na darmowym planie; wtedy faza staje i decyzja wraca do autorki |
| 5. Wdrożenie produkcyjne            | Sentry EU, sekrety, monitor, reguły, strona prywatności, pomiar CPU | Kolejność: strona prywatności przed DSN, `db push` przed monitorem                     |
| 6. Pomiar szybkości                 | LCP `/leki` i `/dzienniczek/nowy`                                   | Wynik powyżej 2,5 s; to nowa pozycja roadmapy                                          |

**Prerequisites:**

- Konto Sentry (zakładane w fazie 5).
- Token Cloudflare tylko do odczytu statystyk (pomiar w fazie 4).
- Lokalne Supabase do bramek.

**Estimated effort:** ok. 3–4 wieczory w 6 fazach. Fazy 1–2 to jeden wieczór, fazy 3–4 to jeden do dwóch, fazy 5–6 to jeden wieczór pracy poza kodem.

## Open Risks & Assumptions

- Dostępność `workersInvocationsAdaptive` z podziałem na `status` na darmowym planie jest niezmierzona. Bramka na początku fazy 4.
- `waitUntil` z `cloudflare:workers` zakładany jako dostępny. Zapas: `locals.cfContext.waitUntil`.
- Darmowy Sentry ma 1 monitor Crons (pewność średnia). Bez niego check-in jest bez skutku, a dowodem niepustych sekretów zostaje pierwsze prawdziwe zgłoszenie.
- 500 z trasy JSON daje dwa zgłoszenia w dwóch grupach. Przyjęte świadomie.
- Ślad w kodzie wskazuje zbudowany plik, więc diagnoza opiera się na etykiecie miejsca.

## Success Criteria (Summary)

- Awaria bazy na dowolnym ekranie i przerwanie przez limit CPU dają mail z Sentry, a JSON zgłoszenia nie zawiera nazwy leku.
- Wymuszona porażka `/api/health` daje mail w ciągu ok. 10 minut, a baza nie usypia.
- `/prywatnosc` wymienia Sentry, a LCP dwóch ekranów jest zapisane.
