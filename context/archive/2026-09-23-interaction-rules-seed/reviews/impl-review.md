<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Pary kolizji na grupach ATC i rejestr leków

- **Plan**: context/changes/interaction-rules-seed/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3, 4
- **Date**: 2026-09-24
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 4 warnings, 5 observations

## Verification run during review

- `npm test`: 90/90 pass
- `npm run lint`, `npm run typecheck`: 0 błędów
- `npx supabase db reset` (lokalnie): czysto, trzy nowe migracje zastosowane
- `supabase/tests/rls_checks.sql`: CHECK 1–14 OK (3273 produkty, 4243 wiersze substancji, 24 pary)
- Ponowne wykonanie obu migracji danych na tej samej bazie: liczby wierszy bez zmian (3273 / 4243 / 24)
- `node scripts/rpl/pairs.mjs supabase/seed-data/interaction_pairs.csv`: accepted=24, skipped=0, errors=0
- CI na PR #30 (run 36053577850): `ci` i `smoke` zielone, 12 nowych kroków smoke raportuje `PASS`
- `npm run smoke` lokalnie nie był powtórzony (wymaga odsunięcia `.env`, `lessons.md`); dowodem jest bieg CI
- Pomiar: w pliku RPL są wyłącznie wartości `rodzajPreparatu` „ludzki” (20 258) i „weterynaryjny” (2 651)

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | WARNING |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | WARNING |
| Success Criteria    | WARNING |

## Findings

### F1 — Kryterium 4.7 odhaczone, choć w tym brzmieniu nie może się spełnić

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Success Criteria
- **Location**: context/changes/interaction-rules-seed/plan.md:676, :796
- **Detail**: Plan: „tymczasowe dodanie polityki `insert` dla `authenticated` na `interaction_pairs` sprawia, że `npm run smoke` pada”. Migracja schematu odbiera `insert` roli `authenticated`, więc sama polityka niczego nie odblokowuje. Zmierzone przy przeglądzie: z polityką `tmp_ins` insert jako `authenticated` dalej kończy się `permission denied for table interaction_pairs`, czyli smoke dalej daje PASS. Albo przy sprawdzeniu dodano też `grant`, albo odhaczenie nie ma pokrycia. Skutek: smoke dowodzi tylko warstwy uprawnień; warstwę RLS (brak polityki zapisu) dowodzi wyłącznie strukturalnie CHECK 9.
- **Fix**: Poprawić brzmienie 4.7 na „tymczasowy `grant insert` + polityka `insert`” i powtórzyć sprawdzenie lokalnie (przywrócić przed commitem).
  - Strength: Kryterium zaczyna mierzyć to, co deklaruje; zgodne z regułą „Bramka musi odróżnić blokadę od niewykonania”.
  - Tradeoff: Jeden bieg smoke lokalnie z odsuniętym `.env`.
  - Confidence: HIGH — zachowanie zmierzone na lokalnej bazie.
  - Blind spot: Nie wiadomo, jak sprawdzenie wykonano 24.09 — może autorka dodała też `grant` i wtedy wystarczy poprawić brzmienie.
- **Decision**: FIXED — brzmienie 4.7 poprawione w planie (sekcja fazy i `## Progress`). Powtórzone lokalnie 2026-09-26 z odsuniętym `.env` (zapisy trafiły do lokalnego `auth.users`): `grant` + polityka → krok „signed-in account cannot insert” FAIL (1 wiersz wstawiony), sama polityka → PASS (`42501`), bieg kontrolny → PASS. Stan bazy i `.env` przywrócone.

### F2 — Zmiana `registry_medication_id` i `composition_source` leku nie jest chroniona po oknie korekty

- **Severity**: ⚠️ WARNING
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20260924120000_registry_schema.sql:176-183; supabase/migrations/20260922120000_medication_schema.sql:370-392
- **Detail**: F-02 zamienia `medications.registry_medication_id` w prawdziwy klucz obcy, więc kolumna zaczyna mówić, skąd pochodzi skład leku. Tabela `medications` ma tylko `medications_guard_delete`, bez wyzwalacza na UPDATE. Po zamknięciu okna korekty właścicielka może przepiąć lek pod inny produkt rejestru albo przełączyć `composition_source` między `registry` i `leaflet`. Brak też kontroli spójności `composition_source = 'registry'` ⇔ `registry_medication_id is not null`. To druga postać luki z `lessons.md` („Ograniczenie na tabeli podrzędnej nie chroni…”: przepięcie pod innego rodzica to zmiana historii). Dziś nic nie pisze tej kolumny — S-02 będzie pierwsze.
- **Fix A**: Nowa migracja `medications_guard_core` (wzorzec F-01) blokująca zmianę `registry_medication_id`, `composition_source`, `product_name` po oknie korekty, plus kontrola spójności i sprawdzenie w `rls_checks.sql`.
  - Strength: Domyka ścieżkę zapisu, zanim S-02 zacznie ją używać; wzorzec gotowy w F-01.
  - Tradeoff: Wykracza poza plan F-02; kolejna migracja i sprawdzenia w tym PR.
  - Confidence: HIGH — ten sam mechanizm działa już na tabelach podrzędnych.
  - Blind spot: Nie ustalono, czy `product_name` ma należeć do rdzenia wpisu (PRD wymienia substancję, dawkę, datę).
- **Fix B ⭐ Recommended**: Zapisać jako wymaganie wejściowe S-02 (follow-up + wzmianka w roadmapie przy S-02), bez zmiany kodu w F-02.
  - Strength: Trzyma zakres F-02; decyzja o rdzeniu wpisu zapada tam, gdzie powstaje zapis tej kolumny.
  - Tradeoff: Ryzyko, że plan S-02 tego nie podejmie, jeśli follow-up zginie.
  - Confidence: MED — zależy od tego, czy `/10x-plan` dla S-02 przeczyta follow-up.
  - Blind spot: Żaden kod dziś nie pisze tej kolumny — sprawdzone tylko w `src/` i `scripts/`.
- **Decision**: FIXED via Fix B — wymaganie wejściowe S-02 w `follow-ups/review-fixes.md` i „Dług przejęty z F-02” przy S-02 w `roadmap.md`. Autorka potwierdziła regułę (`roadmap.md`, S-03): zmiana leku to zakończenie i nowy wpis, nie przepięcie.

### F3 — Filtr języka FR-012 ma luki i nie wymaga „może mieć związek”

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: scripts/rpl/pairs.mjs:21-34
- **Detail**: Lista zakazanych rdzeni jest dokładnie taka jak w planie, ale przepuszcza m.in. „prowadzi do krwawień”, „przyczynia się”, „skutkuje”, „jest przyczyną”, „zmniejszenie dawki”, „dostosuj dawkę”, „przestań”, „unikaj”. Nie ma też sprawdzenia pozytywnego, że opis zawiera „może mieć związek”. Obecne 24 opisy są poprawne (każdy: „mogą wchodzić w interakcję … może mieć związek z …”), bo autorka przeczytała każdy — filtr sam tego nie gwarantuje przy następnych parach.
- **Fix**: Dopisać rdzenie `prowadzi do`, `przyczyn`, `skutk`, `dawk`, `przestań`, `unika`, wymagać frazy „może mieć związek” w każdym przyjętym opisie, test na każdy nowy przypadek.
  - Strength: Reguła nr 1 z CLAUDE.md staje się sprawdzana, nie tylko czytana; obecne dane przechodzą (wszystkie mają frazę).
  - Tradeoff: Rdzeń `dawk` może dać fałszywy alarm na neutralnym opisie — do sprawdzenia na 24 wierszach.
  - Confidence: MED — lista zawsze będzie niepełna; pozytywny wymóg frazy jest mocniejszą częścią.
  - Blind spot: Nie sprawdzono, czy któryś z obecnych opisów zawiera „dawk”.
- **Decision**: FIXED + ACCEPTED-AS-RULE: Filtr języka wymaga formuły, nie tylko zakazuje słów — w `pairs.mjs` rdzenie `prowadz`, `przyczyn`, `skutk`, `dawk`, `przesta`, `unika` (szersze niż w propozycji) i wymóg `REQUIRED_WORDING` („może mieć związek”, powód `missing_required_wording`); testy dopisane. Zmierzone: 24 obecne opisy bez nowych rdzeni, wszystkie z frazą; `npm test` 99/99, walidacja par accepted=24.

### F4 — CHECK 11c nie może się wywrócić

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: supabase/tests/rls_checks.sql:569-577
- **Detail**: 11c grupuje po `(registry_product_id, position, atc_code)` — dokładnie kolumny ograniczenia `unique nulls not distinct` na `registry_substances`. Duplikat, którego szuka, wywróciłby migrację wcześniej, więc sprawdzenie niczego nie mierzy ponad ograniczenie. Przy okazji: CHECK 14 sprawdza klucz obcy tylko dla nieistniejącego produktu, nie `on delete restrict` (usunięcie produktu, na który wskazuje lek).
- **Fix**: Zastąpić 11c niezmiennikiem, którego ograniczenie nie pokrywa (np. wszystkie wiersze produktu mają jedno `composition_source`), i dodać do CHECK 14 przypadek usunięcia wskazywanego produktu → `foreign_key_violation`.
- **Decision**: FIXED — 11c sprawdza jedno źródło składu (`composition_source`, `composition_source_rpl_id`) na produkt; dopisane 14e: usunięcie produktu wskazywanego przez lek pada na `medications_registry_medication_id_fkey`. Lokalnie: CHECK 1–14 OK. Mutacje w transakcji z rollbackiem: mieszane źródło w jednym produkcie → 11c znajduje 1 produkt; FK z `on delete set null` → usunięcie przechodzi, więc 14e by padło.

### F5 — Nie da się pokazać, kto wpisał `verified_on`

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: supabase/seed-data/interaction_pairs.csv, supabase/seed-data/substance-corrections.csv
- **Detail**: Oba pliki pojawiają się pierwszy raz w 8a52fd4 (commit z Co-Authored-By Claude) z datą przy każdym wierszu. Nie ma commitu ze szkicem o pustym `verified_on`. Wszystkie 24 pary i 53 poprawki mają tę samą datę 2026-09-24. Plan zabrania agentowi wpisywania dat; 3.3 i 3.6 są odhaczone, ale historia gita tego nie dokumentuje.
- **Fix**: Autorka potwierdza, że daty wpisała sama; na przyszłość szkic agenta commitować osobno z pustym `verified_on`.
- **Decision**: FIXED — autorka potwierdziła 2026-09-26, że daty `verified_on` wpisała sama. Zasada na przyszłość (szkic agenta osobnym commitem z pustym `verified_on`) w `follow-ups/review-fixes.md`.

### F6 — Komentarz `atc_codes` mówi „dokładnie jak w źródle”, a kody są czyszczone

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: scripts/rpl/generate.mjs (`productAtcCodes`), supabase/migrations/20260924120000_registry_schema.sql (komentarz kolumny)
- **Detail**: Zapisywane są kody po czyszczeniu (wielkie litery, bez spacji, bez powtórzeń), a potem odrzucone surowe wartości. Pisownia i kolejność ze źródła nie są zachowane. Danych nic nie gubi — surowe wartości są w `source_payload` — ale komentarz dla S-02 jest nieścisły.
- **Fix**: Poprawić komentarz kolumny („kody po czyszczeniu + odrzucone wartości surowe; oryginał w `source_payload`”) — w migracji schematu, dopóki nie poszła na produkcję, inaczej nową migracją.
- **Decision**: FIXED — komentarz przy `atc_codes` w `20260924120000_registry_schema.sql` poprawiony w miejscu: to komentarz `--`, nie `comment on column`, więc nie zmienia schematu; migracja nie jest jeszcze w `main`.

### F7 — Nowy klucz unikalny na `medication_substances` i brak testów guardów po zmianie

- **Severity**: 💡 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20260924120000_registry_schema.sql:168-173
- **Detail**: Stary klucz `(medication_id, atc_code)` dawał jeden wiersz na kod w leku. Nowy `(medication_id, substance_name, atc_code)` przepuszcza ten sam kod dwa razy pod różną pisownią („Ibuprofenum” / „ibuprofenum”), więc S-02 może policzyć jedną substancję podwójnie. Guardy F-01 porównują `is distinct from`, więc zmiana kodu na pusty jest blokowana — ale żaden test tego nie sprawdza.
- **Fix**: Dodać do `rls_checks.sql` przypadek „UPDATE `atc_code` → null po oknie korekty pada”; decyzję o normalizacji nazw (albo częściowym indeksie `(medication_id, atc_code) where atc_code is not null`) przekazać do S-02.
  - Strength: Test utrwala założenie, na którym opiera się zmiana F-01; decyzja o kluczu zapada przy pierwszym zapisie.
  - Tradeoff: Częściowy indeks mógłby zablokować dwie różne substancje z tym samym kodem — trzeba to zmierzyć na rejestrze.
  - Confidence: MED — ryzyko podwójnego liczenia zależy od tego, jak S-02 zapisze nazwy.
  - Blind spot: Nie zmierzono, czy w rejestrze są produkty z dwiema różnymi substancjami o tym samym kodzie.
- **Decision**: FIXED — dopisane sprawdzenie 5g w `rls_checks.sql` (wyczyszczenie `atc_code` po oknie korekty pada na `P0001`); przechodzi lokalnie, a mutacja guardu na `<>` je wywraca. Decyzja o kluczu przekazana do S-02 (`follow-ups/review-fixes.md`, „Decyzja przejęta z F-02” w `roadmap.md`). Zmierzone: w rejestrze 0 produktów z dwiema różnymi substancjami o jednym kodzie.

### F8 — Generator i pobieranie: brakujące zabezpieczenia na granicach

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: scripts/rpl/parse.mjs:92-100, scripts/rpl/generate.mjs:40-53, :158-230, scripts/rpl/download.mjs:52-96
- **Detail**: Żaden z tych przypadków nie występuje w obecnym seedzie (sprawdzone), wszystkie wyjdą dopiero przy odświeżeniu RPL:
  - duplikat albo brak `rplId` nie zatrzymuje generatora (brak `id` daje napis `"undefined"`, duplikat cicho scala skład),
  - znak U+0000 lub samotny surogat w tekście przejdzie generator i wywróci migrację dopiero przy `db push`/CI,
  - pole skalarne z atrybutem XML zapisze się jako `"[object Object]"`,
  - `download.mjs`: plik tymczasowy zostaje po błędzie, brak limitu czasu, brak porównania z `Content-Length`; `--refresh` przypina manifest przed parsowaniem.
- **Fix**: Generator odmawia przy duplikacie/braku `rplId`, U+0000 i samotnych surogatach; pola skalarne przez `textOf`; `download.mjs` z `finally`, `AbortSignal.timeout` i sprawdzeniem długości.
- **Decision**: FIXED — `parse.mjs`: brak lub powtórzony `rplId` zatrzymuje parser, pola skalarne przez `textOf`; `generate.mjs`: `sqlString`/`sqlJsonb` odmawiają przy U+0000 i samotnym surogacie; `download.mjs`: `AbortSignal.timeout` (10 min), porównanie z `Content-Length`, usunięcie pliku tymczasowego po błędzie; `AbortSignal` dopisany do globali skryptów w `eslint.config.js`. Nie ruszone: `--refresh` dalej przypina manifest przed parsowaniem. Testy 103/103; migracje wygenerowane ponownie z przypiętego RPL są bajt w bajt identyczne z commitowanymi.

### F9 — Nagłówek `rls_checks.sql` przetłumaczony częściowo

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: supabase/tests/rls_checks.sql:1
- **Detail**: Linia 1 (tekst F-01) zmieniona z polskiego na angielski, a dalsza część nagłówka F-01 (od linii 6) zostaje po polsku. CLAUDE.md: tłumaczenie kodu F-01 to „osobna decyzja, nie przy okazji”. Plan kazał tylko, żeby nagłówek przestał mówić wyłącznie o schemacie leków — dopisane linie 2–4 to spełniają.
- **Fix**: Zostawić angielskie linie 2–4, a tłumaczenie reszty nagłówka F-01 odłożyć do osobnej zmiany (albo przywrócić linię 1 po polsku).
- **Decision**: FIXED — linie 1–4 zostają po angielsku; tłumaczenie reszty nagłówka F-01 przekazane do osobnej zmiany (`follow-ups/review-fixes.md`).
