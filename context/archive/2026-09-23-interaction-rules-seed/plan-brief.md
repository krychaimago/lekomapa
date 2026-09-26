# Pary kolizji na grupach ATC i rejestr leków — Plan Brief

> Full plan: `context/changes/interaction-rules-seed/plan.md`

## What & Why

Do bazy trafia rejestr leków (nazwy handlowe ze składem, z Rejestru Produktów Leczniczych) oraz ~20 par kolizji zapisanych na grupach ATC. Bez nich S-02, gwiazda przewodnia, nie ma czego wyszukać przy dodawaniu leku ani czego oznaczyć znacznikiem.

## Starting Point

F-01 dało tabele leków użytkowniczki, ich składu i okresów dawkowania. Kod ATC przy substancji jest tam obowiązkowy, a `registry_medication_id` nie ma jeszcze powiązania z rejestrem. Tabel rejestru i par nie ma. Pomiar RPL z 2026-09-23 pokazał, że rejestr podaje kod ATC dla całego leku, a nie dla każdej substancji.

## Desired End State

W bazie jest rejestr zawężony do grup występujących w sprawdzonych parach, z kodem ATC przy **każdej substancji**, oraz pary sprawdzone przez autorkę. Zalogowana czyta oba zbiory, nie może ich zmienić, a niezalogowany nie widzi nic. Wszystko odtwarzalne z przypiętego pliku RPL i sprawdzane w CI.

Test decyzji, na którym to stoi:

- Na liście jest Ibuprom (`M01AE01`), w bazie para `C09CA × M01AE`.
- Diovan (walsartan `C09CA03`) daje znacznik ✔.
- Exforge HCT ma ten sam walsartan, ale RPL daje całemu lekowi kod `C09DX01`.
  - Z kodem leku przy każdej substancji: brak znacznika ✘.
  - Z kodem wyprowadzonym dla substancji: walsartan dostaje `C09CA03`, więc znacznik jest ✔.

## Key Decisions Made

| Decyzja                                                                    | Wybór                                                                                                                                                               | Dlaczego                                                                                                         |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Kod substancji w leku złożonym                                             | Z leku jednoskładnikowego tej samej substancji w RPL (walsartan ← Diovan); kod leku też zapisany; brak dopasowania = pusty kod + raport                             | Exforge HCT dostaje znacznik jak Diovan; zapis „hydrochlorotiazyd = C09DX01" byłby nieprawdą                     |
| Substancja z kilkoma kodami (ibuprofen: tabletka `M01AE01`, żel `M02AA13`) | Kod najbliższy kodowi leku; przy remisie wszystkie kody                                                                                                             | Tabletka złożona nie udaje żelu; przy remisie więcej znaczników zamiast cichego braku                            |
| Zakres rejestru                                                            | Wszystkie leki dla ludzi z zakresu: dawki, postacie, importy równoległe; ważność pozwolenia zapisana surowo                                                         | Użytkowniczka znajdzie swój lek niezależnie od opakowania; znaczenie dat niepotwierdzone                         |
| Droga danych do bazy                                                       | Skrypt generuje migracje z przypiętego pliku RPL (skrót w manifeście); na produkcję `db push` autorki                                                               | Ten sam stan lokalnie, w CI i na produkcji; agent bez dostępu do produkcji                                       |
| Źródło par                                                                 | Agent szkicuje CSV, autorka sprawdza każdą parę przy ulotce/ChPL i wpisuje datę; bez daty para nie wchodzi                                                          | Oszczędza czas autorki, decyzja o danych zdrowotnych zostaje przy niej                                           |
| Para grupy z samą sobą                                                     | Dopuszczalna (`M01AE × M01AE`: Ibuprom + Ketonal)                                                                                                                   | Łapie dwa leki jednej klasy od różnych lekarzy                                                                   |
| Lista grup filtra                                                          | Grupy ze sprawdzonych par, bez osobnej listy                                                                                                                        | Jedno źródło prawdy; nowa grupa = migracja dogrywająca                                                           |
| Język opisu pary                                                           | Walidator odrzuca słowa typu „powoduje", „odstaw", „nie łącz"                                                                                                       | FR-012 ma podlegać sprawdzeniu, nie być wytyczną                                                                 |
| Produkt bez składu w RPL (63 z 65 w zakresie to import równoległy)         | Skład z produktu o tej samej nazwie i kodzie, a gdy go brak, z kodu produktu; pochodzenie zapisane w `composition_source`                                           | Concor czy Sintrom z importu bez składu nie dostałyby znacznika nigdy                                            |
| Luki, których RPL nie domyka (literówki, kodeina, remisy, błąd Thinbanu)   | Plik poprawek: agent przygotowuje komplet ze źródłem przy każdym wierszu, autorka sprawdza i wpisuje datę; bez daty poprawka nie działa                             | Automat bierze dane tylko z RPL; ręczne sprawdzenie braku w ChPL czy indeksie WHO to weryfikacja, nie integracja |
| Zmiana F-01                                                                | Kod substancji może być pusty; klucz unikalny składu to (lek, nazwa, kod) z pustymi kodami traktowanymi jako równe; klucz obcy `registry_medication_id` do rejestru | Zamiast wymyślać kod substancji niedopasowanej; domknięcie długu F-01                                            |

## Scope

**In scope:**

- skrypty `scripts/rpl/`: pobieranie, parser, normalizacja, wyprowadzenie kodów, filtr, pomiar, generator, walidacja par, testy `node --test`,
- trzy tabele wspólne z RLS i zmiana F-01,
- CSV par ze szkicem,
- sprawdzenia SQL, kroki smoke, typy, README z uznaniem licencji CC BY 4.0.

**Out of scope:**

- wyszukiwanie i dodawanie leku, znacznik, reguła dopasowania w kodzie aplikacji (S-02),
- automatyczne pobieranie indeksu ATC WHO (ręczne sprawdzenie pojedynczych braków jest w zakresie, przez plik poprawek),
- odświeżanie rejestru,
- wdrożenie na produkcję,
- uznanie licencji w interfejsie (S-02).

## Architecture / Approach

Surowy XML RPL (74 MB, poza repo) → parser → słownik „nazwa substancji → kody" z całego rejestru → kod przy każdej substancji → filtr po grupach z par → dwie migracje danych (idempotentne, z nagłówkiem: stan, skrót, liczby). Schemat i RLS w osobnej, ręcznie pisanej migracji przed danymi.

## Phases at a Glance

| Faza                   | Co daje                                                                                                                           | Główne ryzyko                                                                   |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| 1. Skrypt RPL i pomiar | Raport liczb (ile substancji z kodem, ile pustych, ile remisów), uzupełnienie składu i mechanizm poprawek, zanim powstanie tabela | Normalizacja łacińskich nazw myli substancje                                    |
| 2. Schemat z RLS       | Trzy tabele tylko do odczytu, zmiana F-01, sprawdzenia SQL, typy                                                                  | Bramka mierzy nie to, co deklaruje (nazwane błędy, pomiar kodów)                |
| 3. Pary i poprawki     | CSV z ~20 parami i plik poprawek substancji, oba sprawdzone przez autorkę                                                         | Czas autorki; szkic agenta przyjęty bez sprawdzenia; poprawka z błędnym źródłem |
| 4. Dane i bramki       | Migracje danych, niezmienniki w SQL, kroki smoke                                                                                  | Migracja dogrywająca dubluje skład                                              |

**Prerequisites:** F-01 wdrożone (jest); dostęp do sieci przy pobieraniu RPL; lokalne Supabase i Docker.
**Estimated effort:** ~4 sesje agenta plus kilka godzin autorki na sprawdzenie par (Faza 3) i czytanie raportu (Faza 1).

## Open Risks & Assumptions

- Normalizacja nazw substancji jest heurystyką. Raport z Fazy 1 pokazuje niedopasowania i kolizje, zanim dane trafią do migracji.
- Zbiór par jest z założenia niepełny. Bariera „brak ostrzeżenia ≠ bezpieczne” należy do S-02.
- Rejestr starzeje się od dnia pobrania. Odświeżanie jest poza M-1.
- Wersja schematu XML RPL (v6.0.0) może zostać wycofana. Adres jest przypięty, manifest zapisuje wersję.

## Success Criteria (Summary)

- Każda substancja leku złożonego w bazie ma kod swojego leku jednoskładnikowego (test: walsartan w Exforge HCT = `C09CA03`, jak w Diovanie), więc S-02 oznaczy lek złożony tak jak prosty.
- Każda para w bazie ma źródło i datę sprawdzenia wpisaną przez autorkę, a język opisu przechodzi walidację FR-012.
- Zalogowana czyta rejestr i pary, nikt nie może ich zmienić z aplikacji, a CI to sprawdza.
