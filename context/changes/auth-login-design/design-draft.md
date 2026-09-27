# Język wizualny lekomapy — ustalenia

**Status:** paleta barw ustalona; treści ekranów nieustalone
**Data:** 2026-09-20; uzupełnienie 2026-09-26 (F-04: tekst przygaszony, paleta ciemna, czerwień błędu, nazwy tokenów)
**Zakres:** warstwa wizualna ekranów wejściowych oraz wnętrza aplikacji; nie dotyczy logiki auth, którą pokrywa starter (FR-001, FR-002)

## Czego dotyczy ustalenie

Ustalona jest **wyłącznie paleta barw**. Obowiązuje na wszystkich ekranach wejściowych: logowanie, rejestracja, potwierdzenie adresu e-mail oraz odzyskiwanie hasła wraz z ustawianiem nowego.

Poza paletą przesądzony jest układ ekranu logowania — Rozkładówka — bo powstał i został zaakceptowany na makietach.

**Nieustalone pozostają treści.** Napisy na ekranach wejściowych są w makietach robocze i służą wyłącznie pokazaniu, jak wygląda kolor w otoczeniu tekstu. Nie należy ich traktować jako zatwierdzonego copy ani przenosić do kodu bez osobnej decyzji. Lista rzeczy do rozstrzygnięcia jest w sekcji `## Treści do ustalenia`.

Nieustalone są też układy pozostałych ekranów wejściowych — rejestracji, potwierdzenia adresu i odzyskiwania hasła. Wiadomo tylko, że korzystają z tej samej palety.

## Po co ten dokument

Zapis ustaleń z sesji przeglądania makiet. Utrwala nie tylko to, co wybrano, ale też co odrzucono i dlaczego — żeby te same warianty nie wracały przy kolejnym podejściu i żeby uzasadnienia dało się sprawdzić.

Makiety są zewnętrzne i nie stanowią części repozytorium:

- **aktualna:** sześć ekranów w wybranej palecie — https://claude.ai/artifact/8N5onc4YmezetjxtUoncrq
- wcześniejsze etapy: porównywarka palet https://claude.ai/artifact/JFEmmQ5CnDiTjFMLAAWJwe · kierunki układów https://claude.ai/artifact/GY5Fvs5iBq7DVGTCqgGXEb · trzy jasne kierunki https://claude.ai/artifact/CzjUhmZvbQtiZRRckRwP3B

## Paleta: Mech

| Rola                              | Wartość   |
| --------------------------------- | --------- |
| Pas boczny, lewa kartka logowania | `#CFC9B4` |
| Kreska pasa bocznego              | `#B3AC93` |
| Płótno treści                     | `#F7F8F4` |
| Karty, listy, pola                | `#FFFFFF` |
| Kreska i ramki kart               | `#E3E5DC` |
| Ramka pól formularza              | `#CBD2C7` |
| Akcent                            | `#2C4A33` |
| Tekst na akcencie                 | `#FFFFFF` |
| Akcent jasny                      | `#DCE9DF` |
| Kreska akcentu jasnego            | `#B9D0C0` |
| Tekst                             | `#1E241F` |
| Tekst przygaszony                 | `#4C534C` |

Ciepła szarość z domieszką beżu i głęboka leśna zieleń.

**Tekst przygaszony przyciemniony z `#5A6259` na `#4C534C`** (decyzja 2026-09-26, F-04). To nie pomyłka — nie cofać.

- Pomiar WCAG 2 dla `#5A6259`: 6,31 : 1 na bieli, 5,92 na płótnie, 3,81 na pasie bocznym — poniżej progu 7 : 1 z `## Reguły czytelności`.
- `#4C534C`: 7,93 : 1 na bieli, 7,43 na płótnie. Próg trzymany na karcie i płótnie.
- Na pasie bocznym tekst przygaszony nie występuje wcale: 7 : 1 na chromie wymagałoby koloru praktycznie równego tekstowi głównemu. Na pasie stoi wyłącznie tekst główny (`sidebar-foreground`).
- Pilnuje tego test `scripts/tokens/contrast.test.mjs`.

Porównanie jasnej wersji przed i po zmianie: https://claude.ai/artifact/FLPkn5HvqMUHPjr5zg6apn

## Paleta ciemna

Zaakceptowana przez autorkę na makiecie „Mech po zmroku” przed wpisaniem do kodu: https://claude.ai/artifact/Ha6A6SV4aPjtwMsreZLu3n

Źródłem prawdy są wartości w bloku `.dark` w `src/styles/global.css` — przy rozbieżności obowiązuje tamten plik. Stan na 2026-09-26:

| Rola                    | Jasna     | Ciemna    |
| ----------------------- | --------- | --------- |
| Płótno treści           | `#F7F8F4` | `#141915` |
| Karty, listy, pola      | `#FFFFFF` | `#1C221D` |
| Kreska i ramki kart     | `#E3E5DC` | `#2E352F` |
| Ramka pól formularza    | `#CBD2C7` | `#4A534A` |
| Pas boczny              | `#CFC9B4` | `#38342A` |
| Kreska pasa bocznego    | `#B3AC93` | `#554F3E` |
| Tekst na pasie bocznym  | `#1E241F` | `#EDE8D8` |
| Akcent                  | `#2C4A33` | `#B4D6BC` |
| Tekst na akcencie       | `#FFFFFF` | `#13201A` |
| Akcent jasny            | `#DCE9DF` | `#263A2C` |
| Kreska akcentu jasnego  | `#B9D0C0` | `#3D5A45` |
| Tekst                   | `#1E241F` | `#E8EBE4` |
| Tekst przygaszony       | `#4C534C` | `#B4BCB1` |
| Możliwa interakcja: tło | `#FBEBC8` | `#3A2E14` |
| — tekst                 | `#5A3F08` | `#F2D9A0` |
| — ramka                 | `#E6CE96` | `#6B5424` |
| Błąd: tekst             | `#7F2A22` | `#F2B8AD` |
| — tło                   | `#FBE9E4` | `#3A1A15` |
| — ramka                 | `#E3B5AB` | `#7A3A30` |

W trybie ciemnym akcent odwraca się: jasna zieleń na ciemnym tle, ciemny napis na przycisku. Każda para tekstu trzyma co najmniej 7 : 1 w obu trybach (np. tekst przygaszony 9,13 : 1 na płótnie, napis na bursztynie 9,62 : 1, błąd na swoim tle 9,14 : 1). Ciemny bursztyn nie wygląda jak alarm ani jak czerwień.

Przełącznika trybu i decyzji „ręcznie czy za systemem” jeszcze nie ma — to S-11.

**Len odrzucony** mimo wcześniejszej rekomendacji. Powód konkretny: na pasie bocznym beżowe płótno `#D5C9AC` zestawione z granatem `#2E3A5C` dawało zestawienie, które nie siada — ciepły beż i chłodny granat ciągną w przeciwne strony, a na wąskim pasie te dwa kolory stykają się na całej wysokości ekranu. Na samym logowaniu problem nie był widoczny, bo granat pojawiał się tylko punktowo.

## Zasady budowania powierzchni

Ustalone po tym, jak pierwsze makiety całej aplikacji wyszły smutne. Przyczyną nie były barwy, tylko sposób użycia powierzchni:

- **Treść stoi na bieli.** Kolor palety trzyma wyłącznie chrom: pas boczny i lewą kartkę logowania. Listy, karty i pola leżą na białym.
- **Akcent ma dwa odcienie.** Ciemny na przyciski, kropki i podpisy; jasny `#DCE9DF` na aktywną pozycję w menu, liczniki, zaznaczone objawy i kartę z możliwą interakcją. Brak jasnego odcienia był główną przyczyną wrażenia smutku.
- **Pas boczny zamiast paska u góry** na dużym ekranie. Daje stałą orientację i pozwala treści oddychać.
- **Powietrze i zaokrąglenia.** Karty z miękkim cieniem zamiast samych kresek.

## Układy

### Logowanie na dużym ekranie: Rozkładówka

Strona podzielona pionowo na dwie połowy, złudzenie otwartego dzienniczka z cieniem zagięcia pośrodku.

- Lewa strona w kolorze `#CFC9B4`: nazwa produktu, nagłówek, trzy ogólne zdania o tym, do czego produkt służy, nota o prywatności na dole.
- Prawa strona biała: nagłówek powitalny i formularz.
- Formularz zawsze po prawej. Wariant lustrzany odrzucony.

Kontrast między stronami w wersji wzmocnionej — różnica jasności około 1,5 : 1 zamiast 1,2 : 1, co jest progiem widoczności dla kogoś z obniżoną wrażliwością na kontrast.

### Logowanie na telefonie

Rozkładówka rozkłada się na dwie strefy jedna nad drugą: kolorowa góra zamiast lewej kartki, biały dół zamiast prawej. Kreska między stronami staje się krawędzią między strefami. Trzy zdania o produkcie znikają — pierwszy ekran ma być krótki.

### Wnętrze aplikacji

Pas boczny 22 % szerokości w kolorze chromu, w nim nazwa produktu, trzy pozycje menu i nota o prywatności na dole. Reszta to płótno z nagłówkiem sekcji i treścią na białych kartach.

Na telefonie pas boczny zamienia się w trzy zakładki u dołu ekranu.

## Reguły czytelności

Wynikają z kierunku rozwoju produktu, którym są osoby starsze (PRD, sekcja `## User & Persona`). Nie są wymogiem pierwszej wersji, ale przyjęte jako baza, bo późniejsze dorabianie kosztuje więcej.

- Najmniejszy tekst: 15 px na telefonie, 17 px na dużym ekranie. Dotyczy także noty o prywatności, etykiet i odnośników.
- Pola i przyciski wyższe niż standardowe 44 px.
- Etykiety nad polem, nie jako szary podpis w środku pola.
- Kontrast tekstu do tła na poziomie AAA, czyli co najmniej 7 : 1.
- Akcent dostatecznie ciemny, żeby biały napis na przycisku również trzymał AAA.
- Każdy ekran mieści się bez przewijania.

## Kolory funkcjonalne

Znaczenie przypisane do roli, nie do barwy.

| Znaczenie                  | Kolor                                           | Gdzie                                          |
| -------------------------- | ----------------------------------------------- | ---------------------------------------------- |
| Możliwa interakcja         | tło `#FBEBC8`, tekst `#5A3F08`, ramka `#E6CE96` | znacznik przy leku, karta na ekranie wizyty    |
| Okres trwający             | akcent `#2C4A33`                                | kropka przy leku, przyciski                    |
| Zaznaczenie i podsumowania | akcent jasny `#DCE9DF`                          | aktywna pozycja menu, liczniki, wybrane objawy |
| Okres zakończony           | kreska `#E3E5DC`                                | kropka przy leku odstawionym                   |
| Błąd formularza i techniki | tekst `#7F2A22`, tło `#FBE9E4`, ramka `#E3B5AB` | błędy formularzy, brak konfiguracji, awarie    |

Bursztyn zamiast czerwieni wynika z `shape-notes.md:137`: informacja o możliwej kolizji ma być podana bez czerwieni i bez okna przerywającego pracę. Kontrast tekstu na bursztynie wynosi 7,7 : 1.

**Czerwień — decyzja 2026-09-26 (F-04):** ceglasta czerwień służy wyłącznie błędom formularzy i techniki (np. błędne hasło, brak konfiguracji). Nigdy dla możliwej interakcji ani żadnej treści o zdrowiu — lekach, objawach, pytaniach do lekarza. Wcześniejszy zapis „czerwień nieużywana, zarezerwowana” przestał obowiązywać, bo komunikat o błędzie potrzebuje koloru innego niż bursztyn: inaczej błąd formularza wyglądałby jak informacja o możliwej kolizji. Kontrast: 9,31 : 1 na bieli, 8,72 na płótnie, 7,92 na własnym tle. Błąd jest rozpoznawalny także bez koloru — słowo w treści (np. „Uwaga:”).

### Role z makiety a nazwy tokenów

W kodzie kolory istnieją wyłącznie jako tokeny w `src/styles/global.css`, używane klasami typu `bg-primary`, `text-muted-foreground`. Skaner `scripts/tokens/hardcoded-colors.mjs` odrzuca kolor wpisany na sztywno.

| Rola z makiety                | Token                                                                                |
| ----------------------------- | ------------------------------------------------------------------------------------ |
| Płótno treści                 | `background`, `muted`                                                                |
| Karty, listy, pola            | `card`, `popover`                                                                    |
| Tekst                         | `foreground`, `card-foreground`, `popover-foreground`                                |
| Tekst przygaszony             | `muted-foreground` (nigdy na pasie bocznym)                                          |
| Kreska i ramki kart           | `border`, `secondary`                                                                |
| Ramka pól formularza          | `input`                                                                              |
| Akcent                        | `primary`, `ring`                                                                    |
| Tekst na akcencie             | `primary-foreground`                                                                 |
| Akcent jasny                  | `accent`                                                                             |
| Kreska akcentu jasnego        | `accent-border`                                                                      |
| Pas boczny                    | `sidebar`                                                                            |
| Kreska pasa bocznego          | `sidebar-border`                                                                     |
| Tekst na pasie bocznym        | `sidebar-foreground`                                                                 |
| Aktywna pozycja menu          | `sidebar-accent`, `sidebar-accent-foreground`, `sidebar-primary`                     |
| Możliwa interakcja            | `interaction`, `interaction-foreground`, `interaction-border`                        |
| Błąd formularza i techniki    | `destructive`, `destructive-surface`, `destructive-border`, `destructive-foreground` |
| Pasek „wersja demonstracyjna” | `demo-bar`, `demo-bar-foreground`, `demo-bar-border`                                 |

## Zasady treści

### Zakaz przykładowych wpisów przed zalogowaniem

Na ekranie logowania nie pojawia się ani jeden przykładowy lek, objaw, godzina ani data.

Powód podwójny. Osoba starsza widząca wpisy wyglądające na prawdziwe może uznać, że sama je wprowadziła. Poza tym przed zalogowaniem produkt nie ma prawa wiedzieć, co znajduje się w czyimkolwiek dzienniczku — pokazywanie czegoś, co wygląda na cudze dane zdrowotne, jest sprzeczne z wymaganiami niefunkcjonalnymi o izolacji danych.

Ograniczenie dotyczy wyłącznie ekranów przed zalogowaniem.

### Ton i język oznaczeń

Poniższe zasady obowiązują niezależnie od tego, jak ostatecznie zabrzmią konkretne zdania. Wynikają z FR-006, FR-007 i FR-012:

- Zdania opisujące produkt robią to ogólnie. Nie obiecują, że cokolwiek rozpozna, oceni albo wykryje.
- Pada „ta para substancji może wchodzić w interakcję" oraz „czy może mieć związek" — nigdy stwierdzenie przyczyny.
- Leki stoją w kolejności rozpoczęcia, nigdy według stopnia podejrzenia.
- Pod listą stale wisi nota: „Informacja poglądowa — w razie niepokoju skonsultuj z lekarzem lub farmaceutą. Brak oznaczenia nie znaczy, że połączenie jest bezpieczne."
- Lek odstawiony zostaje na liście w stanie wyciszonym, z datą zakończenia — nie znika.

## Ekran dodawania leku

Zaprojektowany, bo jest jedynym miejscem, gdzie da się uprzedzić o dwóch twardych regułach produktu, zanim staną się niespodzianką.

Pola: substancja czynna wybierana ze słownika z podpowiedziami, dawka, jednostka, data rozpoczęcia wypełniona na dziś i możliwa do cofnięcia.

Dwa objaśnienia towarzyszące formularzowi:

- **„Dawka ma historię"** — późniejsza zmiana dawki zamknie ten wpis datą i otworzy nowy okres obok; lek zostaje jedną pozycją na liście (FR-004).
- **„Substancji nie podmienisz"** — zmiana substancji czynnej to zakończenie leku i dodanie nowego, inaczej dawne wpisy o samopoczuciu przestałyby się zgadzać (FR-004).

Pod polem substancji linijka o tym, że pierwsza wersja przyjmuje jedną substancję na preparat (FR-003).

## Treści do ustalenia

Nic z poniższych nie jest rozstrzygnięte. Napisy widoczne na makietach są robocze.

### Logowanie

- Nagłówek powitalny.
- Trzy zdania opisujące produkt na lewej kartce — czy zostają trzy, czy inna liczba, i jak brzmią.
- Nota o prywatności: jedno zdanie czy więcej, i czy mówi o tym, że dane nie opuszczają konta.
- Etykiety pól i napis na przycisku.
- Brzmienie odnośników do rejestracji i odzyskiwania hasła.

### Rejestracja

- Nagłówek i ewentualne zdanie wprowadzające.
- **Brzmienie zgody na warunki korzystania** — zablokowane, dopóki nie powstanie treść samych warunków (PRD, Open Question 8). Akceptacja ma być jednorazowym, świadomym krokiem z zapisem daty i wersji dokumentu.
- Co użytkowniczka widzi po wysłaniu formularza, zanim potwierdzi adres.

### Potwierdzenie adresu e-mail

- Treść ekranu oczekiwania.
- Treść po udanym potwierdzeniu.
- Co się dzieje, gdy odnośnik wygasł, i jak zamówić nowy.

### Odzyskiwanie hasła

Trzy ekrany, każdy z osobną treścią do napisania:

- Prośba o adres e-mail.
- Potwierdzenie wysłania — tu dochodzi decyzja opisana niżej.
- Ustawienie nowego hasła, wraz z komunikatem o wygasłym odnośniku.

### Komunikaty o błędach

- Błędny e-mail lub hasło.
- Zbyt słabe hasło przy rejestracji.
- Adres już zajęty.
- Wygasły odnośnik potwierdzający lub resetujący.

Do rozstrzygnięcia razem z nimi: **czy produkt zdradza, że konto o danym adresie istnieje.** Dla danych zdrowotnych to ma znaczenie — komunikat „nie ma takiego konta" pozwala postronnej osobie sprawdzić, czy ktoś korzysta z dzienniczka leków. Wariant bezpieczniejszy mówi zawsze to samo: „jeśli konto istnieje, wysłaliśmy wiadomość". Wariant wygodniejszy mówi wprost, że konta nie ma. To decyzja produktowa, nie techniczna.

### Zasady wspólne dla wszystkich napisów

Cokolwiek zostanie napisane, obowiązują zasady z sekcji `### Ton i język oznaczeń` oraz reguły czytelności. Komunikaty o błędach mówią, co poszło nie tak i co z tym zrobić — bez przepraszania i bez ogólników.

## Odrzucone i dlaczego

### Układy

- **Karta wyśrodkowana** (wariant ze startera) — generyczna, nie niesie żadnej treści o produkcie.
- **Zeszyt** — na pełnej szerokości połowa kartki zostawała pusta.
- **Marginesy** — kolumna z glosami wymagała drobnego tekstu, co kłóci się z regułami czytelności.
- **Pas** (podział poziomy) — formularz lądował za nisko.
- **Miód** — formularz po lewej stronie, gorszy w odbiorze niż układ lustrzany.
- **Rama** (karta nad ciemnym polem) — dobra, przegrała z Rozkładówką.

### Palety

- **Len** — powód w sekcji o palecie: beż z granatem nie siada na pasie bocznym.
- **Kamień**, **Figowiec**, **Węgiel** — zbyt przygaszone; neutralna szarość z ledwo widoczną barwą nie czyta się jako spokój, tylko jako brak pomysłu.
- **Mięta i cynamon** — blada mięta to nisko nasycony cyjan, czyli zakres, który przez żółknącą z wiekiem soczewkę oka traci najwięcej. Dodatkowo chłodna zieleń w produkcie o zdrowiu prowadzi wprost do skojarzenia z gabinetem.
- **Jesień** — tło i akcent w tym samym paśmie żółcieni, gdzie rozróżnianie barw zanika z wiekiem najszybciej.
- **Brzoskwinia** — powtórzenie Poranka, tylko o ton mocniejsze.
- **Poranek** — morelowe tło najbardziej nasycone z finalistek, największe ryzyko, że za dwa lata będzie wyglądać na modę z sezonu.
- **Szałwia stopiona** — tło i akcent najbliżej siebie na kole barw, czyli ten sam problem co Jesień, tylko łagodniejszy. Przegrała z Mchem jako reprezentantka kierunku zielonego.
- **Kasztan**, **Piaskowiec**, **Kurkuma**, **Malwa**, **Wrzos** — odrzucone przy zawężaniu stawki, bez osobnego zarzutu.
- **Jasno**, **Barwne sekcje**, **Ciepłe światło** — trzy jasne kierunki przygotowane po uwadze o smutku. Nie weszły jako palety, ale to z nich pochodzą zasady budowania powierzchni opisane wyżej.

Pierwsza wersja Szałwii łączyła zieleń tła ze śliwkowym akcentem i została odrzucona jako zbyt ostro odcięta — zielony i fioletowy leżą po przeciwnych stronach koła barw. Stąd reguła: tło i akcent trzymają się jednej okolicy koła, a różnicę robi jasność, nie skok barwy.

## Co dalej

Paleta jest gotowa do wdrożenia niezależnie od treści — kolory wchodzą jako tokeny, napisy zostają na razie te, które są w kodzie.

1. **Paleta jako tokeny** w `src/styles/global.css`, nie jako klasy przy komponentach. Dziś warstwa auth ma kolory wpisane na sztywno (`bg-purple-600`, `text-blue-100/80`) i ignoruje istniejące tokeny, więc druga zmiana koloru kosztowałaby tyle samo co pierwsza. To jest praca, którą da się zrobić teraz.
2. **Wspólny layout ekranów wejściowych** zamiast markupu karty zduplikowanego w trzech plikach w `src/pages/auth/`.
3. **Trasy i ekrany odzyskiwania hasła** — w kodzie nie istnieją wcale, mimo że obejmuje je FR-002. Strukturę da się postawić przed ustaleniem treści; napisy podmieni się później.
4. **Treści** — osobna sesja, lista w sekcji `## Treści do ustalenia`. Część blokuje Open Question 8 z PRD.
5. **Polonizacja interfejsu** — teksty w `src/pages/auth/` i `src/components/auth/` są dziś po angielsku, podczas gdy komunikat w `Layout.astro` jest po polsku.

## Uwagi do zakresu

Odzyskiwanie hasła wchodzi w zakres — jest częścią FR-002, a w kodzie nie istnieje: brak trasy i brak ekranu. Trzeba je zbudować od zera.

Treść warunków korzystania pozostaje nieustalona (PRD, Open Question 8). Blokuje treść ekranu rejestracji, nie blokuje ani palety, ani struktury ekranów.

Ekrany wnętrza aplikacji powstały jako makiety pokazujące zastosowanie kolorów, nie jako projekty tych widoków. Leki, dawki, objawy i daty w nich są wymyślone — nie pochodzą z żadnego prawdziwego zestawu ani z tabeli interakcji produktu.
