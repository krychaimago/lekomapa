# Nazwy leków i substancji poza adresami URL — Plan Brief

> Full plan: `context/changes/medication-names-out-of-urls/plan.md`

## What & Why

Po S-02 nazwa leku i substancji trafia do adresu URL w sześciu miejscach ścieżki dodawania leku (issue #57, finding F6). Adres zostaje w historii przeglądarki, zakładkach, nagłówku Referer i logach Cloudflare, a to, jaki lek ktoś bierze, jest daną zdrowotną. Komentarz w kodzie twierdzi przy tym, że dane zdrowotne nie podróżują w URL — co jest nieprawdą.

## Starting Point

`/leki/nowy` i `/leki/nowy/z-ulotki` działają na parametrach GET (`?q=`, `?nazwa=`, `?substancja=`, `?niedopasowana=`, `?data=`), podpowiedzi wołają `GET /api/registry/search?q=`, a trasa zapisu leku odsyła wpisany tekst w adresie przy każdym błędzie. Dawka już do adresu nie trafia. Regułę pilnuje dziś tylko komentarz.

## Desired End State

W ścieżce dodawania leku adres zawiera wyłącznie identyfikator wariantu (`?wariant=<uuid>`) i kod błędu (`?error=<kod>`). Wpisany tekst idzie w treści żądań POST i krótkotrwałych ciasteczkach HttpOnly. Wszystko działa bez JavaScriptu, odświeżenie nie pyta o ponowne wysłanie formularza. `npm test` i smoke odrzucają każdy powrót nazwy do adresu.

## Key Decisions Made

| Decision                            | Choice                                                                               | Why (1 sentence)                                                                           |
| ----------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| Wyszukiwanie                        | POST → ciasteczko HttpOnly (10 min) → powrót 303 na czyste `/leki/nowy`              | Odświeżenie i „Wstecz” działają normalnie, a ten sam mechanizm obsługuje błędy formularzy. |
| Wybór nazwy z wyników i podpowiedzi | `?wariant=<uuid>` pierwszego produktu grupy                                          | Identyfikator zamiast nazwy, zgodnie z lessonem; strona sama ustala nazwę.                 |
| Podpowiedzi                         | `POST /api/registry/search` z JSON `{ q }`                                           | Tekst w treści żądania, nie w adresie `fetch`.                                             |
| Podobne substancje                  | Przyciski wysyłające nazwę przez serwer, to samo ciasteczko                          | Działa bez JS; jeden mechanizm dla całej ścieżki.                                          |
| Kod błędu                           | Zostaje w adresie (`?error=`)                                                        | Nie jest daną zdrowotną; ten sam wzorzec mają pozostałe ekrany.                            |
| Ciasteczko a konto                  | Szkic niesie id konta; czyszczony przy wylogowaniu, usunięciu konta i udanym zapisie | Inna osoba w tej samej przeglądarce nie zobaczy cudzego wyszukiwania.                      |
| Strażnik                            | Test kodu z listą dozwolonych parametrów + smoke sprawdzający adresy przekierowań    | Łapie i nowy parametr w kodzie, i prawdziwą wartość w odpowiedzi serwera.                  |
| Stare linki z nazwą                 | Ignorowane (pusty formularz)                                                         | Żadna ścieżka kodu nie przyjmuje nazwy leku z adresu; strażnik bez wyjątków.               |

## Scope

**In scope:**

- `/leki/nowy`, `/leki/nowy/z-ulotki`, `POST /api/medications`, `/api/registry/search`, nowa trasa `POST /api/medications/draft`
- moduł ciasteczek szkicu, czyszczenie przy wylogowaniu i usunięciu konta
- test parametrów adresu, kroki smoke, dopisek w lessonie, poprawka fałszywego komentarza

**Out of scope:**

- obsługa starych zakładek z nazwą
- parametry identyfikatorów i flag na innych ekranach
- test E2E historii adresów
- czyszczenie historycznych logów Cloudflare

## Architecture / Approach

Formularze wyszukiwania i „podobnych substancji” wysyłają tekst do `POST /api/medications/draft`, który zapisuje go w ciasteczku HttpOnly ograniczonym ścieżką ekranu i czasem, po czym odpowiada 303 na czysty adres. Trasa zapisu leku przy błędzie robi to samo dla formularza z ulotki, a dla rejestru odsyła tylko `?wariant=` i `?error=`. Strony czytają szkic z ciasteczka i odrzucają go, gdy należy do innego konta. Grupa wyników wyszukiwania dostaje `productId`, więc każdy link i podpowiedź prowadzi na identyfikator.

## Phases at a Glance

| Phase                                     | What it delivers                                                                             | Key risk                                                                                 |
| ----------------------------------------- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| 1. Rejestr bez nazwy w adresie            | Ciasteczko szkicu, trasa szkicu, wyszukiwanie i podpowiedzi przez POST, wybór po `?wariant=` | `cookies.delete` bez właściwej ścieżki nie usuwa ciasteczka — szkic przetrwa wylogowanie |
| 2. Formularz z ulotki bez nazwy w adresie | Błędy i „brak dopasowania” w ciasteczku, przyciski podobnych substancji                      | Utrata wpisanych pól po błędzie, jeśli szkic się nie zapisze                             |
| 3. Strażnik reguły                        | Test parametrów adresu, smoke na każdym `location`, dopisek w lessonie                       | Zbyt wąski skaner przepuści adres zbudowany innym wzorcem                                |

**Prerequisites:** lokalny Supabase dla smoke; `.env` odsunięty na czas biegu, stary podgląd zatrzymany.
**Estimated effort:** ~3 sesje, po jednej na fazę.

## Open Risks & Assumptions

- `?wariant=<uuid>` wskazuje wiersz rejestru czytelny dla każdego zalogowanego konta — kto ma log i konto, może odczytać nazwę produktu. Lesson dopuszcza identyfikatory; ryzyko świadomie przyjęte.
- Logi Workera są włączone; nie wiadomo, czy zapisują nagłówek `Cookie`. Krok ręczny w fazie 3 to sprawdza — dotyczy też istniejącego ciasteczka sesji.
- Dwie karty z różnymi wyszukiwaniami nadpisują wspólne ciasteczko — ostatnie wyszukiwanie wygrywa.
- Odświeżenie strony po błędzie pokazuje ten sam błąd (jak dziś), dopóki szkic nie wygaśnie albo zapis się nie uda.

## Success Criteria (Summary)

- Przejście całej ścieżki dodawania leku (z JS i bez) zostawia w historii przeglądarki tylko adresy bez nazwy leku, substancji i dawki.
- `npm test` pada przy każdym nowym parametrze adresu spoza listy dozwolonych.
- Smoke pada, gdy jakiekolwiek przekierowanie w ścieżce dodawania zawiera wysłaną nazwę leku albo substancji.
