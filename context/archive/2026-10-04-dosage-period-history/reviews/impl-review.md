<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: S-03 Historia okresów dawkowania

- **Plan**: context/changes/dosage-period-history/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3, 4
- **Date**: 2026-10-04
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 3 warnings, 5 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | WARNING |
| Success Criteria    | PASS    |

Bramki uruchomione przy przeglądzie (2026-10-04): `npm test` 296/296, `npm run lint` 0 błędów (ostrzeżenia `no-console` jak w istniejących trasach), `npm run typecheck` 0 błędów, `npm run build` przechodzi, `npm run db:check` — wszystkie sześć plików z `GATE_COMPLETE`, w tym `dosage_change_checks`. `grep placeholder src/components/medications` pusty. `npm run smoke` nie był powtarzany (wymaga odsunięcia `.env`); w Progress odhaczony przy abd2986.

## Findings

### F1 — Reguła wariantu działa tylko w `change_dosage`; bezpośredni zapis do `dosage_periods` ją omija

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20261004120000_dosage_change.sql:61-63, :80-122; supabase/migrations/20260922120000_medication_schema.sql:402-404
- **Detail**: Polityka `dosage_periods_insert_authenticated` pozwala właścicielce wstawić okres bezpośrednio przez PostgREST, a strażnik `dosage_periods_guard_core` jest wyłącznie `before update`. Przykład: `insert into dosage_periods (..., registry_product_id)` przy leku z ulotki albo z wariantem innego preparatu (np. inna grupa Sartesty) — `DP005` się nie wykonuje. Przy otwartym oknie korekty (dziś zawsze) to samo daje `update ... set registry_product_id`. Ekran historii pokaże wtedy moc preparatu, którego nikt nie brał. Plan świadomie wyłączył to z zakresu („Twarde blokady w bazie dla bezpośrednich INSERT…”), ale lekcja „Ograniczenie na tabeli podrzędnej nie chroni…” każe nakładać gwarancję na całą ścieżkę zapisu. Dane wyłącznie własnego konta — bez wycieku między kontami.
- **Fix A ⭐ Recommended**: Wyzwalacz `before insert or update of registry_product_id` na `dosage_periods` sprawdzający te same trzy warunki co `DP005` (null przy ulotce, ta sama nazwa, ten sam skład) + test DOSAGE dla bezpośredniego `insert`.
  - Strength: Zamyka klasę obejścia na poziomie bazy, zgodnie z lekcją; logika `DP005` może przejść do wspólnej funkcji wołanej z wyzwalacza i z `change_dosage`.
  - Tradeoff: Nowa migracja i kolejny wyzwalacz; kosztowniejsza zmiana niż reszta findingów.
  - Confidence: MED — odebranie `insert` od `authenticated` nie wchodzi w grę (funkcje są `security invoker`), więc wyzwalacz to jedyna droga w bazie.
  - Blind spot: Nie sprawdzono wpływu na `add_medication_from_leaflet` i seed testów, które wstawiają okresy bezpośrednio.
- **Fix B**: Zostawić jako znane ograniczenie i dopisać do długu S-05 (razem z prawdziwym oknem korekty).
  - Strength: Zgodne z decyzją planu; zero kosztu teraz.
  - Tradeoff: Historia zależy od konwencji aplikacji, nie od bazy — dokładnie to, przed czym ostrzega lekcja.
  - Confidence: HIGH — plan już to nazywa.
  - Blind spot: Nikt nie pilnuje, że dług zostanie spłacony.
- **Decision**: FIXED (Fix A) — migracja `20261004130000_dosage_period_variant_guard.sql`: wspólna `assert_dosage_period_variant` (security invoker), wyzwalacz `dosage_periods_guard_variant`, `change_dosage` bez kopii reguły; DOSAGE 14, INVARIANT 8 (7 strażników), INTERACTION 11, sonda CI `dosage-period-without-variant-guard.sql`. `db:check` 6/6, `npm test` 296/296, typecheck 0.

### F2 — Komunikat `DP007` odsyła do drogi, której nie ma i która psuje historię

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/copy/medications.ts:125-126; supabase/migrations/20261004120000_dosage_change.sql:42-43
- **Detail**: Tekst brzmi „Starszą zmianę zapisuje się przez zakończenie leku i dodanie go ponownie z nowym dawkowaniem.” Zakończenie leku to S-04 (status `proposed`) — w aplikacji nie ma jeszcze takiego przycisku. Nawet po S-04 obejście zostawia dwie pozycje tego samego leku z różnymi dawkami w tym samym czasie (ograniczenie wykluczające działa per `medication_id`). Do tego „zakończenie leku” w komunikacie o błędzie stoi blisko sugestii odstawienia (FR-012), choć przechodzi filtr rdzeni.
- **Fix**: Skrócić do „Datę zmiany można cofnąć najwyżej o 14 dni.” i poprawić zdanie w nagłówku migracji przy okazji następnej migracji (bez edycji już wdrożonej).
- **Decision**: FIXED — `changeDateTooOld` skrócony do „Datę zmiany można cofnąć najwyżej o 14 dni.”; sprostowanie nagłówka 20261004120000 w nagłówku migracji 20261004130000.

### F3 — Nazwa preparatu trafia do adresu zapytania z Workera do Supabase

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/pages/leki/[id]/zmiana-dawki.astro:84-88
- **Detail**: `.ilike("product_name", likeLiteral(baseName))` staje się żądaniem GET `?product_name=ilike.<nazwa>` do PostgREST — nazwa leku ląduje w logach API Supabase obok JWT zalogowanej osoby. Lekcja „Żadna nazwa leku ani dawka w adresie URL” obejmuje wprost „zapytania fetch”. Ten sam wzorzec ma `nowy.astro:64` (dług S-02, issue #57), ale tu jest nowe wystąpienie, gdzie wystarczy samo uuid.
- **Fix A ⭐ Recommended**: Funkcja `registry_variants_of(p_product_id uuid)` wołana przez RPC (POST), filtrująca w SQL tę samą nazwę i ten sam skład.
  - Strength: Usuwa nazwę z URL i jednocześnie kopię reguły składu w TS (F5) — ekran i `DP005` liczą to samo w jednym miejscu.
  - Tradeoff: Nowa migracja + test uprawnień w INTERACTION 11.
  - Confidence: HIGH — wzorzec RPC już działa dla `change_dosage`.
  - Blind spot: Nie zmierzono, czy logi Supabase faktycznie zapisują query string dla tego projektu.
- **Fix B**: Dopisać to miejsce do issue #57 i naprawić razem z ekranami dodawania.
  - Strength: Jedna spójna zmiana dla wszystkich wystąpień.
  - Tradeoff: Lekcja łamana w nowym kodzie dalej, dług rośnie.
  - Confidence: HIGH.
  - Blind spot: Brak terminu dla #57.
- **Decision**: FIXED (Fix A) — `registry_variants_of(uuid)` w migracji 20261004130000 (filtr przez `assert_dosage_period_variant`); `zmiana-dawki.astro` woła RPC i czyta warianty po `in("id", …)` — w URL tylko uuid. DOSAGE 15, INTERACTION 11. Ekran zmiany dawki sprawdzony ręcznie w przeglądarce przez autorkę (2026-10-05).

### F4 — Mapowanie `P0002 → medicationNotFound` jest martwe

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/pages/api/medications/[id]/dosage.ts:14-23
- **Detail**: Pomiar z fazy 4 (Notes w `change.md`): `P0002` z polskim komunikatem wraca jako HTTP 500 bez kodu, więc cudzy lub usunięty lek kończy się kluczem `generic` („Nie udało się zapisać…”). Komentarz w trasie to przyznaje. Bezpieczne, ale mylące. Ten sam mechanizm dotyczy funkcji z S-02.
- **Fix**: W `change_dosage` zgłaszać własny kod (np. `DP008`), który dociera jak pozostałe `DP00x`, i zmapować go; funkcje S-02 osobną zmianą.
- **Decision**: FIXED — `change_dosage` zgłasza `DP008` (migracja 20261004130000, nowy komentarz funkcji); trasa mapuje `DP008 → medicationNotFound`; DOSAGE 11 oczekuje `DP008`. Zmierzone na lokalnym API: `{"code":"DP008"}`, HTTP 400. Funkcje S-02 bez zmian.

### F5 — `sameComposition` kopiuje regułę `DP005` w TS bez testu

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/lib/services/medications.ts:117-139
- **Detail**: Funkcja spoza kontraktu planu filtruje warianty na ekranie zmiany. JS `trim()`/`toLowerCase()` i SQL `btrim()`/`lower()` nie są identyczne. Rozjazd = ekran proponuje wariant, który baza odrzuci (`DP005`), albo ukrywa poprawny. Awaria bezpieczna, ale niewidoczna dla testów.
- **Fix**: Testy jednostkowe w `scripts/medications/medications.test.mjs` (kolejność, duplikaty kodów, nazwy bez kodu z wielkością liter i spacjami, inny zbiór kodów) — albo usunąć kopię przez Fix A z F3.
- **Decision**: FIXED (przez F3 Fix A) — `sameComposition` usunięte z `src/lib/services/medications.ts`; ekran bierze listę wariantów z bazy.

### F6 — Luki przekazane dalej: błędna zmiana nie do cofnięcia, okres po przyszłej dacie odstawienia

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20261004120000_dosage_change.sql (`change_dosage`, `DP001`, `DP002`)
- **Detail**: (a) Zapis „2 tabletki” dziś i natychmiastowe zauważenie pomyłki: druga zmiana dziś daje `DP002`, więc zostaje tylko zmiana od jutra i fałszywy jednodniowy okres. Plan odkłada poprawkę literówki do S-05, ale ten konkretny skutek nie jest nazwany. (b) Lek z `discontinued_on` w przyszłości przyjmuje zmianę, a nowy okres trwa dalej niż data odstawienia — S-04 musi zamykać także okresy otwarte po ustawieniu daty odstawienia.
- **Fix**: Dopisać oba punkty do notatek S-04 i S-05 w roadmapie (bez zmiany kodu).
- **Decision**: FIXED — oba punkty dopisane do `context/foundation/roadmap.md`: (a) jako „Dług przejęty z S-03” w S-05 (razem z limitem 14 dni i drogą dla starszej zmiany, por. F2), (b) jako dług z S-03 w ryzyku S-04. Bez zmiany kodu.

### F7 — Różna normalizacja dawki w dwóch funkcjach zapisu

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: supabase/migrations/20261004120000_dosage_change.sql:183 vs :348
- **Detail**: `add_medication_from_registry` zapisuje `p_dose_text` bez `btrim`, `change_dosage` z `btrim`. Trasy przycinają wcześniej, więc dotyczy tylko bezpośrednich wywołań RPC.
- **Fix**: `btrim` także w `add_medication_from_registry` (i `_from_leaflet`) przy najbliższej migracji.
- **Decision**: FIXED — sekcja F migracji 20261004130000: `btrim(p_dose_text)` w `add_medication_from_registry` i `add_medication_from_leaflet`; DOSAGE 1 sprawdza przycięcie w obu.

### F8 — Drobne niedokładności w testach i zapytaniu wariantów

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: supabase/tests/dosage_change_checks.sql:31; src/pages/leki/[id]/zmiana-dawki.astro:88
- **Detail**: Nagłówek testu wymienia pomocnika `pg_temp.assert_changed`, którego nie ma (są `assert_period_count`, `assert_changed_on`). Zapytanie wariantów ma `.limit(100)` bez `order` — przy >100 wariantach bieżący może wypaść z listy (degraduje bezpiecznie: radio ukryte, wariant bieżący zachowany).
- **Fix**: Poprawić nazwę w komentarzu; dodać `.order("strength")` albo rozwiązać razem z F3.
- **Decision**: FIXED — komentarz nagłówka testu wymienia `pg_temp.assert_period_count` i `pg_temp.assert_changed_on`; `.limit(100)` bez `order` usunięte przy F3.
