# Strażnik języka FR-012 — plan wdrożenia

## Overview

Faza 3 planu testów (`context/foundation/test-plan.md` §3), ryzyko #2: komunikat o kolizji stwierdza przyczynę, sugeruje odstawienie lub zmianę dawki albo pozwala odczytać brak znacznika jako „bezpieczne”. Plan dowodzi zgodności z FR-012 na dwóch warstwach, które dziś istnieją — walidatorze opisów par i treści w bazie — a dla tekstów, które powstaną dopiero w S-02 (nota poglądowa, zdanie o braku ostrzeżenia), zostawia kontrakt z gotowym korpusem testowym.

Zasada nadrzędna: oczekiwane frazy biorą się z PRD, nie z kodu walidatora.

## Current State Analysis

Pełne ugruntowanie: `context/changes/testing-language-guard/research.md`. Najważniejsze:

- Jedyny dzisiejszy tekst o kolizji to `interaction_pairs.description` (24 wiersze). Źródło: `supabase/seed-data/interaction_pairs.csv` → generator → migracja `20260924130100_interaction_pairs_seed.sql`. `src/` tej tabeli nie czyta.
- Walidator `scripts/rpl/pairs.mjs` wymaga frazy „może mieć związek” (`:44`, `:111-112`) i odrzuca 18 rdzeni (`:21-40`), ale sprawdza wyłącznie CSV. Migracji i bazy nie pilnuje nic poza `check (btrim(description) <> '')` (`20260924120000_registry_schema.sql:112-114`).
- Pomiar z researchu: 14 zdań łamiących FR-012 przechodzi przez `forbiddenWordsIn` — z dopisaną frazą walidator przyjąłby każde.
- `scripts/rpl/pairs.test.mjs:160-168` generuje testy pętlą z `FORBIDDEN_WORDS` — wyrocznia skopiowana z kodu, wzorzec zakazany przez plan testów (§2, ryzyko #2).
- Nota poglądowa i zdanie „brak ostrzeżenia ≠ bezpieczne” nie istnieją w kodzie; powstaną w S-02 (`context/foundation/roadmap.md`, S-02, status `ready`).
- Bramka SQL (`scripts/db-checks.mjs`, `npm run db:check`) biegnie w CI i ma wzorzec próbek, które muszą ją wywrócić (`test-plan.md` §6.2, `.github/workflows/ci.yml:45-90`).

## Desired End State

- Wspólny moduł korpusu FR-012 zawiera zdania zakazane (w klasach wyprowadzonych z PRD) i zdania poprawne; nie importuje niczego z walidatora.
- `npm test` dowodzi: każde zdanie zakazane, także z dopisaną frazą „może mieć związek”, zostaje odrzucone przez walidator; każde zdanie poprawne i każdy z 24 obecnych opisów przechodzi.
- 14 przypadków z researchu (§3) jest odrzucanych.
- `npm run db:check` dowodzi, że każdy opis w `interaction_pairs` po migracjach zawiera frazę; próbka w CI psuje opis i wywraca bramkę z nazwanym komunikatem.
- Roadmapa S-02 niesie kontrakt: teksty noty i zdania o bezpieczeństwie w module copy, test z korpusem, krok smoke.
- Lekcja „Filtr języka wymaga formuły” opisuje aktualny kod.

Weryfikacja: `npm test`, `npm run lint`, `npm run db:check` lokalnie i zielony CI (job `ci` i `smoke` z próbką).

### Key Discoveries:

- `pairs.mjs:50-52` — `foldText`: NFC, `toLocaleLowerCase("pl")`, zwinięte białe znaki; rdzenie dopasowywane jako podciąg (`:54-57`).
- Rdzeń `dawk` (`:37`) blokuje każde użycie słowa „dawka” — świadomy tradeoff z F3 impl-review. Nowe rdzenie niosą to samo ryzyko fałszywych alarmów.
- Wszystkie 24 opisy mają szablon „X i Y mogą wchodzić w interakcję. Jednoczesne przyjmowanie może mieć związek z …”. Zmierzone `grep`: żaden z kandydatów na nowe rdzenie (`wywoł`, `bezpieczn`, `przerw`, `rezygn`, `ogranicz`, `wynik`, `ryzyk`, `podejrz`, `najbardziej`, `zmniejsz`, `zamie`, `nie bierz`, `odpowiada za`) w nich nie występuje.
- Lokalny Postgres (`supabase_db_10x-astro-starter`): `datctype = en_US.UTF-8`, `lower('MOŻE MIEĆ ZWIĄZEK')` = „może mieć związek” — zmierzone 2026-09-29.
- `npm test` ma `--experimental-strip-types`, więc test w `scripts/` może w S-02 zaimportować moduł `.ts` z `src/lib/copy/`.

## What We're NOT Doing

- Warunek `check` na kolumnie `description` — odrzucone; zostaje sprawdzenie w bramce SQL, bez zmiany schematu.
- Szablon zdań wymuszany przez walidator — odrzucone; zostaje wymóg frazy + rozszerzona lista rdzeni.
- Moduł copy noty i zdania o bezpieczeństwie oraz ich brzmienie — należy do S-02.
- Krok smoke — nie ma UI, które mógłby sprawdzić; przechodzi do S-02 jako część kontraktu.
- Test kolejności leków (zakaz rankingu jako własność listy w UI) — należy do S-02; faza 3 łapie tylko słownictwo rankingowe w tekście.
- Powielanie listy rdzeni w SQL — druga kopia wyroczni z kodu.
- Nowa migracja z opisami — CSV i migracja się nie zmieniają.
- Tłumaczenie polskich komentarzy F-01 (`src/types.ts`) — osobna decyzja wg `CLAUDE.md`.

## Implementation Approach

Najpierw wyrocznia, potem filtr: korpus powstaje z PRD, test na korpusie jest czerwony dla 14 przypadków, a dopiero wtedy walidator dostaje brakujące rdzenie. Korpus zdań poprawnych pilnuje, że nowe rdzenie nie odrzucą tekstu zgodnego z FR-012. Druga warstwa (SQL) patrzy na to, co faktycznie leży w bazie — jedyne wejście tekstu do tabeli to migracje, więc stan po `db reset` jest kompletny dla dzisiejszego źródła. Trzecia faza utrwala kontrakt dla S-02 i porządkuje dokumenty.

## Critical Implementation Details

- **Kolejność w fazie 1**: test korpusu musi być czerwony przed zmianą `FORBIDDEN_WORDS` — zapisz w commicie lub raporcie fazy, które zdania padły przed rozszerzeniem. Test, który był zielony od początku, niczego nie zmierzył (lekcja „Bramka musi odróżnić blokadę od niewykonania”).
- **Oczekiwany powód odrzucenia**: zdanie zakazane z frazą musi dać `reason: "forbidden_word"`, nie dowolny błąd. Zdanie bez frazy dałoby `missing_required_wording` i przeszłoby test z niewłaściwego powodu.
- **Fraza w SQL normalizowana jak w walidatorze**: `foldText` (`pairs.mjs:50-52`) robi NFC, małe litery i zwija białe znaki, więc przyjmuje „Może mieć związek” na początku zdania i „może mieć\nzwiązek”. Sprawdzenie SQL porównuje na `regexp_replace(lower(normalize(description, NFC)), '\s+', ' ', 'g')`. Inaczej poprawny CSV dałby czerwoną bramkę.

## Phase 1: Korpus FR-012 i wzmocniony filtr

### Overview

Wyrocznia z PRD jako wspólny moduł danych, test walidatora na tej wyroczni, zamiana pętli z `FORBIDDEN_WORDS` na korpus i rozszerzenie listy rdzeni tak, by 14 przypadków z researchu było odrzucanych.

### Changes Required:

#### 1. Korpus FR-012

**File**: `scripts/fr012/corpus.mjs` (nowy)

**Intent**: Jedno miejsce z oczekiwanymi frazami wyprowadzonymi z PRD, niezależne od walidatora, żeby usunięcie rdzenia z kodu nie usuwało przypadku testowego. S-02 zaimportuje ten sam moduł do testu swoich tekstów.

**Contract**: Moduł eksportuje wyłącznie dane, bez importów:

- `REQUIRED_PHRASE` — literał „może mieć związek” (`prd.md:144`), nie import `REQUIRED_WORDING`.
- `FORBIDDEN_SENTENCES` — obiekt klas → lista zdań. Klasy z odnośnikiem do PRD w komentarzu: `cause` (FR-012, `prd.md:144`), `advice` (odstawienie/zmiana dawki/zamiana leku, FR-012), `safety` (ocena bezpieczeństwa, `prd.md:49`, `:67`), `ranking` (porządkowanie wg podejrzenia, FR-012, `:66`), `ban` (zakaz łączenia, US-01 `:66`). Każda klasa ma co najmniej dwa zdania; łącznie zawierają 14 zdań z `research.md` §3 oraz 6 zdań z `pairs.test.mjs:195-201`.
- `ALLOWED_SENTENCES` — zdania zgodne z FR-012, co najmniej jedno na każdy nowy rdzeń: realne neutralne użycie tego słowa, także spoza 24 obecnych opisów (np. „może mieć związek ze zwiększonym ryzykiem krwawień” dla `ryzyk`, „…ze zmniejszoną skutecznością leku” dla `zmniejsz`, „…z wynikami badań krzepliwości” dla `wynik`, „…z ograniczonym działaniem” dla `ogranicz`). Każde zawiera `REQUIRED_PHRASE`.
- `ACCEPTED_FALSE_POSITIVES` — zdania zgodne z FR-012, które walidator świadomie odrzuca: każde z rdzeniem, który je łapie, i jednym zdaniem uzasadnienia (wzór: `dawk`). Trafia tu zdanie z `ALLOWED_SENTENCES` tylko wtedy, gdy rdzenia nie da się zawęzić bez przepuszczenia zdania zakazanego.

#### 2. Test walidatora na korpusie

**File**: `scripts/rpl/pairs-fr012.test.mjs` (nowy)

**Intent**: Dowód, że walidator odrzuca każdą klasę zakazaną niezależnie od obecności frazy i przepuszcza tekst poprawny.

**Contract**: Testy `node:test`, nazwy po angielsku:

- każde zdanie z `FORBIDDEN_SENTENCES` połączone z `REQUIRED_PHRASE` w jednym opisie → dokładnie jeden błąd `forbidden_word`, zero `accepted`; nazwa testu zawiera klasę i zdanie,
- opis dwuzdaniowy: pierwsze zdanie z frazą, drugie przyczynowe → `forbidden_word`,
- każde zdanie z `ALLOWED_SENTENCES` → zero błędów,
- każde zdanie z `ACCEPTED_FALSE_POSITIVES` → `forbidden_word` z rdzeniem zapisanym przy zdaniu (koszt jest zmierzony, nie domniemany),
- moduł korpusu nie importuje z `scripts/rpl/` (odczyt źródła pliku, brak `import`).

#### 3. Stary test pętli

**File**: `scripts/rpl/pairs.test.mjs`

**Intent**: Usunąć wyrocznię skopiowaną z kodu; jej rolę przejmuje korpus.

**Contract**: Usunięta pętla `for (const word of FORBIDDEN_WORDS)` (`:160-168`) i test „wording the first stem list let through is caught” (`:193-214`, zdania przeniesione do korpusu). Zostaje test przypinający listę dosłownie (`:170-191`), zaktualizowany o nowe rdzenie, oraz test „the pairs file in the repository loads without errors”. Import `FORBIDDEN_WORDS` zostaje tylko dla testu przypinającego.

#### 4. Rozszerzenie listy rdzeni

**File**: `scripts/rpl/pairs.mjs`

**Intent**: Walidator odrzuca każde zdanie z korpusu zakazanego, nie odrzucając korpusu poprawnego ani 24 obecnych opisów.

**Contract**: `FORBIDDEN_WORDS` rozszerzone minimalnie — każdy nowy rdzeń uzasadniony co najmniej jednym zdaniem z korpusu. Kandydaci z pomiaru: `wywoł` (zastępuje `wywołuj`), `przerw` (zastępuje `przerwij`), `bezpieczn` (zastępuje `niebezpieczn`), `odpowiada za`, `wynik`, `ryzyk`, `nie bierz`, `rezygn`, `zmniejsz` (zastępuje `zmniejsz daw`), `ogranicz`, `zamień`/`zamien`, `najbardziej`, `podejrz`. Ostateczna lista wynika z testu, nie z tej listy. Rdzeń, który odrzuca zdanie z `ALLOWED_SENTENCES`, zostaje zawężony do składni zakazanej (np. `zwiększa ryzyk` zamiast `ryzyk`, `zmniejsz daw` zamiast `zmniejsz`) albo zdanie przechodzi do `ACCEPTED_FALSE_POSITIVES` z uzasadnieniem. Komentarz przy liście (`:18-20`) mówi, że przypadki testowe są w `scripts/fr012/corpus.mjs` i że każdy nowy rdzeń może blokować neutralne słowo (jak `dawk`).

### Success Criteria:

#### Automated Verification:

- Test korpusu uruchomiony przed zmianą `FORBIDDEN_WORDS` pada na co najmniej 14 zdaniach z `research.md` §3: `node --test scripts/rpl/pairs-fr012.test.mjs`
- Po zmianie: `npm test` przechodzi w całości
- `npm run lint` bez błędów
- CSV z repo przechodzi walidator: `node scripts/rpl/pairs.mjs supabase/seed-data/interaction_pairs.csv` daje `errors=0` i `accepted=24`

#### Manual Verification:

- Autorka czyta korpus zdań zakazanych i potwierdza, że każde zdanie łamie FR-012 w swojej klasie, a każde zdanie poprawne jest zgodne z FR-012
- Autorka przegląda listę nowych rdzeni pod kątem słów, których sama użyłaby w neutralnym opisie

**Implementation Note**: Po zielonej weryfikacji automatycznej zatrzymaj się na potwierdzenie weryfikacji manualnej przed fazą 2.

---

## Phase 2: Bramka SQL na treści w bazie

### Overview

Sprawdzenie SQL na stanie po migracjach: każdy opis w `interaction_pairs` zawiera frazę. Próbka w CI dowodzi, że bramka potrafi zrobić się czerwona.

### Changes Required:

#### 1. Plik sprawdzeń

**File**: `supabase/tests/fr012_language_checks.sql` (nowy)

**Intent**: Pilnuje tego, co faktycznie czyta aplikacja — łapie ręczną edycję migracji i przyszły `update` z pominięciem generatora.

**Contract**: Szkielet z `test-plan.md` §6.2 (`\set ON_ERROR_STOP on`, `begin;`, bloki `do $$`, znacznik `GATE_COMPLETE fr012_language_checks`, `rollback;`). Nagłówek pliku opisuje, co sprawdza i czego nie (listy rdzeni celowo nie ma w SQL).

- `LANGUAGE 1`: tabela `interaction_pairs` ma co najmniej jeden wiersz — inaczej `LANGUAGE 2` nie mierzy niczego; komunikat `LANGUAGE 1 FAILED: interaction_pairs is empty`.
- `LANGUAGE 2`: zero wierszy, w których `regexp_replace(lower(normalize(description, NFC)), '\s+', ' ', 'g')` nie zawiera literału „może mieć związek”; komunikat `LANGUAGE 2 FAILED: descriptions without the FR-012 phrase: <group_a x group_b, …>`.

#### 2. Próbka czerwonej bramki

**File**: `scripts/db-checks/probes/pair-description-without-phrase.sql` (nowy)

**Intent**: Dowód, że `LANGUAGE 2` wykrywa opis bez frazy.

**Contract**: Nagłówek jak w `account-table-without-rls.sql`. Jeden `update public.interaction_pairs set description = …` na jednym wierszu, tekstem bez frazy (np. „Połączenie wywoła krwawienie.”). Bez `begin`/`commit`.

#### 3. CI

**File**: `.github/workflows/ci.yml`

**Intent**: Próbka biegnie przed `npm run db:check`, jak pozostałe.

**Contract**: Nowa linia w kroku „SQL checks”: `expect_invariant_failure scripts/db-checks/probes/pair-description-without-phrase.sql supabase/tests/fr012_language_checks.sql "LANGUAGE 2 FAILED"`.

### Success Criteria:

#### Automated Verification:

- `npm run db:check` przechodzi lokalnie po `npx supabase db reset` (bez `.env`, wg lekcji o docelowej bazie)
- Próbka pada z właściwego powodu: `node scripts/db-checks.mjs --probe scripts/db-checks/probes/pair-description-without-phrase.sql supabase/tests/fr012_language_checks.sql` kończy się kodem niezerowym i wypisuje `LANGUAGE 2 FAILED`
- Job `smoke` w CI zielony na PR, w logu `Probe … failed as expected: LANGUAGE 2 FAILED`

#### Manual Verification:

- Po biegu próbki opisy w lokalnej bazie są nietknięte (`select count(*) … where description ilike '%może mieć związek%'` = 24)

**Implementation Note**: Po zielonej weryfikacji automatycznej zatrzymaj się na potwierdzenie weryfikacji manualnej przed fazą 3.

---

## Phase 3: Kontrakt dla S-02 i dokumentacja

### Overview

Utrwalenie tego, czego faza 3 nie może dziś sprawdzić, jako wymagania S-02, oraz aktualizacja planu testów i lekcji.

### Changes Required:

#### 1. Roadmapa S-02

**File**: `context/foundation/roadmap.md` (pozycja S-02)

**Intent**: S-02 nie może napisać tekstów o kolizji poza zasięgiem testu.

**Contract**: Nowy punkt `- **Kontrakt z fazy 3 planu testów:**` w bloku S-02: (1) nota poglądowa i zdanie „brak ostrzeżenia nie oznacza, że połączenie jest bezpieczne” żyją w jednym module copy (wzorzec `src/lib/copy/password-recovery.ts`); (2) test w `scripts/` importuje ten moduł i `scripts/fr012/corpus.mjs` i dowodzi, że każdy tekst przechodzi przez `forbiddenWordsIn` z `scripts/rpl/pairs.mjs` bez trafień (nie porównanie z listą zdań korpusu — to przechodzi zawsze) oraz że nota i zdanie o bezpieczeństwie istnieją; zdanie o bezpieczeństwie jest jedynym jawnym wyjątkiem: test sprawdza je bez rdzenia `bezpieczn`, bo PRD (`prd.md:67`) go wymaga, a wyjątek jest nazwany w teście, nie w walidatorze; (3) jeden krok smoke sprawdza, że widok z kolizją zawiera notę; (4) kolejność leków na liście nie zależy od kolizji. Brzmienie noty rozstrzyga S-02. Status S-02 bez zmian.

#### 2. Plan testów

**File**: `context/foundation/test-plan.md`

**Intent**: Wzorzec testu tekstu o zdrowiu dostępny dla kolejnych zmian.

**Contract**: §6.1 zamiast „TBD”: wyrocznia z PRD w `scripts/fr012/corpus.mjs`, nigdy import z kodu pod testem; test czerwony przed poprawką; korpus zdań poprawnych obok zakazanych. §6.2: wzmianka o `fr012_language_checks.sql` jako wzorcu sprawdzenia treści. §6.5: notatka fazy 3 — co dowiedzione (walidator, baza), co przeszło do S-02 (nota, zdanie o bezpieczeństwie, smoke, kolejność listy). §5: przy ryzyku #2 dopisek, że jest częściowo otwarte do S-02 (nota, zdanie o bezpieczeństwie, smoke, kolejność listy), z odnośnikiem do §6.5 — żeby oznaczenie fazy 3 jako complete nie wyglądało na zamknięcie ryzyka. Status wiersza fazy 3 w §3 zostaje dla orkiestratora `/10x-test-plan`.

#### 3. Lekcja

**File**: `context/foundation/lessons.md` (wpis „Filtr języka wymaga formuły, nie tylko zakazuje słów”)

**Intent**: Agent czytający lekcję nie dostaje fałszywego opisu kodu.

**Contract**: Zmienione tylko **Context** (kotwica `scripts/rpl/pairs.mjs` z aktualnym zakresem linii listy i odnośnik do `scripts/fr012/corpus.mjs`) i **Problem** (stan po fazie 3: fraza jest wymagana; lista wciąż jest z natury niepełna — pomiar 14 zdań). **Rule** i **Applies to** bez zmian.

### Success Criteria:

#### Automated Verification:

- `npx prettier --check context/foundation/roadmap.md context/foundation/test-plan.md context/foundation/lessons.md` bez błędów
- Kotwica w lekcji wskazuje linie, na których stoi `FORBIDDEN_WORDS` w `scripts/rpl/pairs.mjs`

#### Manual Verification:

- Autorka czyta kontrakt w S-02 i potwierdza, że da się go spełnić bez rozstrzygania brzmienia noty w fazie 3
- Autorka potwierdza, że **Rule** w lekcji się nie zmieniła

**Implementation Note**: Po zielonej weryfikacji automatycznej zatrzymaj się na potwierdzenie weryfikacji manualnej.

---

## Testing Strategy

### Unit Tests:

- Każda klasa FR-012 (przyczyna, zalecenie, bezpieczeństwo, ranking, zakaz) z dopisaną frazą → `forbidden_word`.
- Fraza w jednym zdaniu, przyczyna w drugim → `forbidden_word`.
- Korpus poprawny i 24 obecne opisy → brak błędów (fałszywe alarmy nowych rdzeni).
- Korpus nie importuje walidatora.

### Integration Tests:

- `LANGUAGE 1–2` na stanie bazy po wszystkich migracjach; próbka `pair-description-without-phrase.sql` wywraca `LANGUAGE 2`.

### Manual Testing Steps:

1. Przeczytaj korpus zdań zakazanych i poprawnych.
2. Przejrzyj nowe rdzenie pod kątem neutralnych słów.
3. Po próbce sprawdź, że opisy w lokalnej bazie są nietknięte.
4. Przeczytaj kontrakt S-02 w roadmapie.

## Performance Considerations

Brak — 24 wiersze i kilkadziesiąt zdań w teście.

## Migration Notes

Brak migracji. CSV i `20260924130100_interaction_pairs_seed.sql` się nie zmieniają.

## References

- Research: `context/changes/testing-language-guard/research.md`
- Plan testów: `context/foundation/test-plan.md` §2 (ryzyko #2), §3 (faza 3), §6.2
- PRD: `context/foundation/prd.md:49, 65-67, 132, 144-145`
- Walidator: `scripts/rpl/pairs.mjs:17-57`, `:104-113`
- Obecne testy: `scripts/rpl/pairs.test.mjs:160-214`, `:287-290`
- Wzorzec próbki: `scripts/db-checks/probes/account-table-without-rls.sql`, `.github/workflows/ci.yml:45-90`
- Wzorzec modułu copy: `src/lib/copy/password-recovery.ts`
- Historia listy rdzeni: `context/archive/2026-09-23-interaction-rules-seed/reviews/impl-review.md` (F3)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Korpus FR-012 i wzmocniony filtr

#### Automated

- [x] 1.1 Test korpusu uruchomiony przed zmianą `FORBIDDEN_WORDS` pada na co najmniej 14 zdaniach z `research.md` §3 — b3eb0e0
- [x] 1.2 Po zmianie: `npm test` przechodzi w całości — b3eb0e0
- [x] 1.3 `npm run lint` bez błędów — b3eb0e0
- [x] 1.4 CSV z repo przechodzi walidator: `errors=0` i `accepted=24` — b3eb0e0

#### Manual

- [x] 1.5 Autorka potwierdza klasy korpusu zakazanego i zgodność korpusu poprawnego z FR-012 — b3eb0e0
- [x] 1.6 Autorka przegląda nowe rdzenie pod kątem neutralnych słów — b3eb0e0

### Phase 2: Bramka SQL na treści w bazie

#### Automated

- [x] 2.1 `npm run db:check` przechodzi lokalnie po `npx supabase db reset`
- [x] 2.2 Próbka pada z właściwego powodu: `LANGUAGE 2 FAILED`
- [ ] 2.3 Job `smoke` w CI zielony, w logu próbka failed as expected

#### Manual

- [x] 2.4 Po biegu próbki opisy w lokalnej bazie są nietknięte

### Phase 3: Kontrakt dla S-02 i dokumentacja

#### Automated

- [ ] 3.1 `prettier --check` na roadmapie, planie testów i lekcjach bez błędów
- [ ] 3.2 Kotwica w lekcji wskazuje linie `FORBIDDEN_WORDS`

#### Manual

- [ ] 3.3 Autorka potwierdza, że kontrakt S-02 nie rozstrzyga brzmienia noty
- [ ] 3.4 Autorka potwierdza, że **Rule** w lekcji się nie zmieniła
