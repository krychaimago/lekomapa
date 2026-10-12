# Odzyskiwanie dostępu przez ustawienie nowego hasła — Plan Brief

> Full plan: `context/changes/password-recovery/plan.md`

## What & Why

S-10 z roadmapy (issue #36): użytkowniczka, która nie pamięta hasła, prosi o odnośnik na adres konta, ustawia nowe hasło i loguje się nim. FR-002 jest must-have, a w kodzie nie ma dziś żadnej ścieżki odzyskiwania. Odnośnik, który nie wygasa, działa wielokrotnie albo sam otwiera dostęp, byłby drogą do cudzych danych o zdrowiu.

## Starting Point

Starter ma rejestrację, logowanie i wylogowanie (`src/pages/api/auth/`), bez resetu hasła i bez trasy wymieniającej odnośnik z maila na sesję. Klient Supabase wymusza PKCE, więc domyślny link działa tylko w tej samej przeglądarce. Wspólne komponenty formularza mają kolory na sztywno i są na liście wyjątków skanera kolorów.

## Desired End State

Na logowaniu jest „Nie pamiętasz hasła?”. Po podaniu adresu ekran zawsze mówi „jeśli konto istnieje, wysłaliśmy wiadomość”. Odnośnik z maila działa na każdym urządzeniu, zużywa się dopiero po kliknięciu przycisku i do czasu ustawienia hasła otwiera tylko ekran nowego hasła. Po zapisie wszystkie sesje są zamknięte, a użytkowniczka loguje się nowym hasłem. Użyty lub wygasły odnośnik kończy się komunikatem z drogą do nowego. Smoke w CI przechodzi całą ścieżkę przez mailpit.

## Key Decisions Made

| Decision                      | Choice                                                                 | Why (1 sentence)                                                                       |
| ----------------------------- | ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Mechanizm odnośnika           | Własny szablon maila z `token_hash` + `verifyOtp`                      | Link otwarty na telefonie po prośbie z laptopa działa; nadal jednorazowy i ważny 1 h.  |
| Zużycie odnośnika             | Dopiero po kliknięciu przycisku (POST), nie przy otwarciu              | Skanery linków w skrzynkach pocztowych zużyłyby token, zanim użytkowniczka go kliknie. |
| Stan po kliknięciu linku      | Dostępny tylko ekran nowego hasła                                      | Przechwycony mail nie otwiera danych o zdrowiu bez ustawienia hasła.                   |
| Rozpoznanie sesji z odnośnika | Podpisane roszczenie `amr` sesji, po pomiarze                          | Ciasteczko dałoby się usunąć; bez pomiaru implementacja staje.                         |
| Po zmianie hasła              | Wylogowanie ze wszystkich urządzeń, ponowne logowanie                  | Obce urządzenie zalogowane starym hasłem traci dostęp; nowe hasło zostaje sprawdzone.  |
| Wspólne komponenty formularza | Przepięte na tokeny w S-10, zdjęte z `EXCEPTIONS`                      | Jedna wersja komponentów; S-01 dostaje je gotowe.                                      |
| Treści                        | Robocze po polsku w jednym pliku; zawsze ten sam komunikat po wysłaniu | Nie zdradza, kto prowadzi dzienniczek leków; #34 zostaje formalnie otwarte.            |
| Wymagania hasła               | Jak przy rejestracji (min. 6 znaków)                                   | Zmiana reguł haseł należy do S-01.                                                     |
| Nadawca maili                 | Poza S-10, nowa pozycja F-05 w roadmapie                               | S-10 zostaje wąski; konfiguracja domeny i DNS robiona razem.                           |
| Testy                         | Smoke czyta maila z mailpitu, mailpit włączony w CI                    | Jednorazowość odnośnika i zamknięcie sesji mierzone przy każdym pushu.                 |

## Scope

**In scope:**

- Trzy trasy API: prośba o odnośnik, wymiana odnośnika na sesję, zapis nowego hasła
- Blokada wnętrza w sesji z odnośnika (middleware)
- Szablon maila i lokalna konfiguracja Supabase
- Ekrany: prośba o adres, „wysłaliśmy”, strona odnośnika z komunikatem o wygaśnięciu, nowe hasło
- Cztery wspólne komponenty formularza na tokenach
- Odnośnik i informacja po zmianie hasła na logowaniu
- 12 kroków w smoke, mailpit w CI, ręczna konfiguracja panelu produkcji

**Out of scope:**

- Własny nadawca maili (F-05) — do tego czasu mail na produkcji dochodzi tylko do członków zespołu Supabase
- Przebudowa i tłumaczenie logowania, rejestracji i potwierdzenia adresu (S-01)
- Zmiana reguł siły hasła, zmiana hasła z ustawień konta
- Mail z powiadomieniem o zmianie hasła
- Automatyczny test wygaśnięcia po czasie

## Architecture / Approach

Mail z Supabase zawiera odnośnik `/auth/reset-password/confirm?token_hash=…&type=recovery`. Strona pokazuje przycisk, który wysyła token do `/api/auth/password-reset-verify`. `verifyOtp` zakłada sesję, a middleware rozpoznaje ją po `amr` i kieruje wszystko na `/auth/reset-password`. Formularz nowego hasła idzie do `/api/auth/password-update`: `updateUser`, potem `signOut({ scope: "global" })` i przekierowanie na logowanie.

## Phases at a Glance

| Phase                                    | What it delivers                                                                   | Key risk                                                                                |
| ---------------------------------------- | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| 1. Mechanizm odnośnika i blokada wnętrza | Trasy API, szablon maila, bramka w middleware — sprawdzalne przez `curl` i mailpit | Sesji z odnośnika nie da się odróżnić po `amr` — wtedy powrót do planowania             |
| 2. Ekrany i komponenty na tokenach       | Cała ścieżka w przeglądarce po polsku, 4 komponenty zdjęte z `EXCEPTIONS`          | Przepięte komponenty na tle `bg-cosmic` logowania mogą stracić czytelność do czasu S-01 |
| 3. Bramka smoke, CI i produkcja          | 12 kroków smoke w CI, szablon i adres w panelu produkcji                           | Szablon w panelu rozjedzie się z plikiem w repozytorium                                 |

**Prerequisites:** F-04 (done); lokalny Supabase z mailpitem; dostęp do panelu produkcyjnego Supabase (faza 3).
**Estimated effort:** ~3 sesje, po jednej na fazę.

## Open Risks & Assumptions

- Do czasu F-05 obca osoba nie dostanie maila resetu na produkcji.
- S-01 zaczyna po merge'u S-10 albo przejmuje przepięte komponenty przy rebase.
- Pytanie #34 (czy ekrany zdradzają istnienie konta) formalnie otwarte; S-10 wdraża wariant bezpieczniejszy.
- Zmiana szablonu maila wymaga ręcznego przeniesienia do panelu produkcji.

## Success Criteria (Summary)

- Użytkowniczka odzyskuje dostęp z maila otwartego na dowolnym urządzeniu i loguje się nowym hasłem.
- Użyty lub wygasły odnośnik nie otwiera niczego i mówi, jak poprosić o nowy.
- Smoke w CI dowodzi jednorazowości odnośnika, blokady wnętrza i zamknięcia starych sesji.
