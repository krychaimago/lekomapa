---
project: lekomapa
context_type: greenfield
created: 2026-09-14
updated: 2026-09-17
checkpoint:
  current_phase: 8
  phases_completed: [1, 2, 3, 4, 5, 6, 7]
  gray_areas_resolved:
    - topic: "kategoria bólu"
      decision: "brak zdolności + dane uwięzione + paraliż decyzyjny + tarcie rutyny"
    - topic: "wgląd"
      decision: "bazy pisane dla profesjonalistów; nikt nie łączy leków z objawami w czasie; wynik to materiał na wizytę, nie diagnoza"
    - topic: "zakres reguł w MVP"
      decision: "interakcje lek-lek + skutki uboczne; niedobory przesunięte do v2"
    - topic: "zestawianie objawów ze skutkami ubocznymi"
      decision: "w MVP; wymaga zamkniętej listy objawów"
    - topic: "nota o charakterze informacyjnym"
      decision: "akceptacja warunków przy rejestracji (data + wersja) + stała linijka przy każdym ostrzeżeniu; bez modalu przy wejściu"
    - topic: "identyfikacja leku"
      decision: "wybór substancji czynnej ze słownika; mapowanie nazw handlowych poza MVP"
    - topic: "model dostępu"
      decision: "konto z logowaniem, dane po stronie serwera; płaski model ról; tabela reguł nieedytowalna z UI"
    - topic: "zasięg persony"
      decision: "jedna osoba — autorka; bez profili bliskich i roli opiekuna"
  frs_drafted: 12
  quality_check_status: accepted
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

# Shape notes

## Open Questions

1. ~~**Jak nazywa się produkt?**~~ — ROZSTRZYGNIĘTE 2026-09-17: **lekomapa**, domena `lekomapa.pl`. Robocze "MedBuddy" zostało wcześniej wycofane.
2. **Ile par substancji czynnych i z jakiego źródła trafia do tabeli reguł?** — ustalono "kilkanaście par plus leki faktycznie przyjmowane", bez wskazania źródła, z którego zostaną przepisane. Właściciel: użytkowniczka. Zebranie i sprawdzenie tych danych to praca poza kodem, wliczona w budżet czasu.
3. **Ile pozycji liczy zamknięta lista objawów i skąd pochodzi?** — przyjęto rząd 15–20 pozycji wraz z potocznymi określeniami do wyszukiwania; konkretna lista nieustalona.
4. **Jak długie jest okno czasowe w FR-010?** — przyjęto roboczo około 30 dni przed objawem; wartość do potwierdzenia.
5. **Jak długo trwa okno korekty wpisu dzienniczka?** — zasada jest przesądzona i wspólna z lekami (FR-004/FR-009); nieustalona pozostaje sama miara. Przy leku warunek jest zdarzeniowy, przy wpisie dzienniczka musi być czasowy, bo wpis zasila złożone pytanie natychmiast. Właściciel: użytkowniczka.

## Seed idea (verbatim)

> Osobiste narzędzie do zapisywania przyjmowanych leków i prowadzenia dzienniczka objawów, które ostrzega o możliwym negatywnym wpływie jednej substancji czynnej na drugą oraz o możliwych niedoborach i skutkach niepożądanych.
>
> MVP: ręcznie wprowadzona tabela najpopularniejszych par substancji czynnych działających na siebie negatywnie. Integracja z zewnętrznym API interakcji — poza zakresem MVP, jako późniejsze rozszerzenie.
>
> Autorka: QA, nie programuje jeszcze, niewielkie doświadczenie z agentami, ~8h tygodniowo.
>
> Do rozstrzygnięcia w sesji: ile par reguł i z jakiego źródła, jak mapować nazwy handlowe leków na substancje czynne, jak wygląda ostrzeżenie i kiedy się pojawia, zakres dzienniczka objawów, status informacyjny ostrzeżeń (nota „to nie porada medyczna").

## Vision & Problem Statement

Pacjentka przyjmuje jednocześnie kilka leków przepisanych przez różnych lekarzy. Żaden z tych lekarzy nie widzi pełnego zestawu, a ona sama nie ma wiedzy ani informacji, których połączeń substancji czynnych unikać, który lek może odpowiadać za gorsze samopoczucie i czy zestaw nie wymaga uzupełnienia niedoborów mikro- lub makroskładników. Dziś radzi sobie doraźnie: szuka w Google i ulotkach przy każdym nowym leku, prowadzi notatki w telefonie lub na kartce, pyta farmaceutę albo lekarza przy okazji, a poza tym polega na pamięci. Ból ma cztery warstwy naraz: brak zdolności (nikt nie składa całości), dane uwięzione w ulotkach i pamięci, paraliż decyzyjny przy łączeniu leków oraz tarcie codziennego śledzenia.

Wgląd: istniejące bazy interakcji są pisane dla profesjonalistów, nie dla pacjenta; nikt nie łączy leków z realnymi objawami użytkownika w czasie; a wynikiem ma być materiał na wizytę, nie diagnoza. Moment odbioru wartości to wizyta u lekarza — możliwość powiedzenia „biorę X, Y, Z, od dwóch tygodni mam objaw A, zbiega się to w czasie z Y" zamiast „coś mi nie służy".

## User & Persona

Primary persona: osoba dorosła przyjmująca przewlekle kilka leków przepisanych przez różnych specjalistów, bez wykształcenia medycznego. Sięga po produkt w trzech momentach: gdy do zestawu dochodzi nowy lek, gdy pojawia się złe samopoczucie o nieznanej przyczynie oraz przed wizytą u lekarza, na którą chce przyjść z uporządkowanym opisem.

Pierwsza wersja obsługuje jedną konkretną osobę — autorkę. Bez profili dla bliskich, bez roli opiekuna.

Kierunek rozwoju (poza MVP): osoby starsze przyjmujące kilka leków. Decyzje projektowe pierwszej wersji świadomie nie zamykają tej drogi — stąd m.in. wybór logowania loginem i hasłem jako formy najprostszej dla tej grupy. Wymagania o czytelności i prostocie ekranów nie są jednak wymogiem MVP.

## Access Control

Konto z logowaniem loginem i hasłem, wraz ze ścieżką odzyskiwania dostępu (FR-002). Dane mieszkają po stronie serwera, dzięki czemu dostęp jest możliwy z telefonu i z komputera i przeżywa wymianę urządzenia. Odrzucono stałą sesję oraz logowanie kontem zewnętrznym: pierwsze nie działa przy wielu urządzeniach, drugie uzależnia dostęp do danych zdrowotnych od konta u dostawcy.

Płaski model uprawnień: jeden rodzaj użytkownika. Każde konto widzi i edytuje wyłącznie własne leki i własne wpisy objawów. Tabela par substancji czynnych jest wspólna dla aplikacji i dostarczana razem z nią — nie jest edytowana przez użytkownika z poziomu interfejsu, więc rola administratora reguł w MVP nie powstaje.

Dane zdrowotne są danymi wrażliwymi — konsekwencje dla prywatności zapisane są w ## Non-Functional Requirements.

## Success Criteria

### Primary
- Użytkowniczka po zalogowaniu dodaje pojedynczo przyjmowane leki (wybierając substancję czynną ze słownika) i po dodaniu leku kolidującego z już zapisanym widzi ostrzeżenie bez proszenia o nie.
- Użytkowniczka zapisuje w dzienniczku wpis o samopoczuciu z datą i godziną, wybierając objaw z zamkniętej listy, a aplikacja sama składa pytanie do lekarza zestawiające ten objaw z okresami dawkowania przyjmowanych leków.
- Użytkowniczka przed wizytą otwiera sekcję "Do omówienia z lekarzem" i widzi w jednym miejscu możliwe kolizje oraz gotowe pytania o zbieżność objawów z okresami dawkowania.

### Secondary
- Oś czasu: objawy i leki zestawione w czasie, w formie wizualnej albo raportu do wygenerowania. (Pierwotne "podsumowanie na wizytę" zostało podniesione do wymagań obowiązkowych jako FR-011.)

### Guardrails
- Prywatność danych zdrowotnych: leki i wpisy jednej osoby nie są widoczne dla nikogo innego ani nie opuszczają systemu.
- Brak ostrzeżenia nie oznacza „bezpieczne”. Tabela reguł jest z założenia niepełna i produkt musi mówić to wprost — fałszywe poczucie bezpieczeństwa jest gorsze niż brak narzędzia.

### Pierwsza sesja — przepływ MVP
1. Rejestracja z jednorazową, świadomą akceptacją warunków korzystania (zapisana data i wersja dokumentu); treść mówi wprost: narzędzie informacyjne wspierające rozmowę z lekarzem, nie diagnoza, nie podstawa do zmiany dawkowania.
2. Logowanie.
3. Dodanie pojedynczo przyjmowanych leków — wybór substancji czynnej ze słownika.
4. Po dodaniu leku kolidującego z już zapisanym: przy pozycji pojawia się dyskretny znacznik możliwej kolizji, a pełna treść czeka w szczegółach leku, ze stałą jednolinijkową notą „informacja poglądowa — skonsultuj z lekarzem lub farmaceutą”.
5. Osobna zakładka dzienniczka: dodanie wpisu o samopoczuciu z datą i godziną wypełnionymi domyślnie, jednym lub kilkoma objawami z zamkniętej listy (15–20 pozycji), opcjonalnym nasileniem i opcjonalną notatką nieuczestniczącą w regule.
6. Po zapisaniu objawu aplikacja pokazuje złożone pytanie do lekarza, a przed wizytą użytkowniczka otwiera sekcję "Do omówienia z lekarzem".
7. Poprawianie wpisów — leków i wpisów dzienniczka — wyłącznie w oknie korekty; zakończenie leku z datą odstawienia zamiast usuwania.

Nota o charakterze informacyjnym występuje w dwóch warstwach: świadoma akceptacja przy rejestracji (ślad: data + wersja) oraz stała linijka przy każdym ostrzeżeniu. Bez modalu przy każdym wejściu — po kilku logowaniach przestaje być czytany.

### Zakres przycięty w tej fazie
Zakres urósł podczas fazy 3 (trzy tabele reguł + zestawianie objawów) i został świadomie przycięty. Przyjęte cięcia:
- Niedobory (substancja → wyczerpywany składnik) przesunięte do wersji drugiej — najsłabsze powiązanie z dzienniczkiem, najmniejsza liczba leków, mechanizm i tak powstaje przy dwóch pozostałych regułach.
- Lek wybierany po substancji czynnej ze słownika zamiast po nazwie handlowej — zdejmuje z MVP mapowanie nazw handlowych na substancje czynne.
- Zamknięta lista objawów zamiast wolnego tekstu — warunek działania zestawiania.
- Tabele reguł ograniczone do leków faktycznie przyjmowanych przez użytkowniczkę plus kilkanaście najczęstszych par, zamiast „najpopularniejszych w ogóle”.

## Timeline acknowledgment

Acknowledged on 2026-09-15: pierwsza wersja szacowana na 4–5 tygodni przy ~8h tygodniowo (~32–40h); użytkowniczka świadomie przyjęła koszt stałego wysiłku po godzinach. Wzrost względem pierwotnych 3 tygodni wynika z decyzji o pełnej historii okresów dawkowania w FR-004. Autorka nie programowała wcześniej, więc estymata pozostaje do zweryfikowania po pierwszym tygodniu pracy.

## Functional Requirements

### Konto i dostęp
- FR-001: Użytkowniczka może założyć konto, akceptując warunki korzystania. Priority: must-have
  > Socrates: Kontrargument rozważony: "przy jednej użytkowniczce konto to zbędny koszt, a dane zdrowotne na serwerze tworzą nowe ryzyko; zgoda przez checkbox i tak nie jest czytana". Rozstrzygnięcie: zostaje. Uwierzytelnianie jest wymogiem projektu, rejestracja otwiera drogę do pokazania prototypu bliskim, a akceptacja regulaminu jest spełniona niezależnie od tego, czy ktoś go przeczyta — to dwie różne sprawy.
- FR-002: Użytkowniczka może zalogować się loginem i hasłem; odzyskiwanie dostępu jest częścią zakresu. Priority: must-have
  > Socrates: Kontrargument rozważony: "hasło pociąga za sobą reset hasła; stała sesja albo logowanie zewnętrzne byłyby prostsze". Rozstrzygnięcie: zostaje, świadomie, wraz z odzyskiwaniem dostępu w zakresie. Stała sesja odpada, bo docelowo dochodzą urządzenia mobilne. Login i hasło jest też najprostszą formą dla osób starszych, które są kierunkiem rozwoju produktu.

### Leki
- FR-003: Użytkowniczka może dodać przyjmowany preparat, wybierając substancję czynną ze słownika. Priority: must-have
  > Socrates: Kontrargument rozważony: "preparaty wieloskładnikowe nie mieszczą się w założeniu jeden lek = jedna substancja". Rozstrzygnięcie: preparat od początku może mieć wiele substancji czynnych w strukturze danych, ale interfejs MVP przyjmuje jedną; dodawanie kolejnych dochodzi później, bez przeróbki reguł ani przeprowadzki danych. Zebranie słownika substancji uznane za wykonalne; odczyt substancji z ulotki to akceptowana, lekka uciążliwość. Nazwy handlowe — dalszy rozwój.
- FR-004: Użytkowniczka może zmienić dawkowanie leku, co zamyka bieżący okres dawkowania i otwiera nowy; lek pozostaje jedną pozycją na liście z historią okresów od–do. Priority: must-have
  > Socrates: Kontrargument rozważony: "edycja bez historii niszczy zbieżności w czasie — podmiana leku lub dawki sprawia, że wcześniejsze zestawienia z objawami przestają być prawdziwe". Rozstrzygnięcie: przyjęte i rozszerzone przez użytkowniczkę — zmiana dawkowania jest zmianą istotną, bo może wpływać na objawy. Wybrany wariant: pełna historia okresów dawkowania (od–do plus dawka) już w MVP, mimo kosztu ~8–15h ponad wariant minimalny. Uzasadnienie użytkowniczki: to jest rdzeń produktu; dorobienie później oznaczałoby przeróbkę FR-010 i podsumowania na wizytę; struktura okresów jest gotową podstawą pod przyszłe wykresy w czasie.
  > Konsekwencja: zestawianie objawów (FR-010) i podsumowanie na wizytę (FR-011) operują na okresach dawkowania, nie na samym fakcie przyjmowania leku — co umożliwia zdanie "objaw pojawił się po zwiększeniu dawki". Substancja czynna pozostaje niemodyfikowalna: zmiana substancji to zakończenie leku i dodanie nowego.

- FR-005: Użytkowniczka może zakończyć przyjmowanie leku z datą odstawienia; trwałe usunięcie wpisu jest zarezerwowane dla pozycji dodanych przez pomyłkę. Priority: must-have
  > Socrates: Kontrargument rozważony: "trwałe usunięcie jest prostsze". Rozstrzygnięcie: odrzucone — usunięcie kasuje kontekst dla wcześniejszych objawów. Odstawiony lek znika z listy aktualnych, ale zostaje w historii i nadal tłumaczy dawne wpisy.

### Ostrzeżenia
- FR-006: Użytkowniczka po dodaniu leku widzi przy nim dyskretny znacznik możliwej kolizji, a pełną treść informacji w szczegółach leku. Priority: must-have
  > Socrates: Kontrargumenty rozważone: informacja przychodzi po fakcie (lek jest już przepisany), niepełna tabela daje fałszywe poczucie kontroli, a powtarzane ostrzeżenia zlewają się w szum. Rozstrzygnięcie: forma ma być informacyjna, nie alarmowa — bez czerwieni, bez okna blokującego, język "może wchodzić w interakcję, w razie niepokoju skonsultuj z lekarzem lub farmaceutą" zamiast zakazu. Znacznik przy leku plus treść w szczegółach zamiast banera na liście.
- FR-007: Użytkowniczka widzi notę o charakterze informacyjnym przy każdej informacji o kolizji. Priority: must-have
  > Socrates: Kontrargument rozważony: "powtarzana nota rozmywa treść, a regulamin już to załatwił". Rozstrzygnięcie: zostaje. Akceptacja regulaminu jest zapisem prawnym, a linijka przy informacji działa poznawczo — pada tam, gdzie pada twierdzenie o zdrowiu, także gdy ekran ogląda ktoś inny.

### Dzienniczek
- FR-008: Użytkowniczka może dodać wpis o samopoczuciu z datą i godziną wypełnionymi domyślnie na "teraz" i możliwymi do cofnięcia, zaznaczając jeden lub więcej objawów z zamkniętej listy, opcjonalnie podając nasilenie i własną notatkę. Priority: must-have
  > Socrates: Kontrargumenty rozważone: zamknięta lista nie obejmie tego, co użytkowniczka faktycznie czuje; brakuje nasilenia; ręczne wpisywanie daty to zbędne tarcie. Rozstrzygnięcie: zamknięta lista zostaje jako realny wybór dla pierwszej wersji, ale problem języka rozwiązany dwojako — potoczne określenia jako słowa wyszukiwania przy pozycjach listy ("sraczka" podpowiada "biegunka"), a własne słowa użytkowniczki trafiają do notatki, która nie uczestniczy w regule. Nasilenie dodane jako pole opcjonalne, bo na wizycie odróżnia "mdłości raz, łagodne" od "mdłości codziennie, silne". Data i godzina wypełniane domyślnie, bo wpisy często powstają wieczorem o porannym objawie — zła godzina fałszowałaby zbieżność z okresem dawkowania.
- FR-009: Użytkowniczka może poprawić wpis dzienniczka w oknie korekty, na tej samej zasadzie co wpis o leku (FR-004): po zamknięciu okna rdzeń wpisu — data, godzina, objawy, nasilenie — jest niemodyfikowalny, a edytowalna zostaje notatka. Usunięcie wpisu jest zarezerwowane dla pozycji dodanych przez pomyłkę, analogicznie do FR-005. Priority: must-have
  > Socrates: Kontrargument rozważony: "swobodna edycja i usuwanie po fakcie dają obraz ładniejszy niż prawdziwy — dzienniczek jest wart tyle, ile jego kompletność". Rozstrzygnięcie: przyjęte; wpisy dzienniczka obejmuje ta sama zasada co leki, dla spójności zachowania w całej aplikacji i dla ochrony obrazu pokazywanego lekarzowi. Warunek zamknięcia okna jest jedyną różnicą wymagającą doprecyzowania: przy leku jest zdarzeniowy ("dopóki nie istnieje wpis objawu po dacie rozpoczęcia"), a wpis dzienniczka zasila złożone pytanie natychmiast, więc potrzebny jest warunek czasowy — patrz ## Open Questions.
- FR-010: Użytkowniczka po zapisaniu objawu widzi gotowe pytanie do lekarza, złożone z okresów dawkowania przyjmowanych leków i wpisów o tym objawie, z pierwszeństwem dla leków rozpoczętych lub zmienionych w oknie czasowym poprzedzającym objaw. Priority: must-have
  > Socrates: Kontrargumenty rozważone, wszystkie uznane za trafne: częste objawy występują wśród działań niepożądanych niemal każdego leku, więc zestawienie trafiające zawsze przestaje znaczyć cokolwiek; objaw może mieć przyczynę niezwiązaną z lekami (infekcja, stres, niewyspanie); pokazanie związku jest o krok od samodzielnego odstawienia leku, czego produkt ma nie sugerować. Rozstrzygnięcie: wszystkie trzy trafiają w różnicę między zbieżnością a przyczyną. Wynikiem nie jest lista podejrzanych leków, tylko zdanie do rozmowy z lekarzem ("od 12 marca przyjmuję X, od 20 marca zwiększona dawka, od 21 marca notuję mdłości — czy to może mieć związek?"). Okno czasowe oparte na okresach dawkowania z FR-004 usuwa większość szumu; leki spoza okna pozostają dostępne pod zwinięciem.

- FR-012: Komunikaty produktu nigdy nie stwierdzają, że lek powoduje objaw (tylko "może mieć związek"), nigdy nie sugerują odstawienia leku ani zmiany dawki i nigdy nie porządkują leków według stopnia podejrzenia. Priority: must-have
  > Socrates: Zasada przyjęta wprost przez użytkowniczkę jako wymaganie, nie wytyczna — ma podlegać sprawdzeniu, bo dotyczy jedynego miejsca, w którym produkt mógłby wyrządzić szkodę.

### Podsumowanie
- FR-011: Użytkowniczka może wyświetlić sekcję "Do omówienia z lekarzem", zbierającą wykryte możliwe kolizje i złożone pytania o zbieżność objawów z okresami dawkowania, jako podsumowanie na wizytę. Priority: must-have
  > Socrates: Kontrargumenty rozważone: sekcja duplikuje treść widoczną przy lekach; lekarz nie przeczyta długiego zestawienia. Rozstrzygnięcie: podniesiona z nice-to-have do must-have. Produkt istnieje dla momentu wizyty, a po zmianie kształtu FR-010 sekcja nie liczy niczego nowego — zbiera gotowe zdania, więc koszt jest mały w stosunku do tego, co domyka.

## Business Logic

Na podstawie substancji czynnych przyjmowanych leków, ich okresów dawkowania i zapisanych objawów aplikacja ustala, które substancje mogą na siebie negatywnie oddziaływać i które objawy są zbieżne w czasie ze znanymi działaniami niepożądanymi tych leków, i składa z tego pytania do zadania lekarzowi.

Sformułowanie źródłowe użytkowniczki: "Na podstawie informacji o lekach, które użytkownik wprowadził, aplikacja informuje, które z nich mogą na siebie negatywnie oddziaływać oraz pozwala użytkownikowi lepiej przygotować się na wizytę u lekarza."

Wejścia reguły to wyłącznie rzeczy, które użytkowniczka sama wprowadza: substancje czynne przyjmowanych preparatów, daty i dawki kolejnych okresów przyjmowania oraz wpisy o samopoczuciu z datą, godziną, objawami i opcjonalnym nasileniem. Do tego dochodzą dwa zbiory reguł dostarczone razem z aplikacją: pary substancji czynnych oddziałujących negatywnie oraz znane działania niepożądane przypisane substancjom.

Wyjściem nie jest lista podejrzanych leków ani ocena ryzyka, tylko dwa rodzaje informacji: oznaczenie możliwej kolizji przy konkretnym leku oraz złożone zdanie-pytanie zestawiające okres dawkowania z zapisanym objawem. Użytkowniczka spotyka je w trzech momentach: zaraz po dodaniu leku (dyskretny znacznik przy pozycji), zaraz po zapisaniu objawu oraz w sekcji "Do omówienia z lekarzem", którą otwiera przed wizytą.

Reguła świadomie nie rozstrzyga przyczyny. Zbieżność w czasie nie jest przyczynowością i produkt nie ma prawa tej granicy przekroczyć — stąd wymaganie FR-012 o języku komunikatów i guardrail mówiący, że brak ostrzeżenia nie oznacza bezpieczeństwa.

## Non-Functional Requirements

- Leki, okresy dawkowania i wpisy o samopoczuciu jednej osoby pozostają nieczytelne dla kogokolwiek poza właścicielem konta — zarówno dla innego użytkownika produktu, jak i dla osoby mającej wgląd w magazyn danych.
- Usunięcie konta powoduje bezpowrotne skasowanie wszystkich powiązanych danych: leków, okresów dawkowania, wpisów dzienniczka i złożonych pytań. Nie pozostaje kopia zachowana "na wszelki wypadek".
- Produkt jest aplikacją webową, która pozostaje czytelna i w pełni używalna na ekranie telefonu — tam powstaje większość wpisów o samopoczuciu.

## Forward: tech-stack
- Docelowo korzystanie również na urządzeniach mobilnych; MVP jest aplikacją webową działającą poprawnie na ekranie telefonu. Decyzja o formie (strona responsywna, aplikacja instalowalna, natywna) należy do etapu wyboru technologii.
- Odrzucono stałą sesję jako formę utrzymania zalogowania, właśnie ze względu na przyszłe korzystanie z wielu urządzeń.

## Forward: technical-roadmap
- Eksport własnych danych z aplikacji — uznany za potrzebny, świadomie odłożony poza pierwszą wersję.
- Oś czasu: objawy i leki zestawione wizualnie lub jako raport; struktura okresów dawkowania przyjęta w FR-004 jest pod to gotowa.
- Integracja z zewnętrznym źródłem danych o interakcjach — poza MVP.
- Mapowanie nazw handlowych leków na substancje czynne — poza MVP.
- Reguła niedoborów (substancja → wyczerpywany składnik) — przeniesiona do wersji drugiej.
- Preparaty wieloskładnikowe: struktura danych gotowa od MVP, interfejs dodawania kilku substancji — później.

## Non-Goals

Funkcjonalne:
- Brak integracji z zewnętrzną bazą interakcji — reguły pochodzą wyłącznie z tabeli dostarczonej razem z aplikacją.
- Brak rozpoznawania nazw handlowych leków — użytkowniczka podaje substancję czynną odczytaną z ulotki.
- Brak przypomnień o przyjęciu dawki — produkt służy rozumieniu zestawu leków, nie pilnowaniu rutyny.
- Brak zdalnego udostępniania danych lekarzowi — sekcja na wizytę jest do pokazania na ekranie, bez kont dla lekarzy i bez wysyłki.
- Brak reguły niedoborów mikro- i makroskładników — przeniesiona do wersji drugiej.

Niefunkcjonalne:
- Brak trybu offline — wpis powstaje wyłącznie przy połączeniu z siecią.
- Produkt nie jest kompletną bazą interakcji; tabela obejmuje kilkanaście par i leki faktycznie przyjmowane przez użytkowniczkę, a brak ostrzeżenia niczego nie dowodzi.
- Brak formalnej zgodności ze standardami dostępności — czytelność na telefonie tak, certyfikowana dostępność nie w tej wersji.
- Brak wielu profilów w jednym koncie — jedno konto to jedna osoba; prowadzenie leków podopiecznego poza zakresem.

## Quality cross-check

Przeprowadzona 2026-09-15. Wszystkie elementy obecne, brak luk:
- Kontrola dostępu — obecna (konto z logowaniem, płaski model ról).
- Reguła biznesowa — obecna, jedno zdanie, z rozstrzygniętą domeną decyzji.
- Artefakty projektu — obecne.
- Koszt czasu — 4–5 tygodni, zapisana świadoma akceptacja (## Timeline acknowledgment).
- Nie-cele — 5 funkcjonalnych, 4 niefunkcjonalne.
- Zachowanie do ochrony — nie dotyczy (projekt od zera).

Poza listą kontrolną: nazwa produktu trafiła do ## Open Questions i została rozstrzygnięta 2026-09-17 — **lekomapa**.
