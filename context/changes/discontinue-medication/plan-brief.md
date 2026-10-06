# S-04: Zakończenie przyjmowania leku z datą — Plan Brief

> Full plan: `context/changes/discontinue-medication/plan.md`

## What & Why

Użytkowniczka może zakończyć przyjmowanie leku datą „pierwszego dnia bez leku”. Lek znika z listy aktualnych, ale zostaje w historii i dalej tłumaczy dawne wpisy (FR-005). Trwałe usunięcie jest osobną ścieżką, tylko dla pozycji dodanej przez pomyłkę — żeby zakończenie nie wyglądało jak kasowanie i nie niszczyło kontekstu dla S-06.

## Starting Point

Kolumna `discontinued_on` istnieje od F-01, ale nic jej nie zapisuje; `/leki` ukrywa leki zakończone, szczegóły nie pokazują daty. Baza ma dwa długi: po zamknięciu okna datę zakończenia da się dowolnie przesunąć (S-02), a przy przyszłej dacie zmiana dawki otwiera okres bez końca (S-03 F6b).

## Desired End State

Na szczegółach leku jest „Zakończ przyjmowanie”. Po zapisie bieżący okres jest zamknięty, lek trafia na `/leki/zakonczone`, a przez 24 h zakończenie można przesunąć lub cofnąć. Po oknie data jest ostateczna także przy zapisie bezpośrednio do bazy. W oknie korekty leku jest osobny, odsunięty link do usunięcia pozycji dodanej przez pomyłkę, z ekranem potwierdzenia.

## Key Decisions Made

| Decision            | Choice                                                       | Why (1 sentence)                                                                                   |
| ------------------- | ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| Data w przyszłości  | Nie — tylko dziś lub wcześniej                               | Zapisujemy fakt; dług F6b znika u źródła, zgodne ze strażnikiem okresów.                           |
| Jak daleko wstecz   | 14 dni, jak zmiana dawki                                     | Jedna reguła z `change_dosage` i S-05 F1; starsze zakończenie dostaje komunikat.                   |
| Znaczenie daty      | Pierwszy dzień bez leku                                      | Zgodne z bazą, okresami i formularzem zmiany dawki; ostatnią dawkę wziętą dziś zapisuje się jutro. |
| Poprawa zakończenia | Własne okno 24 h: przesunięcie lub cofnięcie                 | Ta sama zasada co FR-009; domyka dług S-02.                                                        |
| Widok zakończonych  | Osobna strona `/leki/zakonczone`, link z licznikiem pod notą | Lista aktualnych nie rośnie na telefonie; nota zostaje przy znacznikach.                           |
| Usuwanie            | Link w szczegółach + ekran potwierdzenia, tylko w oknie leku | Wyraźnie rozdziela usunięcie od zakończenia, działa bez JavaScriptu.                               |
| Wznowienie leku     | Poza S-04 — powrót = nowa pozycja                            | Data zakończenia po oknie naprawdę ostateczna; bez nowego modelu przerw.                           |
| Zamykanie okresu    | Wyzwalacz na `medications`, nie sama funkcja RPC             | Gwarancja obejmuje każdą ścieżkę zapisu (lesson o tabeli podrzędnej).                              |

## Scope

**In scope:**

- Migracja: `discontinued_at`, reguły daty, synchronizacja okresów, wyjątek na ponowne otwarcie ostatniego okresu, RPC `discontinue_medication`, `correct_discontinuation`, `delete_medication` z kodami MD001–MD010
- Nowy `discontinuation_checks.sql`; aktualizacja CHECK 21, DOSAGE 8, INTERACTION 8, INVARIANT 8
- Ekran `/leki/[id]/zakonczenie`, trasy POST, stan „zakończony” w szczegółach, teksty przez filtr FR-012
- `/leki/zakonczone`, link z licznikiem, ekran i trasa usuwania, kroki smoke

**Out of scope:**

- Data w przyszłości, data starsza niż 14 dni, zakończenie w dniu startu okresu
- Wznowienie leku, stronicowanie zakończonych, testy E2E Playwright

## Architecture / Approach

Baza trzyma reguły, aplikacja tłumaczy nazwane kody na tekst. `discontinued_at` (zegar serwera, niepodrabialny) wyznacza okno zakończenia przez istniejące `correction_window_end`. Wyzwalacz `AFTER UPDATE OF discontinued_on` zamyka, przesuwa lub ponownie otwiera ostatni okres; strażnik okresów przepuszcza zmianę `ended_on` tylko wtedy, gdy podąża ona za datą zakończenia w otwartym oknie. RPC sprawdzają warunki z góry i zwracają kody MD; strażniki zostają ostatnią linią obrony.

## Phases at a Glance

| Phase                         | What it delivers                                             | Key risk                                                            |
| ----------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------- |
| 1. Baza i testy SQL           | Reguły, okno zakończenia, RPC, testy długów S-02 i F6b       | Wyjątek w strażniku okresów za szeroki — test na wcześniejszy okres |
| 2. Zakończenie i poprawa w UI | Ekran zakończenia, trasy, szczegóły, teksty, smoke           | Słownictwo przez filtr FR-012 (`odstaw`, `przesta`, `dawk`)         |
| 3. Zakończone i usuwanie      | `/leki/zakonczone`, link z licznikiem, ekran usuwania, smoke | Usuwanie mylone z zakończeniem — rozdzielenie w UI                  |

**Prerequisites:** S-02, S-03, S-05 zakończone (są); lokalne Supabase do `db:check` i `smoke`.
**Estimated effort:** ~3 sesje, po jednej na fazę; faza 1 największa.

## Open Risks & Assumptions

- Zakładamy brak w produkcji leków z datą zakończenia; jeśli są, migracja staje z komunikatem i potrzebna jest decyzja autorki.
- „Skończyłam miesiąc temu” daje historię dłuższą niż w rzeczywistości — świadomy koszt reguły 14 dni.
- Ostatnią dawkę wziętą dziś da się zapisać dopiero jutro; wpisanie dzisiejszej daty gubi dzisiejszą dawkę w historii.

## Success Criteria (Summary)

- Zakończony lek znika z `/leki`, jest na `/leki/zakonczone`, a jego okresy kończą się datą zakończenia.
- Po 24 h od zapisu zakończenia nie da się go przesunąć ani cofnąć — test w `supabase/tests/` to dowodzi.
- Usunięcie jest możliwe tylko dla pozycji dodanej w ciągu 24 h i nie da się go pomylić z zakończeniem.
