# Okno korekty wpisu dzienniczka (S-07) — Plan Brief

> Full plan: `context/changes/journal-correction-window/plan.md`

## What & Why

Użytkowniczka może poprawić wpis dzienniczka w oknie korekty (24 h od zapisu, zegarem serwera) i usunąć wpis dodany przez pomyłkę, a notatkę zmienić zawsze (FR-009). Dziś lista pokazuje „Możesz poprawić do …”, ale nie ma żadnej drogi poprawy — obietnica bez pokrycia (F4 z przeglądu S-05).

## Starting Point

Baza pilnuje okna od S-05: po 24 h wyzwalacze odrzucają zmianę daty, objawów, nasilenia i usunięcie wpisu, notatka zostaje edytowalna; sprawdzenia SQL to dowodzą. Brakuje funkcji zapisu z nazwanymi kodami, tras API i ekranów. Wzorzec istnieje przy lekach (ekran poprawy okresu, ekran usunięcia).

## Desired End State

Każdy wpis na liście ma link „Popraw wpis”. W oknie ekran wpisu pozwala zmienić wszystko i usunąć wpis dodany przez pomyłkę; po zamknięciu okna rdzeń jest tylko do odczytu z wyjaśnieniem, a notatkę da się zmienić. Po poprawce lista pokazuje komunikat, podświetloną kartę i pytanie do lekarza złożone od nowa. W żadnym URL nie ma nazwy objawu ani notatki.

## Key Decisions Made

| Decision                         | Choice                                                                                        | Why (1 sentence)                                                                      |
| -------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Droga do poprawy i notatki (P1)  | Jeden ekran wpisu `/dzienniczek/<id>` w dwóch stanach                                         | Jedno miejsce dla wpisu; widać, co zablokowane, zamiast szukać brakującego przycisku. |
| Widok po poprawce (P2)           | Lista z komunikatem, podświetleniem i nowym pytaniem do lekarza; po samej notatce bez pytania | Od razu widać, że pytanie poszło za poprawką; istniejący mechanizm `?dodano=`.        |
| Okno minie w trakcie edycji (P3) | Odrzuć całość, formularz zachowuje dane                                                       | Bez połowicznego zapisu, którego nie widać.                                           |
| Limit 14 dni przy poprawie (P4)  | Od chwili poprawy, jak działa baza                                                            | Zero zmian w bazie, jedna reguła dla dodania i poprawy.                               |
| Testy (P5)                       | SQL + smoke + ręcznie, bez E2E                                                                | Zgodne z test-plan; ryzyka #1 i #3 pokryte w bazie i przez HTTP.                      |
| Zapis do bazy                    | Trzy funkcje `security invoker` z kodami SE006 (brak/cudzy wpis) i SE007 (okno zamknięte)     | Atomowa poprawa i nazwany kod zamiast ogólnego `P0001`, wzorem DP009/MD010.           |
| Wysyłka formularzy               | Poprawa i notatka: fetch z JSON; usunięcie: zwykły POST z potwierdzeniem                      | Stan formularza zostaje po błędzie; usunięcie jak przy lekach.                        |

## Scope

**In scope:**

- migracja z `correct_symptom_entry`, `set_symptom_entry_note`, `delete_symptom_entry` i sprawdzenia SQL
- trasy `/api/journal/[id]`, `/api/journal/[id]/note`, `/api/journal/[id]/delete`
- teksty w `JOURNAL_COPY` (filtr FR-012)
- ekran wpisu, ekran usunięcia, link i komunikaty na liście
- kroki smoke (API, izolacja kont, strony, brak danych w URL)

**Out of scope:**

- zmiana reguły 14 dni, częściowy zapis, edycja notatki na liście
- testy E2E, zmiany w wyzwalaczach S-05, historia zmian notatki
- `.limit` w zapytaniu listy (follow-up S-05)

## Architecture / Approach

Funkcje SQL sprawdzają kolejno: sesję, właściciela wpisu, okno, a dopiero potem treść — i zwracają nazwany kod; wyzwalacze S-05 zostają drugą linią obrony. Trasy API przyjmują id z URL (uuid), resztę w treści żądania. Jedna strona `.astro` wczytuje wpis i stan okna zegarem serwera; jeden komponent React pokazuje pełny formularz albo samą notatkę.

## Phases at a Glance

| Phase                 | What it delivers                                | Key risk                                                            |
| --------------------- | ----------------------------------------------- | ------------------------------------------------------------------- |
| 1. Funkcje bazy       | Trzy funkcje zapisu z kodami, sprawdzenia SQL   | Kolejność sprawdzeń — po zamknięciu okna błąd treści zamiast SE007  |
| 2. Trasy API i teksty | Trzy trasy, teksty, smoke HTTP i izolacja       | Smoke idący do produkcji zamiast lokalnej bazy                      |
| 3. Ekrany i lista     | Ekran wpisu, ekran usunięcia, link i komunikaty | Pole daty blokujące wysłanie wpisu datowanego blisko granicy 14 dni |

**Prerequisites:** lokalne Supabase (`npx supabase start`), S-05 i S-06 wdrożone (są).
**Estimated effort:** ~3 sesje, po jednej na fazę.

## Open Risks & Assumptions

- Wpis datowany prawie 14 dni wstecz: przesunięcie godziny wcześniej następnego dnia zostanie odrzucone (SE003) — świadomie przyjęte (P4).
- Po merge'u migracja wymaga `npx supabase db push` na produkcję.

## Success Criteria (Summary)

- Pomyłkę w objawie lub nasileniu da się poprawić w ciągu 24 h, a pytanie do lekarza idzie za poprawką.
- Po 24 h rdzeń wpisu jest nie do zmiany i nie do usunięcia, notatka da się zmienić.
- Żaden adres URL nie niesie nazwy objawu ani notatki; drugie konto nie poprawi ani nie usunie cudzego wpisu.
