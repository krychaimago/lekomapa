---
date: 2026-10-04T17:30:00+02:00
researcher: Claude (Opus 5.5) dla Krycha Imago
git_commit: c974d8f
branch: chore/mutation-gaps-medications-fr012
repository: krychaimago/lekomapa
topic: "Które przeżyłe mutanty w medications.ts i pairs.mjs wymagają testu, a które można świadomie pominąć"
tags: [research, mutation-testing, stryker, medications, fr012, pairs]
status: complete
last_updated: 2026-10-04
last_updated_by: Claude (Opus 5.5)
---

# Research: przeżyłe mutanty — `medications.ts` i filtr FR-012 (`pairs.mjs`)

**Date**: 2026-10-04T17:30:00+02:00
**Researcher**: Claude (Opus 5.5) dla Krycha Imago
**Git Commit**: c974d8f
**Branch**: chore/mutation-gaps-medications-fr012
**Repository**: krychaimago/lekomapa

## Research Question

Z `change.md`: przejrzeć przeżyłe mutanty w `src/lib/services/medications.ts` (39) i `scripts/rpl/pairs.mjs` (41), rozdzielić na te, które wymagają testu, i te pomijane świadomie z zapisanym powodem. Oczekiwane wartości z wymagań, nie z kodu (test-plan §6.1).

## Summary

- Źródło: raport `reports/mutation/mutation.html` (4.10.2026 15:53). Kod obu plików w raporcie jest bajt w bajt równy plikom na `c974d8f` (sprawdzone porównaniem `source` z dyskiem).
- **`medications.ts`, 39 przeżyłych + 1 timeout** (timeout #633 Stryker liczy jako wykryty):
  - 22 to jedna przyczyna: `registryCompositionNames` (`medications.ts:63-77`) nie ma żadnego testu. 21 do zabicia, 1 (#594) do pominięcia.
  - 3: `formatIsoDate` (`:80-83`) bez testu. Wszystkie do zabicia.
  - 11: `similarSubstances` i pomocnicze. 7 do zabicia, 4 równoważne.
  - 2: `groupRegistryResults`. 1 do zabicia (kolacja polska), 1 równoważny.
  - 1: `todayInWarsaw` — test zależy od strefy czasowej maszyny (szczegóły niżej).
  - Razem: **33 do zabicia, 6 do pominięcia**.
- **`pairs.mjs`, 41 przeżyłych**:
  - 21 w `main()` (CLI, `pairs.mjs:189-212`), 9 to treść komunikatów, 7 równoważnych lub praktycznie równoważnych.
  - Tylko 1 dotyczy samego filtra FR-012: zwijanie białych znaków (#56). Do zabicia.
  - 2 w obsłudze błędów `loadPairs`, 1 w przycinaniu nagłówka — niska wartość.
  - Razem: **1 obowiązkowy, 2 opcjonalne (#79, #206), 17 do pominięcia, 21 w CLI — decyzja autorki** (patrz Open Questions).
- Dwa znaleziska poza samą listą:
  - Mutant `"pl"→""` w `localeCompare` przeżywa przez kolejność testów, nie przez brak znaczenia (sekcja „Pułapka V8”).
  - Test `todayInWarsaw` przechodzi z usuniętą strefą `Europe/Warsaw`, bo maszyna autorki sama jest w tej strefie.

## Detailed Findings

### Skąd lista

- Konfiguracja: `stryker.config.json` — `testRunner: "command"`, `npm test --silent`, `coverageAnalysis: "off"`, raport HTML w `reports/mutation/mutation.html`.
- Statusy z raportu: `medications.ts` 104 mutanty (64 Killed, 39 Survived, 1 Timeout); `pairs.mjs` 233 (192 Killed, 41 Survived).
- Raport nie zapisuje `statusReason` dla przeżyłych — przyczyny poniżej ustalone z kodu i odtworzeniem na kopii w katalogu tymczasowym.

### `medications.ts` — `registryCompositionNames` (22 mutanty, #586–#607)

- Brak testu: `scripts/medications/medications.test.mjs:7-13` nie importuje funkcji. Mutant #588 (`[...rows]` → `[]`) przeżywa — dowód, że nic jej nie woła w testach.
- Po co jest: skład widoczny przy wyborze wariantu w formularzu (`src/pages/leki/nowy.astro:76`, render `AddMedicationForm.tsx:55-56`). Komentarz `medications.ts:59-62`: odzwierciedla deduplikację SQL `add_medication_from_registry`, „so the composition on screen is the one that gets saved”.
- Reguła SQL (`supabase/migrations/20260930120000_medication_write_and_interactions.sql:192-207`): jeden wiersz na kod ATC, pierwszy wg `position`, potem `substance_name`; wiersze bez kodu — distinct po nazwie.
- Wymaganie: FR-006 „Szczegóły leku pokazują też jego pełny skład” (`prd.md:129`); plan S-02 nazywa deduplikację „obowiązkową, nie kosmetyczną” (`context/archive/2026-09-29-add-medication-with-interaction-flag/plan.md:93-97`). Lesson „Niepełny zbiór reguł…” — pokazany skład nie może być węższy niż zapisany.
- Zbiór nazw TS = zbiór zapisany przez SQL dla każdego wejścia dopuszczalnego przez schemat (ograniczenie `unique nulls not distinct (registry_product_id, position, atc_code)`, `registry_schema.sql:81-82`). Różnią się kolejnością i duplikatami nazw — tylko na ekranie.
- Grupy przypadków, które zabijają mutanty (wejścia wzorowane na produktach z planu S-02 `plan.md:37-39`):
  - wiersze podane nie w kolejności `position` → zabija #587, #588 (częściowo), #589, #590, #591, #592, #593 (to przykład z `change.md`),
  - ten sam kod na dwóch pozycjach z różnymi nazwami (wzór: Dexak M01AE17, Coroswera C10AA07 — forma soli) → zostaje nazwa z niższej `position`: #596–#603,
  - wiersz bez kodu obok wierszy z kodem → zostaje: #597, #598, #599,
  - ta sama nazwa z dwoma kodami → pokazana raz: #604–#607,
  - pusta lista → `[]`: #595 padnie już przy dowolnym teście.
- **#594** (`"pl"` → `""` w rozstrzyganiu remisu po nazwie): remis na tej samej `position` jest możliwy tylko dla pary „wiersz z kodem + wiersz bez kodu” (wynika z ograniczenia schematu wyżej) i zmienia wyłącznie kolejność nazw na ekranie. Propozycja: pominąć z tym powodem.

### `medications.ts` — `formatIsoDate` (3 mutanty, #608–#610)

- Bez testu. Używana w liście leków (`src/pages/leki/index.astro:118`) i szczegółach (`src/pages/leki/[id].astro:162`).
- Format `DD.MM.YYYY` nie występuje w PRD ani w planie S-02 — jedynym źródłem jest komentarz `medications.ts:79`. Oczekiwanej wartości nie da się wziąć z wymagań; to decyzja autorki (Open Questions).

### `medications.ts` — `similarSubstances` (11 mutantów)

Wymaganie: plan S-02 `plan.md:498` — wspólny przedrostek ≥ 4 znaki po złożeniu wielkości liter i ogonków, najwyżej 5. PRD tego nie ustala.

| Mutant                                        | Co zmienia                                                | Werdykt                                                                                                    |
| --------------------------------------------- | --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| #617 `replace(/\p{M}/gu, "")` → wstawia tekst | ogonek przed 4. znakiem psuje przedrostek                 | zabić: „dićlofenac” musi znaleźć „diclofenacum”; obecny test ma ogonek dopiero na 6. znaku („IBUPRÓFEN”)   |
| #623, #625, #628 warunki pętli → `true`       | pętla bez końca przy identycznych nazwach                 | zabić: wpis równy pozycji słownika („ibuprofenum”) — Stryker liczy timeout jako wykrycie                   |
| #624 `&&`→`\|\|`, #626, #629 `<`→`<=`         | brak różnicy: `undefined` nigdy nie równa się znakowi     | równoważne, pominąć                                                                                        |
| #636 `folded.length < 4` → `false`            | brak różnicy: krótszy wpis i tak nie ma przedrostka ≥ 4   | równoważny (osłona to skrót), pominąć                                                                      |
| #637 `<` → `<=`                               | wpis o długości dokładnie 4 przestaje cokolwiek znajdować | zabić: „ibup” musi znaleźć „ibuprofenum” (granica z `plan.md:498`); obecne „ibux” ma wspólne tylko 3 znaki |
| #643, #644 usunięcie `seen`                   | nazwa podana dwa razy wraca dwa razy                      | zabić, o ile autorka uzna „każda nazwa raz” za wymaganie — jest tylko w komentarzu `medications.ts:102`    |

### `medications.ts` — `groupRegistryResults` i `todayInWarsaw`

- **#564** `toLocaleLowerCase` → `toLocaleUpperCase` w kluczu grupy: równoważny dla polskich nazw (klucz porównywany tylko sam ze sobą). Pominąć.
- **#574** `"pl"` → `""` w sortowaniu: zabić testem z polską literą. Zmierzone na Node v24.13.0: `["Lc","Łb"]` z `"pl"` daje `Lc, Łb`, z domyślną kolacją `Łb, Lc`. Wymaganie „alfabetycznie” jest w `plan.md:304`; „polska kolacja” tylko w komentarzu `medications.ts:24`.
- **#581** opcje `Intl.DateTimeFormat` → `{}`: bez `timeZone` funkcja zwraca datę w strefie maszyny. Strefa maszyny autorki to `Europe/Warsaw` (zmierzone), więc test `medications.test.mjs:58-63` przechodzi. Pod `TZ=UTC` ten sam mutant daje `2026-09-30` zamiast `2026-10-01` (zmierzone) — czyli w CI na GitHub test by go zabił, lokalnie nie. Naprawa po stronie testu: wymusić strefę inną niż Warszawa, np. `TZ=UTC` w skrypcie albo w samym teście. Wymaganie: `plan.md:306`, `plan-review.md:61`.

### Pułapka V8: `localeCompare(x, "")`

- W czystym procesie `"a".localeCompare("b", "")` rzuca `RangeError: Incorrect locale information provided`.
- Po dowolnym wcześniejszym `localeCompare` bez locale ten sam kod przestaje rzucać i porównuje kolacją domyślną (zmierzone, Node v24.13.0).
- `orderMedications` (pierwszy test w pliku) woła `localeCompare` bez locale, więc mutanty #574 i #594 dostają cichą kolację domyślną zamiast wyjątku. Odtworzone na kopii: zmutowany plik przechodzi 10/10 testów, a to samo wywołanie w izolacji rzuca.
- Wniosek dla planu: test na #574 musi rozróżniać kolację polską od domyślnej (para z „Ł”/„Ś”), a nie liczyć na wyjątek.

### `pairs.mjs` (41 mutantów)

| Grupa                                                                             | Mutanty                                                            | Werdykt                                                                                                                                                                                                                                                                          |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Zwijanie białych znaków `/\s+/` → `/\s/` (`:72`)                                  | #56                                                                | **zabić** — jedyny przeżyły dotykający filtra FR-012. „zmień␣␣dawkę” (podwójna spacja) albo podział wiersza w wielowyrazowym rdzeniu (`pairs.mjs:31-44`, np. „nie łącz”) przechodzi filtr. Intencja zapisana w komentarzu `:69-70`. Zdanie do korpusu `scripts/fr012/corpus.mjs` |
| `/\s+/g, " "` → `""`                                                              | #58                                                                | praktycznie równoważny (tekst i rdzeń zwijane tak samo; różnica tylko przy sztucznym sklejeniu wyrazów) — pominąć                                                                                                                                                                |
| `toLocaleLowerCase` → `toLocaleUpperCase` (`:72`)                                 | #53                                                                | równoważny (tekst i rdzeń składane tą samą funkcją) — pominąć                                                                                                                                                                                                                    |
| Kotwice `ISO_DATE` (`:67`), `!ISO_DATE.test` → `false` (`:81`)                    | #44, #45, #65                                                      | osłonięte sprawdzeniem w obie strony `toISOString().slice(0,10) === value` (`:83`). Zmierzone: `12026-01-01`, `2026-01-01x`, `2026-1-1` dają `NaN`. #65 przepuściłby jedynie `+010000-01` (rok rozszerzony) — pominąć jako praktycznie równoważne                                |
| `?? ""` (`:96`)                                                                   | #99                                                                | równoważny — brakująca kolumna i tak daje `column_count` przez `extraFields` (`:112`)                                                                                                                                                                                            |
| `<=` → `<` przy kolejności grup (`:156`)                                          | #176                                                               | równoważny przy `groupA === groupB`                                                                                                                                                                                                                                              |
| Treść komunikatów (`:92`, `:113`, `:123`, `:124`, `:129`, `:133`, `:136`, `:170`) | #89, #93, #109, #129, #136, #145, #152, #163, #198                 | pominąć — testy sprawdzają stabilny kod `reason` (`pairs.mjs:142-143`), wzorzec „Nazwany wynik” z test-plan §6.1                                                                                                                                                                 |
| `name.trim()` w nagłówku (`:90`)                                                  | #79                                                                | opcjonalnie: nagłówek z odstępem; plik pisze autorka                                                                                                                                                                                                                             |
| `error.code === "ENOENT"` → `true`, `{ cause }` → `{}` (`:183`)                   | #206, #212                                                         | #206 opcjonalnie (inny błąd, np. katalog zamiast pliku, ma wyjść bez zmiany); #212 pominąć                                                                                                                                                                                       |
| `main()` — CLI (`:189-212`)                                                       | #213–#217, #219–#224, #226, #227, #229, #231, #233–#237, #239 (21) | decyzja autorki: CLI uruchamiane ręcznie wg `README.md:128`. Kod wyjścia 1 przy błędach (#234–#237) jest jedyną częścią z realnym skutkiem                                                                                                                                       |

## Code References

- `src/lib/services/medications.ts:63-77` — `registryCompositionNames`, 22 przeżyłe, zero testów
- `src/lib/services/medications.ts:80-83` — `formatIsoDate`, zero testów
- `src/lib/services/medications.ts:90-118` — `foldForComparison`, `sharedPrefixLength`, `similarSubstances`
- `src/lib/services/medications.ts:43-51` — `todayInWarsaw`
- `scripts/medications/medications.test.mjs:58-63` — test strefy zależny od strefy maszyny
- `scripts/rpl/pairs.mjs:71-73` — `foldText`, mutant #56
- `scripts/rpl/pairs.mjs:189-212` — `main()`, 21 przeżyłych
- `supabase/migrations/20260930120000_medication_write_and_interactions.sql:192-207` — deduplikacja składu w SQL
- `supabase/tests/medication_interaction_checks.sql:100-190` — testy SQL deduplikacji (Ibuprofen Zentiva, Sartesta); brak przypadku formy soli (Dexak, Coroswera)

## Architecture Insights

- Testy jednostkowe ładują `medications.ts` bezpośrednio przez `node --experimental-strip-types` (`medications.ts:1-2`) — nowe testy idą do `scripts/medications/medications.test.mjs`, bez nowej infrastruktury.
- `stryker.config.json` używa `coverageAnalysis: "off"` i runnera `command`: każdy mutant uruchamia cały `npm test`. Efekty uboczne między testami (pułapka V8) przenoszą się między plikami testów.
- Filtr FR-012 ma wzorzec korpusu zdań (`scripts/fr012/corpus.mjs`, lesson „Filtr języka wymaga formuły…”): przypadek dla #56 pasuje tam, nie jako pętla po `FORBIDDEN_WORDS`.

## Historical Context (from prior changes)

- `context/archive/2026-09-29-add-medication-with-interaction-flag/plan.md:303-317` — kontrakty funkcji i wymagane testy S-02; `registryCompositionNames` i `formatIsoDate` nie mają tam kontraktu ani testu.
- `context/archive/2026-09-29-add-medication-with-interaction-flag/plan.md:93-97` i `reviews/plan-review.md:27` — deduplikacja składu obowiązkowa (4 produkty z dublem kodu).
- `context/archive/2026-09-29-add-medication-with-interaction-flag/reviews/impl-review.md:94-110` (F5) — forma soli znika ze składu; naprawa tylko w komentarzach, zachowanie bez zmian.
- `context/foundation/test-plan.md:110` — Stryker jako bramka opcjonalna, pierwszy pomiar 81,70 %.
- Twierdzenie z `change.md` „`a.position - b.position` → `+` nie pada” — potwierdzone (#593); przyczyna: funkcja w ogóle nie ma testu, nie tylko słaba asercja.

## Related Research

Nie dotyczy — brak wcześniejszego research.md o testach mutacyjnych.

## Open Questions

1. **`main()` w `pairs.mjs` (21 mutantów)** — warianty:
   - najszybszy: pominąć całość z powodem „CLI ręczne, wynik czyta człowiek”,
   - optymalny: jeden test uruchamiający skrypt jako proces na pliku z błędem i sprawdzający kod wyjścia 1 (zabija #234–#237, prawdopodobnie #216, #239); resztę pominąć,
   - najlepszy: testy całego wyjścia CLI — koszt nieproporcjonalny do ryzyka.
   - Przesądza: czy kod wyjścia skryptu walidacji jest kontraktem.
2. **Format `DD.MM.YYYY`** — brak w PRD i planie. Czy autorka zatwierdza go jako wymaganie (wtedy test z wartością od niej), czy zostaje decyzją kodu?
3. **„Każda nazwa raz” w podpowiedziach** (#643, #644) i **kolacja polska** w liście nazw (#574) — oba tylko w komentarzach. Wymagają potwierdzenia jako oczekiwanie, zanim test je utrwali.
4. **Strefa w teście `todayInWarsaw`** — wymusić `TZ` w całym `npm test` czy tylko w tym pliku? Całość dotyka też innych testów zależnych od daty (niesprawdzone).
5. **Niesprawdzone**: czy osadzenie PostgREST `registry_substances` w `nowy.astro:61-66` może zostać ucięte przez `max_rows` — wtedy pokazany skład byłby krótszy niż zapisany niezależnie od testów TS.
