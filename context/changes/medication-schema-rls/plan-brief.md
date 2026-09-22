# Schemat leków i okresów dawkowania z RLS — skrót planu

> Pełny plan: `context/changes/medication-schema-rls/plan.md`

## Co i po co

Pierwsza migracja lekomapy: lek użytkowniczki, jego skład i okresy dawkowania, z izolacją danych per-konto włączoną od pierwszego dnia. To fundament F-01 — bez niego nie ma czego zapisać ani w S-02 (dodanie leku ze znacznikiem kolizji), ani w S-05 (wpis o samopoczuciu). Ustala też dwie rzeczy dla całego produktu: konwencję migracji i ścieżkę weryfikacji izolacji.

## Punkt wyjścia

W repozytorium nie ma ani jednej migracji, ani jednej tabeli produktowej i pliku `src/types.ts`. Działa natomiast warstwa auth ze startera (`src/middleware.ts`, `src/lib/supabase.ts`), a `scripts/smoke.mjs` przechodzi ścieżkę auth po HTTP i jest odpalany w CI przeciw lokalnemu Supabase.

## Stan docelowy

Trzy tabele w bazie z włączonym RLS i ograniczeniami, które nie pozwalają historii skłamać: okresy dawkowania nie mogą się nakładać, a rdzeń wpisu nie daje się zmienić po zamknięciu okna korekty. `src/types.ts` opisuje te encje dla reszty kodu. `npm run smoke` dowodzi, że drugie konto nie widzi ani nie zmienia cudzych leków — i pada, gdyby ktoś RLS wyłączył.

## Podjęte decyzje

| Decyzja                    | Wybór                                                                      | Dlaczego                                                                                                                          |
| -------------------------- | -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Skład leku                 | Kopiowany przy leku użytkowniczki w chwili dodania                         | F-01 nie zależy od F-02, lek spoza rejestru chodzi tą samą ścieżką, a późniejsza poprawka rejestru nie przepisuje historii        |
| Powiązanie z rejestrem     | Zwykła kolumna `registry_medication_id` teraz, klucz obcy dociąga F-02     | Roadmapa mówi, że F-01 i F-02 są wzajemnie niezależne — klucz obcy od razu wymusiłby kolejność                                    |
| Kod ATC                    | Pełny kod przy każdej substancji, kontrola dopuszczająca wszystkie poziomy | Reguły z F-02 siedzą na grupach i dopasowują się po przedrostku; obcięcie kodu zabrałoby informację nie do odzyskania             |
| Nakładki okresów           | Blokowane ograniczeniem w bazie (`btree_gist`)                             | Błąd w kodzie S-03 pada od razu, zamiast po cichu psuć zdanie pokazane lekarzowi w S-06                                           |
| Niemodyfikowalność rdzenia | Wyzwalacz w bazie plus funkcja okna korekty                                | Obowiązuje każdą drogę zapisu, także przyszłe trasy API i ręczną poprawkę w panelu                                                |
| Usuwanie wierszy rdzenia   | Wyzwalacz `before delete` na tych samych zasadach, z wyjątkiem dla kaskady | Bez tego ochrona jest pozorna: wiersza nie da się zmienić, ale da się go skasować i wpisać od nowa                                |
| Okno korekty przed S-05    | Funkcja zwraca `true`, S-05 podmienia jej treść                            | Warunek zdarzeniowy potrzebuje tabeli dzienniczka, która jeszcze nie istnieje; reguła stoi od początku, zmienia się jedno miejsce |
| Dowód izolacji             | Krok w `scripts/smoke.mjs`, dwa konta                                      | Wyciek wywraca CI także przy każdej późniejszej tabeli; zero nowych zależności                                                    |
| Zapis leku w teście        | Skrypt sięga do Supabase bezpośrednio                                      | Fundament nie wciąga tras API przed S-02, które je uzasadnia                                                                      |
| Typy                       | Pisane ręcznie, bez generowania z bazy                                     | `npm run typecheck` nie wymaga wtedy uruchomionego Supabase                                                                       |

## Zakres

**W zakresie:** katalog `supabase/migrations/` i konwencja nazw; tabele `medications`, `medication_substances`, `dosage_periods`; RLS z dwunastoma politykami; ograniczenie przeciw nakładkom okresów; wyzwalacze niemodyfikowalności rdzenia przy zmianie i przy usuwaniu; plik sprawdzeń `supabase/tests/rls_checks.sql`; `src/types.ts`; krok izolacji w `scripts/smoke.mjs`; dopisek w `README.md`.

**Poza zakresem:** trasy API i ekrany (S-02); rejestr leków i pary kolizji (F-02); tabele dzienniczka (S-05); logika zamykania okresu (S-03); klucz obcy do rejestru (F-02); wdrożenie migracji na produkcję.

## Podejście

Jedna niepodzielna migracja — RLS i ograniczenia powstają razem z tabelami, bo dołożone później zostawiają okno, w którym dane zdrowotne leżą bez ochrony, a przy jednym koncie testowym nic tego nie ujawnia. Skład leku leży przy leku, nie za odniesieniem do rejestru. Ochrona historii siedzi w bazie, nie w kodzie. Tabele podrzędne nie mają własnej kolumny właściciela — przynależność sprawdzana jest przez lek nadrzędny, żeby nie powstały dwa źródła prawdy o tym, czyj jest wiersz.

## Fazy w skrócie

| Faza                    | Co dowozi                                      | Główne ryzyko                                                                                                 |
| ----------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| 1. Migracja             | Trzy tabele, RLS, ograniczenia, wyzwalacze     | Rozszerzenie `btree_gist` musi stać przed tabelą okresów; wyzwalacz musi przepuścić zamknięcie okresu         |
| 2. Typy encji           | `src/types.ts` i konwencja dla kolejnych zmian | Rozjechanie się typów z kontrolą wartości w migracji                                                          |
| 3. Weryfikacja izolacji | Krok dwóch kont w `scripts/smoke.mjs` + CI     | Krok, który przechodzi zawsze, także przy wyłączonym RLS — stąd bramka manualna sprawdzająca, że potrafi paść |

**Wymagania wstępne:** Docker i lokalne Supabase (`npx supabase start`), CLI z `devDependencies`. Brak zależności od F-02 i S-01.
**Szacowany rozmiar:** około dwóch–trzech sesji, po jednej na fazę; faza 1 jest najcięższa.

## Otwarte ryzyka i założenia

- Miara okna korekty dla leku pozostaje warunkiem zdarzeniowym z PRD, nie liczbą. Dopóki nie ma dzienniczka, funkcja przepuszcza wszystko — gdyby S-05 przyszło później niż S-02 i S-03, rdzeń wpisu jest w tym czasie edytowalny.
- Rollback nie cofa schematu. Pomyłka w migracji wymaga osobnej migracji odwracającej, nie `wrangler rollback`.
- Kontrola kształtu kodu ATC jest luźna celowo. Gdyby dane z rejestru w F-02 okazały się brudniejsze, niż widać dziś, kontrola może wymagać poluzowania — nie zaostrzenia.
- Wdrożenie migracji na produkcję wykonuje człowiek. Agent tego nie robi.

## Kryteria sukcesu

- Świeża baza przyjmuje migrację czysto, a trzy tabele mają RLS z politykami per-operacja i per-rola.
- Dwa konta w `npm run smoke` nie widzą nawzajem swoich leków, a wyłączenie RLS ten test wywraca.
- `npm run typecheck`, `npm run lint` i `npm run build` przechodzą, a `src/types.ts` opisuje encje dla S-02 i S-05.
