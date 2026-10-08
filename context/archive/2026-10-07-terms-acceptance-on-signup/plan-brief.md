# S-01: Konto z akceptacją warunków korzystania — Plan Brief

> Full plan: `context/changes/terms-acceptance-on-signup/plan.md`

## What & Why

Osoba zakładająca konto akceptuje warunki korzystania w wersji 1 („prototyp”), a baza zapisuje datę i wersję akceptacji (FR-001, PRD `## Access Control`). Przed założeniem konta może przeczytać stronę prywatności, do której prowadzi pasek „wersja demonstracyjna” (MS-02). Rejestracja jest publiczna, więc ta warstwa zmniejsza ryzyko wpisywania prawdziwych danych o zdrowiu i mówi prawdę o tym, co dzieje się z danymi.

## Starting Point

- Rejestracja i logowanie działają, ale w wyglądzie startera, po angielsku, z surowymi błędami Supabase w adresie strony. To łamie ustalenie #34.
- Nie ma tabeli akceptacji, kontroli wersji, stron warunków i prywatności ani obsługi odnośnika z maila potwierdzającego.
- Na produkcji potwierdzanie adresu jest włączone (pomiar 2026-10-07), więc po rejestracji nie ma sesji.

## Desired End State

- Rejestracja wymaga zaznaczenia akceptacji z odnośnikiem do `/warunki`. Baza zapisuje wersję 1 z datą w chwili tworzenia konta.
- Konto bez akceptacji bieżącej wersji trafia z każdego ekranu wnętrza na ekran „Akceptuję / Wyloguj się”, a zapisy danych dostają odmowę.
- Ekrany wejściowe są w Rozkładówce, po polsku, na tokenach kolorów.
- Odnośnik z maila potwierdza adres i mówi, co dalej, także gdy wygasł.

## Key Decisions Made

| Decyzja                       | Wybór                                                                                                 | Dlaczego                                                                          |
| ----------------------------- | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Prowadzący serwis             | „testFit Anna Kryśko”, krysko.anna@gmail.com                                                          | Zgodne z propozycją z roadmapy i z treścią warunków v1                            |
| Zapis akceptacji              | Baza w chwili tworzenia konta (metadane `terms_version` + wyzwalacz)                                  | Na produkcji po rejestracji nie ma sesji. Data = faktyczna chwila akceptacji      |
| Zasięg kontroli wersji        | Każdy ekran wnętrza (przekierowanie) i każde `/api/*` poza auth (403)                                 | Akceptacji nie obejdzie ani długa sesja, ani zapytanie z pominięciem ekranu       |
| Odnośnik potwierdzający       | Własna trasa z przyciskiem, jak przy haśle, wylogowanie po potwierdzeniu                              | Wzorzec sprawdzony w S-10. Sesja z `otp` zamknęłaby osobę na ekranie resetu hasła |
| Układ ekranów                 | Rozkładówka dla wszystkich ekranów wejściowych S-01; S-10 bez zmian                                   | Karta wyśrodkowana przegrała przy makietach                                       |
| Napisy                        | Pełny projekt w załączniku A planu, zatwierdzany przy przeglądzie planu                               | Makieta: napisy robocze nie trafiają do kodu bez decyzji                          |
| Odmowa akceptacji             | „Akceptuję” albo „Wyloguj się” + odnośnik do prywatności o usuwaniu konta                             | Przy S-09 zmienia się tylko strona prywatności                                    |
| Nienaruszalność akceptacji    | Tabela tylko do dopisywania; bramka izolacji dostaje jawną listę takich tabel z odwróconymi asercjami | „Historia nie kłamie”. Bramka mierzy blokadę, zamiast ją pomijać                  |
| Sentry na stronie prywatności | Nie teraz; wymóg dopisany do F-06                                                                     | Strona mówi o tym, co wdrożone                                                    |

## Scope

**In scope:**

- tabele `terms_versions` i `terms_acceptances` z RLS, zapis przy tworzeniu konta, bramki SQL;
- strony `/warunki` i `/prywatnosc`, odnośnik na pasku;
- Rozkładówka dla logowania, rejestracji, „sprawdź skrzynkę”, potwierdzenia adresu i akceptacji;
- polskie formularze, stałe komunikaty błędów;
- kontrola wersji w middleware, ekran ponownej akceptacji;
- szablon maila potwierdzającego, trasy potwierdzenia i ponownego wysłania;
- smoke, README, CLAUDE.md.

**Out of scope:**

- usuwanie konta w aplikacji (S-09);
- przeróbka ekranów S-10;
- pełna warstwa prawna RODO;
- Sentry (F-06);
- własny nadawca maili (F-05);
- tryb tylko do odczytu;
- zmiany `NORMAL_SESSION_METHODS`.

## Architecture / Approach

- **Dane:** numer wersji w bazie (`terms_versions`, klucz obcy z akceptacji), tekst w `src/lib/copy/terms.ts`, pilnowany testem z plikiem w foundation. Bieżąca wersja to stała `CURRENT_TERMS_VERSION`.
- **Zapis:** rejestracja przekazuje `terms_version` w metadanych `signUp`, a wyzwalacz `after insert on auth.users` dopisuje akceptację. Złe metadane nie przerywają rejestracji, bo brak wiersza wyłapie kontrola wersji.
- **Kontrola:** decyzja w czystym module `terms-gate.ts`. Middleware wykonuje jedno zapytanie, tylko dla zalogowanej osoby na ścieżce objętej kontrolą.

## Phases at a Glance

| Faza                       | Co daje                                                                            | Główne ryzyko                                                        |
| -------------------------- | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| 1. Dane akceptacji         | Tabele z RLS, zapis przy tworzeniu konta, bramki SQL z tabelą tylko do dopisywania | Wyzwalacz na `auth.users` przerywa rejestrację przy złych metadanych |
| 2. Warunki i prywatność    | `/warunki`, `/prywatnosc`, odnośnik na pasku, testy tekstu i języka                | Tekst warunków odpływa od zatwierdzonego pliku                       |
| 3. Logowanie i rejestracja | Rozkładówka, pole akceptacji, stałe komunikaty, 5 plików poza wyjątkami            | Przeciek istnienia konta przez różne ekrany lub komunikaty           |
| 4. Kontrola wersji         | Przekierowanie / 403, ekran „Akceptuję / Wyloguj się”, smoke                       | Pętla przekierowań albo zamknięte wylogowanie                        |
| 5. Odnośnik potwierdzający | Szablon, trasa z przyciskiem, ekran wygasłego odnośnika, data v1, kroki panelu     | Rozjazd szablonu lokalnego i produkcyjnego                           |

**Prerequisites:** F-04 (done). Lokalny Supabase. Przed fazą 5: dostęp autorki do panelu Supabase produkcji.

**Estimated effort:** ~5–7 wieczorów, po jednej fazie na wieczór, plus przegląd załącznika napisów (~45 min).

## Open Risks & Assumptions

- Treści do zatwierdzenia w załączniku A. Szczególnie strona prywatności: zdanie o technicznym dostępie prowadzącej do bazy i obietnica usunięcia konta na mail.
- Region Supabase nie jest zapisany w repozytorium. Autorka odczytuje go w panelu w fazie 2.
- Przy F-05 nieukończonym mail potwierdzający dochodzi na produkcji tylko do członków zespołu Supabase. Pełną ścieżkę sprawdza się adresem z zespołu.
- Istniejące konta (autorki i testowe na produkcji) po wdrożeniu trafią raz na ekran akceptacji. To zamierzone.
- Kontrola wersji dokłada jedno zapytanie na ekran wnętrza. Pomiar LCP należy do S-08.

## Success Criteria (Summary)

- Nowa osoba czyta prywatność i warunki, zakłada konto z akceptacją, potwierdza adres i loguje się. W bazie jest wersja 1 z datą.
- Konto bez akceptacji bieżącej wersji nie wejdzie do wnętrza ani nie zapisze danych.
- Ekrany wejściowe nie zdradzają, czy konto istnieje, i nie mają kolorów wpisanych na sztywno.
