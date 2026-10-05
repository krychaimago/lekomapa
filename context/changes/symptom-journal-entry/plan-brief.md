# S-05: Wpis o samopoczuciu i okno korekty — Plan Brief

> Full plan: `context/changes/symptom-journal-entry/plan.md`

## What & Why

Użytkowniczka zapisuje wpis o samopoczuciu na telefonie. Data i godzina są wypełnione domyślnie na moment zapisu i można je cofnąć. Do tego objawy z zamkniętej listy, nasilenie przy każdym i notatka.

Ten sam plasterek zamienia zaślepkę okna korekty na prawdziwą regułę: 24 h od zapisu, zegarem serwera. Bez niej gwarancja „historia nie kłamie” formalnie nie obowiązuje. Pomyłka w zmianie dawki (F6a z S-03) zostaje dziś w historii na zawsze.

## Starting Point

- Katalog 34 objawów ze słowami potocznymi jest w bazie (F-03), ale nie ma tabeli wpisów ani ekranu.
- `medication_correction_window_open` zwraca zawsze `true`. Strażnicy historii leków są przez to bezczynni.
- `created_at` da się dziś ustawić z klienta.

## Desired End State

- Zakładka „Dzienniczek”:
  - lista wpisów,
  - formularz z wyszukiwaniem bez polskich znaków i grupami kategorii,
  - po zapisie „Możesz poprawić ten wpis do jutra, 21:14”.
- Baza blokuje zmianę rdzenia leku, składu, okresu i wpisu po 24 h od zapisu danego wiersza.
- Przy świeżym okresie dawkowania jest „Popraw dawkę”: pomyłkę poprawia bez nowego okresu.

## Key Decisions Made

| Decision                        | Choice                                                                           | Why (1 sentence)                                                                       | Source          |
| ------------------------------- | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | --------------- |
| Długość okna, zegar             | 24 h od zapisu, zegar serwera                                                    | Rozstrzygnięcie Q-3; wpis wieczorny o porannym objawie nie może mieć zamkniętego okna. | PRD / change.md |
| Od czego okno leku              | Każdy wiersz osobno: lek i skład od dodania leku, każdy okres od własnego zapisu | Świeża zmiana dawki jest poprawialna, stare okresy zostają zamknięte.                  | Plan            |
| F6a                             | Poprawa treści dawki i wariantu w oknie, bez zmiany dat                          | Strażnik już to dopuszcza; najmniejsza droga, która usuwa fałszywy okres.              | Plan            |
| Limit 14 dni przy zmianie dawki | Zostaje; starsza zmiana bez drogi w MVP                                          | Pomyłki w dacie zmiany nie da się poprawić, więc krótki limit ogranicza szkodę.        | Plan            |
| Nasilenie                       | Przy każdym objawie, 3 stopnie, opcjonalne                                       | „Mdłości silne, ból głowy łagodny” — tak mówi się lekarzowi.                           | Plan            |
| Nazwa objawu w starym wpisie    | Bieżąca z katalogu (id, `on delete restrict`)                                    | Brak kopii do pilnowania; zmiany katalogu muszą zachować sens.                         | Plan / roadmapa |
| Granice daty wpisu              | Nie w przyszłości, najwyżej 14 dni wstecz, czas polski                           | Pokrywa „wieczorem o porannym objawie”; literówka w roku nie przejdzie.                | Plan            |
| Formularz po błędzie            | React + `fetch` POST z JSON; stan zostaje w przeglądarce                         | Nic nie ginie na telefonie; żadnych danych zdrowotnych w URL ani w ciasteczku.         | Plan            |
| Godzina końca okna na ekranie   | Pole wyliczane z bazy (`correction_window_ends_at`)                              | Godzina zgadza się z blokadą; funkcje okna zostają bez `EXECUTE`.                      | Plan / roadmapa |

## Scope

**In scope:**

- prawdziwe okno korekty leków, okresów i wpisów,
- zamrożenie `created_at`,
- tabele dzienniczka z RLS,
- RPC zapisu,
- formularz i lista,
- „do kiedy” po zapisie leku, zmiany dawki i wpisu,
- poprawa dawki w oknie,
- testy SQL, jednostkowe, FR-012 i smoke.

**Out of scope:**

- poprawa i usuwanie wpisu (S-07),
- pytanie do lekarza (S-06),
- odstawienie i usuwanie leku (S-04),
- poprawa daty zmiany dawki,
- zmiana limitu 14 dni,
- E2E w Playwright,
- nazwy leków w URL (#57).

## Architecture / Approach

Jedna funkcja w bazie mierzy okno (zapis + 24 h). Z niej korzystają:

- strażnicy (osobne funkcje dla leku, okresu i wpisu),
- pola wyliczane czytane przez ekrany.

Wpis to `symptom_entries` (kiedy, notatka) i `symptom_entry_items` (objaw, nasilenie), zapisywane jednym RPC `add_symptom_entry`. Granice daty i „co najmniej jeden objaw” pilnują wyzwalacze, więc obejmują każdą ścieżkę zapisu. Katalog jest ładowany ze stroną i filtrowany w przeglądarce, więc tekst objawu nie trafia do URL.

## Phases at a Glance

| Phase                             | What it delivers                                                    | Key risk                                                                     |
| --------------------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| 1. Okno korekty leków w bazie     | Reguła 24 h per wiersz, zamrożone `created_at`, przepięte testy SQL | Po wdrożeniu dane starsze niż 24 h od razu stają się niemodyfikowalne        |
| 2. Schemat dzienniczka            | Tabele z RLS, strażnicy, RPC, sprawdzenia izolacji i smoke          | Luka w ścieżce zapisu (np. objaw dopisany do zamkniętego wpisu)              |
| 3. Ekran dzienniczka              | Menu, formularz z wyszukiwaniem i nasileniem, lista z „do kiedy”    | Tekst neutralny trafiający w rdzeń zakazany; strefa czasowa w Workerze (UTC) |
| 4. UI leków + poprawa dawki (F6a) | „Do kiedy” przy lekach, RPC i ekran „Popraw dawkę”                  | Komunikat ogólny strażnika zamiast nazwanego `DP009`                         |

**Prerequisites:** F-01, F-03, F-04, S-03 (done); lokalne Supabase dla `db:check` i smoke.
**Estimated effort:** ~5–7 sesji po ~1,5 h; fazy 1 i 3 największe.

## Open Risks & Assumptions

- Testy granicy 24 h wyłączają na chwilę sam wyzwalacz zamrażający `created_at`. Wyłączenie wszystkich wyzwalaczy zafałszowałoby wynik.
- Kody `SE00x` i `DP009` trzeba zmierzyć na PostgREST przed mapowaniem w trasach.
- Zmiana nazwy objawu w katalogu zmienia wygląd starych wpisów — zmiany katalogu muszą zachować sens nazwy.

## Success Criteria (Summary)

- Wpis z telefonu w mniej niż minutę, z objawem znalezionym bez polskich znaków, widoczny na liście z godziną końca okna.
- Po 24 h od zapisu baza odrzuca zmianę rdzenia leku, okresu i wpisu; notatka zostaje edytowalna.
- Pomyłka w świeżej zmianie dawki poprawiona bez fałszywego okresu w historii.
