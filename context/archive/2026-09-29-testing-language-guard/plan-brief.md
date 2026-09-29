# Strażnik języka FR-012 — Plan Brief

> Full plan: `context/changes/testing-language-guard/plan.md`
> Research: `context/changes/testing-language-guard/research.md`

## What & Why

Faza 3 planu testów, ryzyko #2: komunikat o kolizji może stwierdzić przyczynę objawu, zasugerować odstawienie lub zmianę dawki albo pozwolić odczytać brak znacznika jako „bezpieczne”. Dziś pilnuje tego lista zakazanych rdzeni, a pomiar pokazał, że 14 zdań łamiących FR-012 przez nią przechodzi. Plan zastępuje „nie ma zakazanego słowa, więc tekst jest poprawny” wyrocznią wyprowadzoną z PRD.

## Starting Point

- Jedyny tekst o kolizji: 24 opisy par leków w `interaction_pairs`, wgrywane migracją z CSV.
- Walidator (`scripts/rpl/pairs.mjs`) sprawdza tylko CSV.
- Treści w bazie nie sprawdza nic.
- Test walidatora generuje przypadki z listy rdzeni w kodzie.
- Noty poglądowej i zdania o bezpieczeństwie jeszcze nie ma — powstaną w S-02.

## Desired End State

- Wspólny korpus zdań z PRD (zakazane w klasach i poprawne) napędza test walidatora; 14 luk jest zamkniętych.
- Bramka SQL w CI dowodzi, że każdy opis w bazie niesie „może mieć związek”, a próbka pokazuje, że bramka potrafi zrobić się czerwona.
- S-02 ma w roadmapie kontrakt: teksty w module copy, test z tym samym korpusem, krok smoke.

## Key Decisions Made

| Decision                           | Choice                                                          | Why (1 sentence)                                                                     | Source   |
| ---------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------ | -------- |
| Warstwa testu                      | Unit na korpusie z PRD + sprawdzenie SQL na stanie bazy         | Walidator nie widzi migracji; tylko baza pokazuje to, co czyta aplikacja             | Research |
| 14 zdań przepuszczanych dziś       | Rozszerzyć filtr, pilnując korpusem zdań poprawnych             | Bramka realnie się wzmacnia, a korpus poprawny łapie fałszywe alarmy jak przy `dawk` | Plan     |
| Pilnowanie treści w bazie          | Sprawdzenie w bramce SQL + próbka w CI, bez `check` w schemacie | Sam test, bez zmiany schematu w fazie testów                                         | Plan     |
| Nota i zdanie o bezpieczeństwie    | Kontrakt dla S-02 i wspólny korpus, bez brzmienia               | PRD nie ustaliło brzmienia ani miejsca noty; to decyzja S-02                         | Plan     |
| Pętla z `FORBIDDEN_WORDS` w teście | Zastąpiona korpusem; test przypinający listę zostaje            | Wyrocznia skopiowana z kodu znika razem z rdzeniem, który miała pilnować             | Plan     |
| Nieaktualna lekcja o filtrze       | Poprawić Context i Problem, Rule bez zmian                      | Lekcja opisuje kod sprzed F3 i myli kolejne przeglądy                                | Plan     |

## Scope

**In scope:**

- `scripts/fr012/corpus.mjs` i test walidatora na korpusie
- rozszerzenie `FORBIDDEN_WORDS`
- usunięcie pętli z `pairs.test.mjs`
- `supabase/tests/fr012_language_checks.sql`, próbka i linia w CI
- kontrakt w roadmapie S-02
- §6.1, §6.2 i §6.5 planu testów
- poprawka lekcji

**Out of scope:**

- `check` na kolumnie
- szablon zdań w walidatorze
- moduł copy i brzmienie noty
- krok smoke
- test kolejności listy leków
- lista rdzeni w SQL
- nowa migracja z opisami

## Architecture / Approach

Najpierw wyrocznia, potem filtr. Korpus to czyste dane bez importów, więc usunięcie rdzenia z walidatora nie usuwa przypadku testowego. Test korpusu musi być czerwony przed rozszerzeniem listy. Druga warstwa patrzy na bazę po migracjach — tylko migracje wpisują tekst do tej tabeli, więc to sprawdzenie obejmuje całe dzisiejsze źródło tekstu. S-02 zaimportuje ten sam korpus do testu swojego modułu copy.

## Phases at a Glance

| Phase                               | What it delivers                                    | Key risk                                                          |
| ----------------------------------- | --------------------------------------------------- | ----------------------------------------------------------------- |
| 1. Korpus FR-012 i wzmocniony filtr | Wyrocznia z PRD, 14 luk zamkniętych, pętla usunięta | Nowy rdzeń zablokuje neutralne słowo w przyszłym opisie           |
| 2. Bramka SQL na treści w bazie     | `LANGUAGE 1–2` w `db:check` i próbka w CI           | Sprawdzenie rozróżniające wielkość liter fałszywie odrzuci „Może” |
| 3. Kontrakt dla S-02 i dokumentacja | Wpis w S-02, cookbook §6.1, poprawiona lekcja       | S-02 zignoruje kontrakt, jeśli nie trafi do jego planu            |

**Prerequisites:** lokalny Supabase (`npx supabase start`) do fazy 2; `.env` odsunięty na czas `db:check`.
**Estimated effort:** ~2 sesje w 3 fazach.

## Open Risks & Assumptions

- Lista rdzeni pozostaje z natury niepełna — korpus zamyka znane klasy, nie wszystkie możliwe zdania; gwarancją ostateczną zostaje czytanie przez autorkę.
- Faza 3 nie zamyka całego ryzyka #2: nota, zdanie o bezpieczeństwie i kolejność listy są chronione dopiero po S-02.
- Zakłada, że CI ma to samo kodowanie bazy co lokalny kontener (`en_US.UTF-8`); próbka w CI to potwierdzi.

## Success Criteria (Summary)

- Zdanie „Połączenie jest bezpieczne. … może mieć związek …” nie przejdzie walidatora, a opis zgodny z FR-012 przejdzie.
- Ręcznie zepsuty opis w migracji wywraca CI.
- Plan S-02 zaczyna od gotowego korpusu i jawnego kontraktu na notę.
