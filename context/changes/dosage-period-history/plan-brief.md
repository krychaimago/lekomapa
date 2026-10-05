# S-03: Historia okresów dawkowania — Plan Brief

> Full plan: `context/changes/dosage-period-history/plan.md`

## What & Why

Użytkowniczka zmienia dawkowanie leku: bieżący okres się zamyka, otwiera się nowy, a lek zostaje jedną pozycją z historią okresów od–do (US-04, FR-004). To rdzeń produktu. Nadpisanie dawki zamiast zamknięcia okresu sprawiłoby, że S-06 (pytanie do lekarza) zestawiałby objawy z dawką, której wtedy nie brano.

## Starting Point

Baza z F-01 pilnuje okresów: nie mogą się nakładać, nie mogą mieć zerowej długości, a zamknięcie okresu przechodzi zawsze. Aplikacja nie ma jednak żadnej drogi zapisu zmiany dawki, a szczegóły leku pokazują tylko bieżącą dawkę. Wariant (moc) jest dziś cechą leku, nie okresu. Formularze leku mają placeholdery wyglądające jak wpisana wartość i nie oznaczają pól obowiązkowych.

## Desired End State

Na szczegółach leku jest przycisk „Zmiana dawkowania” prowadzący do osobnego ekranu. Zapis zamyka stary okres i otwiera nowy w jednej transakcji. Szczegóły pokazują historię okresów od najnowszego, z dawką, mocą i datami („1.09.2026 – 9.10.2026”, „od 10.10.2026”). Formularze leku pokazują przykład pod polem i dopisek „(obowiązkowe)”.

## Key Decisions Made

| Decision                         | Choice                                                                                                          | Why (1 sentence)                                                                                                  |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Data zmiany                      | Domyślnie dziś, można cofnąć najwyżej o 14 dni i nie przed dzień po początku bieżącego okresu; nie w przyszłość | Spóźniony wpis nie przekłamuje osi czasu, a limit nie pozwala przepisać zamkniętej historii wstecz (US-04, S-06). |
| Data „do” na ekranie             | Ostatni dzień starej dawki (zmiana 10.10 → „do 9.10”)                                                           | Okresy nie dotykają się wizualnie — wiadomo, którą dawkę brano danego dnia.                                       |
| Ta sama dawka                    | Odrzucona z komunikatem (ten sam tekst bez wielkości liter i spacji na brzegach, ten sam wariant)               | Nie powstaje sztuczna „zmiana”, którą S-06 podbiłby w pierwszeństwie.                                             |
| Inna moc tego samego leku        | Zmiana dawki z wyborem wariantu; każdy okres pamięta swój wariant                                               | Historia zostaje jedną pozycją i S-06 może powiedzieć „po zwiększeniu dawki”.                                     |
| Wariant o innym składzie         | Odrzucony — to zakończenie leku i dodanie nowego                                                                | Substancja czynna jest niemodyfikowalna (US-04).                                                                  |
| Lek odstawiony                   | Zmiana zablokowana                                                                                              | Okres nie wychodzi poza datę odstawienia; S-04 dostaje czysty punkt startu.                                       |
| Zmiana w dniu rozpoczęcia okresu | Możliwa od jutra                                                                                                | Okres zerowej długości omijałby blokadę nakładania; brak podmiany tylnymi drzwiami.                               |
| Miejsce formularza               | Osobny ekran `/leki/<id>/zmiana-dawki`                                                                          | Wzorzec dodawania leku, wygodne na telefonie.                                                                     |
| Poprawka literówki               | Nie w S-03                                                                                                      | Okno korekty to zaślepka zawsze „otwarta” do S-05.                                                                |
| Droga zapisu                     | Jedna funkcja w bazie z nazwanymi kodami błędów                                                                 | Wszystko albo nic, jak dodawanie leku w S-02.                                                                     |
| Placeholdery                     | Przykład pod polem jako podpowiedź                                                                              | Rozjaśnienie placeholdera złamałoby próg kontrastu 7 : 1.                                                         |
| Pole obowiązkowe                 | Dopisek „(obowiązkowe)” w etykiecie                                                                             | Czytelne od razu i dla czytnika ekranu; gwiazdka wymaga legendy.                                                  |
| Testy                            | SQL + jednostkowe, w CI                                                                                         | Najtańsza warstwa pilnuje ryzyka #3 (historia); Playwright nie jest w CI.                                         |

## Scope

**In scope:**

- poprawki formularzy leku (podpowiedzi, „(obowiązkowe)”),
- wariant przy okresie dawkowania i jego ochrona po oknie korekty,
- funkcja `change_dosage` z regułami i testami SQL,
- historia okresów na szczegółach leku,
- ekran, formularz i trasa API zmiany dawki.

**Out of scope:**

- dawka wybierana z list (odłożona, kandydat na osobną zmianę),
- poprawka literówki bez nowego okresu,
- zmiana przy leku odstawionym i powrót do leku (S-04),
- zmiana substancji albo preparatu,
- wariant przy leku z ulotki,
- test E2E,
- ekrany auth,
- nazwa leku w URL na ekranach dodawania (#57),
- okno korekty (S-05).

## Architecture / Approach

Formularz (natywny POST) → trasa `POST /api/medications/<id>/dosage` (zod, mapowanie kodów) → funkcja `change_dosage` w bazie (`security invoker`, RLS jak przy zwykłym zapisie). Funkcja blokuje lek, sprawdza reguły i zamyka okres trwający, a potem otwiera nowy. Kolumna `dosage_periods.registry_product_id` przenosi wariant z leku do okresu; istniejące okresy dostają wariant leku. Po błędzie URL niesie wyłącznie klucz błędu.

## Phases at a Glance

| Phase                      | What it delivers                                 | Key risk                                                             |
| -------------------------- | ------------------------------------------------ | -------------------------------------------------------------------- |
| 1. Formularze leku         | Podpowiedź pod polem, „(obowiązkowe)”            | Tekst podpowiedzi trafiający w filtr FR-012                          |
| 2. Baza                    | Wariant przy okresie, `change_dosage`, testy SQL | Kolejność w migracji: uzupełnienie przed nową wersją strażnika       |
| 3. Historia na szczegółach | Lista okresów z datą „do” jako ostatnim dniem    | Pomyłka o jeden dzień na granicy miesiąca lub roku                   |
| 4. Ekran zmiany dawki      | Przycisk, ekran, trasa, komunikaty               | Kody błędów PostgREST inne niż zakładane — mierzone przed mapowaniem |

**Prerequisites:** S-02 (done); lokalny Supabase do `db:check` i smoke.
**Estimated effort:** ~4–5 sesji, po jednej na fazę; faza 2 największa.

## Open Risks & Assumptions

- Okno korekty jest zaślepką do S-05, więc do tego czasu okresy da się nadpisać bezpośrednim zapytaniem. S-03 tego nie zmienia.
- Zapis tylko przez funkcję to konwencja aplikacji: bezpośredni `INSERT` może ominąć reguły wariantu (znane ograniczenie z S-02).
- Reguła „ta sama dawka” porównuje tekst: „pół tabletki” i „½ tabletki” przejdą jako zmiana.
- Zakładamy, że warianty jednej nazwy zwykle mają ten sam skład. Pomiar w fazie 2 pokaże, jak często zadziała odrzucenie „inny skład”.

## Success Criteria (Summary)

- Po zmianie dawki szczegóły leku pokazują stary okres z datą końca i nowy trwający; lek nadal jest jedną pozycją.
- Każde odrzucenie (data, ta sama dawka, lek odstawiony, inny skład) daje zrozumiały komunikat, a dawka nie trafia do URL.
- Testy SQL w CI dowodzą każdej reguły nazwanym błędem.
