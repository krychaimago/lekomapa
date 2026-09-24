# Pomiar rejestru RPL dla zakresu par

> Wygenerowane przez `node scripts/rpl/measure.mjs`. Nie edytuj ręcznie — uruchom skrypt ponownie.
> Źródło: Rejestr Produktów Leczniczych, licencja CC BY 4.0.

## Plik źródłowy

- Adres: https://rejestry.ezdrowie.gov.pl/api/rpl/medicinal-products/public-pl-report/6.0.0/overall.xml
- Wersja schematu: 6.0.0
- `stanNaDzien`: 2026-09-23
- sha256: `13495542e12cd6d63b01770f21e185a5c50180d2db51154a62e5d6bcf13f01c0` (zgodny z `supabase/seed-data/rpl-snapshot.json`)
- Plik: `.cache/rpl/overall-6.0.0-2026-09-23.xml`
- Plik poprawek: `supabase/seed-data/substance-corrections.csv`

## Robocza lista grup

Grupy kandydujące przygotowane przez agenta, do przeglądu przez autorkę w fazie 3:

`C09AA`, `C09CA`, `C09DA`, `C09DX`, `C03AA`, `C03CA`, `C08CA`, `C07AB`, `C10AA`, `B01AA`, `B01AF`, `B01AC`, `M01AE`, `M01AB`, `N06AB`

## Liczby

„Przed” to samo wyprowadzenie z RPL. „Po” dodaje uzupełnienie składu produktów bez substancji i sprawdzone poprawki z pliku poprawek (tylko wiersze z `verified_on`).

| Miara                                                                    | Przed  | Po     |
| ------------------------------------------------------------------------ | ------ | ------ |
| Produkty dla ludzi                                                       | 20258  | 20258  |
| Produkty weterynaryjne (odrzucone)                                       | 2651   | 2651   |
| Produkty w zakresie                                                      | 3270   | 3270   |
| — w tym wieloskładnikowe                                                 | 803    | 803    |
| — w tym jednoskładnikowe                                                 | 2402   | 2467   |
| — w tym bez składu                                                       | 65     | 0      |
| Produkty w zakresie z uzupełnionym składem: odpowiednik (`sibling`)      | 0      | 63     |
| Produkty w zakresie z uzupełnionym składem: kod produktu (`atc_reverse`) | 0      | 2      |
| Produkty w zakresie ze składem z poprawki (`correction`)                 | 0      | 0      |
| Substancje z pustą nazwą w zakresie                                      | 0      | 0      |
| Hasła w słowniku substancji                                              | 1851   | 1851   |
| Poprawki zastosowane                                                     | 0      | 0      |
| Poprawki oczekujące (bez `verified_on`)                                  | —      | 0      |
| Poprawki odrzucone przez walidację                                       | —      | 0      |
| Luki bez źródła                                                          | —      | 84     |
| Szacowany rozmiar migracji danych                                        | 8.6 MB | 8.6 MB |

### Substancje produktów wieloskładnikowych w zakresie

Liczone per substancja. Remis daje kilka wierszy jednej substancji, więc liczba wierszy jest podana osobno.

| `atc_source`        | Substancje przed | Wiersze przed | Substancje po | Wiersze po |
| ------------------- | ---------------- | ------------- | ------------- | ---------- |
| `derived`           | 1685             | 1685          | 1685          | 1685       |
| `derived_ambiguous` | 36               | 108           | 36            | 108        |
| `corrected`         | 0                | 0             | 0             | 0          |
| `unmatched`         | 41               | 41            | 41            | 41         |

- Remisy potwierdzone poprawką `confirmed_ambiguous`: 0, nierozstrzygnięte: 36.
- Substancje `unmatched` potwierdzone poprawką `confirmed_unmatched`: 0, niewyjaśnione: 41.

Produkty jednoskładnikowe w zakresie bez poprawnego kodu ATC (substancja zapisana jako `unmatched`): przed 0, po 0.

## Próbka kontrolna

Stan „po”.

| Produkt                  | RPL id    | Moc                      | Kody produktu | W zakresie | Substancje i kody                                                                                                                                   |
| ------------------------ | --------- | ------------------------ | ------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Diovan                   | 100107195 | 80 mg                    | C09CA03       | tak        | Valsartanum: C09CA03 (product)                                                                                                                      |
| Diovan                   | 100107203 | 160 mg                   | C09CA03       | tak        | Valsartanum: C09CA03 (product)                                                                                                                      |
| Exforge HCT              | 100094647 | 5 mg +160 mg +12,5 mg    | C09DX01       | tak        | Amlodipini besilas: C08CA01 (derived); Valsartanum: C09CA03 (derived); Hydrochlorothiazidum: C03AA03 (derived)                                      |
| Exforge HCT              | 100095150 | 5 mg + 160 mg + 25 mg    | C09DX01       | tak        | Amlodipini besilas: C08CA01 (derived); Valsartanum: C09CA03 (derived); Hydrochlorothiazidum: C03AA03 (derived)                                      |
| Exforge HCT              | 100101301 | 10 mg + 320 mg + 25 mg   | C09DX01       | tak        | Amlodipini besilas: C08CA01 (derived); Valsartanum: C09CA03 (derived); Hydrochlorothiazidum: C03AA03 (derived)                                      |
| Exforge HCT              | 100215750 | 10 mg + 160 mg + 25 mg   | C09DX01       | tak        | Amlodipini besilas: C08CA01 (derived); Valsartanum: C09CA03 (derived); Hydrochlorothiazidum: C03AA03 (derived)                                      |
| Exforge HCT              | 100224676 | 10 mg + 160 mg + 12,5 mg | C09DX01       | tak        | Amlodipini besilas: C08CA01 (derived); Valsartanum: C09CA03 (derived); Hydrochlorothiazidum: C03AA03 (derived)                                      |
| Ibuprom                  | 100197985 | 200 mg                   | M01AE01       | tak        | Ibuprofenum: M01AE01 (product)                                                                                                                      |
| Ibuprom dla dzieci       | 100341940 | 100 mg/5 ml              | M01AE01       | tak        | Ibuprofenum: M01AE01 (product)                                                                                                                      |
| Ibuprom dla dzieci forte | 100341927 | 40 mg/ml                 | M01AE01       | tak        | Ibuprofenum: M01AE01 (product)                                                                                                                      |
| Ibuprom Effect żel       | 100383660 | 50 mg/g                  | M02AA13       | nie        | Ibuprofenum: M02AA13 (product)                                                                                                                      |
| Ibuprom Forte            | 100437053 | 400 mg                   | M01AE01       | tak        | Ibuprofenum: M01AE01 (product)                                                                                                                      |
| Ibuprom Max              | 100111044 | 400 mg                   | M01AE01       | tak        | Ibuprofenum: M01AE01 (product)                                                                                                                      |
| Ibuprom Max Express      | 100480231 | 400 mg                   | M01AE01       | tak        | Ibuprofenum: M01AE01 (product)                                                                                                                      |
| Ibuprom Max Rapid        | 100424286 | 400 mg                   | M01AE01       | tak        | Ibuprofenum: M01AE01 (product)                                                                                                                      |
| Ibuprom Max Sprint       | 100254068 | 400 mg                   | M01AE01       | tak        | Ibuprofenum: M01AE01 (product)                                                                                                                      |
| Ibuprom Rapid            | 100424317 | 200 mg                   | M01AE01       | tak        | Ibuprofenum: M01AE01 (product)                                                                                                                      |
| Ibuprom Regular          | 100437060 | 200 mg                   | M01AE01       | tak        | Ibuprofenum: M01AE01 (product)                                                                                                                      |
| Ibuprom RR MAX           | 100110702 | 400 mg                   | M01AE01       | tak        | Ibuprofenum: M01AE01 (product)                                                                                                                      |
| Ibuprom Sport spray      | 100390430 | 50 mg/g                  | M02AA13       | nie        | Ibuprofenum: M02AA13 (product)                                                                                                                      |
| Ibuprom Sprint           | 100197991 | 200 mg                   | M01AE01       | tak        | Ibuprofenum: M01AE01 (product)                                                                                                                      |
| Ibuprom Ultramax         | 100328520 | 600 mg                   | M01AE01       | tak        | Ibuprofenum: M01AE01 (product)                                                                                                                      |
| Ibuprom Ultramax Sprint  | 100433635 | 600 mg                   | M01AE01       | tak        | Ibuprofenum: M01AE01 (product)                                                                                                                      |
| Ibuprom Zatoki           | 100194780 | 200 mg + 30 mg           | M01AE51       | tak        | Ibuprofenum: M01AE01 (derived); Pseudoephedrini hydrochloridum: R01BA02 (derived)                                                                   |
| Ibuprom Zatoki Max       | 100427681 | 400 mg + 60 mg           | M01AE51       | tak        | Ibuprofenum: M01AE01 (derived); Pseudoephedrini hydrochloridum: R01BA02 (derived)                                                                   |
| Ibuprom Zatoki Sprint    | 100413940 | 200 mg + 30 mg           | M01AE51       | tak        | Ibuprofenum: M01AE01 (derived); Pseudoephedrini hydrochloridum: R01BA02 (derived)                                                                   |
| Ibuprom Zatoki Tabs      | 100306291 | 200 mg + 6,1 mg          | M01AE51       | tak        | Ibuprofenum: M01AE01 (derived); Phenylephrini hydrochloridum: C01CA06 (derived_ambiguous), R01BA03 (derived_ambiguous), S01FB01 (derived_ambiguous) |

## Luki bez źródła (84)

Luki w zakresie („po”), dla których plik poprawek nie ma żadnego wiersza — ani sprawdzonego, ani oczekującego: produkty bez składu, substancje `unmatched`, remisy i używane w zakresie hasła z kodami z różnych grup anatomicznych.

| Luka                              | Produkt                                    | RPL id    | Substancja                            | Kody / kandydaci                                     |
| --------------------------------- | ------------------------------------------ | --------- | ------------------------------------- | ---------------------------------------------------- |
| `unmatched`                       | Aspimag                                    | 100007803 | Magnesii oxidum                       | brak kandydatów                                      |
| `unmatched`                       | Tialorid                                   | 100066705 | Amiloridi hydrochloridum              | brak kandydatów                                      |
| `unmatched`                       | Tialorid mite                              | 100066711 | Amiloridi hydrochloridum              | brak kandydatów                                      |
| `unmatched`                       | Pluscard                                   | 100094179 | Glycinum                              | brak kandydatów                                      |
| `unmatched`                       | Venogel                                    | 100114261 | Tribenosidum                          | brak kandydatów                                      |
| `unmatched`                       | ParoGen                                    | 100157112 | Carboxymethylamylum natricum (typ A)  | brak kandydatów                                      |
| `unmatched`                       | Nurofen Plus                               | 100200049 | Codeini phosphas                      | brak kandydatów                                      |
| `unmatched`                       | Amlator                                    | 100252974 | Atorwastyatyna z L-lizyną             | brak kandydatów                                      |
| `unmatched`                       | Amlator                                    | 100253028 | Atorwastyatyna z L-lizyną             | brak kandydatów                                      |
| `unmatched`                       | Amlator                                    | 100253034 | Atorwastyatyna z L-lizyną             | brak kandydatów                                      |
| `unmatched`                       | Amlator                                    | 100253040 | Atorwastyatyna z L-lizyną             | brak kandydatów                                      |
| `unmatched`                       | Ibuprofen Forte DOZ                        | 100260181 | Cellulosum microcristallinum          | brak kandydatów                                      |
| `unmatched`                       | Entresto                                   | 100309013 | Sacubitrilum                          | brak kandydatów                                      |
| `unmatched`                       | Entresto                                   | 100357087 | Sacubitrilum                          | brak kandydatów                                      |
| `unmatched`                       | Entresto                                   | 100357093 | Sacubitrilum                          | brak kandydatów                                      |
| `unmatched`                       | Neparvis                                   | 100372804 | Sacubitrilum                          | brak kandydatów                                      |
| `unmatched`                       | Neparvis                                   | 100372810 | Sacubitrilum                          | brak kandydatów                                      |
| `unmatched`                       | Neparvis                                   | 100373264 | Sacubitrilum                          | brak kandydatów                                      |
| `unmatched`                       | Polopiryna Complex                         | 100384807 | Chlorphenamini maleas                 | brak kandydatów                                      |
| `unmatched`                       | Entresto                                   | 100484187 | Sacubitrilum                          | brak kandydatów                                      |
| `unmatched`                       | Entresto                                   | 100484194 | Sacubitrilum                          | brak kandydatów                                      |
| `unmatched`                       | Culbista                                   | 100491243 | Sacubitrilum natricum                 | brak kandydatów                                      |
| `unmatched`                       | Culbista                                   | 100491250 | Sacubitrilum natricum                 | brak kandydatów                                      |
| `unmatched`                       | Culbista                                   | 100491268 | Sacubitrilum natricum                 | brak kandydatów                                      |
| `unmatched`                       | Sartesta                                   | 100491275 | Sacubitrilum natricum                 | brak kandydatów                                      |
| `unmatched`                       | Sartesta                                   | 100491282 | Sacubitrilum natricum                 | brak kandydatów                                      |
| `unmatched`                       | Sartesta                                   | 100491290 | Sacubitrilum natricum                 | brak kandydatów                                      |
| `unmatched`                       | Albaliva                                   | 100498305 | Sacubitrilum                          | brak kandydatów                                      |
| `unmatched`                       | Albaliva                                   | 100498312 | Sacubitrilum                          | brak kandydatów                                      |
| `unmatched`                       | Albaliva                                   | 100498320 | Sacubitrilum                          | brak kandydatów                                      |
| `unmatched`                       | Valkubit                                   | 100501151 | Sacubitrilum                          | brak kandydatów                                      |
| `unmatched`                       | Valkubit                                   | 100501169 | Sacubitrilum                          | brak kandydatów                                      |
| `unmatched`                       | Valkubit                                   | 100501176 | Sacubitrilum                          | brak kandydatów                                      |
| `unmatched`                       | Neparvis                                   | 100502023 | Sacubitrilum                          | brak kandydatów                                      |
| `unmatched`                       | Neparvis                                   | 100502030 | Sacubitrilum                          | brak kandydatów                                      |
| `unmatched`                       | Sacubitril/Valsartan Gedeon Richter        | 100503779 | Sacubitrilum natricum                 | brak kandydatów                                      |
| `unmatched`                       | Sacubitril/Valsartan Gedeon Richter        | 100503786 | Sacubitrilum natricum                 | brak kandydatów                                      |
| `unmatched`                       | Sacubitril/Valsartan Gedeon Richter        | 100503793 | Sacubitrilum natricum                 | brak kandydatów                                      |
| `unmatched`                       | Brazier                                    | 100510685 | Sacubitrilum natricum                 | brak kandydatów                                      |
| `unmatched`                       | Brazier                                    | 100510692 | Sacubitrilum natricum                 | brak kandydatów                                      |
| `unmatched`                       | Brazier                                    | 100510705 | Sacubitrilum natricum                 | brak kandydatów                                      |
| remis                             | Arthrotec                                  | 100001491 | Misoprostolum                         | A02BB01, G02AD06                                     |
| remis                             | Olfen 75                                   | 100049322 | Lidocaini hydrochloridum monohydricum | A01AD11, C01BB01, C05AD01, N01BB02, R02AD02, S01HA07 |
| remis                             | Arthrotec Forte                            | 100087216 | Misoprostolum                         | A02BB01, G02AD06                                     |
| remis                             | Venogel                                    | 100114261 | Diclofenacum natricum                 | A01AD11, D11AX18, M01AB05, M02AA15, S01BC03          |
| remis                             | Bisoratio ASA                              | 100275202 | Acidum acetylsalicylicum              | A01AD05, B01AC06, N02BA01                            |
| remis                             | Bisoratio ASA                              | 100275219 | Acidum acetylsalicylicum              | A01AD05, B01AC06, N02BA01                            |
| remis                             | Acatar Zatoki Tabs                         | 100306279 | Phenylephrini hydrochloridum          | C01CA06, R01BA03, S01FB01                            |
| remis                             | Ibuprom Zatoki Tabs                        | 100306291 | Phenylephrini hydrochloridum          | C01CA06, R01BA03, S01FB01                            |
| remis                             | Modafen Grip                               | 100306836 | Phenylephrini hydrochloridum          | C01CA06, R01BA03, S01FB01                            |
| remis                             | Nasivin Zatoki i Katar                     | 100327531 | Ibuprofenum                           | C01EB16, M01AE01, M02AA13                            |
| remis                             | Arthrotec                                  | 100348763 | Misoprostolum                         | A02BB01, G02AD06                                     |
| remis                             | Polopiryna Complex                         | 100384807 | Acidum acetylsalicylicum              | A01AD05, B01AC06, N02BA01                            |
| remis                             | Polopiryna Complex                         | 100384807 | Phenylephrini bitartras               | C01CA06, R01BA03, S01FB01                            |
| remis                             | Zahron ASA                                 | 100407862 | Acidum acetylsalicylicum              | A01AD05, B01AC06, N02BA01                            |
| remis                             | Zahron ASA                                 | 100407879 | Acidum acetylsalicylicum              | A01AD05, B01AC06, N02BA01                            |
| remis                             | Zahron ASA                                 | 100407891 | Acidum acetylsalicylicum              | A01AD05, B01AC06, N02BA01                            |
| remis                             | Rosuvastatin + Acetylsalicylic acid Rafarm | 100407900 | Acidum acetylsalicylicum              | A01AD05, B01AC06, N02BA01                            |
| remis                             | Rosuvastatin + Acetylsalicylic acid Rafarm | 100410462 | Acidum acetylsalicylicum              | A01AD05, B01AC06, N02BA01                            |
| remis                             | Rosuvastatin + Acetylsalicylic acid Rafarm | 100410479 | Acidum acetylsalicylicum              | A01AD05, B01AC06, N02BA01                            |
| remis                             | Infex Zatoki                               | 100421282 | Ibuprofenum                           | C01EB16, M01AE01, M02AA13                            |
| remis                             | Ibuxal Plus                                | 100421655 | Ibuprofenum                           | C01EB16, M01AE01, M02AA13                            |
| remis                             | Rosuvastatin/Acetylsalicylic acid Teva     | 100427149 | Acidum acetylsalicylicum              | A01AD05, B01AC06, N02BA01                            |
| remis                             | Rosuvastatin/Acetylsalicylic acid Teva     | 100427155 | Acidum acetylsalicylicum              | A01AD05, B01AC06, N02BA01                            |
| remis                             | Rosuvastatin/Acetylsalicylic acid Teva     | 100427161 | Acidum acetylsalicylicum              | A01AD05, B01AC06, N02BA01                            |
| remis                             | Frimig Duo                                 | 100446477 | Naproxenum natricum                   | M01AE02, M02AA12                                     |
| remis                             | Hadmuliv                                   | 100447531 | Ibuprofenum                           | C01EB16, M01AE01, M02AA13                            |
| remis                             | Bazdygor                                   | 100447548 | Ibuprofenum                           | C01EB16, M01AE01, M02AA13                            |
| remis                             | Kivenul                                    | 100447554 | Ibuprofenum                           | C01EB16, M01AE01, M02AA13                            |
| remis                             | Gexiro                                     | 100460398 | Ibuprofenum natricum dihydricum       | C01EB16, M01AE01, M02AA13                            |
| remis                             | Gexiro                                     | 100460705 | Ibuprofenum                           | C01EB16, M01AE01, M02AA13                            |
| remis                             | Arthrotec                                  | 100476360 | Misoprostolum                         | A02BB01, G02AD06                                     |
| remis                             | Excedrin Duo                               | 100488204 | Ibuprofenum                           | C01EB16, M01AE01, M02AA13                            |
| remis                             | Arthrotec Forte                            | 100489434 | Misoprostolum                         | A02BB01, G02AD06                                     |
| remis                             | Arthrotec                                  | 100490084 | Misoprostolum                         | A02BB01, G02AD06                                     |
| remis                             | Orebriton Plus                             | 100508147 | Acidum acetylsalicylicum              | A01AD05, B01AC06, N02BA01                            |
| remis                             | DicloDuo Combi                             | 100539095 | Diclofenacum natricum                 | A01AD11, D11AX18, M01AB05, M02AA15, S01BC03          |
| kody z różnych grup anatomicznych | —                                          | —         | acidum acetylsalicylicum              | A01AD05, B01AC06, N02BA01                            |
| kody z różnych grup anatomicznych | —                                          | —         | diclofenacum                          | A01AD11, D11AX18, M01AB05, M02AA15, S01BC03          |
| kody z różnych grup anatomicznych | —                                          | —         | ibuprofenum                           | C01EB16, M01AE01, M02AA13                            |
| kody z różnych grup anatomicznych | —                                          | —         | lidocainum                            | A01AD11, C01BB01, C05AD01, N01BB02, R02AD02, S01HA07 |
| kody z różnych grup anatomicznych | —                                          | —         | misoprostolum                         | A02BB01, G02AD06                                     |
| kody z różnych grup anatomicznych | —                                          | —         | phenylephrinum                        | C01CA06, R01BA03, S01FB01                            |
| kody z różnych grup anatomicznych | —                                          | —         | rivaroxabanum                         | A10BA02, B01AF01, B01AX06                            |

## Produkty z uzupełnionym składem w zakresie (65)

Skład dopisany polami `composition_source` i `composition_source_rpl_id`; treść źródłowa (`raw`) zostaje nietknięta.

| Produkt                                 | RPL id    | Typ procedury | Kody produktu | Skąd                                | RPL id odpowiednika | Skład                     |
| --------------------------------------- | --------- | ------------- | ------------- | ----------------------------------- | ------------------- | ------------------------- |
| Aspirin Cardio                          | 100271658 | IR            | B01AC06       | produkt o tej samej nazwie i kodach | 100007855           | Acidum acetylsalicylicum  |
| Betaloc ZOK 100                         | 100277856 | IR            | C07AB02       | produkt o tej samej nazwie i kodach | 100077784           | Metoprololi succinas      |
| Betaloc ZOK 100                         | 100307988 | IR            | C07AB02       | produkt o tej samej nazwie i kodach | 100077784           | Metoprololi succinas      |
| Betaloc ZOK 100                         | 100310476 | IR            | C07AB02       | produkt o tej samej nazwie i kodach | 100077784           | Metoprololi succinas      |
| Betaloc ZOK 50                          | 100277738 | IR            | C07AB02       | produkt o tej samej nazwie i kodach | 100077821           | Metoprololi succinas      |
| Betaloc ZOK 50                          | 100280120 | IR            | C07AB02       | produkt o tej samej nazwie i kodach | 100077821           | Metoprololi succinas      |
| Betaloc ZOK 50                          | 100313658 | IR            | C07AB02       | produkt o tej samej nazwie i kodach | 100077821           | Metoprololi succinas      |
| Betaloc ZOK 50                          | 100314089 | IR            | C07AB02       | produkt o tej samej nazwie i kodach | 100077821           | Metoprololi succinas      |
| Beto 100 ZK                             | 100289227 | IR            | C07AB02       | produkt o tej samej nazwie i kodach | 100137196           | Metoprololi succinas      |
| Beto 100 ZK                             | 100294100 | IR            | C07AB02       | produkt o tej samej nazwie i kodach | 100137196           | Metoprololi succinas      |
| Beto 150 ZK                             | 100290450 | IR            | C07AB02       | produkt o tej samej nazwie i kodach | 100137026           | Metoprololi succinas      |
| Beto 150 ZK                             | 100304369 | IR            | C07AB02       | produkt o tej samej nazwie i kodach | 100137026           | Metoprololi succinas      |
| Beto 150 ZK                             | 100414135 | IR            | C07AB02       | produkt o tej samej nazwie i kodach | 100137026           | Metoprololi succinas      |
| Beto 200 ZK                             | 100005193 | IR            | C07AB02       | produkt o tej samej nazwie i kodach | 100135978           | Metoprololi succinas      |
| Beto 200 ZK                             | 100302117 | IR            | C07AB02       | produkt o tej samej nazwie i kodach | 100135978           | Metoprololi succinas      |
| Beto 200 ZK                             | 100304375 | IR            | C07AB02       | produkt o tej samej nazwie i kodach | 100135978           | Metoprololi succinas      |
| Beto 25 ZK                              | 100307215 | IR            | C07AB02       | produkt o tej samej nazwie i kodach | 100136989           | Metoprololi succinas      |
| Beto 50 ZK                              | 100288564 | IR            | C07AB02       | produkt o tej samej nazwie i kodach | 100137003           | Metoprololi succinas      |
| Beto 50 ZK                              | 100291678 | IR            | C07AB02       | produkt o tej samej nazwie i kodach | 100137003           | Metoprololi succinas      |
| Beto 50 ZK                              | 100293097 | IR            | C07AB02       | produkt o tej samej nazwie i kodach | 100137003           | Metoprololi succinas      |
| Beto 50 ZK                              | 100305713 | IR            | C07AB02       | produkt o tej samej nazwie i kodach | 100137003           | Metoprololi succinas      |
| Cataflam 50                             | 100287582 | IR            | M01AB05       | produkt o tej samej nazwie i kodach | 100013100           | Diclofenacum kalicum      |
| Cataflam 50                             | 100296078 | IR            | M01AB05       | produkt o tej samej nazwie i kodach | 100013100           | Diclofenacum kalicum      |
| Cataflam 50                             | 100304406 | IR            | M01AB05       | produkt o tej samej nazwie i kodach | 100013100           | Diclofenacum kalicum      |
| Clopidogrel Krka                        | 100290549 | CEN           | B01AC04       | kod produktu                        | —                   | Clopidogrelum             |
| Concor 10                               | 100265586 | IR            | C07AB07       | produkt o tej samej nazwie i kodach | 100015560           | Bisoprololi fumaras       |
| Concor 10                               | 100306204 | IR            | C07AB07       | produkt o tej samej nazwie i kodach | 100015560           | Bisoprololi fumaras       |
| Concor 5                                | 100045235 | IR            | C07AB07       | produkt o tej samej nazwie i kodach | 100015576           | Bisoprololi fumaras       |
| Concor 5                                | 100310714 | IR            | C07AB07       | produkt o tej samej nazwie i kodach | 100015576           | Bisoprololi fumaras       |
| Concor Cor 2,5                          | 100259628 | IR            | C07AB07       | produkt o tej samej nazwie i kodach | 100099975           | Bisoprololi fumaras       |
| Concor Cor 2,5                          | 100293536 | IR            | C07AB07       | produkt o tej samej nazwie i kodach | 100099975           | Bisoprololi fumaras       |
| Concor Cor 2,5                          | 100309177 | IR            | C07AB07       | produkt o tej samej nazwie i kodach | 100099975           | Bisoprololi fumaras       |
| Concor Cor 5                            | 100293341 | IR            | C07AB07       | produkt o tej samej nazwie i kodach | 100099998           | Bisoprololi fumaras       |
| Concor Cor 5                            | 100297681 | IR            | C07AB07       | produkt o tej samej nazwie i kodach | 100099998           | Bisoprololi fumaras       |
| Concor Cor 5                            | 100308918 | IR            | C07AB07       | produkt o tej samej nazwie i kodach | 100099998           | Bisoprololi fumaras       |
| Dexak                                   | 100436071 | IR            | M01AE17       | produkt o tej samej nazwie i kodach | 100163667           | Dexketoprofenum           |
| Diclac 150 Duo                          | 100264173 | IR            | M01AB05       | produkt o tej samej nazwie i kodach | 100109886           | Diclofenacum natricum     |
| Dicloratio retard 100                   | 100291945 | IR            | M01AB05       | produkt o tej samej nazwie i kodach | 100324544           | Diclofenacum natricum     |
| Dicloratio retard 100                   | 100304292 | IR            | M01AB05       | produkt o tej samej nazwie i kodach | 100324544           | Diclofenacum natricum     |
| Escitil                                 | 100309970 | IR            | N06AB10       | produkt o tej samej nazwie i kodach | 100217819           | Escitalopramum            |
| Inhibace                                | 100042521 | IR            | C09AA08       | produkt o tej samej nazwie i kodach | 100030624           | Cilazaprilum              |
| Inhibace                                | 100057391 | IR            | C09AA08       | produkt o tej samej nazwie i kodach | 100030624           | Cilazaprilum              |
| Irprestan                               | 100219681 | DCP           | C09DA04       | produkt o tej samej nazwie i kodach | 100219698           | Irbesartanum              |
| Karbis                                  | 100413727 | IR            | C09CA06       | produkt o tej samej nazwie i kodach | 100054145           | Candesartanum cilexetili  |
| Karbis                                  | 100413733 | IR            | C09CA06       | produkt o tej samej nazwie i kodach | 100054145           | Candesartanum cilexetili  |
| Karbis                                  | 100413756 | IR            | C09CA06       | produkt o tej samej nazwie i kodach | 100054145           | Candesartanum cilexetili  |
| Karbis                                  | 100413868 | IR            | C09CA06       | produkt o tej samej nazwie i kodach | 100054145           | Candesartanum cilexetili  |
| Karbis                                  | 100415376 | IR            | C09CA06       | produkt o tej samej nazwie i kodach | 100054145           | Candesartanum cilexetili  |
| Karbis                                  | 100416559 | IR            | C09CA06       | produkt o tej samej nazwie i kodach | 100054145           | Candesartanum cilexetili  |
| Nimotop S                               | 100293252 | IR            | C08CA06       | produkt o tej samej nazwie i kodach | 100047470           | Nimodipinum               |
| Nimotop S                               | 100293648 | IR            | C08CA06       | produkt o tej samej nazwie i kodach | 100047470           | Nimodipinum               |
| Noclaud                                 | 100371414 | IR            | B01AC23       | produkt o tej samej nazwie i kodach | 100315516           | Cilostazolum              |
| Noclaud                                 | 100375688 | IR            | B01AC23       | produkt o tej samej nazwie i kodach | 100315516           | Cilostazolum              |
| Nurofen dla dzieci Junior pomarańczowy  | 100446951 | IR            | M01AE01       | produkt o tej samej nazwie i kodach | 100241686           | Ibuprofenum               |
| Nurofen dla dzieci Junior truskawkowy   | 100444828 | IR            | M01AE01       | produkt o tej samej nazwie i kodach | 100241692           | Ibuprofenum               |
| Nurofen dla dzieci o smaku truskawkowym | 100307830 | IR            | M01AE01       | kod produktu                        | —                   | Ibuprofenum               |
| Prinivil                                | 100307971 | IR            | C09AA03       | produkt o tej samej nazwie i kodach | 100325727           | Lisinoprilum              |
| Seroxat                                 | 100255961 | IR            | N06AB05       | produkt o tej samej nazwie i kodach | 100060832           | Paroxetini hydrochloridum |
| Seroxat                                 | 100285689 | IR            | N06AB05       | produkt o tej samej nazwie i kodach | 100060832           | Paroxetini hydrochloridum |
| Simvacard 20                            | 100289003 | IR            | C10AA01       | produkt o tej samej nazwie i kodach | 100108272           | Simvastatinum             |
| Sintrom                                 | 100226824 | IR            | B01AA07       | produkt o tej samej nazwie i kodach | 100061151           | Acenocoumarolum           |
| Sintrom                                 | 100292376 | IR            | B01AA07       | produkt o tej samej nazwie i kodach | 100061151           | Acenocoumarolum           |
| Sintrom                                 | 100306530 | IR            | B01AA07       | produkt o tej samej nazwie i kodach | 100061151           | Acenocoumarolum           |
| Sintrom                                 | 100310335 | IR            | B01AA07       | produkt o tej samej nazwie i kodach | 100061151           | Acenocoumarolum           |
| Voltaren SR 75                          | 100264411 | IR            | M01AB05       | produkt o tej samej nazwie i kodach | 100071600           | Diclofenacum natricum     |

## Produkty w zakresie nadal bez składu (0)

_brak_

## Poprawki zastosowane (0)

_brak_

## Poprawki oczekujące (0)

Wiersze bez `verified_on`. Nie zmieniają wyniku, dopóki autorka ich nie sprawdzi.

_brak_

## Poprawki odrzucone przez walidację (0)

_brak_

## Substancje `unmatched` w zakresie — niewyjaśnione (41)

| Produkt                             | RPL id    | Kody produktu | Substancja                           | Znormalizowana               | Kandydaci |
| ----------------------------------- | --------- | ------------- | ------------------------------------ | ---------------------------- | --------- |
| Aspimag                             | 100007803 | B01AC06       | Magnesii oxidum                      | magnesii oxidum              | brak      |
| Tialorid                            | 100066705 | C03EA01       | Amiloridi hydrochloridum             | amiloridum                   | brak      |
| Tialorid mite                       | 100066711 | C03EA01       | Amiloridi hydrochloridum             | amiloridum                   | brak      |
| Pluscard                            | 100094179 | B01AC06       | Glycinum                             | glycinum                     | brak      |
| Venogel                             | 100114261 | C05CX01       | Tribenosidum                         | tribenosidum                 | brak      |
| ParoGen                             | 100157112 | N06AB05       | Carboxymethylamylum natricum (typ A) | carboxymethylamylum          | brak      |
| Nurofen Plus                        | 100200049 | M01AE51       | Codeini phosphas                     | codeinum                     | brak      |
| Amlator                             | 100252974 | C10BX03       | Atorwastyatyna z L-lizyną            | atorwastyatyna z l-lizyna    | brak      |
| Amlator                             | 100253028 | C10BX03       | Atorwastyatyna z L-lizyną            | atorwastyatyna z l-lizyna    | brak      |
| Amlator                             | 100253034 | C10BX03       | Atorwastyatyna z L-lizyną            | atorwastyatyna z l-lizyna    | brak      |
| Amlator                             | 100253040 | C10BX03       | Atorwastyatyna z L-lizyną            | atorwastyatyna z l-lizyna    | brak      |
| Ibuprofen Forte DOZ                 | 100260181 | M01AE01       | Cellulosum microcristallinum         | cellulosum microcristallinum | brak      |
| Entresto                            | 100309013 | C09DX04       | Sacubitrilum                         | sacubitrilum                 | brak      |
| Entresto                            | 100357087 | C09DX04       | Sacubitrilum                         | sacubitrilum                 | brak      |
| Entresto                            | 100357093 | C09DX04       | Sacubitrilum                         | sacubitrilum                 | brak      |
| Neparvis                            | 100372804 | C09DX04       | Sacubitrilum                         | sacubitrilum                 | brak      |
| Neparvis                            | 100372810 | C09DX04       | Sacubitrilum                         | sacubitrilum                 | brak      |
| Neparvis                            | 100373264 | C09DX04       | Sacubitrilum                         | sacubitrilum                 | brak      |
| Polopiryna Complex                  | 100384807 |               | Chlorphenamini maleas                | chlorphenaminum              | brak      |
| Entresto                            | 100484187 | C09DX04       | Sacubitrilum                         | sacubitrilum                 | brak      |
| Entresto                            | 100484194 | C09DX04       | Sacubitrilum                         | sacubitrilum                 | brak      |
| Culbista                            | 100491243 | C09DX04       | Sacubitrilum natricum                | sacubitrilum                 | brak      |
| Culbista                            | 100491250 | C09DX04       | Sacubitrilum natricum                | sacubitrilum                 | brak      |
| Culbista                            | 100491268 | C09DX04       | Sacubitrilum natricum                | sacubitrilum                 | brak      |
| Sartesta                            | 100491275 | C09DX04       | Sacubitrilum natricum                | sacubitrilum                 | brak      |
| Sartesta                            | 100491282 | C09DX04       | Sacubitrilum natricum                | sacubitrilum                 | brak      |
| Sartesta                            | 100491290 | C09DX04       | Sacubitrilum natricum                | sacubitrilum                 | brak      |
| Albaliva                            | 100498305 | C09DX04       | Sacubitrilum                         | sacubitrilum                 | brak      |
| Albaliva                            | 100498312 | C09DX04       | Sacubitrilum                         | sacubitrilum                 | brak      |
| Albaliva                            | 100498320 | C09DX04       | Sacubitrilum                         | sacubitrilum                 | brak      |
| Valkubit                            | 100501151 | C09DX04       | Sacubitrilum                         | sacubitrilum                 | brak      |
| Valkubit                            | 100501169 | C09DX04       | Sacubitrilum                         | sacubitrilum                 | brak      |
| Valkubit                            | 100501176 | C09DX04       | Sacubitrilum                         | sacubitrilum                 | brak      |
| Neparvis                            | 100502023 | C09DX04       | Sacubitrilum                         | sacubitrilum                 | brak      |
| Neparvis                            | 100502030 | C09DX04       | Sacubitrilum                         | sacubitrilum                 | brak      |
| Sacubitril/Valsartan Gedeon Richter | 100503779 | C09DX04       | Sacubitrilum natricum                | sacubitrilum                 | brak      |
| Sacubitril/Valsartan Gedeon Richter | 100503786 | C09DX04       | Sacubitrilum natricum                | sacubitrilum                 | brak      |
| Sacubitril/Valsartan Gedeon Richter | 100503793 | C09DX04       | Sacubitrilum natricum                | sacubitrilum                 | brak      |
| Brazier                             | 100510685 | C09DX04       | Sacubitrilum natricum                | sacubitrilum                 | brak      |
| Brazier                             | 100510692 | C09DX04       | Sacubitrilum natricum                | sacubitrilum                 | brak      |
| Brazier                             | 100510705 | C09DX04       | Sacubitrilum natricum                | sacubitrilum                 | brak      |

## Substancje `unmatched` w zakresie — potwierdzone poprawką `confirmed_unmatched` (0)

_brak_

## Remisy `derived_ambiguous` w zakresie — nierozstrzygnięte (36)

| Produkt                                    | RPL id    | Kody produktu | Substancja                            | Kandydaci                                            | Zapisane kody (remis)                                |
| ------------------------------------------ | --------- | ------------- | ------------------------------------- | ---------------------------------------------------- | ---------------------------------------------------- |
| Arthrotec                                  | 100001491 | M01AB55       | Misoprostolum                         | A02BB01, G02AD06                                     | A02BB01, G02AD06                                     |
| Olfen 75                                   | 100049322 | M01AB05       | Lidocaini hydrochloridum monohydricum | A01AD11, C01BB01, C05AD01, N01BB02, R02AD02, S01HA07 | A01AD11, C01BB01, C05AD01, N01BB02, R02AD02, S01HA07 |
| Arthrotec Forte                            | 100087216 | M01AB55       | Misoprostolum                         | A02BB01, G02AD06                                     | A02BB01, G02AD06                                     |
| Venogel                                    | 100114261 | C05CX01       | Diclofenacum natricum                 | A01AD11, D11AX18, M01AB05, M02AA15, S01BC03          | A01AD11, D11AX18, M01AB05, M02AA15, S01BC03          |
| Bisoratio ASA                              | 100275202 | C07AB57       | Acidum acetylsalicylicum              | A01AD05, B01AC06, N02BA01                            | A01AD05, B01AC06, N02BA01                            |
| Bisoratio ASA                              | 100275219 | C07AB57       | Acidum acetylsalicylicum              | A01AD05, B01AC06, N02BA01                            | A01AD05, B01AC06, N02BA01                            |
| Acatar Zatoki Tabs                         | 100306279 | M01AE51       | Phenylephrini hydrochloridum          | C01CA06, R01BA03, S01FB01                            | C01CA06, R01BA03, S01FB01                            |
| Ibuprom Zatoki Tabs                        | 100306291 | M01AE51       | Phenylephrini hydrochloridum          | C01CA06, R01BA03, S01FB01                            | C01CA06, R01BA03, S01FB01                            |
| Modafen Grip                               | 100306836 | M01AE51       | Phenylephrini hydrochloridum          | C01CA06, R01BA03, S01FB01                            | C01CA06, R01BA03, S01FB01                            |
| Nasivin Zatoki i Katar                     | 100327531 | R01BA52       | Ibuprofenum                           | C01EB16, M01AE01, M02AA13                            | C01EB16, M01AE01, M02AA13                            |
| Arthrotec                                  | 100348763 | M01AB55       | Misoprostolum                         | A02BB01, G02AD06                                     | A02BB01, G02AD06                                     |
| Polopiryna Complex                         | 100384807 |               | Acidum acetylsalicylicum              | A01AD05, B01AC06, N02BA01                            | A01AD05, B01AC06, N02BA01                            |
| Polopiryna Complex                         | 100384807 |               | Phenylephrini bitartras               | C01CA06, R01BA03, S01FB01                            | C01CA06, R01BA03, S01FB01                            |
| Zahron ASA                                 | 100407862 | C10BX05       | Acidum acetylsalicylicum              | A01AD05, B01AC06, N02BA01                            | A01AD05, B01AC06, N02BA01                            |
| Zahron ASA                                 | 100407879 | C10BX05       | Acidum acetylsalicylicum              | A01AD05, B01AC06, N02BA01                            | A01AD05, B01AC06, N02BA01                            |
| Zahron ASA                                 | 100407891 | C10BX05       | Acidum acetylsalicylicum              | A01AD05, B01AC06, N02BA01                            | A01AD05, B01AC06, N02BA01                            |
| Rosuvastatin + Acetylsalicylic acid Rafarm | 100407900 | C10BX05       | Acidum acetylsalicylicum              | A01AD05, B01AC06, N02BA01                            | A01AD05, B01AC06, N02BA01                            |
| Rosuvastatin + Acetylsalicylic acid Rafarm | 100410462 | C10BX05       | Acidum acetylsalicylicum              | A01AD05, B01AC06, N02BA01                            | A01AD05, B01AC06, N02BA01                            |
| Rosuvastatin + Acetylsalicylic acid Rafarm | 100410479 | C10BX05       | Acidum acetylsalicylicum              | A01AD05, B01AC06, N02BA01                            | A01AD05, B01AC06, N02BA01                            |
| Infex Zatoki                               | 100421282 | R01BA52, R05X | Ibuprofenum                           | C01EB16, M01AE01, M02AA13                            | C01EB16, M01AE01, M02AA13                            |
| Ibuxal Plus                                | 100421655 | N02BE51       | Ibuprofenum                           | C01EB16, M01AE01, M02AA13                            | C01EB16, M01AE01, M02AA13                            |
| Rosuvastatin/Acetylsalicylic acid Teva     | 100427149 | C10BX05       | Acidum acetylsalicylicum              | A01AD05, B01AC06, N02BA01                            | A01AD05, B01AC06, N02BA01                            |
| Rosuvastatin/Acetylsalicylic acid Teva     | 100427155 | C10BX05       | Acidum acetylsalicylicum              | A01AD05, B01AC06, N02BA01                            | A01AD05, B01AC06, N02BA01                            |
| Rosuvastatin/Acetylsalicylic acid Teva     | 100427161 | C10BX05       | Acidum acetylsalicylicum              | A01AD05, B01AC06, N02BA01                            | A01AD05, B01AC06, N02BA01                            |
| Frimig Duo                                 | 100446477 | N02CC         | Naproxenum natricum                   | M01AE02, M02AA12                                     | M01AE02, M02AA12                                     |
| Hadmuliv                                   | 100447531 | N02BE51       | Ibuprofenum                           | C01EB16, M01AE01, M02AA13                            | C01EB16, M01AE01, M02AA13                            |
| Bazdygor                                   | 100447548 | N02BE51       | Ibuprofenum                           | C01EB16, M01AE01, M02AA13                            | C01EB16, M01AE01, M02AA13                            |
| Kivenul                                    | 100447554 | N02BE51       | Ibuprofenum                           | C01EB16, M01AE01, M02AA13                            | C01EB16, M01AE01, M02AA13                            |
| Gexiro                                     | 100460398 | N02BE51       | Ibuprofenum natricum dihydricum       | C01EB16, M01AE01, M02AA13                            | C01EB16, M01AE01, M02AA13                            |
| Gexiro                                     | 100460705 | N02BE51       | Ibuprofenum                           | C01EB16, M01AE01, M02AA13                            | C01EB16, M01AE01, M02AA13                            |
| Arthrotec                                  | 100476360 | M01AB55       | Misoprostolum                         | A02BB01, G02AD06                                     | A02BB01, G02AD06                                     |
| Excedrin Duo                               | 100488204 | N02BE51       | Ibuprofenum                           | C01EB16, M01AE01, M02AA13                            | C01EB16, M01AE01, M02AA13                            |
| Arthrotec Forte                            | 100489434 | M01AB55       | Misoprostolum                         | A02BB01, G02AD06                                     | A02BB01, G02AD06                                     |
| Arthrotec                                  | 100490084 | M01AB55       | Misoprostolum                         | A02BB01, G02AD06                                     | A02BB01, G02AD06                                     |
| Orebriton Plus                             | 100508147 |               | Acidum acetylsalicylicum              | A01AD05, B01AC06, N02BA01                            | A01AD05, B01AC06, N02BA01                            |
| DicloDuo Combi                             | 100539095 |               | Diclofenacum natricum                 | A01AD11, D11AX18, M01AB05, M02AA15, S01BC03          | A01AD11, D11AX18, M01AB05, M02AA15, S01BC03          |

## Remisy `derived_ambiguous` w zakresie — potwierdzone poprawką `confirmed_ambiguous` (0)

_brak_

## Nazwy z kodami z różnych grup anatomicznych (86)

Podejrzenie błędnej normalizacji. Jeden zapis źródłowy przy kilku grupach to zwykle ta sama substancja podawana różnymi drogami (tabletki i żel). Kilka różnych zapisów źródłowych pod jednym hasłem wymaga sprawdzenia, czy normalizacja nie złączyła różnych substancji. Najpierw hasła używane przez substancje leków złożonych w zakresie (7). Stan „po” (przed: 86).

| Hasło                          | Kody                                                       | Zapisy źródłowe                                                                                        | Używane w zakresie |
| ------------------------------ | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------ |
| acidum acetylsalicylicum       | A01AD05, B01AC06, N02BA01                                  | Acidum acetylsalicylicum                                                                               | tak                |
| diclofenacum                   | A01AD11, D11AX18, M01AB05, M02AA15, S01BC03                | Diclofenacum; Diclofenacum kalicum; Diclofenacum natricum                                              | tak                |
| ibuprofenum                    | C01EB16, M01AE01, M02AA13                                  | Ibuprofenum; Ibuprofenum lysinum                                                                       | tak                |
| lidocainum                     | A01AD11, C01BB01, C05AD01, N01BB02, R02AD02, S01HA07       | Lidocaini hydrochloridum; Lidocaini hydrochloridum monohydricum; Lidocainum                            | tak                |
| misoprostolum                  | A02BB01, G02AD06                                           | Misoprostolum                                                                                          | tak                |
| phenylephrinum                 | C01CA06, R01BA03, S01FB01                                  | Phenylephrini hydrochloridum; Phenylephrinum                                                           | tak                |
| rivaroxabanum                  | A10BA02, B01AF01, B01AX06                                  | Rivaroxabanum                                                                                          | tak                |
| acetylcysteinum                | R05CB01, V03AB23                                           | Acetylcysteinum                                                                                        | nie                |
| aciclovirum                    | D06BB03, J05AB01, S01AD03                                  | Aciclovirum; Aciclovirum natricum                                                                      | nie                |
| afliberceptum                  | L01XX44, S01LA05                                           | Afliberceptum                                                                                          | nie                |
| amikacinum                     | J01GB06, S01AA21                                           | Amikacini sulfas                                                                                       | nie                |
| atropinum                      | A03BA01, S01FA01                                           | Atropini sulfas                                                                                        | nie                |
| azelastinum                    | R01AC03, S01GX07                                           | Azelastini hydrochloridum                                                                              | nie                |
| azithromycinum                 | J01FA10, S01AA26                                           | Azithromycinum; Azithromycinum dihydricum                                                              | nie                |
| benzydaminum                   | A01AD02, G02CC03, R02AX03                                  | Benzydamini hydrochloridum                                                                             | nie                |
| betamethasonum                 | D07AC01, D07CC01, H02AB01                                  | Betamethasoni dipropionas; Betamethasoni natrii phosphas; Betamethasoni valeras; Betamethasonum        | nie                |
| betaxololum                    | C07AB05, S01ED02                                           | Betaxololi hydrochloridum                                                                              | nie                |
| bilastinum                     | R06AX29, S01GX13                                           | Bilastinum; Bilastinum monohydricum                                                                    | nie                |
| budesonidum                    | A07EA06, R01AD05, R03BA02                                  | Budesonidum                                                                                            | nie                |
| calcii gluconas ad iniectabile | A12AA03, B05BB01                                           | Calcii gluconas ad iniectabile                                                                         | nie                |
| cefuroximum                    | J01DC02, S01AA27                                           | Cefuroximum; Cefuroximum natricum                                                                      | nie                |
| chlorhexidinum                 | A01AB03, D08AC                                             | Chlorhexidini digluconas                                                                               | nie                |
| chlorquinaldolum               | D08AH02, R02AA11                                           | Chlorquinaldolum                                                                                       | nie                |
| cholini salicylas              | A01AD11, N02BA03, S02D                                     | Cholini salicylas                                                                                      | nie                |
| ciclopirox olaminum            | D01AE14, G01AX12                                           | Ciclopirox olaminum                                                                                    | nie                |
| ciclosporinum                  | L04AD01, S01XA18                                           | Ciclosporinum                                                                                          | nie                |
| ciprofloxacinum                | J01MA02, S01AE03, S02AA15                                  | Ciprofloxacini hydrochloridum; Ciprofloxacinum                                                         | nie                |
| clindamycinum                  | D10AF01, G01AA10, J01FF01                                  | Clindamycini hydrochloridum; Clindamycini phosphas; Clindamycinum                                      | nie                |
| clotrimazolum                  | D01AC, D01AC01, G01AF02, S02AA                             | Clotrimazolum                                                                                          | nie                |
| dexamethasonum                 | D07AB19, H02AB02, S01BA01                                  | Dexamethasoni Natrii phosphas; Dexamethasoni natrii phosphas; Dexamethasoni phosphas; Dexamethasonum   | nie                |
| dexpanthenolum                 | D03AX03, S01XA12                                           | Dexpanthenolum                                                                                         | nie                |
| diazepamum                     | N05BA01, V03AB                                             | Diazepamum                                                                                             | nie                |
| dimenhydrinatum                | A04AD, R06AA02                                             | Dimenhydrinatum                                                                                        | nie                |
| dimetindenum                   | D04AA13, R06AB03                                           | Dimetindeni maleas                                                                                     | nie                |
| doxazosinum                    | C02CA04, G04CA                                             | Doxazosini mesilas; Doxazosinum                                                                        | nie                |
| doxycyclinum                   | A01AB22, J01AA02                                           | Doxycyclini hyclas; Doxycyclinum                                                                       | nie                |
| econazolum                     | D01AC03, G01AF05                                           | Econazoli nitras                                                                                       | nie                |
| ephedrinum                     | C01CA26, R01AA03, R03CA02                                  | Ephedrini hydrochloridum                                                                               | nie                |
| erythromycini cyclocarbonas    | D10AF02, J01FA01                                           | Erythromycini cyclocarbonas                                                                            | nie                |
| erythromycinum                 | D10AF02, J01FA01, S01AA17                                  | Erythromycinum                                                                                         | nie                |
| finasteridum                   | D11AX10, G04CB01                                           | Finasteridum                                                                                           | nie                |
| fluocinoloni acetonidum        | D07AC04, S01BA15                                           | Fluocinoloni acetonidum                                                                                | nie                |
| fluticasonum                   | D07AC17, R01AD08, R01AD12, R03BA05                         | Fluticasoni furoas; Fluticasoni propionas                                                              | nie                |
| ganciclovirum                  | J05AB06, S01AD09                                           | Ganciclovirum                                                                                          | nie                |
| gentamicinum                   | J01GB03, S01AA11                                           | Gentamicini sulfas; Gentamicinum                                                                       | nie                |
| glucosum                       | B05BA, B05BA03, B05DB, V04CA02, V06DC01, V07AB             | Glucosum; Glucosum anhydricum; Glucosum monohydricum                                                   | nie                |
| glycopyrronium                 | A03AB02, D11AA01, R03BB06                                  | Glycopyrronii bromidum; Glycopyrronium                                                                 | nie                |
| heparinum                      | B01AB01, C05BA03                                           | Heparinum natricum                                                                                     | nie                |
| hydrocortisonum                | D07AA02, H02AB09, S01BA02                                  | Hydrocortisoni acetas; Hydrocortisoni natrii phosphas; Hydrocortisoni natrii succinas; Hydrocortisonum | nie                |
| indometacinum                  | M01AB01, M02AA23, S01BC01                                  | Indometacinum                                                                                          | nie                |
| isoconazolum                   | D01AC05, G01AF07                                           | Isoconazoli nitras                                                                                     | nie                |
| ivermectinum                   | D11AX22, P02CF01                                           | Ivermectinum                                                                                           | nie                |
| iwermektyna                    | D11AX22, P02CF01                                           | Iwermektyna                                                                                            | nie                |
| kalii chloridum                | A12BA01, B05XA01                                           | Kalii chloridum                                                                                        | nie                |
| kalii citras                   | A12BA02, G04BC                                             | Kalii citras                                                                                           | nie                |
| kalii iodidum                  | H03CA, V03AB21                                             | Kalii iodidum                                                                                          | nie                |
| ketoconazolum                  | D01AC08, H02CA03, J02AB02                                  | Ketoconazolum                                                                                          | nie                |
| ketoprofenum                   | A01AD11, M01AE03, M02AA10                                  | Ketoprofenum; Ketoprofenum lysinum                                                                     | nie                |
| ketotifenum                    | R06AX17, S01GX08                                           | Ketotifeni fumaras; Ketotifeni hydrofumaras                                                            | nie                |
| levofloxacinum                 | J01MA12, S01AE05, S01AX19                                  | Levofloxacinum                                                                                         | nie                |
| mannitolum                     | B05BC01, R05CB16                                           | Mannitolum                                                                                             | nie                |
| mercaptaminum                  | A16AA04, S01XA21                                           | Mercaptamini bitartras; Mercaptamini hydrochloridum                                                    | nie                |
| metronidazolum                 | A01A, A01AD11, D06BX01, G01AF01, G01FA01, J01XD01, P01AB01 | Metronidazolum                                                                                         | nie                |
| miconazolum                    | A01AB09, A07AC01, D01AC02, G01AF04                         | Miconazoli nitras; Miconazolum                                                                         | nie                |
| mometasonum                    | D07AC13, R01AD09, R03BA07                                  | Mometasoni furoas; Mometasoni furoas monohydricum                                                      | nie                |
| moxifloxacinum                 | J01MA14, S01AE07, S01AX22                                  | Moxifloxacini hydrochloridum; Moxifloxacinum                                                           | nie                |
| mupirocinum                    | D06AX09, R01AX06                                           | Mupirocinum; Mupirocinum calicum (mikronizowana)                                                       | nie                |
| natrii cromoglicas             | R01AC01, S01GX01                                           | Natrii cromoglicas                                                                                     | nie                |
| natrii fluoridum               | A01AA01, V09IX06                                           | Natrii fluoridum; Natrii fluoridum (18F)                                                               | nie                |
| neomycinum                     | A01AB08, D06AX04, S01AA03                                  | Neomycini sulfas                                                                                       | nie                |
| norfloxacinum                  | J01MA06, S01AE02, S01AX12                                  | Norfloxacinum                                                                                          | nie                |
| nystatinum                     | A07AA02, G01AA01                                           | Nystatinum                                                                                             | nie                |
| octenidinum                    | A01AB24, R02AA21                                           | Octenidini dihydrochloridum                                                                            | nie                |
| ofloxacinum                    | J01MA01, S01AE01, S01AX11                                  | Ofloxacinum                                                                                            | nie                |
| paraffinum liquidum            | A06AA, A06AA01, D02AC                                      | Paraffinum liquidum                                                                                    | nie                |
| polyvidonum iodinatum          | D08AG02, G01AX11                                           | Polyvidonum iodinatum                                                                                  | nie                |
| povidonum iodinatum            | D08AG02, G01AX11, S01AX18                                  | Povidonum iodinatum                                                                                    | nie                |
| prasteronum                    | A14AA07, G03XX01                                           | Prasteronum                                                                                            | nie                |
| produkt zlozony                | A06AD65, B05XC, C05C, G04BC, L03AX, R05X, R07AX            | Produkt złożony                                                                                        | nie                |
| ruxolitinibum                  | D11AH09, L01EJ01                                           | Ruxolitinibum                                                                                          | nie                |
| szczepionka wielowazna         | L03AX, R07AX                                               | Szczepionka wieloważna                                                                                 | nie                |
| tacrolimusum                   | D11AH01, L04AA05, L04AD02                                  | Tacrolimusum; Tacrolimusum monohydricum                                                                | nie                |
| tetracyclinum                  | D06AA04, J01AA07                                           | Tetracyclini hydrochloridum                                                                            | nie                |
| tobramycinum                   | J01GB01, S01AA12                                           | Tobramycini sulfas; Tobramycinum                                                                       | nie                |
| troxerutinum                   | C05CA04, S01XA20                                           | Troxerutinum                                                                                           | nie                |
| vancomycinum                   | A07AA09, J01XA01                                           | Vancomycini hydrochloridum; Vancomycinum                                                               | nie                |

## Odrzucone kody ATC (2, w zakresie 0)

Kody produktów dla ludzi, które po oczyszczeniu (wielkie litery, bez spacji) nie spełniają reguły kształtu z `medication_substances_atc_code_check`. Nie trafiają do `atcCodes`; trafią do nagłówka migracji.

| Produkt    | RPL id    | Wartość źródłowa |
| ---------- | --------- | ---------------- |
| Amaplantis | 100436059 | "BRAK"           |
| Verrumal   | 100522446 | "BRAK"           |

## Produkty w zakresie bez składu przed uzupełnieniem (65)

| Produkt                                 | RPL id    | Typ procedury | Kody produktu |
| --------------------------------------- | --------- | ------------- | ------------- |
| Beto 200 ZK                             | 100005193 | IR            | C07AB02       |
| Inhibace                                | 100042521 | IR            | C09AA08       |
| Concor 5                                | 100045235 | IR            | C07AB07       |
| Inhibace                                | 100057391 | IR            | C09AA08       |
| Irprestan                               | 100219681 | DCP           | C09DA04       |
| Sintrom                                 | 100226824 | IR            | B01AA07       |
| Seroxat                                 | 100255961 | IR            | N06AB05       |
| Concor Cor 2,5                          | 100259628 | IR            | C07AB07       |
| Diclac 150 Duo                          | 100264173 | IR            | M01AB05       |
| Voltaren SR 75                          | 100264411 | IR            | M01AB05       |
| Concor 10                               | 100265586 | IR            | C07AB07       |
| Aspirin Cardio                          | 100271658 | IR            | B01AC06       |
| Betaloc ZOK 50                          | 100277738 | IR            | C07AB02       |
| Betaloc ZOK 100                         | 100277856 | IR            | C07AB02       |
| Betaloc ZOK 50                          | 100280120 | IR            | C07AB02       |
| Seroxat                                 | 100285689 | IR            | N06AB05       |
| Cataflam 50                             | 100287582 | IR            | M01AB05       |
| Beto 50 ZK                              | 100288564 | IR            | C07AB02       |
| Simvacard 20                            | 100289003 | IR            | C10AA01       |
| Beto 100 ZK                             | 100289227 | IR            | C07AB02       |
| Beto 150 ZK                             | 100290450 | IR            | C07AB02       |
| Clopidogrel Krka                        | 100290549 | CEN           | B01AC04       |
| Beto 50 ZK                              | 100291678 | IR            | C07AB02       |
| Dicloratio retard 100                   | 100291945 | IR            | M01AB05       |
| Sintrom                                 | 100292376 | IR            | B01AA07       |
| Beto 50 ZK                              | 100293097 | IR            | C07AB02       |
| Nimotop S                               | 100293252 | IR            | C08CA06       |
| Concor Cor 5                            | 100293341 | IR            | C07AB07       |
| Concor Cor 2,5                          | 100293536 | IR            | C07AB07       |
| Nimotop S                               | 100293648 | IR            | C08CA06       |
| Beto 100 ZK                             | 100294100 | IR            | C07AB02       |
| Cataflam 50                             | 100296078 | IR            | M01AB05       |
| Concor Cor 5                            | 100297681 | IR            | C07AB07       |
| Beto 200 ZK                             | 100302117 | IR            | C07AB02       |
| Dicloratio retard 100                   | 100304292 | IR            | M01AB05       |
| Beto 150 ZK                             | 100304369 | IR            | C07AB02       |
| Beto 200 ZK                             | 100304375 | IR            | C07AB02       |
| Cataflam 50                             | 100304406 | IR            | M01AB05       |
| Beto 50 ZK                              | 100305713 | IR            | C07AB02       |
| Concor 10                               | 100306204 | IR            | C07AB07       |
| Sintrom                                 | 100306530 | IR            | B01AA07       |
| Beto 25 ZK                              | 100307215 | IR            | C07AB02       |
| Nurofen dla dzieci o smaku truskawkowym | 100307830 | IR            | M01AE01       |
| Prinivil                                | 100307971 | IR            | C09AA03       |
| Betaloc ZOK 100                         | 100307988 | IR            | C07AB02       |
| Concor Cor 5                            | 100308918 | IR            | C07AB07       |
| Concor Cor 2,5                          | 100309177 | IR            | C07AB07       |
| Escitil                                 | 100309970 | IR            | N06AB10       |
| Sintrom                                 | 100310335 | IR            | B01AA07       |
| Betaloc ZOK 100                         | 100310476 | IR            | C07AB02       |
| Concor 5                                | 100310714 | IR            | C07AB07       |
| Betaloc ZOK 50                          | 100313658 | IR            | C07AB02       |
| Betaloc ZOK 50                          | 100314089 | IR            | C07AB02       |
| Noclaud                                 | 100371414 | IR            | B01AC23       |
| Noclaud                                 | 100375688 | IR            | B01AC23       |
| Karbis                                  | 100413727 | IR            | C09CA06       |
| Karbis                                  | 100413733 | IR            | C09CA06       |
| Karbis                                  | 100413756 | IR            | C09CA06       |
| Karbis                                  | 100413868 | IR            | C09CA06       |
| Beto 150 ZK                             | 100414135 | IR            | C07AB02       |
| Karbis                                  | 100415376 | IR            | C09CA06       |
| Karbis                                  | 100416559 | IR            | C09CA06       |
| Dexak                                   | 100436071 | IR            | M01AE17       |
| Nurofen dla dzieci Junior truskawkowy   | 100444828 | IR            | M01AE01       |
| Nurofen dla dzieci Junior pomarańczowy  | 100446951 | IR            | M01AE01       |
