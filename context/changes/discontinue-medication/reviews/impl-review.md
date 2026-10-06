<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: S-04 — Zakończenie przyjmowania leku z datą

- **Plan**: context/changes/discontinue-medication/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3
- **Date**: 2026-10-06
- **Verdict**: REJECTED
- **Findings**: 1 critical, 1 warning, 4 observations

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

- `npm run db:check` — 9/9 plików `PASS` z `GATE_COMPLETE`, w tym `discontinuation_checks`
- `npm test` — 316/316 pass
- `npm run typecheck` — 0 błędów
- `npm run lint` — 0 błędów; 34 ostrzeżenia (27 na `d6f59c8`), wszystkie nowe to `no-console` przy logowaniu `{ code }` w trasach — ten sam wzorzec co `dosage.ts` i `journal/index.ts`
- `npm run smoke` — **nie uruchomiony ponownie** w przeglądzie (wymaga odsunięcia `.env` i świeżego podglądu); polegamy na wpisach 2.4 i 3.4 w `## Progress`
- Bramki ręczne w `## Progress` odhaczone z SHA; dowodów z przeglądarki diff nie zawiera (zgodnie z naturą bramek ręcznych)
- Sonda F1 uruchomiona na lokalnej bazie w transakcji zakończonej `rollback` — wynik w F1

Zgodne z planem (bez findingu): kolejność migracji, stempel `discontinued_at` (nie da się go podrobić), kolejność kodów MD001–MD010 co do joty, `for update`, uprawnienia, wszystkie przypadki testowe z fazy 1 §2 (plus CHECK 11 z uprawnieniami), trasy wg wzorca `dosage.ts`, brak nazwy leku i daty w URL, przycisk usuwania bez `destructive*`, licznik `head: true` odporny na błąd.

## Findings

### F1 — Zamknięty okres da się przepisać przez przepięcie ostatniego okresu i cofnięcie zakończenia

- **Severity**: ❌ CRITICAL
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20261006120000_discontinue_medication.sql:299-303 (gałąź przepięcia `medication_id`) i :338-351 (wyjątek dla `medications_sync_discontinuation`)
- **Detail**: Wyjątek zakłada, że „ostatni okres wg `started_on`” to okres zamknięty przez zakończenie. Klient może to założenie złamać własnymi zapisami PostgREST, bo przepięcie okresu sprawdza okno leku **docelowego** i okno samego okresu, a nigdy okna leku **źródłowego**. Zmierzone lokalnie jako `authenticated`: lek M (okno zamknięte), P1 `[2026-09-06, 2026-10-04)` zamknięty zmianą dawki, okno zamknięte; P2 od 2026-10-04, świeży. Kroki: `discontinue_medication(M, dziś)` → nowy lek N → `update dosage_periods set medication_id = N where id = P2` (przechodzi) → `correct_discontinuation(M, null)`. Wynik: P1 ma `ended_on = null` — zamknięta granica zmiany dawki z 04.10 zniknęła, a P2 wisi pod lekiem N. Przesunięcie zamiast cofnięcia przepisuje `ended_on` P1 na dowolną datę z okna. Łamie twardą regułę 2 i plan („po oknie data jest ostateczna — także przy bezpośrednim zapisie do bazy”); lekcja „Ograniczenie na tabeli podrzędnej…” wprost wymienia przepięcie pod innego rodzica. Samo przepięcie z leku z zamkniętym oknem istniało przed S-04 (zostawia lek bez trwającego okresu), S-04 zamienia je w przepisanie zamkniętej historii. Tylko własne konto, bez UI. Żaden test tego nie łapie — DISCONTINUATION 4 sprawdza głębokość i ostatni okres, ale nie zmianę tożsamości ostatniego okresu.
- **Fix**: W tej samej migracji (gałąź nie jest wypchnięta, migracja nie wdrożona) dopisać w `dosage_periods_guard_core` odmowę przepięcia, gdy `not public.medication_correction_window_open(old.medication_id)` (lustro strażnika usuwania okresu) oraz gdy lek źródłowy ma `discontinued_on`; dopisać przypadek DISCONTINUATION z tą sekwencją (nazwany `P0001` + treść komunikatu); `db reset` + `db:check`.
  - Strength: Domyka ścieżkę na poziomie bazy, tam gdzie stoją pozostałe gwarancje historii; ten sam warunek co `dosage_periods_guard_delete`, więc przepięcie i usunięcie okresu mają jedną regułę.
  - Tradeoff: Nowy komunikat do dopisania; przepięcie okresu staje się możliwe tylko w oknie obu leków (UI i tak go nie używa).
  - Confidence: HIGH — luka zmierzona, warunek już istnieje w strażniku usuwania.
  - Blind spot: Nie sprawdzone, czy któryś istniejący test SQL przepina okres z leku starszego niż 24 h jako przypadek „pozytywny” — `db:check` to pokaże.
- **Decision**: FIXED — source-medication rule in `dosage_periods_guard_core` (closed window or ended → P0001), DISCONTINUATION 12 added; mutation-checked (fails without the fix on the refusal assertion), `db:check` 9/9 PASS

### F2 — Szczegóły leku zakończonego mówią, że lek porównano z parami

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/leki/[id].astro:376-379
- **Detail**: `medication_interactions()` pomija leki zakończone, więc dla nich `interactions` jest zawsze puste i strona pokazuje `noInteractionsForMedication` („Wśród Twoich bieżących leków nie znaleziono sprawdzanej pary z tym lekiem.”). To sugeruje sprawdzenie, którego nie było — `/leki/zakonczone` mówi dokładnie odwrotnie (`endedNotCompared`). Przed S-04 gałąź była praktycznie nieosiągalna dla leku zakończonego; teraz prowadzi do niej lista zakończonych i link powrotny. FR-012: brak ostrzeżenia ≠ bezpieczne.
- **Fix**: Gdy `!isCurrent`, w tej sekcji pokazać `INTERACTION_COPY.endedNotCompared` zamiast `noInteractionsForMedication` (`noWarningIsNotSafe` zostaje).
- **Decision**: FIXED — ended medication shows `INTERACTION_COPY.endedNotCompared` instead of `noInteractionsForMedication`; typecheck 0 errors, `npm test` 316/316

### F3 — Zdanie dla leków zakończonych w innym pliku niż w planie; komentarz „keep equal” bez `change_dosage`

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/lib/copy/interactions.ts:15-17; supabase/migrations/20261004130000_dosage_period_variant_guard.sql:174-175
- **Detail**: Plan (faza 3 §1) kazał umieścić zdanie „leki zakończone nie są porównywane” w sekcji `endedList` w `medications.ts`; trafiło do `INTERACTION_COPY.endedNotCompared`. Uzasadnione — kontrakt `scripts/fr012/interaction-copy.test.mjs` każe trzymać każdy tekst o (braku) interakcji w `interactions.ts` — ale odstępstwo nie jest nigdzie zapisane. Drugie: plan chciał komentarza „keep equal” przy `c_max_days_back` w `change_dosage`; funkcja nie była redefiniowana, więc jej komentarz nie wskazuje nowych miejsc z granicą 14 dni (pozostałe miejsca mają odsyłacz).
- **Fix**: Dopisać w planie (sekcja faza 3 §1) jednozdaniową adnotację o przeniesieniu do `interactions.ts`; komentarz w `change_dosage` zostawić do najbliższej migracji, która i tak ją redefiniuje.
- **Decision**: FIXED — annotation in plan.md (phase 3 §1); the `change_dosage` comment is left for the next migration that redefines it

### F4 — „Zakończ przyjmowanie” jako tryb rozkazujący obok rzeczownikowego „Zmiana dawkowania”

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/lib/copy/medications.ts (`discontinuation.open`, cytowane też w `deletion.endInstead`)
- **Detail**: S-03 celowo nazwało link rzeczownikiem („Nouns, not imperatives… never suggests that the dose should change”). Nowy link na tym samym ekranie jest w trybie rozkazującym. Plan sam narzucił to brzmienie (plan.md:32, :173), filtr FR-012 je przepuszcza, a bramka ręczna 2.7 je zaakceptowała — więc to tylko niespójność z uzasadnieniem z S-03.
- **Fix**: Zmienić etykietę linku na „Zakończenie przyjmowania” (przycisk „Zapisz zakończenie…” bez zmian) albo świadomie zostawić.
- **Decision**: FIXED — `discontinuation.open` and its quote in `deletion.endInstead` now „Zakończenie przyjmowania” (same as the page title); `npm test` 316/316

### F5 — Okno zakończenia da się odnawiać łańcuchem „cofnij → zakończ ponownie”

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20261006120000_discontinue_medication.sql:144-152
- **Detail**: Cofnięcie czyści `discontinued_at`, ponowne zakończenie stempluje nowe 24 h. Powtarzane w każdym oknie trzyma zakończenie edytowalnym bez końca. Zasięg ograniczony: każde ponowne zakończenie mieści się w `[max(start ostatniego okresu + 1, dziś − 14), dziś]`, więc starszej historii nie dosięga. Nagłówek migracji opisuje to jako zamierzone („Cancelling and ending again is a new save”) i plan to przyjął.
- **Fix**: Brak — zostawić świadomie; zapisane dla autorki.
- **Decision**: SKIPPED — intended behaviour (migration header, plan); reach limited to the last 14 days

### F6 — Koniec ostatniego okresu może być wcześniejszy niż data zakończenia leku

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20261006120000_discontinue_medication.sql:370-377
- **Detail**: Reguła wymaga dla leku zakończonego `ended_on <= discontinued_on`, nie `=`. W otwartym oknie samego okresu bezpośredni zapis może ustawić koniec wcześniej niż data zakończenia — szczegóły pokażą „Przyjmowany do” z `discontinued_on`, a historia okresów wcześniejszy koniec. Tylko w oknie korekty okresu, więc mały wpływ.
- **Fix**: Dla ostatniego okresu leku zakończonego wymagać `ended_on = discontinued_on` (wcześniejsze okresy dalej `<=`), z przypadkiem w DISCONTINUATION 8.
- **Decision**: FIXED — `dosage_periods_guard_core` requires `ended_on = discontinued_on` for the last period of an ended medication (new P0001 message); case added to DISCONTINUATION 8; mutation-checked, `db:check` 9/9 PASS
