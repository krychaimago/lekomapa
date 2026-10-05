<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: S-05 — Wpis o samopoczuciu i okno korekty

- **Plan**: context/changes/symptom-journal-entry/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3, 4
- **Date**: 2026-10-05
- **Verdict**: REJECTED
- **Findings**: 1 critical, 2 warnings, 6 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | WARNING |
| Scope Discipline    | PASS    |
| Safety & Quality    | FAIL    |
| Architecture        | PASS    |
| Pattern Consistency | WARNING |
| Success Criteria    | PASS    |

## Bramki uruchomione w przeglądzie

- `npm test` — 316/316 pass
- `npm run lint` — 0 błędów; 27 ostrzeżeń (17 na `main`), wszystkie nowe to `no-console` przy logowaniu `error.code`, ten sam wzorzec co istniejące trasy
- `npm run typecheck` — 0 błędów
- `npm run build` — przechodzi
- `npx supabase db reset` + `npm run db:check` — wszystkie 8 plików `PASS` z `GATE_COMPLETE`
- 15 sond z `ci.yml` — każda pada z oczekiwanym komunikatem, w tym nowa `period-window-execute-for-authenticated.sql`
- `npm run smoke` przeciw lokalnej bazie (tymczasowy `.env` = `.dev.vars`, oryginał przywrócony; lokalne `auth.users` 0 → 3) — wszystkie kroki `PASS`, w tym dzienniczek i poprawa dawki
- Bramki ręczne w `## Progress` odhaczone z SHA; dowodów z przeglądarki diff nie zawiera (zgodnie z naturą bramek ręcznych)

Rozszerzenia ponad plan (bez findingu, zgodne z lekcjami): gałęzie przepięcia `medication_id` w strażnikach okresów i składu, 415 dla treści innej niż JSON w `/api/journal`, sprawdzenie, że okres należy do leku z URL w trasie poprawy, `Cache-Control: private, no-store`.

## Findings

### F1 — Zamkniętą historię dawkowania da się przepisać wstecz bez limitu przez bezpośrednie API

- **Severity**: ❌ CRITICAL
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20261005120000_correction_window.sql:206-211 (gałąź `ended_on` w `dosage_periods_guard_core`) oraz :299-320 (`dosage_periods_guard_insert`)
- **Detail**: Przy zamkniętym oknie strażnik przepuszcza `ended_on` z pustego na dowolną datę, a strażnik INSERT wymaga tylko, by `started_on` było późniejsze od każdego istniejącego startu. Żaden nie egzekwuje granic `change_dosage` (DP007 — najwyżej 14 dni wstecz, DP003 — nie w przyszłość). Zmierzone lokalnie jako `authenticated`, okno zamknięte 200 dni temu: `update dosage_periods set ended_on='2026-02-01'` + `insert … started_on='2026-02-01', dose_text='5 tabletek'` przechodzą — powstaje zmiana dawki sprzed 8 miesięcy. Sam `update` skracający trwający okres do `2026-01-02` też fałszuje historię. Komentarz strażnika twierdzi „which is what change_dosage does”, a tego nie egzekwuje. Ścieżka tylko przez własne konto i spreparowane wywołania PostgREST, bez UI — ale to jest dokładnie reguła 2 („historia nie kłamie”), którą okno korekty ma gwarantować na całej ścieżce zapisu (lekcja „Ograniczenie na tabeli podrzędnej nie chroni…”). Gałąź `ended_on` istniała przed tą zmianą, ale do teraz okno było zaślepką, więc dziura staje się realna dopiero z tym plasterkiem.
- **Fix A ⭐ Recommended**: W tej samej (jeszcze niewdrożonej) migracji ograniczyć przy zamkniętym oknie `ended_on` null→data oraz `started_on` w INSERT do `[dziś(Europe/Warsaw) − 14 dni, dziś]`, tymi samymi stałymi co `change_dosage`; dopisać sprawdzenia z nazwanym `P0001` w `correction_window_checks.sql`.
  - Strength: Zamyka dziurę w bazie, na całej ścieżce zapisu; `change_dosage` i tak mieści się w tych granicach, więc CHECK 19 i smoke zostają zielone.
  - Tradeoff: Odstawienie leku (S-04) też zamyka okres przez `ended_on` — dostanie ten sam limit 14 dni wstecz; to decyzja przesądzana teraz za S-04. Edycja migracji zastosowanej lokalnie wymaga `db reset`.
  - Confidence: HIGH — luka zmierzona, granice już istnieją w `change_dosage`.
  - Blind spot: Czy S-04 potrzebuje odstawienia z datą starszą niż 14 dni (np. „przestałam brać miesiąc temu”).
- **Fix B**: Zostawić bazę, zapisać dziurę jako dług S-04 w roadmapie i ustalić limit dat razem z odstawieniem.
  - Strength: Jedna decyzja o datach zamknięcia okresu dla zmiany dawki i odstawienia naraz.
  - Tradeoff: Do S-04 produkcja ma okno korekty, które nie chroni historii dawkowania przed zapisem wstecz.
  - Confidence: MED — zależy od tego, kiedy S-04 wejdzie.
  - Blind spot: Nic nie pilnuje, żeby dług nie został zapomniany poza wpisem w roadmapie.
- **Decision**: FIXED (Fix A) — `dosage_periods_guard_core` i `dosage_periods_guard_insert` przy zamkniętym oknie przyjmują datę końca / startu tylko w `[dziś − 14, dziś]` (Europe/Warsaw); WINDOW 6 w `correction_window_checks.sql`; `rls_checks.sql` (5d, CHECK 19) przeniesione z dat sztywnych na względne. `db reset` + `db:check` 8/8, 15 sond, `npm test` 316/316. Przesądza za S-04: odstawienie zamyka okres najwyżej 14 dni wstecz.

### F2 — Usunięcie świeżego okresu zostawia lek bez trwającego okresu

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20261005120000_correction_window.sql:218-237 (`dosage_periods_guard_delete`)
- **Detail**: Strażnik usunięcia liczy okno okresu, nie leku. Po `change_dosage` na starym leku nowy okres da się usunąć przez PostgREST w jego 24 h; poprzedni okres ma `ended_on` zamrożone własnym zamkniętym oknem. Lek zostaje bez trwającego okresu i bez `discontinued_on` — historia pokazuje lukę, której nie było. Brak ścieżki z UI. To dług „cofnięcie zmiany” (S-06) w postaci surowego `delete`. Razem z F1 pozwala potem dopisać okres z inną datą.
- **Fix A ⭐ Recommended**: Usunięcie okresu dopuszczać tylko w oknie leku (albo przy kaskadzie); poprawa świeżego okresu idzie przez `correct_dosage_period`. Sprawdzenie w `correction_window_checks.sql`.
  - Strength: Usuwanie zostaje dla pozycji dodanych przez pomyłkę (lek w swoim oknie), zgodnie z regułą „trwałe usunięcie tylko dla pomyłek”.
  - Tradeoff: Świeżej zmiany dawki nie da się wycofać nawet przez API do czasu S-06.
  - Confidence: HIGH — UI i smoke nie usuwają okresów.
  - Blind spot: Czy któryś test SQL usuwa okres przy zamkniętym oknie leku i otwartym oknie okresu.
- **Fix B**: Przy usunięciu okresu w jego oknie automatycznie przywracać `ended_on = null` poprzedniemu (prawdziwe cofnięcie zmiany).
  - Strength: Domyka dług „cofnięcie zmiany” w bazie.
  - Tradeoff: Nowa funkcja poza zakresem S-05; strażnik `ended_on` musi dostać wyjątek.
  - Confidence: MED — więcej ruchomych części.
  - Blind spot: Interakcja z odstawieniem (S-04).
- **Decision**: FIXED (Fix A) — `dosage_periods_guard_delete` pyta o okno leku zamiast okna okresu (kaskada bez zmian); WINDOW 2 w `correction_window_checks.sql` sprawdza odmowę dla świeżego okresu i przejście dla leku w jego oknie. `db:check` 8/8.

### F3 — DP010 porównuje tylko z poprzednim okresem, nie z następnym

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20261005140000_correct_dosage_period.sql:100-119
- **Detail**: Lek dodany dziś od d−10 (P1), `change_dosage` na d−5 (P2), oba okresy w oknie. `correct_dosage_period(P1, <dawka P2>)` przechodzi — P1 nie ma poprzednika — i historia ma dwa kolejne identyczne okresy, czyli „zmianę, której nie było”, przed którą DP010 ma chronić. Odwrotny kierunek jest blokowany, więc reguła jest asymetryczna. Plan opisał tylko poprzednika — to luka planu.
- **Fix**: Dodać to samo porównanie z okresem bezpośrednio następnym (`started_on > … order by started_on asc limit 1`) i przypadek w DOSAGE 16.
- **Decision**: FIXED — `correct_dosage_period` porównuje z okresem bezpośrednio przed i po (DP010 dla obu); komunikat w bazie i w `src/lib/copy/medications.ts` (`sameAsAdjacentPeriod`, dawniej `sameAsPreviousPeriod`) mówi o okresie przed albo po; przypadek „następny okres” w DOSAGE 16. `db:check` 8/8, `npm test` 316/316, typecheck czysty.

### F4 — „Możesz poprawić do …” przy wpisie dzienniczka bez drogi poprawy

- **Severity**: 💡 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Adherence
- **Location**: src/lib/copy/journal.ts:13-14, src/pages/dzienniczek/index.astro:99, :146
- **Detail**: Lista i komunikat po zapisie obiecują poprawę, a ekranu ani trasy poprawy wpisu nie ma (plan przesuwa je do S-07, `plan.md:52`). Użytkowniczka szuka przycisku i odbiera to jak zepsutą funkcję. Zgodne z planem — to decyzja produktowa, nie dryf.
- **Fix A ⭐ Recommended**: Zostawić informację do czasu S-07 i nic nie zmieniać; S-07 dokłada ekran.
  - Strength: Zero pracy; informacja jest prawdziwa w bazie i gotowa pod S-07.
  - Tradeoff: Do S-07 obietnica bez drogi.
  - Confidence: MED — zależy, jak szybko przyjdzie S-07.
  - Blind spot: Czy produkcja dostanie S-05 bez S-07 na dłużej.
- **Fix B**: Ukryć „do kiedy” przy wpisach dzienniczka do S-07 (zostaje przy lekach, gdzie droga poprawy istnieje).
  - Strength: UI nie obiecuje niczego, czego nie ma.
  - Tradeoff: Kryterium ręczne 3.7 i krok smoke z komunikatem do zmiany; S-07 przywraca.
  - Confidence: HIGH — mała zmiana w dwóch miejscach.
  - Blind spot: None significant.
- **Decision**: ACCEPTED (Fix A) — informacja „do kiedy” zostaje bez zmian; ekran poprawy wpisu dokłada S-07.

### F5 — Nasilenie pod objawem na liście zamiast w bloku „Wybrane”

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/components/journal/SymptomPicker.tsx:54-99
- **Detail**: Plan: zaznaczone objawy widoczne nad listą z wyborem nasilenia. Jest: przyciski nasilenia pod zaznaczonym objawem w liście; blok nad listą pokazuje nazwę, etykietę nasilenia i „usuń”. Gdy wyszukiwanie ukrywa zaznaczony objaw, jego nasilenia nie da się zmienić bez czyszczenia pola. Komentarz w kodzie mówi, że to świadome.
- **Fix**: Zapisać wybór w planie jako uzupełnienie (bez zmiany kodu) albo dodać przyciski nasilenia w bloku „Wybrane”.
- **Decision**: FIXED (wariant „przenieść”) — przyciski nasilenia przeniesione spod objawu na liście do bloku „Wybrane objawy”, zgodnie z planem; lista ma same kratki. Lint, typecheck, prettier, `npm test` czyste. Do sprawdzenia w przeglądarce na telefonie (kryterium 3.6).

### F6 — `when others` w `pg_temp.try_code`

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: supabase/tests/symptom_journal_checks.sql:180-198
- **Detail**: Helper łapie `when others` i rzuca dalej każdy kod inny niż oczekiwany — zachowanie jest nazwanym łapaniem, ale brzmienie łamie lekcję „Bramka musi odróżnić blokadę od niewykonania” i plan („nigdy `when others`”). Inne pliki (`try_correct` w `dosage_change_checks.sql`) wymieniają kody z nazwy.
- **Fix**: Zostawić (zachowanie poprawne) albo zamienić na listę nazwanych warunków jak w `dosage_change_checks.sql`.
- **Decision**: FIXED — `pg_temp.try_code` łapie z nazwy wyłącznie `28000` i `SE001`–`SE005`; `symptom_journal_checks.sql` PASS.

### F7 — Górna granica godziny zamrożona przy otwarciu ekranu

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/journal/NewEntryForm.tsx:112
- **Detail**: `max={defaultOccurred}` to czas serwera z chwili renderowania. Ekran otwarty o 21:00, o 21:40 wpisana godzina 21:30 — przeglądarka blokuje wysłanie, choć baza by przyjęła.
- **Fix**: Usunąć `max` (baza zwraca `SE002`, trasa go mapuje) albo przeliczać go przy wysyłce.
- **Decision**: FIXED — usunięty `max` z pola daty i godziny; przyszłą godzinę odrzuca baza (`SE002` → `occurredInFuture`). Lint czysty.

### F8 — Lista dzienniczka bez limitu

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/dzienniczek/index.astro:39-45
- **Detail**: Zapytanie pobiera wszystkie wpisy z objawami, bez `.limit`/`.range`. Plan to przewiduje (Performance Considerations); przy latach codziennych wpisów lista rośnie liniowo.
- **Fix**: Bez zmian teraz; stronicowanie przy S-06 (indeks `(user_id, occurred_at desc)` już jest).
- **Decision**: DEFERRED — kod bez zmian; stronicowanie zapisane w `follow-ups/review-fixes.md` do zrobienia przy S-06.

### F9 — Drobne rozbieżności z kontraktem tras

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/pages/api/journal/index.ts:141, src/pages/api/medications/[id]/periods/[periodId].ts:116
- **Detail**: `28000` mapowane na 401 (plan: 422) — spójne z 401 przy braku sesji, lepsze niż plan. Sukces poprawy przekierowuje na `?poprawiono=<periodId>` (plan: `?poprawiono=1`) — uuid, nie dana zdrowotna; baner i smoke z tego korzystają.
- **Fix**: Dopisać oba w planie jako uzupełnienie; kod bez zmian.
- **Decision**: FIXED — obie różnice dopisane w `plan.md`, sekcja „Uzupełnienia po impl-review”; kod bez zmian.

## Triage

| Wynik         | Findingi                                                          |
| ------------- | ----------------------------------------------------------------- |
| Naprawione    | F1 (Fix A), F2 (Fix A), F3, F5 (przeniesienie), F6, F7, F9 (plan) |
| Zaakceptowane | F4 (Fix A — bez zmian do S-07)                                    |
| Odłożone      | F8 (stronicowanie przy S-06, `follow-ups/review-fixes.md`)        |

Bramki po triage'u: `npx supabase db reset` + `npm run db:check` 8/8 PASS, 15 sond CI pada z oczekiwanym komunikatem, `npm test` 316/316, `npm run typecheck` czysty, lint zmienionych plików bez nowych ostrzeżeń. Nieuruchomione: `npm run smoke`, sprawdzenie F5 w przeglądarce.

Po triage'u, z testu ręcznego autorki: komunikat „Zapisano wpis…” wymienia objawy wpisu (najwyżej trzy, reszta jako „i jeszcze N”) (`src/lib/copy/journal.ts`, `src/pages/dzienniczek/index.astro`, prefiks w `scripts/smoke.mjs`). F4 potwierdzone ponownie po teście ręcznym: napis „Możesz poprawić do …” zostaje bez ekranu poprawy do S-07.
