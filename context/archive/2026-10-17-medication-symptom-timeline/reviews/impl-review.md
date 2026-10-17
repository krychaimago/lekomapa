<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Oś czasu leków i objawów

- **Plan**: context/changes/medication-symptom-timeline/plan.md
- **Scope**: Full plan (faza 4 bez kroku 4.7, który przypada po wdrożeniu)
- **Reviewed phases**: 1, 2, 3, 4
- **Date**: 2026-10-17
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 4 warnings, 5 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | WARNING |
| Scope Discipline    | WARNING |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | PASS    |

## Success criteria — uruchomione w przeglądzie (17.10.2026)

- `npm test` — 531/531 pass
- `npm run typecheck` — 0 błędów
- `npm run lint` — 0 błędów, 10 ostrzeżeń `no-console` w `src/lib/observability/*` (pliki spoza tej zmiany)
- `npm run build` — pass
- `npm run db:check` — 16 plików pass, w tym `GATE_COMPLETE symptom_timeline_checks`
- `node --experimental-strip-types scripts/timeline/bench.mjs` — mediana 0,989 ms (próg ≤ 2 ms)
- `node scripts/timeline/render-bench.mjs` — mediana 6,037 ms, p95 7,458 ms (próg ≤ 7 ms po decyzji autorki)
- Niepowtórzone celowo: `npx supabase db reset` (skasowałby lokalne konto ciężkie) i oba biegi Playwright (wymagają odsunięcia `.env`, lesson „Lokalne bramki sprawdź…”). Zielone przy commicie a2e7c09.
- Krok 4.7 (limit CPU po wdrożeniu) otwarty z założenia; `change.md` ma `TODO`.

## Findings

### F1 — Plan mówi „≤ 5 ms”, skrypt mierzy „≤ 7 ms”

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — szybka decyzja, poprawka oczywista i wąska
- **Dimension**: Plan Adherence
- **Location**: context/changes/medication-symptom-timeline/plan.md:234, 244, 333
- **Detail**: Autorka podniosła próg renderu do 7 ms (`change.md`, 17.10.2026), `render-bench.mjs:26` ma `THRESHOLD_MS = 7`. Kontrakt fazy 3, kryterium automatyczne i „Performance Considerations” dalej mówią 5 ms. Krok 3.5 w `## Progress` zostaje bez zmian (zasada: nie zmieniać tytułów kroków) — ale reszta planu będzie wprowadzać w błąd przy archiwum i S-10, które korzysta z tej samej techniki.
- **Fix**: W liniach 234, 244 i 333 zmienić próg na „≤ 7 ms (decyzja autorki 17.10.2026, `change.md`)”; Progress bez zmian.
- **Decision**: FIXED — próg 7 ms w plan.md:234, 244, 333; Progress 3.5 bez zmian (17.10.2026)

### F2 — Przeglądarka bez `:has()` pokazuje wszystko naraz

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — prawdziwy kompromis; warto się zatrzymać
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/timeline.ts:369-402, src/components/timeline/TimelineView.astro:124
- **Detail**: Każdy filtr (zakres, objaw, leki, komunikat o ukryciu) stoi na `:has()`. Brak `@supports` w komponentach. Przeglądarka bez `:has()` (Firefox < 121, Safari < 15.4) dostaje trzy zakresy × dwa układy × wszystkie objawy jeden pod drugim. Danych nie ukrywa — ryzyko FR-013 nie zachodzi — ale ekran jest nieczytelny, a kontrolki nic nie robią.
- **Fix A ⭐ Recommended**: Zapisać jako przyjęte ograniczenie w `change.md` → `## Notes`.
  - Strength: Zero kodu; starsze przeglądarki to mały odsetek, a dane nie znikają.
  - Tradeoff: Osoba na starym urządzeniu widzi bałagan bez wyjaśnienia.
  - Confidence: HIGH — zachowanie wynika wprost z reguł CSS.
  - Blind spot: Nie zmierzono, jakie przeglądarki mają użytkowniczki.
- **Fix B**: Dodać `@supports not selector(:has(*))` — pokazać tylko „90 dni” w jednym układzie i krótką informację, że filtry wymagają nowszej przeglądarki.
  - Strength: Ekran czytelny wszędzie.
  - Tradeoff: Nowa reguła CSS i tekst w copy z testem FR-012; ok. godzina pracy, ponowny pomiar renderu.
  - Confidence: MED — `@supports selector()` sam nie działa w bardzo starych przeglądarkach.
  - Blind spot: Brak przeglądarki testowej bez `:has()` w Playwright.
- **Decision**: FIXED via Fix A — przyjęte ograniczenie w change.md → ## Notes (17.10.2026)

### F3 — Komunikat „Część leków jest ukryta.” może nie zostać odczytany

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — szybka decyzja, poprawka oczywista i wąska
- **Dimension**: Safety & Quality
- **Location**: src/components/timeline/TimelineView.astro:220-233
- **Detail**: Blok ma `role="status"`, ale pojawia się przez zmianę `display` w CSS. Część czytników ekranu nie ogłasza regionu, który był ukryty od początku i stał się widoczny. To dokładnie ryzyko z testu E2E („filtr ukrywa dane bez ostrzeżenia”), tylko dla osoby korzystającej z czytnika. E2E sprawdza wyłącznie widoczność.
- **Fix**: Sprawdzić ręcznie w VoiceOver (iPhone, Safari): odznaczyć lek, posłuchać, czy komunikat pada. Wynik zapisać w `change.md`; gdy milczy — osobna zmiana (bez JavaScriptu nie da się tego wymusić).
- **Decision**: FIXED — krok ręczny VoiceOver dopisany do change.md (wynik TODO, razem z 4.7) (17.10.2026)

### F4 — Zmiany poza planem: roadmapa i wyłączanie strażników w skrypcie

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — szybka decyzja, poprawka oczywista i wąska
- **Dimension**: Scope Discipline
- **Location**: context/foundation/roadmap.md (S-09), scripts/timeline/seed-heavy.mjs:157-158, 195-199, 231-250
- **Detail**: (1) Roadmapa: S-09 `proposed` → `in-progress` — plan jej nie edytuje; reszta diffu tabeli to tylko wyrównanie spacji. (2) `seed-heavy.mjs` wyłącza trzy wyzwalacze historii (`symptom_entries_guard_occurred_at`, `medications_guard_core`, `medications_sync_discontinuation`). Kontrakt planu mówi tylko o odmowie pracy poza lokalną bazą. Mechanizm jest dobrze zabezpieczony (dokładne porównanie hosta, jedna transakcja, sprawdzenie `pg_trigger` przed zatwierdzeniem, opis w `change.md`), ale dotyka reguły „Historia nie kłamie”, więc wymaga świadomej zgody.
- **Fix**: Przyjąć oba; przy archiwum ustawić S-09 na `done` w roadmapie.
- **Decision**: ACCEPTED — autorka przyjęła zmianę S-09 w roadmapie i wyłączanie trzech wyzwalaczy w seed-heavy.mjs (tylko lokalna baza); przy archiwum S-09 → done (17.10.2026)

### F5 — Lek z przyszłą datą rozpoczęcia znika z osi bez śladu

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — szybka decyzja, poprawka oczywista i wąska
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/timeline.ts:237-265
- **Detail**: Lek, którego wszystkie okresy zaczynają się po dziś, nie ma wiersza, pola wyboru ani nie wlicza się do „N leków zakończonych…”. Przyszłą datę blokuje tylko trasa API, nie baza. Zachowanie celowe i przypięte testem (`timeline.test.mjs:237`), ale nie mówi o tym żaden tekst.
- **Fix**: Potwierdzić, że milczenie jest w porządku (dziś nie da się takiego leku zapisać przez UI); bez zmian w kodzie.
- **Decision**: ACCEPTED — autorka potwierdziła, że brak leku z przyszłą datą na osi jest w porządku (UI nie pozwala go zapisać); bez zmian w kodzie (17.10.2026)

### F6 — Komentarz obiecuje filtrowanie uuid, którego komponenty nie robią

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — szybka decyzja, poprawka oczywista i wąska
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/timeline.ts:359
- **Detail**: Komentarz mówi, że strona ma renderować wiersze tylko dla identyfikatorów uuid. `TimelineView.astro` i `TimelineChart.astro` renderują każdy id bez sprawdzenia. Bezpieczne (Astro ucieka atrybuty, id z bazy to uuid), ale wiersz z innym id nigdy nie zostałby ukryty filtrem.
- **Fix**: Poprawić komentarz, żeby opisywał stan faktyczny (id z bazy są zawsze uuid; `buildFilterCss` pomija inne).
- **Decision**: FIXED — komentarz przy isUuid opisuje stan faktyczny (17.10.2026)

### F7 — Nieznane nasilenie z bazy daje zepsuty rysunek

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — szybka decyzja, poprawka oczywista i wąska
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/timeline-data.ts:36-43
- **Detail**: Wynik `rpc` rzutowany bez sprawdzenia (tak samo jak w `visit-summary-data.ts`). Nowa wartość nasilenia w przyszłej migracji dałaby `undefined` w `SEVERITY_RANK` i `NaN` w ścieżce SVG. Mało prawdopodobne — wartości pilnuje `check` w bazie.
- **Fix**: `SEVERITY_RANK[x] ?? 0` przy scalaniu dnia — albo pominąć, zgodnie z wzorcem rodzeństwa.
- **Decision**: FIXED — rankOf: SEVERITY_RANK jako Partial + ?? 0, nieznane nasilenie rysowane jak brak (17.10.2026)

### F8 — Nagłówki skaczą z h1 na h3

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — szybka decyzja, poprawka oczywista i wąska
- **Dimension**: Safety & Quality
- **Location**: src/components/timeline/TimelineChart.astro:151, 189; src/components/timeline/TimelineView.astro:275, 289
- **Detail**: „Leki” i „Objaw” to `<h3>`, a strona nie ma żadnego `<h2>`. Czytnik ekranu pokazuje lukę w strukturze nagłówków.
- **Fix**: Zmienić te cztery `<h3>` na `<h2>` (wygląd zostaje, klasy bez zmian).
- **Decision**: FIXED — cztery <h3> → <h2> w TimelineChart.astro i TimelineView.astro (17.10.2026)

### F9 — Pozostałe po merge'u: db push i krok 4.7

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — szybka decyzja, poprawka oczywista i wąska
- **Dimension**: Success Criteria
- **Location**: supabase/migrations/20261017120000_symptom_timeline.sql, plan.md:410
- **Detail**: Zmiana ma migrację — bez `npx supabase db push` po merge'u oś na produkcji pokaże błąd ładowania mimo zielonego CI (lesson „Po merge'u migracji wykonaj db push”). Krok 4.7 i `TODO` w `change.md` czekają na otwarcie osi na produkcji. Próg renderu ma zapas ok. 1 ms (mediana 6,04 ms wobec 7 ms); `render-bench.mjs` nie jest w CI, więc każda zmiana komponentów wymaga ręcznego biegu.
- **Fix**: Po merge'u: `db push`, sprawdzenie listy migracji, otwarcie osi, wpis wyniku 4.7 w `change.md`.
- **Decision**: FIXED — kroki po merge'u (db push, lista migracji, otwarcie osi, 4.7 i VoiceOver) w change.md (17.10.2026)
