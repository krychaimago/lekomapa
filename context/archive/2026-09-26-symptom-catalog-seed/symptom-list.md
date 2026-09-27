# Lista objawów do przeglądu

Źródło: issue #3 (`krychaimago/lekomapa`), sekcja „Treść listy”, rozstrzygnięcie Q-2 z 2026-09-21.

Status: **zatwierdzona przez autorkę 2026-09-26** — źródło migracji `20260926120100_symptom_catalog_seed.sql`.

## Jak czytać

- **Kolejność** — pozycja w obrębie kategorii (1 = na górze listy w S-05). Wg numerów z issue #3, zatwierdzona przez autorkę 2026-09-26. Zmiana kolejności to nowa migracja.
- **Klucz** — stały identyfikator po angielsku. Nie zmienia się nigdy po wgraniu; kolejne migracje odwołują się do objawu po kluczu, nie po nazwie. Poprawiać tylko teraz, przed pierwszym wgraniem.
- **Nazwa** — to, co widzi użytkowniczka. Można ją zmieniać także później (nowa migracja).
- **Słowa wyszukiwania** — małe litery, rozdzielone średnikiem. Co najmniej jedno przy każdym objawie. To samo słowo przy dwóch objawach jest dozwolone.

Kolejność kategorii w interfejsie: pokarmowy, nerwowy, psychika, skóra, krążenie, ogólne, mięśnie, pozostałe.

## Lista

| Kategoria | Kolejność | Klucz                     | Nazwa                           | Słowa wyszukiwania                                |
| --------- | --------- | ------------------------- | ------------------------------- | ------------------------------------------------- |
| pokarmowy | 1         | `nausea`                  | mdłości                         | nudności; niedobrze mi; zbiera się na wymioty     |
| pokarmowy | 2         | `vomiting`                | wymioty                         | zwracanie; rzyganie                               |
| pokarmowy | 3         | `diarrhea`                | biegunka                        | sraczka; rozwolnienie; luźne stolce               |
| pokarmowy | 4         | `constipation`            | zaparcia                        | twardy stolec; nie mogę się wypróżnić             |
| pokarmowy | 5         | `abdominal_pain`          | ból brzucha                     | ból żołądka; skurcze brzucha; kolka               |
| pokarmowy | 6         | `loss_of_appetite`        | brak apetytu                    | nie chce mi się jeść; wstręt do jedzenia          |
| pokarmowy | 7         | `dry_mouth`               | suchość w ustach                | zaschnięte usta; brak śliny                       |
| pokarmowy | 8         | `taste_change`            | zmiana smaku                    | metaliczny posmak; dziwny smak w ustach           |
| nerwowy   | 1         | `headache`                | ból głowy                       | migrena; łupanie w głowie                         |
| nerwowy   | 2         | `dizziness`               | zawroty głowy                   | kręci mi się w głowie; chwieje mnie               |
| nerwowy   | 3         | `drowsiness`              | senność                         | ospałość; ciągle chce mi się spać                 |
| nerwowy   | 4         | `insomnia`                | bezsenność                      | nie mogę zasnąć; budzę się w nocy                 |
| nerwowy   | 5         | `tremor`                  | drżenie                         | trzęsące się ręce; trzęsiączka                    |
| nerwowy   | 6         | `tingling_numbness`       | mrowienie i drętwienie          | ścierpnięte ręce; kłucie igiełkami                |
| nerwowy   | 7         | `concentration_problems`  | kłopoty z koncentracją          | mgła w głowie; rozkojarzenie; zapominanie         |
| psychika  | 1         | `anxiety`                 | niepokój                        | lęk; nerwowość; napięcie                          |
| psychika  | 2         | `low_mood`                | obniżony nastrój                | przygnębienie; smutek; chandra                    |
| psychika  | 3         | `irritability`            | drażliwość                      | rozdrażnienie; wybuchowość; irytacja              |
| skóra     | 1         | `rash`                    | wysypka                         | krostki; pokrzywka; plamy na skórze               |
| skóra     | 2         | `itching`                 | świąd                           | swędzenie; drapanie                               |
| skóra     | 3         | `excessive_sweating`      | nadmierne pocenie               | zlewne poty; nocne poty                           |
| krążenie  | 1         | `palpitations`            | kołatanie serca                 | serce wali; szybkie bicie serca; palpitacje       |
| krążenie  | 2         | `orthostatic_hypotension` | spadek ciśnienia przy wstawaniu | ciemno przed oczami; zasłabnięcie przy wstawaniu  |
| krążenie  | 3         | `edema`                   | obrzęki                         | opuchnięte nogi; opuchlizna; puchnięcie           |
| ogólne    | 1         | `fatigue`                 | zmęczenie                       | osłabienie; brak siły; wyczerpanie                |
| ogólne    | 2         | `weight_change`           | zmiana masy ciała               | tycie; chudnięcie; spadek wagi                    |
| ogólne    | 3         | `fever`                   | gorączka                        | podwyższona temperatura; stan podgorączkowy       |
| mięśnie   | 1         | `muscle_pain`             | bóle mięśni                     | łamanie w mięśniach; zakwasy bez wysiłku          |
| mięśnie   | 2         | `muscle_cramps`           | skurcze mięśni                  | kurcze; łapie mnie w łydce                        |
| pozostałe | 1         | `cough`                   | kaszel                          | suchy kaszel; pokasływanie                        |
| pozostałe | 2         | `dyspnea`                 | duszność                        | brak powietrza; zadyszka; nie mogę złapać oddechu |
| pozostałe | 3         | `vision_disturbance`      | zaburzenia widzenia             | zamazane widzenie; podwójne widzenie; mroczki     |
| pozostałe | 4         | `frequent_urination`      | częstsze oddawanie moczu        | częste siusianie; częste chodzenie do toalety     |
| pozostałe | 5         | `decreased_libido`        | spadek libido                   | brak ochoty na seks; obniżony popęd               |

## Liczności

- Objawy: 34 (pokarmowy 8, nerwowy 7, psychika 3, skóra 3, krążenie 3, ogólne 3, mięśnie 2, pozostałe 5).
- Słowa wyszukiwania: 82.

Po zmianach w przeglądzie liczności trzeba przeliczyć — CHECK 18 w `supabase/tests/rls_checks.sql` sprawdza dokładnie te liczby.
