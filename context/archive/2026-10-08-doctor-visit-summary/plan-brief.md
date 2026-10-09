# Sekcja „Do omówienia z lekarzem” (S-08) — Plan Brief

> Full plan: `context/changes/doctor-visit-summary/plan.md`

## What & Why

Użytkowniczka przed wizytą otwiera jeden ekran z możliwymi interakcjami między bieżącymi lekami i jednym aktualnym pytaniem do lekarza na każdy objaw (US-03, FR-011). To moment odbioru wartości całego produktu. Sekcja niczego nie liczy od nowa — zbiera treści z S-02 i S-06 — a język FR-012 obowiązuje tu bez wyjątku.

## Starting Point

Pytanie do lekarza powstaje dziś tylko zaraz po zapisaniu wpisu i dotyczy jednego wpisu (`loadDoctorQuestions`). Kolizje liczy funkcja bazy `medication_interactions()`, wołana wprost ze stron leków. Tekstów pustych stanów sekcji nie ma, pomiaru LCP też nie.

## Desired End State

Trzecia pozycja menu „Do omówienia” prowadzi na `/do-omowienia`. Bez leków i wpisów — wprowadzenie z przyciskami „Dodaj lek” i „Zapisz objaw”. W pozostałych przypadkach dwie części: każda para leków raz z notą poglądową oraz rozwinięte pytania od najnowszego objawu, z linijką „Bez pytania: …” dla objawów, przy których pytanie nie powstaje. Zawsze widoczna zachęta do pytania lekarza lub farmaceuty. LCP ≤ 2,5 s zmierzone na produkcji.

## Key Decisions Made

| Decision               | Choice                                                                                 | Why (1 sentence)                                                                    | Source        |
| ---------------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ------------- |
| Jedno pytanie na objaw | Z najnowszego wpisu objawu                                                             | Bez tego 30 wpisów dałoby 30 prawie identycznych pytań                              | Roadmapa (#7) |
| Puste stany            | Wprowadzenie przy 0 lekach i 0 wpisach; kolizje wg liczby bieżących leków (0 / 1 / 2+) | „Nie znaleziono pary” przy zerze lub jednym leku jest nieprawdą                     | Roadmapa (#7) |
| „Najnowszy wpis”       | Największa data objawu (`occurred_at`), nie data zapisania                             | Wpis dopisany wstecz uciąłby zmiany leków z ostatnich dni                           | Plan          |
| Odczyt objawów         | Nowa funkcja bazy: jeden wiersz na objaw z kompletem dat                               | Limit 1000 wierszy nie obetnie najstarszego wpisu, od którego liczy się okno 90 dni | Plan          |
| Dostęp                 | Trzecia pozycja menu, `/do-omowienia`                                                  | Moment wizyty to cel produktu — jedno dotknięcie                                    | Plan          |
| Układ pytań            | Od najnowszego wpisu, remis alfabetycznie, wszystkie rozwinięte                        | Ekran pokazywany lekarzowi bez klikania                                             | Plan          |
| Objaw bez pytania      | Linijka „Bez pytania: …” + zdanie z S-06                                               | Zapisany objaw nie znika bez śladu                                                  | Plan          |
| Kolizje w sekcji       | Ta sama funkcja co na liście leków, każda para raz, alfabetycznie                      | Brak rozjazdu z treścią przy lekach; kolejność nie sugeruje podejrzenia             | Plan          |
| Wprowadzenie           | Tylko gdy zero leków (także zakończonych) i zero wpisów                                | Lek zakończony nadal zasila pytania                                                 | Plan          |
| Pomiar LCP             | Ręcznie, Lighthouse Mobile na produkcji, 3 biegi                                       | Prawdziwe środowisko, zero nowego kodu                                              | Plan          |
| Testy                  | Jednostkowe + FR-012 + SQL na dwóch kontach + krok smoke                               | Dowód izolacji danych zdrowotnych i renderu w CI                                    | Plan          |

## Scope

**In scope:**

- Funkcja bazy `symptom_occurrences()` ze sprawdzeniem SQL
- Czysty moduł sekcji, nowy plik tekstów, testy jednostkowe i FR-012
- Strona `/do-omowienia`, wspólny komponent pytania (dzienniczek i sekcja), pozycja menu, krok smoke
- Ręczny pomiar LCP po wdrożeniu

**Out of scope:**

- Poprawka tego samego limitu 1000 wierszy w odczycie S-06 (osobne issue)
- Zmiany w `composeDoctorQuestion`
- Lista bieżących leków w sekcji (Parked)
- Porównywanie leków zakończonych z parami
- Automatyczny pomiar LCP, test E2E, wydruk i udostępnianie

## Architecture / Approach

Strona `.astro` → `loadVisitSummary` czyta równolegle trzy rzeczy przez RLS: `symptom_occurrences()`, leki z okresami (wspólna funkcja z S-06) i `medication_interactions()`. Czysty moduł `visit-summary.ts` wybiera najnowszy wpis, układa objawy, deduplikuje pary i wybiera puste stany; pytania składa niezmieniona `composeDoctorQuestion`, teksty `doctorQuestionText`. Render pytania wspólny z dzienniczkiem.

## Phases at a Glance

| Phase                 | What it delivers                                     | Key risk                                                               |
| --------------------- | ---------------------------------------------------- | ---------------------------------------------------------------------- |
| 1. Funkcja bazy       | `symptom_occurrences()` + dowód izolacji kont        | Test „konto B nie widzi” przechodzi na pustym wyniku z błędnej funkcji |
| 2. Logika i teksty    | Moduł sekcji, teksty, testy jednostkowe i FR-012     | Nowe zdanie przechodzi filtr, a brzmi jak „bezpieczne”                 |
| 3. Ekran, menu, smoke | `/do-omowienia`, menu, wspólny komponent, krok smoke | Rozjazd pytania w sekcji z pytaniem w dzienniczku                      |
| 4. Pomiar             | LCP z produkcji w Progress                           | Wynik > 2,5 s → nowa zmiana                                            |

**Prerequisites:** S-02 i S-06 wdrożone (są); lokalny Supabase; osobne stałe konto pomiarowe na produkcji do fazy 4 (nie konto smoke, nie prywatne).
**Estimated effort:** ~4–5 sesji po ~2 h w czterech fazach; faza 4 po merge'u do `main`.

## Open Risks & Assumptions

- Brzmienie nowych tekstów jest robocze — autorka zatwierdza je w fazie 3.
- Kod błędu dla `anon` w sprawdzeniu SQL ustalony pomiarem, nie z góry.
- Wydzielenie komponentu pytania dotyka dzienniczka S-06 — smoke dzienniczka musi zostać zielony.
- `roadmap.md:322` twierdzi, że teksty pustych stanów istnieją; nie istnieją — plan je dopisuje.

## Success Criteria (Summary)

- Przed wizytą jedno dotknięcie w menu pokazuje możliwe interakcje i pytania do lekarza, bez klikania w każde pytanie.
- Pusta sekcja lub jej część mówi, skąd bierze się brak treści, i nigdy nie brzmi jak „wszystko w porządku”.
- Główna treść widoczna w ≤ 2,5 s na telefonie.
