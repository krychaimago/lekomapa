# Tryb ciemny (S-11) — Plan Brief

> Full plan: `context/changes/dark-mode/plan.md`

## What & Why

Użytkowniczka może korzystać z lekomapy w trybie ciemnym na wszystkich ekranach M-1, z czytelnością na poziomie trybu jasnego. PRD wymaga trybu ciemnego, w którym możliwa kolizja nie wygląda jak alarm. To ostatnia pozycja kamienia milowego M-1.

## Starting Point

Ciemne wartości wszystkich kolorów są już w bloku `.dark` w `src/styles/global.css` (F-04), z testem kontrastu 7 : 1 i skanerem kolorów wpisanych na sztywno — bez wyjątków. Brakuje tylko tego, co włącza tryb: nic nie ustawia klasy `dark` na stronie i nie ma przełącznika.

## Desired End State

Bez żadnego wyboru lekomapa idzie za ustawieniem systemu, także na logowaniu. W Konto jest wybór: Jasny, Ciemny, Jak w systemie. We wnętrzu ikona przełącza na tryb przeciwny do widocznego. Strona nie miga innym trybem przy wczytaniu. Autorka zaakceptowała galerię zrzutów wszystkich ekranów w trybie ciemnym.

## Key Decisions Made

| Decision               | Choice                                                                  | Why (1 sentence)                                                                       |
| ---------------------- | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Skąd tryb              | Domyślnie za systemem + wybór jasny / ciemny / jak w systemie           | Działa bez klikania, a osoba, której ciemny nie służy, może go wyłączyć                |
| Pełny wybór            | Sekcja „Wygląd” w Konto                                                 | Prośba autorki; jedno miejsce z wszystkimi trzema opcjami                              |
| Ikona                  | We wnętrzu: pas boczny i nagłówek telefonu; przełącza na tryb przeciwny | Szybka zmiana bez wchodzenia w Konto; powrót do „jak w systemie” tylko w Konto         |
| Ikona przed logowaniem | Brak — wejście idzie za systemem lub zapamiętanym wyborem               | Jeden układ do zmiany zamiast dwóch                                                    |
| Zapis wyboru           | Ciasteczko na urządzeniu                                                | Serwer rysuje stronę od razu w dobrym trybie; bez migracji i nowej tabeli z RLS        |
| Przełączanie           | Zwykłe formularze POST, bez React                                       | Ten sam wzorzec co „Wyloguj się”; ikona dobiera się sama przez CSS także przy systemie |
| Strona prywatności     | Punkt o ciasteczkach rozszerzony o ciasteczko trybu                     | Dzisiejsze zdanie „wyłącznie do logowania” przestałoby być prawdą                      |
| Przegląd ekranów       | Galeria zrzutów z Playwrighta do akceptacji autorki                     | Wszystkie 31 ekranów w jednym miejscu, powtarzalne po poprawce                         |
| Poprawki z przeglądu   | Wyłącznie w tokenach `.dark`; zmiana układu = osobna zmiana             | Poprawka obejmuje wszystkie ekrany i zostaje pod testem kontrastu                      |

## Scope

**In scope:**

- ciasteczko trybu, klasa `dark` rysowana przez serwer, skrypt dla „jak w systemie”, `color-scheme` dla pól przeglądarki,
- trasa zapisu `/api/preferences/theme` z bezpiecznym adresem powrotu,
- sekcja „Wygląd” w Konto, ikona we wnętrzu, teksty, punkt o ciasteczkach na `/prywatnosc`,
- testy jednostkowe, test Playwright przełączania, galeria zrzutów i poprawki tokenów.

**Out of scope:**

- zapis wyboru na koncie (wspólny tryb na wszystkich urządzeniach),
- ikona na ekranach wejściowych i publicznych,
- „jak w systemie” bez JavaScriptu (pokazuje wtedy tryb jasny),
- zmiany układu ekranów, stałe porównywanie zrzutów w CI, tryb wydruku.

## Architecture / Approach

Preferencja żyje w ciasteczku `lekomapa-theme`. Wspólny `Layout.astro` czyta je na serwerze i rysuje `<html>` od razu z klasą `dark` albo bez. Przy „jak w systemie” mały skrypt w `<head>` ustawia klasę przed narysowaniem i słucha zmian systemu. Konto i ikona wysyłają formularz do jednej trasy, która zapisuje ciasteczko i wraca na ten sam ekran. Ikona ma dwa przyciski, z których CSS pokazuje jeden — właściwy dla widocznego trybu.

## Phases at a Glance

| Phase               | What it delivers                                              | Key risk                                                           |
| ------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------ |
| 1. Mechanizm trybu  | Tryb działa z ciasteczka i za systemem, bez mignięcia         | Skrypt odpalony za późno daje mignięcie jasnego ekranu             |
| 2. Przełączniki     | Wybór w Konto, ikona we wnętrzu, teksty, prywatność, test E2E | Ikona w nagłówku telefonu ciasno obok „Wyloguj się”                |
| 3. Przegląd ekranów | Galeria 31 ekranów × 2 rozmiary, akceptacja, poprawki tokenów | Ekrany wymagające specjalnego stanu (reset hasła) trudne do zrzutu |

**Prerequisites:** lokalny Supabase z kontem E2E (`.env.e2e`), wszystkie ekrany M-1 gotowe (spełnione — S-11 jest ostatni).
**Estimated effort:** ~3 sesje po jednej na fazę; faza 3 zależy od liczby usterek z przeglądu.

## Open Risks & Assumptions

- Ciemna paleta była projektowana przed ekranami — przegląd może wymagać kilku poprawek tokenów.
- Osoby z ciemnym systemem zobaczą lekomapę ciemną bez własnego wyboru — zamierzone.
- Wybór jest per urządzenie; na nowym urządzeniu wraca „jak w systemie”.

## Success Criteria (Summary)

- Każdy ekran ma tryb ciemny zgodny z wyborem albo z systemem, bez mignięcia.
- Tryb da się zmienić w Konto i ikoną we wnętrzu.
- Autorka zaakceptowała galerię; znacznik „Możliwa interakcja” w ciemnym nie wygląda jak alarm.
