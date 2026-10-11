# Usunięcie konta (S-09) — Plan Brief

> Full plan: `context/changes/account-deletion-cascade/plan.md`

## What & Why

- Użytkowniczka może sama usunąć konto z ekranu „Konto”, potwierdzając hasłem.
- Znikają bezpowrotnie wszystkie dane konta: leki z historią dawkowania, wpisy dzienniczka i zapis akceptacji warunków. Nie zostaje żadna kopia.
- To wymóg z PRD (NFR usunięcia konta). Dziś jedyna droga to mail do autorki.

## Starting Point

- Baza już kasuje wszystkie dane razem z wierszem konta, także po zamknięciu okna korekty. Pilnują tego testy ISOLATION 6 i TERMS 4.
- Brakuje sposobu, żeby aplikacja to uruchomiła: nie ma funkcji, trasy ani ekranu.
- Strona prywatności odsyła na krysko.anna@gmail.com.

## Desired End State

- Menu ma pozycję „Konto”: adres e-mail i „Usuń konto”.
- Strona potwierdzenia mówi, co zniknie, i prosi o hasło.
  - Złe hasło: komunikat, konto zostaje.
  - Dobre hasło: konto i dane znikają, sesja jest czyszczona, wyświetla się publiczna strona „Konto usunięte”.
- Strona prywatności wskazuje najpierw ekran „Konto”, a mail tylko awaryjnie.

## Key Decisions Made

| Decision               | Choice                                                                                    | Why (1 sentence)                                                                                      |
| ---------------------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Sposób usunięcia       | Funkcja w bazie `delete_own_account()`, usuwa tylko konto wywołującej osoby               | Bez klucza `service_role`, który omija izolację kont i jest zakazany w `deploy-plan.md:65`.           |
| Potwierdzenie          | Ponowne hasło                                                                             | Chroni przed cudzym odblokowanym telefonem i przypadkowym kliknięciem.                                |
| Gdzie sprawdzane hasło | Trasa loguje hasłem jeszcze raz, a funkcja żąda logowania hasłem sprzed ≤ 5 minut (`amr`) | Wywołanie funkcji wprost z przeglądarki nie omija hasła; sesja z odnośnika resetu też dostaje odmowę. |
| Wejście                | Nowa pozycja „Konto” w menu                                                               | Miejsce na przyszłe ustawienia konta.                                                                 |
| Strona prywatności     | Najpierw „Konto → Usuń konto”, mail awaryjnie                                             | Kto nie może się zalogować albo nie akceptuje nowych warunków, nadal ma drogę wyjścia.                |
| Bramka warunków        | Bez wyjątku dla `/konto/usun`                                                             | Taką osobę obsługuje mail awaryjny; bramka zostaje bez zmian.                                         |
| Po usunięciu           | Czyszczenie ciasteczek, publiczna strona `/auth/konto-usuniete`                           | Pod `/konto/…` strona byłaby wnętrzem i przekierowywałaby na logowanie.                               |
| Testy                  | SQL + smoke + jednostkowe                                                                 | Obie bramki działają w CI; smoke jako jedyny sprawdza prawdziwy zapis w bazie po usunięciu.           |
| Smoke a stałe konto    | Krok tylko na nowym koncie jednorazowym, pomijany w trybie `SMOKE_EMAIL`                  | Usunięcie stałego konta testowego byłoby nieodwracalne.                                               |

## Scope

**In scope:**

- migracja z funkcją i testy SQL,
- wyjątek w INVARIANT 7,
- ekrany `/konto`, `/konto/usun` i `/auth/konto-usuniete`,
- trasa `/api/account/delete`,
- teksty i testy jednostkowe,
- nowy tekst strony prywatności,
- krok smoke,
- wpisy w CLAUDE.md, README i deploy-plan.

**Out of scope:**

- klucz `service_role`,
- okno dialogowe,
- mail po usunięciu,
- kosz albo przywracanie konta,
- wyjątek w bramce warunków,
- zmiana warunków v1,
- test E2E,
- inne ustawienia konta (S-11).

## Architecture / Approach

1. Formularz POST z hasłem trafia do `/api/account/delete`.
2. Trasa woła `signInWithPassword` z adresem bieżącego konta. Supabase sprawdza hasło i liczy próby.
3. Trasa sprawdza, że to to samo konto.
4. Trasa woła `rpc("delete_own_account")` z nową sesją.
5. Funkcja sprawdza `auth.uid()` i świeży wpis `password` w `amr`, potem usuwa wiersz `auth.users`.
6. Istniejąca kaskada kasuje dane z 6 tabel.
7. Trasa czyści ciasteczka i przekierowuje na `/auth/konto-usuniete`.

## Phases at a Glance

| Phase                           | What it delivers                                                           | Key risk                                                              |
| ------------------------------- | -------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| 1. Funkcja w bazie              | `delete_own_account()`, testy odmów i zakresu, wyjątek INVARIANT 7         | Kształt `amr` inny niż zakładany — dlatego najpierw pomiar            |
| 2. Ekrany i trasa               | „Konto” w menu, potwierdzenie hasłem, trasa API, strona „Konto usunięte”   | Ciasteczka po usunięciu: `signOut` może zwrócić błąd, trzeba zmierzyć |
| 3. Prywatność, smoke, dokumenty | Nowy tekst „Jak usunąć konto”, krok smoke, dokumenty, `db push` po merge'u | Smoke trafiający do produkcji zamiast lokalnej bazy                   |

**Prerequisites:** lokalny Supabase (`npx supabase start`), S-01, S-02, S-05 i S-06 zrobione.
**Estimated effort:** ~3 sesje po jednej na fazę.

## Open Risks & Assumptions

- Zakładam, że `amr` po logowaniu hasłem zawiera `{"method":"password","timestamp":…}`. Faza 1 mierzy to, zanim powstanie warunek.
- Bez `db push` po merge'u trasa na produkcji zwraca błąd mimo zielonego CI.
- Smoke wymaga odsuniętego `.env` i zatrzymanego starego podglądu (lekcje projektu).
- Konto usunięte jest nie do odzyskania — także przy błędzie po stronie aplikacji. To zamierzone (NFR).

## Success Criteria (Summary)

- Użytkowniczka usuwa konto sama w trzech krokach: Konto → Usuń konto → hasło. Nie da się potem zalogować, a dane nie istnieją.
- Funkcji w bazie nie da się użyć bez świeżego logowania hasłem ani do usunięcia cudzego konta. Dowodzą tego testy SQL z nazwanymi kodami.
- Strona prywatności mówi prawdę o obu drogach usunięcia.
