# S-02: Dodanie leku ze znacznikiem możliwej kolizji — Plan Brief

> Full plan: `context/changes/add-medication-with-interaction-flag/plan.md`
> Research: `context/changes/add-medication-with-interaction-flag/research.md`

## What & Why

Użytkowniczka dodaje lek po nazwie handlowej albo z ulotki i od razu widzi przy nim znacznik możliwej kolizji z innym zapisanym lekiem. Pełna treść informacji ze składem i notą poglądową jest w szczegółach leku.

To gwiazda przewodnia roadmapy: jedyny przepływ, który uruchamia regułę kolizji od danych po komunikat. Zarazem jedyne miejsce, w którym produkt mógłby wyrządzić szkodę, dlatego język tekstów podlega testowi.

## Starting Point

Są:

- tabele leków, składu i okresów z RLS i strażnikami historii (F-01);
- rejestr 3273 preparatów i 24 pary kolizji (F-02);
- tokeny kolorów i szkielet wnętrza (F-04).

Nie ma:

- funkcji zapisu leku ani liczenia kolizji;
- strażnika UPDATE na `medications` (dług F-02);
- żadnego ekranu domenowego.

Okno korekty to wciąż zaślepka zwracająca `true`.

## Desired End State

- `/leki` w menu. Lista leków nieodstawionych, najnowsze na górze. Bursztynowy znacznik przy obu lekach z każdej pary. Pod listą stale nota i zdanie „Brak oznaczenia nie znaczy, że połączenie jest bezpieczne”.
- Dodanie z rejestru: „Szukaj” → nazwa → wariant (moc, postać, skład) → dawkowanie i data.
- Dodanie z ulotki: substancja z podpowiedzi albo świadomie „bez sprawdzania”.
- Szczegóły leku: skład, każda kolizja z nazwą drugiego leku i notą.
- Baza pilnuje spójności i historii. Smoke dowodzi znacznika i noty na zbudowanej aplikacji.

## Key Decisions Made

| Decyzja                              | Wybór                                                                                                                             | Dlaczego                                                                                                                                      | Źródło        |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| Lek spoza rejestru                   | Podpowiedź ze słownika (100 nazw) albo wolny tekst po świadomym potwierdzeniu; przy wolnym tekście linijka „nieobjęta żadną parą” | Każdy lek da się dodać, a brak znacznika przy leku niesprawdzonym nie udaje sprawdzonego                                                      | Plan          |
| Wybór z rejestru                     | Nazwa, potem wariant                                                                                                              | 3 nazwy mają różne substancje zależnie od wariantu, 1 (Sartesta) różne kody — pomiar i zapytanie w plan.md — sama nazwa dałaby fałszywy skład | Plan (pomiar) |
| Wyszukiwarka                         | Formularz „Szukaj” teraz, podpowiedzi jako ostatnia, odkładalna faza                                                              | Przepływ działa i jest sprawdzony, zanim dojdzie najdroższa część                                                                             | Plan          |
| Liczenie kolizji                     | Funkcja SQL `security invoker`                                                                                                    | Jedno źródło dla S-02 i S-08; test na prawdziwych kodach                                                                                      | Plan          |
| Który lek dostaje znacznik           | Oba leki z pary                                                                                                                   | Symetria reguły; kolejność dodania nie wskazuje „winnego” (FR-012)                                                                            | Plan          |
| Kolejność listy                      | Data rozpoczęcia malejąco, remis wg daty dodania                                                                                  | Nowy lek od razu widoczny; znacznik nie wpływa na kolejność                                                                                   | Plan          |
| F7 (dubel kodu)                      | Jeden wiersz na kod ATC w leku + częściowy indeks unikalny                                                                        | 4 produkty mają kod dwa razy; Ibuprofen Zentiva łamie obecny klucz                                                                            | Plan (pomiar) |
| Nazwa handlowa w rdzeniu             | Nie — etykieta; blokowane źródło składu i wskazany preparat                                                                       | PRD: nazwa jest wyłącznie etykietą; literówkę da się poprawić                                                                                 | Plan          |
| Substancja z wieloma kodami (ulotka) | Wszystkie kody tej nazwy                                                                                                          | Znacznik za dużo zamiast cichego braku, jak `derived_ambiguous`                                                                               | Plan          |
| Zapis                                | Atomowa funkcja w bazie zamiast trzech insertów                                                                                   | Brak leku bez składu albo okresu po błędzie w połowie                                                                                         | Research      |
| Teksty                               | Moduł kolizji (test FR-012 w całości) oddzielnie od tekstów formularza z „dawką”                                                  | Rdzeń `dawk` odrzuciłby etykiety formularza                                                                                                   | Research      |

## Scope

**In scope:**

- migracja: 3 funkcje, strażnik, kontrola spójności, F7, niepuste teksty;
- sprawdzenia SQL i INVARIANT 8;
- moduły copy z testem FR-012 i czyste funkcje z testami;
- ekrany: lista, dodanie z rejestru i z ulotki, szczegóły; trasa POST;
- kroki smoke; odkładalne podpowiedzi.

**Out of scope:**

- zmiana dawkowania (S-03), odstawienie i usunięcie (S-04), edycja nazwy w UI;
- stan okna korekty w UI;
- kilka substancji z ulotki;
- sekcja „Do omówienia z lekarzem”;
- indeks `pg_trgm`.

## Architecture / Approach

Reguła i zapis żyją w bazie: `add_medication_from_registry`, `add_medication_from_leaflet` i `medication_interactions()` to funkcje `security invoker`, więc RLS widzi wyłącznie dane wywołującej.

Aplikacja jest cienka:

- strony `.astro` renderowane serwerowo, sterowane parametrami GET;
- jedna trasa `POST /api/medications` z zod `discriminatedUnion("source")`;
- czyste funkcje w `src/lib/services/medications.ts` (kolejność, grupowanie, ucieczka `like`, podobne substancje).

Teksty o kolizji są w `src/lib/copy/interactions.ts` i czyta je także smoke.

## Phases at a Glance

| Faza                        | Co dostarcza                                                                   | Główne ryzyko                                           |
| --------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------- |
| 1. Baza                     | Zapis atomowy, kolizje, strażnik, F7, sprawdzenia SQL                          | Strażnik sprawdzalny tylko przez podmianę zaślepki okna |
| 2. Teksty i test FR-012     | Nota, zdanie o bezpieczeństwie, test języka, kolejność niezależna od znacznika | Wyjątek `bezpieczn` zbyt szeroki                        |
| 3. Rejestr + lista          | Gwiazda przewodnia: nazwa → wariant → znacznik                                 | Pierwszy ekran wnętrza, nowe komponenty shadcn          |
| 4. Szczegóły + ulotka       | Skład, treść kolizji z notą, ścieżka ulotki                                    | Cichy zapis bez kodu przy polskiej nazwie z ulotki      |
| 5. Smoke                    | Znacznik i nota na zbudowanej aplikacji                                        | Stary podgląd albo bieg do produkcji                    |
| 6. Podpowiedzi (odkładalna) | Podpowiedzi przy pisaniu                                                       | Dostępność listy podpowiedzi                            |

**Prerequisites:** lokalne Supabase (`npx supabase start`), F-01, F-02 i F-04 wdrożone.
**Estimated effort:** ~6–8 sesji po ~1–1,5 h. Fazy 1 i 3 największe; faza 6 do przesunięcia.

## Open Risks & Assumptions

- Lek z ulotki ma jedną substancję (Non-Goal PRD). Preparat złożony spoza rejestru straci składniki — łagodzi to linijka „nieobjęta żadną parą”, nie rozwiązuje.
- Strażnik UPDATE niczego realnie nie blokuje do S-05 (zaślepka okna). Dowodzą go tylko sprawdzenia z podmienioną funkcją.
- Brzmienie noty i zdań jest robocze. Autorka akceptuje je w fazie 2, a test pilnuje każdej wersji.
- Roadmapa podaje błędny pomiar dubli kodów (F7) — poprawiany w fazie 1.
- Gdzie leżą prawdziwe dane autorki (PRD Open Question 9) — nie blokuje implementacji, blokuje użycie na produkcji.

## Success Criteria (Summary)

- Po dodaniu dwóch leków z pary oba mają znacznik, a szczegóły pokazują skład, opis pary i notę.
- Każdy lek da się dodać. Lek niesprawdzony mówi to wprost, zamiast wyglądać jak bezpieczny.
- Test FR-012, sprawdzenia SQL i smoke padają na zepsutej implementacji i przechodzą na poprawnej.
