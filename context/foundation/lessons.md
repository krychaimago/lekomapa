# Lessons Learned

> Append-only register of recurring rules and patterns. Re-read at start by /10x-frame, /10x-research, /10x-plan, /10x-plan-review, /10x-implement, /10x-impl-review.

## Włącz RLS w tej samej migracji, co CREATE TABLE

- **Context**: Każda migracja w `supabase/migrations/` tworząca nową tabelę.
- **Problem**: Tabele przechowują dane zdrowotne, które mogą wyciec. Bez RLS zapytanie kluczem `anon` zwraca wiersze wszystkich kont, a przy jednym koncie testowym nic tego nie ujawnia — aplikacja wygląda na działającą.
- **Rule**: Zawsze włącz RLS w tej samej migracji, w której powstaje tabela. Nigdy nie odkładaj tego na osobną migrację "później".
- **Applies to**: plan, implement, impl-review

## Nigdy nie stwierdzaj przyczyny objawu

- **Context**: Każdy tekst widoczny dla użytkowniczki (komunikaty o kolizji, złożone pytania do lekarza, UI) oraz dokumenty projektowe — PRD, plany, opisy funkcji — żeby formuła była spójna już na etapie planowania.
- **Problem**: Niewłaściwy komunikat może wystraszyć pacjenta, spowodować odstawienie któregoś z leków albo dać błędne przekonanie, że objaw jest wynikiem przyjmowanego leku. Produkt nie ma straszyć ani dawać porad medycznych.
- **Rule**: Żaden komunikat nie stwierdza przyczyny objawu — wyłącznie „może mieć związek". Nigdy nie sugeruj odstawienia leku ani zmiany dawki i nie porządkuj leków według stopnia podejrzenia.
- **Applies to**: all

## Zmiana dawki zamyka okres, nie nadpisuje wpisu

- **Context**: Edycja leków, gdy dochodzi do zmiany dawkowania.
- **Problem**: Bez tej reguły historia zostaje naruszona i docelowo pokaże nieprawdę na wykresie objawów zestawionych z przyjmowanymi lekami.
- **Rule**: Zawsze przy zmianie dawki zamknij bieżący okres i otwórz nowy, zamiast nadpisywać stary wpis.
- **Applies to**: all

## Weryfikuj wartość sekretu, nie obecność klucza

- **Context**: Każde ustawianie sekretów Workera przez `wrangler secret put` — pierwsze wdrożenie, rotacja klucza, konfiguracja CI.
- **Problem**: `wrangler secret put` przyjmuje pustą wartość bez ostrzeżenia, a `wrangler secret list` i `wrangler versions view` pokazują taki sekret jako istniejący. `astro:env` zamienia `""` na `undefined`, więc aplikacja zachowuje się dokładnie tak, jakby sekretu nie było — z komunikatem „nie skonfigurowano" zamiast błędu wskazującego przyczynę.
- **Rule**: Po `wrangler secret put` zawsze potwierdź, że runtime widzi niepustą wartość. Obecność klucza na liście nie jest dowodem konfiguracji.
- **Applies to**: implement, impl-review

## Zmierz, zanim wdrożysz poprawkę na produkcję

- **Context**: Diagnozowanie niedziałających zmiennych środowiskowych, sekretów i bindingów na wdrożonym środowisku.
- **Problem**: Objaw „zmienna nie dociera" ma kilka równie prawdopodobnych przyczyn. Przy pierwszym wdrożeniu lekomapy dwie hipotezy były błędne, a jedna z nich pociągnęła niepotrzebne ponowne wdrożenie produkcji.
- **Rule**: Zanim wdrożysz poprawkę na produkcję, zmierz, co runtime faktycznie widzi — tymczasowa trasa zwracająca typy i nazwy kluczy, nigdy wartości. Hipoteza bez pomiaru nie uzasadnia wdrożenia.
- **Applies to**: implement, impl-review

## Brakujący pakiet w locku naprawiaj jawną zależnością, nie regeneracją

- **Context**: `npm ci` w CI pada komunikatem `Missing: <pakiet> from lock file`, a lokalnie wszystko przechodzi.
- **Problem**: Warianty `wasm32` pakietów `sharp` i `@tailwindcss/oxide` wymagają `@emnapi/runtime` i `@emnapi/core`. npm na macOS tych wariantów nie wybiera, więc nie zapisuje ich zależności do locka; npm na Linuksie ich wymaga. Regeneracja locka na macOS problemu nie naprawia — sprawdzone dwukrotnie, także z `--os=linux --cpu=x64`. Objaw wychodzi wyłącznie w CI i wygląda na zepsuty lock, a lock jest poprawny dla platformy, na której powstał.
- **Rule**: Dopisz brakujący pakiet do `devDependencies` z wersją, której żąda komunikat, i przegeneruj lock przez `npm install --package-lock-only`. Nie próbuj naprawiać tego regeneracją locka ani flagami `--os` / `--cpu`. Zależność dodaną w tym celu opisz w `CLAUDE.md`, inaczej ktoś usunie ją jako nieużywaną.
- **Applies to**: implement, impl-review

## Otwarte pytanie może kryć niezadaną decyzję

- **Context**: Rozstrzyganie pozycji z `## Open Roadmap Questions` i `## Open Questions` w PRD, zwłaszcza pytań o kształcie „ile czegoś i z jakiego źródła".
- **Problem**: Q-1 brzmiało „ile par substancji czynnych i z jakiego źródła", a kryło trzecią sprawę, której nikt nie postawił: sposób wprowadzania leku przez użytkownika. Samo brzmienie pytania zakładało wybór substancji czynnej ze słownika jako rzecz przesądzoną, choć była to najbardziej kosztowna niewiadoma w całym fundamencie. Odpowiedź wprost na zadane pytanie utrwaliłaby barierę wejścia dla grupy, którą PRD wskazuje jako kierunek rozwoju produktu.
- **Rule**: Zanim odpowiesz na otwarte pytanie, sprawdź, czy jego brzmienie nie zamyka po cichu wariantu, którego nikt nie rozważył. Rozłóż pytanie na składowe i nazwij te, które nie są w nim postawione. Jeśli rozstrzygnięcie podważa zapis w PRD, popraw PRD jawnie i wypisz granice, które pozostają nienaruszone — nie omijaj Non-Goal po cichu.
- **Applies to**: frame, research, plan, roadmap

## Niepełny zbiór reguł to co innego niż wyrzucone dane

- **Context**: Projektowanie danych wejściowych reguły kolizji — skład preparatu, słowniki, zbiory dostarczone z produktem.
- **Problem**: PRD uczciwie mówi, że zbiór reguł jest niepełny i brak ostrzeżenia niczego nie dowodzi. Ta bariera osłania lukę w regułach, o której wiadomo. Nie osłania sytuacji, w której produkt miał dane i sam je zawęził — preparat złożony zapisany z jedną substancją zamiast z pełnym składem daje brak znacznika przy leku, który faktycznie koliduje, a użytkowniczka nie ma jak odróżnić tego od leku sprawdzonego.
- **Rule**: Nigdy nie zawężaj danych wejściowych tam, gdzie produkt mógłby powiedzieć więcej. Gdy struktura danych dopuszcza komplet, zapisuj komplet, nawet jeśli interfejs przyjmuje jedną rzecz. Ograniczenie interfejsu i ograniczenie danych to dwie różne decyzje i nie wolno ich mylić.
- **Applies to**: plan, implement, impl-review

## Zakres zbioru dostarczonego z produktem to filtr przy wczytywaniu, nie flaga w bazie

- **Context**: Migracje seed z danymi dostarczonymi razem z produktem — rejestr leków w F-02, zamknięta lista objawów w F-03, każdy późniejszy zbiór referencyjny.
- **Problem**: Zbiory wgrywane są w zakresie zawężonym względem źródła i zakres ten będzie się z czasem rozszerzał. Zapisanie przynależności do zakresu jako właściwości wiersza sprawia, że rozszerzenie wymaga przeliczenia wszystkich istniejących wierszy zamiast doładowania nowych. Objaw nie wychodzi przy pierwszym wgraniu — wychodzi dopiero przy pierwszym rozszerzeniu, gdy migracja okazuje się przeróbką.
- **Rule**: Zawężenie stosuj jako filtr w momencie wczytywania danych. Nie zapisuj w bazie flagi „poza zakresem" ani niczego, co trzeba by przeliczyć po rozszerzeniu. Przy wierszu zapisuj pełną treść ze źródła, także pola nieużywane przez bieżące reguły.
- **Applies to**: plan, implement, impl-review
