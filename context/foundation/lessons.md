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
