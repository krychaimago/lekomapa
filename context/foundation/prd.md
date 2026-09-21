---
project: lekomapa
version: 1
status: draft
created: 2026-09-15
context_type: greenfield
product_type: web-app
target_scale:
  users: small
  qps: low
  data_volume: small
timeline_budget:
  mvp_weeks: 5
  hard_deadline: 2027-01-10
  after_hours_only: true
---

## Vision & Problem Statement

Użytkowniczka przyjmuje jednocześnie kilka leków przepisanych przez różnych lekarzy. Żaden z tych lekarzy nie widzi pełnego zestawu, a ona sama nie ma wiedzy ani informacji, których połączeń substancji czynnych unikać, który lek może odpowiadać za gorsze samopoczucie i czy zestaw nie wymaga uzupełnienia niedoborów mikro- lub makroskładników. Dziś radzi sobie doraźnie: szuka w wyszukiwarce i w ulotkach przy każdym nowym leku, prowadzi notatki w telefonie lub na kartce, pyta farmaceutę albo lekarza przy okazji, a poza tym polega na pamięci. Ból ma cztery warstwy naraz: brak zdolności (nikt nie składa całości), dane uwięzione w ulotkach i pamięci, paraliż decyzyjny przy łączeniu leków oraz tarcie codziennego śledzenia.

Istniejące bazy interakcji są pisane dla profesjonalistów, nie dla pacjenta; nikt nie łączy leków z realnymi objawami użytkownika w czasie; a wynikiem ma być materiał na wizytę, nie diagnoza. Moment odbioru wartości to wizyta u lekarza — możliwość powiedzenia „biorę X, Y, Z, od dwóch tygodni mam objaw A, zbiega się to w czasie z Y" zamiast „coś mi nie służy".

## User & Persona

Persona główna: osoba dorosła przyjmująca przewlekle kilka leków przepisanych przez różnych specjalistów, bez wykształcenia medycznego. Sięga po produkt w trzech momentach: gdy do zestawu dochodzi nowy lek, gdy pojawia się złe samopoczucie o nieznanej przyczynie oraz przed wizytą u lekarza, na którą chce przyjść z uporządkowanym opisem.

Pierwsza wersja obsługuje jedną konkretną osobę — autorkę produktu. Bez profili dla bliskich, bez roli opiekuna.

Kierunek rozwoju poza pierwszą wersją: osoby starsze przyjmujące kilka leków. Decyzje projektowe pierwszej wersji świadomie nie zamykają tej drogi — stąd m.in. wybór loginu i hasła jako formy najprostszej dla tej grupy. Wymagania o czytelności i prostocie ekranów nie są jednak wymogiem pierwszej wersji.

## Success Criteria

### Primary

- Po zalogowaniu użytkowniczka dodaje pojedynczo przyjmowane leki, wpisując ich nazwy handlowe, i po dodaniu leku kolidującego z już zapisanym widzi informację o możliwej kolizji bez proszenia o nią.
- Użytkowniczka zapisuje wpis o samopoczuciu z datą i godziną, wybierając objaw z zamkniętej listy, a produkt sam składa pytanie do lekarza zestawiające ten objaw z okresami dawkowania przyjmowanych leków.
- Przed wizytą użytkowniczka otwiera sekcję „Do omówienia z lekarzem" i widzi w jednym miejscu możliwe kolizje oraz gotowe pytania o zbieżność objawów z okresami dawkowania.

### Secondary

- Oś czasu: objawy i leki zestawione w czasie, w formie wizualnej albo raportu do wygenerowania.

### Guardrails

- Leki, okresy dawkowania i wpisy o samopoczuciu jednej osoby nie są widoczne dla nikogo innego i nie opuszczają produktu.
- Brak ostrzeżenia nie oznacza „bezpieczne". Zbiór reguł jest z założenia niepełny i produkt musi mówić to wprost — fałszywe poczucie bezpieczeństwa jest gorsze niż brak narzędzia.
- Produkt nigdy nie stwierdza przyczyny objawu ani nie sugeruje odstawienia leku lub zmiany dawki.

## User Stories

Poniższe historie są sformatowaniem przepływu pierwszej sesji zapisanego w `shape-notes.md`. Kryteria akceptacji nie były przedmiotem osobnego przeglądu — patrz `## Open Questions`.

### US-01: Użytkowniczka dodaje lek i dowiaduje się o możliwej kolizji

- **Given** zalogowana użytkowniczka, która ma już na liście co najmniej jeden lek
- **When** dodaje kolejny lek, wpisując jego nazwę handlową
- **Then** przy nowo dodanej pozycji pojawia się dyskretny znacznik możliwej kolizji, a pełna treść informacji czeka w szczegółach leku

#### Acceptance Criteria

- Informacja pojawia się bez działania użytkowniczki — nie jest ukryta za osobnym żądaniem sprawdzenia.
- Przy treści informacji stale widoczna jest nota o jej charakterze poglądowym wraz z zachętą do konsultacji z lekarzem lub farmaceutą.
- Treść nie stwierdza zakazu łączenia leków ani nie porządkuje leków według stopnia podejrzenia.
- Gdy dodany lek nie tworzy pary z żadnym już zapisanym, znacznik nie pojawia się, co nie jest równoznaczne z potwierdzeniem bezpieczeństwa.
- Gdy preparatu nie ma w rejestrze leków, produkt prosi o wskazanie substancji czynnej z ulotki; tak dodany lek uczestniczy w sprawdzaniu kolizji na tych samych zasadach.
- Szczegóły leku pokazują pełny skład preparatu, bo treść informacji o kolizji nazywa substancję czynną, a lista pokazuje nazwę handlową.

### US-02: Użytkowniczka zapisuje objaw i dostaje pytanie do lekarza

- **Given** zalogowana użytkowniczka z co najmniej jednym lekiem na liście
- **When** zapisuje wpis o samopoczuciu, zaznaczając jeden lub więcej objawów z zamkniętej listy
- **Then** produkt pokazuje złożone pytanie do lekarza, zestawiające ten objaw z okresami dawkowania przyjmowanych leków

#### Acceptance Criteria

- Data i godzina wpisu są wypełnione domyślnie na moment zapisu i możliwe do cofnięcia.
- Nasilenie objawu i notatka własnymi słowami są polami opcjonalnymi; notatka nie uczestniczy w regule.
- Pierwszeństwo mają leki rozpoczęte lub zmienione w oknie czasowym poprzedzającym objaw; pozostałe pozostają dostępne pod zwinięciem.
- Wynikiem jest pytanie, a nie lista podejrzanych leków ani ocena ryzyka.

### US-03: Użytkowniczka przygotowuje się do wizyty

- **Given** użytkowniczka z zapisanymi lekami i wpisami o samopoczuciu
- **When** przed wizytą otwiera sekcję „Do omówienia z lekarzem"
- **Then** widzi w jednym miejscu wykryte możliwe kolizje oraz złożone pytania o zbieżność objawów z okresami dawkowania

#### Acceptance Criteria

- Sekcja nie wylicza niczego ponad to, co powstało przy dodawaniu leków i zapisywaniu objawów — zbiera gotowe treści.
- Treści zachowują język informacyjny wymagany przez FR-012.

### US-04: Użytkowniczka zmienia dawkowanie

- **Given** użytkowniczka przyjmująca lek zapisany w produkcie
- **When** zmienia dawkowanie tego leku
- **Then** bieżący okres dawkowania zostaje zamknięty, otwiera się nowy, a lek pozostaje jedną pozycją na liście z historią okresów od–do

#### Acceptance Criteria

- Wcześniejsze zestawienia objawów z poprzednim okresem dawkowania pozostają prawdziwe.
- Zmiana substancji czynnej nie jest zmianą dawkowania — wymaga zakończenia leku i dodania nowego.

## Functional Requirements

### Konto i dostęp

- FR-001: Użytkowniczka może założyć konto, akceptując warunki korzystania. Priority: must-have
  > Socratic: Kontrargument rozważony: „przy jednej użytkowniczce konto to zbędny koszt, a dane zdrowotne przechowywane poza urządzeniem tworzą nowe ryzyko; zgoda przez zaznaczenie pola i tak nie jest czytana". Rozstrzygnięcie: zostaje. Uwierzytelnianie jest wymogiem projektu, rejestracja otwiera drogę do pokazania prototypu bliskim, a akceptacja warunków jest spełniona niezależnie od tego, czy ktoś je przeczyta — to dwie różne sprawy.
- FR-002: Użytkowniczka może zalogować się loginem i hasłem; odzyskiwanie dostępu jest częścią zakresu. Priority: must-have
  > Socratic: Kontrargument rozważony: „hasło pociąga za sobą odzyskiwanie dostępu; trwałe zalogowanie albo logowanie kontem zewnętrznym byłyby prostsze". Rozstrzygnięcie: zostaje, świadomie, wraz z odzyskiwaniem dostępu w zakresie. Trwałe zalogowanie odpada, bo docelowo dochodzą urządzenia mobilne. Login i hasło jest też najprostszą formą dla osób starszych, które są kierunkiem rozwoju produktu.

### Leki

- FR-003: Użytkowniczka może dodać przyjmowany preparat, wpisując jego nazwę handlową; skład preparatu produkt ustala na podstawie rejestru leków dostarczonego razem z nim. Gdy preparatu nie ma w rejestrze, użytkowniczka wskazuje substancję czynną odczytaną z ulotki, a lek uczestniczy w regułach na tych samych zasadach. Priority: must-have
  > Socratic: Kontrargument rozważony: „preparaty wieloskładnikowe nie mieszczą się w założeniu jeden lek = jedna substancja". Rozstrzygnięcie: preparat od początku może mieć wiele substancji czynnych, ale pierwsza wersja przyjmuje jedną; dodawanie kolejnych dochodzi później. Zebranie słownika substancji uznane za wykonalne; odczyt substancji z ulotki to akceptowana, lekka uciążliwość. Nazwy handlowe — dalszy rozwój.
  > Rewizja 2026-09-21 (rozstrzygnięcie pytania 2): wejściem jest nazwa handlowa, nie substancja czynna. Powód: odczyt substancji z ulotki jest barierą wejścia dla osób starszych, które są kierunkiem rozwoju produktu. Skład przychodzi z rejestru leków dostarczonego z produktem, więc ograniczenie „pierwsza wersja przyjmuje jedną substancję" nadal obowiązuje tam, gdzie zostało ustalone — nie powstaje interfejs do ręcznego kompletowania składu. Preparat wieloskładnikowy zapisywany jest z pełnym składem, bo pominięcie którejkolwiek substancji oznaczałoby brak znacznika przy leku, który faktycznie koliduje.
  > Konsekwencja: reguły kolizji działają na substancjach czynnych i ich grupach, nigdy na nazwach handlowych. Nazwa handlowa jest wyłącznie sposobem wprowadzenia leku i etykietą na liście.
- FR-004: Użytkowniczka może zmienić dawkowanie leku, co zamyka bieżący okres dawkowania i otwiera nowy; lek pozostaje jedną pozycją na liście z historią okresów od–do. Priority: must-have
  > Socratic: Kontrargument rozważony: „edycja bez historii niszczy zbieżności w czasie — podmiana leku lub dawki sprawia, że wcześniejsze zestawienia z objawami przestają być prawdziwe". Rozstrzygnięcie: przyjęte i rozszerzone przez użytkowniczkę — zmiana dawkowania jest zmianą istotną, bo może wpływać na objawy. Wybrany wariant: pełna historia okresów dawkowania już w pierwszej wersji, mimo kosztu ponad wariant minimalny. Uzasadnienie: to jest rdzeń produktu; dorobienie później oznaczałoby przeróbkę FR-010 i FR-011; struktura okresów jest gotową podstawą pod przyszłą oś czasu.
  > Konsekwencja: FR-010 i FR-011 operują na okresach dawkowania, nie na samym fakcie przyjmowania leku — co umożliwia zdanie „objaw pojawił się po zwiększeniu dawki". Substancja czynna pozostaje niemodyfikowalna: jej zmiana to zakończenie leku i dodanie nowego.
- FR-005: Użytkowniczka może zakończyć przyjmowanie leku z datą odstawienia; trwałe usunięcie pozycji jest zarezerwowane dla pozycji dodanych przez pomyłkę. Priority: must-have
  > Socratic: Kontrargument rozważony: „trwałe usunięcie jest prostsze". Rozstrzygnięcie: odrzucone — usunięcie kasuje kontekst dla wcześniejszych objawów. Odstawiony lek znika z listy aktualnych, ale zostaje w historii i nadal tłumaczy dawne wpisy.

### Informacje o kolizjach

- FR-006: Użytkowniczka po dodaniu leku widzi przy nim dyskretny znacznik możliwej kolizji, a pełną treść informacji w szczegółach leku. Szczegóły leku pokazują też jego pełny skład. Priority: must-have
  > Socratic: Kontrargumenty rozważone: informacja przychodzi po fakcie (lek jest już przepisany), niepełny zbiór reguł daje fałszywe poczucie kontroli, a powtarzane ostrzeżenia zlewają się w szum. Rozstrzygnięcie: forma ma być informacyjna, nie alarmowa — język „może wchodzić w interakcję, w razie niepokoju skonsultuj z lekarzem lub farmaceutą" zamiast zakazu, bez treści przerywającej pracę.
  > Rewizja 2026-09-21: skład w szczegółach leku jest wymogiem, nie ozdobą. Treść informacji o kolizji nazywa substancję czynną, a lista pokazuje nazwę handlową — bez widocznego składu komunikat mówiłby o czymś, czego użytkowniczka nie kojarzy ze swoim lekiem. Sama lista pozostaje przy nazwach handlowych: przy preparatach złożonych rozpisany skład zaciemniłby obraz.
- FR-007: Użytkowniczka widzi notę o charakterze informacyjnym przy każdej informacji o kolizji. Priority: must-have
  > Socratic: Kontrargument rozważony: „powtarzana nota rozmywa treść, a akceptacja warunków już to załatwiła". Rozstrzygnięcie: zostaje. Akceptacja warunków jest zapisem prawnym, a nota przy informacji pada tam, gdzie pada twierdzenie o zdrowiu — także wtedy, gdy ekran ogląda ktoś inny.

### Dzienniczek samopoczucia

- FR-008: Użytkowniczka może dodać wpis o samopoczuciu z datą i godziną wypełnionymi domyślnie na moment zapisu i możliwymi do cofnięcia, zaznaczając jeden lub więcej objawów z zamkniętej listy, opcjonalnie podając nasilenie i własną notatkę. Priority: must-have
  > Socratic: Kontrargumenty rozważone: zamknięta lista nie obejmie tego, co użytkowniczka faktycznie czuje; brakuje nasilenia; ręczne wpisywanie daty to zbędne tarcie. Rozstrzygnięcie: zamknięta lista zostaje jako realny wybór dla pierwszej wersji, ale problem języka rozwiązany dwojako — potoczne określenia jako słowa wyszukiwania przy pozycjach listy, a własne słowa użytkowniczki trafiają do notatki, która nie uczestniczy w regule. Nasilenie dodane jako pole opcjonalne, bo na wizycie odróżnia „mdłości raz, łagodne" od „mdłości codziennie, silne". Data i godzina wypełniane domyślnie, bo wpisy często powstają wieczorem o porannym objawie, a zła godzina fałszowałaby zbieżność z okresem dawkowania.
  > Rewizja 2026-09-21 (rozstrzygnięcie pytania 3): lista liczy 34 pozycje w ośmiu kategoriach układów — pokarmowy, nerwowy, psychika, skóra, krążenie, ogólne, mięśnie i pozostałe. Kryterium doboru to objawy zauważalne przez pacjenta, występujące w ulotkach jako bardzo częste i częste. Lista jest zbiorem dostarczonym razem z produktem i tylko odczytywanym; nie jest wejściem reguły, więc jej zakres jest kwestią pokrycia, nie poprawności zestawienia. Objaw nieujęty na liście nadal trafia do notatki własnymi słowami — osobnej pozycji „inny objaw" nie ma.
- FR-009: Użytkowniczka może poprawić wpis dzienniczka w oknie korekty, na tej samej zasadzie co wpis o leku; po zamknięciu okna rdzeń wpisu — data, godzina, objawy, nasilenie — jest niemodyfikowalny, a edytowalna zostaje notatka. Usunięcie wpisu jest zarezerwowane dla pozycji dodanych przez pomyłkę. Priority: must-have
  > Socratic: Kontrargument rozważony: „swobodna edycja i usuwanie po fakcie dają obraz ładniejszy niż prawdziwy — dzienniczek jest wart tyle, ile jego kompletność". Rozstrzygnięcie: przyjęte; wpisy dzienniczka obejmuje ta sama zasada co leki, dla spójności zachowania w całym produkcie i dla ochrony obrazu pokazywanego lekarzowi. Miara okna korekty dla wpisu dzienniczka pozostaje nierozstrzygnięta — patrz `## Open Questions`.
- FR-010: Użytkowniczka po zapisaniu objawu widzi gotowe pytanie do lekarza, złożone z okresów dawkowania przyjmowanych leków i wpisów o tym objawie, z pierwszeństwem dla leków rozpoczętych lub zmienionych w oknie czasowym poprzedzającym objaw. Priority: must-have
  > Socratic: Kontrargumenty rozważone, wszystkie uznane za trafne: częste objawy występują wśród działań niepożądanych niemal każdego leku, więc zestawienie trafiające zawsze przestaje znaczyć cokolwiek; objaw może mieć przyczynę niezwiązaną z lekami; pokazanie związku jest o krok od samodzielnego odstawienia leku, czego produkt ma nie sugerować. Rozstrzygnięcie: wszystkie trzy trafiają w różnicę między zbieżnością a przyczyną. Wynikiem nie jest lista podejrzanych leków, tylko zdanie do rozmowy z lekarzem. Okno czasowe oparte na okresach dawkowania z FR-004 usuwa większość szumu; leki spoza okna pozostają dostępne pod zwinięciem.
- FR-012: Komunikaty produktu nigdy nie stwierdzają, że lek powoduje objaw (tylko „może mieć związek"), nigdy nie sugerują odstawienia leku ani zmiany dawki i nigdy nie porządkują leków według stopnia podejrzenia. Priority: must-have
  > Socratic: Zasada przyjęta wprost przez użytkowniczkę jako wymaganie, nie wytyczna — ma podlegać sprawdzeniu, bo dotyczy jedynego miejsca, w którym produkt mógłby wyrządzić szkodę.

### Podsumowanie na wizytę

- FR-011: Użytkowniczka może wyświetlić sekcję „Do omówienia z lekarzem", zbierającą wykryte możliwe kolizje i złożone pytania o zbieżność objawów z okresami dawkowania. Priority: must-have
  > Socratic: Kontrargumenty rozważone: sekcja duplikuje treść widoczną przy lekach; lekarz nie przeczyta długiego zestawienia. Rozstrzygnięcie: podniesiona z nice-to-have do must-have. Produkt istnieje dla momentu wizyty, a po zmianie kształtu FR-010 sekcja nie liczy niczego nowego — zbiera gotowe zdania.

## Non-Functional Requirements

- Leki, okresy dawkowania i wpisy o samopoczuciu jednej osoby pozostają nieczytelne dla kogokolwiek poza właścicielem konta — zarówno dla innej osoby korzystającej z produktu, jak i dla osoby mającej dostęp do zgromadzonych danych.
- Usunięcie konta powoduje bezpowrotne skasowanie wszystkich powiązanych danych: leków, okresów dawkowania, wpisów o samopoczuciu i złożonych pytań. Nie pozostaje kopia zachowana „na wszelki wypadek".
- Produkt pozostaje czytelny i w pełni używalny na ekranie telefonu — tam powstaje większość wpisów o samopoczuciu.
- Dostęp do zapisanych danych przeżywa wymianę urządzenia i jest możliwy z więcej niż jednego urządzenia tej samej osoby.

# TODO: mierzalne progi czasu odpowiedzi i dostępności — see Open Questions

## Business Logic

Na podstawie substancji czynnych przyjmowanych leków, ich okresów dawkowania i zapisanych objawów aplikacja ustala, które substancje mogą na siebie negatywnie oddziaływać i które objawy są zbieżne w czasie z okresami dawkowania, i składa z tego pytania do zadania lekarzowi.

Sformułowanie źródłowe użytkowniczki: „Na podstawie informacji o lekach, które użytkownik wprowadził, aplikacja informuje, które z nich mogą na siebie negatywnie oddziaływać oraz pozwala użytkownikowi lepiej przygotować się na wizytę u lekarza."

Wejścia reguły to wyłącznie rzeczy, które użytkowniczka sama wprowadza: przyjmowane preparaty, daty i dawki kolejnych okresów przyjmowania oraz wpisy o samopoczuciu z datą, godziną, objawami i opcjonalnym nasileniem. Do tego dochodzą trzy zbiory danych dostarczone razem z produktem:

- **Zbiór reguł** — pary substancji czynnych oddziałujących negatywnie, zapisane na poziomie grup klasyfikacji ATC. Zebrany ręcznie, z ulotek i charakterystyk produktów leczniczych; z założenia niepełny.
- **Rejestr leków** — słownik nazw handlowych wraz ze składem i kodami ATC, przepisany z Rejestru Produktów Leczniczych. Służy wyłącznie rozpoznaniu, jakie substancje zawiera wpisany preparat. Nie jest źródłem reguł kolizji i nie rozstrzyga o niczym poza składem.
- **Katalog objawów** — zamknięta lista 34 objawów w ośmiu kategoriach układów, wraz z potocznymi określeniami użytymi jako słowa wyszukiwania. Nie jest wejściem reguły: służy etykietowaniu wpisu o samopoczuciu i składaniu zdania dla lekarza, a zestawienie objawu z lekami idzie wyłącznie po osi czasu.

Rewizja 2026-09-21: wcześniejsza wersja wymieniała jako drugi zbiór reguł znane działania niepożądane przypisane substancjom. Zestawianie objawu z lekami (FR-010) działa wyłącznie na osi czasu — porównuje datę objawu z okresami dawkowania — więc taki zbiór nie jest w pierwszej wersji do niczego potrzebny. Przeniesiony poza zakres, patrz `## Non-Goals`.

Wyjściem nie jest lista podejrzanych leków ani ocena ryzyka, tylko dwa rodzaje informacji: oznaczenie możliwej kolizji przy konkretnym leku oraz złożone zdanie-pytanie zestawiające okres dawkowania z zapisanym objawem. Użytkowniczka spotyka je w trzech momentach: zaraz po dodaniu leku, zaraz po zapisaniu objawu oraz w sekcji „Do omówienia z lekarzem", którą otwiera przed wizytą.

Reguła świadomie nie rozstrzyga przyczyny. Zbieżność w czasie nie jest przyczynowością i produkt nie ma prawa tej granicy przekroczyć — stąd FR-012 o języku komunikatów i bariera mówiąca, że brak ostrzeżenia nie oznacza bezpieczeństwa.

## Access Control

Konto z logowaniem loginem i hasłem, wraz ze ścieżką odzyskiwania dostępu (FR-002). Odrzucono trwałe zalogowanie oraz logowanie kontem zewnętrznym: pierwsze nie działa przy korzystaniu z wielu urządzeń, drugie uzależnia dostęp do danych zdrowotnych od konta u zewnętrznego dostawcy.

Płaski model uprawnień: jeden rodzaj użytkownika. Każde konto widzi i zmienia wyłącznie własne leki, własne okresy dawkowania i własne wpisy o samopoczuciu. Zbiór reguł, rejestr leków i katalog objawów są wspólne dla produktu i dostarczane razem z nim; nie są zmieniane przez użytkownika, tylko odczytywane, więc rola administratora reguł w pierwszej wersji nie powstaje.

Akceptacja warunków korzystania jest jednorazowym, świadomym krokiem przy zakładaniu konta, z zapisem daty i wersji dokumentu. Treść warunków mówi wprost: narzędzie informacyjne wspierające rozmowę z lekarzem, nie diagnoza, nie podstawa do zmiany dawkowania. Nota informacyjna nie jest powtarzana jako osobny ekran przy każdym wejściu — jej drugą warstwą jest stała linijka przy każdej informacji o kolizji (FR-007).

## Non-Goals

Funkcjonalne:

- Brak integracji z zewnętrzną bazą interakcji — reguły kolizji pochodzą wyłącznie ze zbioru dostarczonego razem z produktem i zebranego ręcznie. Rejestr leków przepisany z Rejestru Produktów Leczniczych tego nie narusza: rozpoznaje skład preparatu, nie mówi nic o interakcjach.
- Brak aktualizowanego na bieżąco rejestru leków — rejestr jest wgrany raz, razem z produktem, i starzeje się. Odświeżanie poza pierwszą wersją.
- Brak zbioru znanych działań niepożądanych przypisanych substancjom — zestawianie objawów z lekami działa wyłącznie na osi czasu (FR-010), więc taki zbiór nie jest w pierwszej wersji używany. Przeniesiony do drugiej wersji.
- Brak przypomnień o przyjęciu dawki — produkt służy rozumieniu zestawu leków, nie pilnowaniu rutyny.
- Brak zdalnego udostępniania danych lekarzowi — sekcja na wizytę jest do pokazania na ekranie, bez kont dla lekarzy i bez wysyłki.
- Brak reguły niedoborów mikro- i makroskładników — przeniesiona do drugiej wersji.
- Brak interfejsu do dodawania kilku substancji czynnych w jednym preparacie — użytkowniczka wpisuje nazwę handlową, skład przychodzi z rejestru; ekran ręcznego kompletowania składu nie powstaje.

Niefunkcjonalne:

- Brak działania bez połączenia z siecią.
- Produkt nie jest kompletnym zbiorem interakcji; obejmuje około dwudziestu par grup substancji, a brak ostrzeżenia niczego nie dowodzi. Nie dowodzi tym bardziej przy leku spoza rejestru, dodanym przez wskazanie substancji z ulotki.
- Brak formalnej zgodności ze standardami dostępności — czytelność na telefonie tak, certyfikowana dostępność nie w tej wersji.
- Brak wielu profilów w jednym koncie — jedno konto to jedna osoba; prowadzenie leków podopiecznego poza zakresem.

## Open Questions

1. ~~**Jak nazywa się produkt?**~~ — ROZSTRZYGNIĘTE 2026-09-17: **lekomapa**, domena `lekomapa.pl`. Robocze „MedBuddy" zostało wcześniej wycofane. Pole `project` uzupełnione.
2. ~~**Ile par substancji czynnych i z jakiego źródła trafia do zbioru reguł?**~~ — ROZSTRZYGNIĘTE 2026-09-21 (issue #2): około 20 par zapisanych na poziomie grup ATC, obejmujących 10–14 grup i wynikowo około 40 substancji. Pary zbierane ręcznie z ulotek i charakterystyk produktów leczniczych, każda z zapisem źródła i daty sprawdzenia. Nazwy handlowe i skład preparatów pochodzą z Rejestru Produktów Leczniczych, zawężonego do wybranych grup ATC. Zebranie i sprawdzenie par pozostaje pracą poza kodem, wliczoną w budżet czasu; przepisywanie nazw leków odpada. Konsekwencje zapisane w FR-003, FR-006, `## Business Logic` i `## Non-Goals`.
3. ~~**Ile pozycji liczy zamknięta lista objawów i skąd pochodzi?**~~ — ROZSTRZYGNIĘTE 2026-09-21 (issue #3): lista liczy 34 pozycje w ośmiu kategoriach układów, dobrane jako objawy zauważalne przez pacjenta i opisane w ulotkach jako bardzo częste i częste. Źródłem jest zbiór ustalony w sesji rozstrzygania, nie obchód ulotek ani słownik kodowany — lista nie jest wejściem reguły, bo zestawianie objawu z lekami działa wyłącznie na osi czasu. Przy każdej pozycji potoczne określenia jako słowa wyszukiwania oraz kolumna na kod źródłowy, pusta w pierwszej wersji i przewidziana pod zbiór działań niepożądanych z wersji drugiej. Objaw nieujęty na liście zostaje w notatce własnymi słowami. Konsekwencje zapisane w FR-008, `## Business Logic` i `## Access Control`.
4. **Jak długie jest okno czasowe w FR-010?** — przyjęto roboczo około 30 dni przed objawem; wartość do potwierdzenia. Właściciel: użytkowniczka.
5. **Jak długo trwa okno korekty wpisu dzienniczka (FR-009)?** — zasada jest przesądzona i wspólna z lekami; nieustalona pozostaje sama miara. Przy leku warunek jest zdarzeniowy („dopóki nie istnieje wpis objawu po dacie rozpoczęcia"), przy wpisie dzienniczka musi być czasowy, bo wpis zasila złożone pytanie natychmiast. Właściciel: użytkowniczka.
6. **Jakie mierzalne progi obowiązują dla czasu odpowiedzi i dostępności produktu?** — nie były przedmiotem sesji planistycznej. Właściciel: użytkowniczka. Konsekwencja: `## Non-Functional Requirements` nie zawiera progów liczbowych.
7. **Czy kryteria akceptacji historii użytkownika zostały zaakceptowane?** — historie US-01…US-04 powstały jako sformatowanie przepływu pierwszej sesji z `shape-notes.md`; sesja planistyczna nie przechodziła osobnej fazy pisania historii i kryteriów. Właściciel: użytkowniczka. Konsekwencja: kryteria wymagają przeglądu przed użyciem jako podstawy testów.
8. **Jak brzmi treść warunków korzystania?** — ustalono rolę i moment akceptacji oraz sens komunikatu, nie samą treść dokumentu. Właściciel: użytkowniczka.
