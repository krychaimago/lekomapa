<!-- PLAN-REVIEW-REPORT -->

# Plan Review: Pary kolizji na grupach ATC i rejestr leków (rewizja 2026-09-24)

- **Plan**: context/changes/interaction-rules-seed/plan.md
- **Mode**: Deep
- **Date**: 2026-09-24
- **Verdict**: REVISE (lekki — kierunek rewizji dobry, poprawki punktowe) → SOUND po triage'u (wszystkie findingi FIXED)
- **Findings**: 0 critical, 3 warnings, 2 observations

Przegląd rewizji po pierwszym pomiarze (Faza 1 pkt 7–8, plik poprawek substancji). Poprzedni przegląd z 2026-09-23 (F1–F5, wszystkie FIXED) jest w historii gita.

## Verdicts

| Dimension             | Verdict |
| --------------------- | ------- |
| End-State Alignment   | PASS    |
| Lean Execution        | PASS    |
| Architectural Fitness | PASS    |
| Blind Spots           | WARNING |
| Plan Completeness     | WARNING |

## Grounding

6/6 paths ✓, 4/4 symbols ✓ (`medication_substances_medication_id_atc_code_key`, skrypt `test`, `fast-xml-parser`, `npm test` w CI), brief↔plan ✓, Progress 27/27 ✓.

Potwierdzone przez podagenta na `.cache/rpl/overall-6.0.0-2026-09-23.xml`:

- 63 z 65 produktów bez składu w zakresie ma odpowiednika o tej samej nazwie i tym samym zbiorze kodów; 0 pasuje wyłącznie po nazwie. Kryterium 1.7 jest osiągalne.
- `fillMissingComposition` wchodzi w `measure.mjs` między `:122` (`buildSubstanceIndex`) a `:123` (`deriveSubstanceCodes`). Słownik musi powstać przed uzupełnieniem, bo uzupełnienie zmienia `product.substances`.
- Klucz F-01 zadeklarowany w `20260922120000_medication_schema.sql:57-58`. Nic nie odwołuje się do jego nazwy. Założenie niepustego kodu tylko w `src/types.ts:45,83`.
- Venogel i 12 innych produktów wchodzą do zakresu wyłącznie przez wiersz `derived_ambiguous`. Zgodne z zasadą „więcej znaczników zamiast cichego braku”, nie jest findingiem.

## Findings

### F1 — Poprawka zatwierdzona po pierwszej migracji nie trafi do bazy

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Faza 1 pkt 8, Faza 4 pkt 1, Migration Notes
- **Detail**: Dogrywanie pomija produkty już wgrane (`on conflict (rpl_id) do nothing`), a skład dostają wyłącznie produkty wstawione w danej migracji. Poprawka bez `verified_on` przy pierwszym generowaniu, zatwierdzona później, nigdy nie zmieni wgranego produktu. To samo dotyczy poprawki remisu odkrytego po dodaniu nowej grupy. Plan nie mówi, jak taka poprawka ma trafić do bazy, a obecny kontrakt nie ma na to drogi.
- **Fix A ⭐ Recommended**: Generator odmawia pracy, gdy `pending` jest niepuste. Migration Notes: poprawka do wgranego produktu to osobna, ręcznie pisana migracja aktualizująca.
  - Strength: Mała zmiana. Pierwsza migracja nie zgubi po cichu poprawek, których autorka jeszcze nie sprawdziła.
  - Tradeoff: Każda późniejsza poprawka to ręczny SQL.
  - Confidence: HIGH — nie koliduje z regułą idempotencji.
  - Blind spot: Liczba późniejszych poprawek nieznana.
- **Fix B**: Generator pisze też migrację poprawek dla wgranych produktów: usuwa ich skład i wstawia go na nowo.
  - Strength: Jedna ścieżka dla wszystkich poprawek, bez ręcznego SQL.
  - Tradeoff: Więcej kodu i testów. Zmienia wiersze wspólne, na które S-02 może już wskazywać.
  - Confidence: MED — niesprawdzone przy kolejnych rozszerzeniach.
  - Blind spot: Wpływ na dane zapisane przez S-02 przy leku.
- **Decision**: FIXED (Fix A)

### F2 — Reguła walidacji odrzuci każdą poprawkę `product_composition`

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Faza 1 pkt 8, `loadCorrections`
- **Detail**: Błąd walidacji „`substance` nieobecna w produkcie” uderza w `product_composition`, które z definicji dotyczy produktu bez składu. `loadCorrections(path, products)` sprawdza produkty sprzed pkt 7, więc `product_substance_code` dla produktu z uzupełnionym składem też padnie. Pozycja (`position`) substancji dodanej poprawką nie jest ustalona.
- **Fix**: Regułę „substancja obecna w produkcie” stosować tylko do `product_substance_code`, na nazwach znormalizowanych po aliasach i po pkt 7. Dla `product_composition` wymagać produktu bez składu. Pozycja = kolejność wierszy produktu w pliku.
- **Decision**: FIXED

### F3 — Kryterium 3.5 nie da się sprawdzić automatycznie

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Faza 3 pkt 3, kryterium 3.5
- **Detail**: Pkt 3 dopuszcza „pozostawienie remisu z uzasadnieniem w `note`”, ale żaden rodzaj poprawki tego nie wyraża. Raport nie odróżni świadomie zostawionego remisu od pominiętego. Lista „luk wypisanych autorce” nie jest wejściem `measure.mjs`, więc 3.5 zależy od oceny, nie od komendy.
- **Fix**: Dodać rodzaj `confirmed_ambiguous` (`rpl_id`, substancja; zmienia tylko raport). Raport liczy luki bez wiersza poprawki i wypisuje je w sekcji „Luki bez źródła”. Kryterium 3.5: każda luka ma wiersz poprawki albo stoi w tej sekcji.
- **Decision**: FIXED

### F4 — Nierozstrzygnięte remisy przy uzupełnianiu składu

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Faza 1 pkt 7
- **Detail**: „Różny skład” odpowiedników nie mówi, czy porównanie idzie na nazwach surowych czy znormalizowanych. Zmierzone: Seroxat ma „Paroxetinum” i „Paroxetini hydrochloridum” (po normalizacji to samo); jeden odpowiednik Dexaku ma substancję wpisaną dwa razy. Remis „najczęstszego zapisu źródłowego” przy `atc_reverse` też nie jest rozstrzygnięty.
- **Fix**: Porównywać posortowane nazwy znormalizowane, bez duplikatów. Remis zapisu = pierwszy alfabetycznie.
- **Decision**: FIXED

### F5 — Lista 2 produktów bez składu w planie nie zgadza się z pomiarem

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Current State Analysis
- **Detail**: Plan podaje Aspirin Cardio i Clopidogrel Krka. Zmierzone: bez odpowiednika są Clopidogrel Krka (100290549) i Nurofen dla dzieci o smaku truskawkowym (100307830); Aspirin Cardio odpowiednika ma. Nurofen uzupełni się z kodu produktu. Clopidogrel nie: `B01AC04` wskazuje 3 nazwy (`clopidogrelum`, `clopidogrelum hydrosulfas`, `clopidogrelum besilate`), bo w `SALT_WORDS` brakuje tych słów. W całym słowniku 196 kodów wskazuje więcej niż jedną nazwę.
- **Fix**: Poprawić fakt w planie. Dopisać `hydrosulfas` i `besilate` do `SALT_WORDS`. Oczekiwany wynik kryterium 1.7 to wtedy 0.
- **Decision**: FIXED
