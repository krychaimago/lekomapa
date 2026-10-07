# S-06: Złożone pytanie do lekarza — Plan Brief

> Full plan: `context/changes/symptom-question-composer/plan.md`

## What & Why

Po zapisaniu objawu w dzienniczku użytkowniczka widzi gotowe pytanie do lekarza: które leki zaczęła, zmieniła albo odstawiła w czasie objawu, z datami, i pytanie „Czy {objaw} może mieć związek z którymś z tych leków?”. To moment, w którym produkt mógłby wyrządzić szkodę, więc wynikiem jest zestawienie dat i pytanie, nigdy wskazanie podejrzanego leku (FR-012).

## Starting Point

Dzienniczek (S-05) zapisuje wpis i pokazuje baner „Zapisano wpis…” na `/dzienniczek?dodano=<uuid>`. Historia dawkowania (S-03, S-04) zawiera daty początku, zmian i odstawienia. Zmiany dawki zapisanej przez pomyłkę nie da się dziś cofnąć (dług DP010).

## Desired End State

Pod banerem zapisu jest sekcja „Pytanie do lekarza”: osobne pytanie na każdy objaw wpisu, pierwsze rozwinięte. Na górze zmiany w lekach w kolejności dat, pod „▸ Pozostałe leki” leki przyjmowane w tym czasie bez zmian. Na szczegółach leku świeżą zmianę dawki można cofnąć przez 24 h od jej zapisu.

## Key Decisions Made

| Decision                       | Choice                                                                                                      | Why (1 sentence)                                                                    | Source        |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ------------- |
| Zapis czy przeliczanie         | Przeliczane przy każdym otwarciu                                                                            | Poprawka wpisu (S-07) trafia do pytania sama, bez tabeli do pilnowania i kasowania. | Plan          |
| Okno czasowe                   | Od 90 dni przed pierwszym wpisem objawu do bieżącego wpisu, w datach czasu polskiego, obie granice włącznie | Rozstrzygnięte w PRD (pytanie 4); zdarzenia po objawie się nie liczą.               | Roadmap / PRD |
| „Pozostałe leki”               | Tylko leki przyjmowane w oknie bez zdarzenia w nim                                                          | Lista dotyczy czasu objawu; lek dodany po objawie nie udaje zbieżności.             | Plan          |
| Pomyłka w zmianie dawki        | Przycisk „Cofnij zmianę dawki” przez 24 h                                                                   | Historia nie kłamie; pytanie nie pokaże zmiany, której nie było.                    | Plan          |
| Wygląd                         | Lista zmian z datami + pytanie + „▸ Pozostałe leki”                                                         | Czytelne przy wielu lekach, łatwe do pokazania lekarzowi.                           | Plan          |
| Brak zmian w oknie             | Pytanie o przyjmowane leki, lista rozwinięta                                                                | Brak zmian nie może brzmieć jak „leki są w porządku”.                               | Plan          |
| Brak leków w oknie             | Pytanie nie powstaje, jedna linijka wyjaśnia dlaczego                                                       | Nie ma czego zestawić (PRD US-02).                                                  | PRD / Plan    |
| Gdzie widać                    | Zaraz po zapisie; stały dostęp w zakładce S-08                                                              | Zakładka „Do omówienia z lekarzem” to osobny plasterek.                             | Plan          |
| Kolejność przy tej samej dacie | Alfabetycznie po nazwie leku                                                                                | Porządek neutralny, nic nie mówi o podejrzeniu.                                     | Plan          |

## Scope

**In scope:**

- cofnięcie najnowszej zmiany dawki w jej oknie korekty (baza, bramka SQL, ekran, smoke),
- czysta funkcja składania pytania, teksty i testy (granice okna, FR-012, kolejność),
- pytanie pod banerem po zapisie wpisu, smoke,
- dopisanie ustaleń do PRD (US-02, FR-010) i roadmapy (S-06, S-07, S-08).

**Out of scope:**

- tabela z zapisanymi pytaniami,
- zakładka „Do omówienia z lekarzem” (S-08),
- pytanie przy starszych wpisach,
- stronicowanie dzienniczka (F8),
- kolizje w pytaniu,
- odmiana nazw leków,
- cofanie starszych zmian albo przy leku zakończonym.

## Architecture / Approach

Trzy warstwy:

- **Baza:** strażnik usuwania okresu przepuszcza usunięcie najnowszego okresu w jego oknie, a wyzwalacz otwiera wtedy poprzedni okres. Reguła działa tak samo przez RPC `undo_dosage_change` i przy bezpośrednim zapisie.
- **Logika:** `composeDoctorQuestion` w `src/lib/services/doctor-question.ts` liczy okno i zdarzenia bez bazy. `doctorQuestionText` składa napisy z szablonów `DOCTOR_QUESTION_COPY`.
- **Ekran:** `loadDoctorQuestions(supabase, entryId)` czyta wpis, historię objawu i leki przez RLS. Strona dzienniczka renderuje wynik w `<details>`, bez Reacta. S-08 użyje tego samego `loadDoctorQuestions`.

## Phases at a Glance

| Phase                            | What it delivers                                              | Key risk                                                                            |
| -------------------------------- | ------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| 1. Cofnięcie zmiany dawki        | Przycisk cofnięcia świeżej zmiany, reguła w bazie, bramka SQL | Wyjątek w strażniku historii otwarty szerzej niż trzeba                             |
| 2. Składanie pytania             | Funkcja i teksty z testami granic okna i FR-012               | Błąd o jeden dzień na granicy okna albo w strefie czasowej                          |
| 3. Pytanie na ekranie po zapisie | Sekcja pod banerem, smoke, PRD i roadmapa                     | Zdanie złożone z nazw leków trafia na filtr FR-012 (np. nazwa z zakazanym rdzeniem) |

**Prerequisites:** S-03, S-04, S-05 wdrożone (są); lokalne Supabase do `db:check` i smoke.
**Estimated effort:** ok. 4–6 wieczorów: faza 1 ok. 2, faza 2 ok. 1–2, faza 3 ok. 1–2.

## Open Risks & Assumptions

- Nazwa leku z rejestru może zawierać zakazany rdzeń; test złożonego tekstu używa fixture'ów, nie całego rejestru. Przy wpadce nazwa jest daną, nie treścią produktu — do oceny w impl-review.
- Zakładam, że konto ma najwyżej kilkaset wpisów; odczyt historii objawu nie jest stronicowany.
- Zmiana stałej 90 dni przestawi także stare pytania. To świadomy skutek przeliczania.

## Success Criteria (Summary)

- Po zapisie objawu pytanie pokazuje zmiany w lekach z czasu objawu, w kolejności dat, z formułą „może mieć związek”.
- Zmiana dawki zapisana przez pomyłkę znika z historii i z pytania po cofnięciu.
- Żaden tekst pytania nie stwierdza przyczyny, nie sugeruje zmiany leczenia i nie porządkuje leków według podejrzenia — pilnują tego testy i odczyt autorki.
