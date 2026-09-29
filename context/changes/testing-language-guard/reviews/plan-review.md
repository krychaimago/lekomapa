<!-- PLAN-REVIEW-REPORT -->

# Plan Review: Strażnik języka FR-012 — plan wdrożenia

- **Plan**: context/changes/testing-language-guard/plan.md
- **Mode**: Deep
- **Date**: 2026-09-29
- **Verdict**: REVISE
- **Findings**: 0 critical, 3 warnings, 1 observation

## Verdicts

| Dimension             | Verdict |
| --------------------- | ------- |
| End-State Alignment   | WARNING |
| Lean Execution        | PASS    |
| Architectural Fitness | PASS    |
| Blind Spots           | WARNING |
| Plan Completeness     | WARNING |

## Grounding

8/8 paths ✓, 5/5 symbols ✓ (FORBIDDEN_WORDS, REQUIRED_WORDING, forbiddenWordsIn, expect_invariant_failure, auto-discovery supabase/tests/*.sql), brief↔plan ✓, Progress↔Phase ✓ (12/12).

Verified without findings: the runner discovers `supabase/tests/*.sql` itself (no change to `db-checks.mjs` needed); the DML probe runs as `postgres` inside the transaction closed by the check file's `rollback;`; no triggers on `interaction_pairs`; the old loop is at `pairs.test.mjs:160`. Note: `test-plan.md` has uncommitted edits in §3 that phase 3 also touches.

## Findings

### F1 — Kontrakt S-02: nie wiadomo, jak test ma sprawdzić tekst noty

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Completeness
- **Location**: Phase 3 — Roadmapa S-02, punkt (2)
- **Detail**: Kontrakt każe testowi S-02 dowieść, że „teksty nie zawierają zdań z klas zakazanych” przy użyciu korpusu, a korpus to gotowe zdania. Oba możliwe odczyty są złe. Dopasowanie do listy zdań przejdzie zawsze. Przepuszczenie tekstu przez `forbiddenWordsIn` sprawi, że nowy rdzeń `bezpieczn` odrzuci zdanie wymagane przez PRD („brak ostrzeżenia nie oznacza, że połączenie jest bezpieczne”, `prd.md:67`), a rdzeń `dawk` może zablokować zachętę do konsultacji. Implementujący S-02 musiałby zgadywać.
- **Fix A ⭐ Recommended**: Doprecyzować punkt (2): który mechanizm, i że zdanie o bezpieczeństwie jest jawnym wyjątkiem od rdzenia `bezpieczn`.
  - Strength: S-02 dostaje kontrakt do spełnienia, a konflikt jest nazwany teraz.
  - Tradeoff: Faza 3 rozstrzyga mechanizm testu, choć nie rozstrzyga brzmienia noty.
  - Confidence: HIGH — konflikt wynika wprost z listy kandydatów i z `prd.md:67`.
  - Blind spot: Brzmienie noty nieznane; może trafić na inne rdzenie.
- **Fix B**: Zostawić mechanizm S-02, dopisać tylko ostrzeżenie o konflikcie z `bezpieczn` i `dawk`.
  - Strength: Mniejsza zmiana; S-02 decyduje z pełnym kontekstem UI.
  - Tradeoff: Ryzyko testu, który zawsze przechodzi, zostaje otwarte.
  - Confidence: MED
  - Blind spot: Czy plan S-02 przeczyta ostrzeżenie.
- **Decision**: FIXED (Fix A)

### F2 — Nowe rdzenie blokują neutralne zdania, a korpus poprawny tego nie złapie

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 1 — ALLOWED_SENTENCES i rozszerzenie FORBIDDEN_WORDS
- **Detail**: `ALLOWED_SENTENCES` ma pokrywać słowa neutralne tylko wtedy, gdy „takie istnieje w realnym opisie”. Obecne 24 opisy celowo omijają te słowa („słabszym” zamiast „zmniejszonym”), więc korpus poprawny nie sprawdzi żadnego nowego rdzenia. Typowe zdania zgodne z FR-012 zostałyby odrzucone: „może mieć związek ze zwiększonym ryzykiem krwawień” (`ryzyk`), „…ze zmniejszoną skutecznością leku” (`zmniejsz`), „…z wynikami badań krzepliwości” (`wynik`), „…z ograniczonym działaniem” (`ogranicz`). Przy `ryzyk` zakazana jest składnia przyczynowa („zwiększa ryzyko”), nie samo słowo. Przy `dawk` taki koszt był decyzją, tu zapadłby przypadkiem.
- **Fix**: `ALLOWED_SENTENCES` zawiera realne neutralne zdanie dla każdego nowego rdzenia, także spoza 24 opisów. Rdzeń, który je odrzuca, trzeba zawęzić (np. `zwiększa ryzyk` zamiast `ryzyk`) albo zapisać jako świadomy koszt, jak przy `dawk`.
  - Strength: Nie ma ukrytej blokady: każdy fałszywy alarm to decyzja zapisana w korpusie.
  - Tradeoff: Węższe rdzenie przepuszczą część wariantów.
  - Confidence: HIGH — zmierzone grepem na CSV: żaden opis nie zawiera tych słów.
  - Blind spot: Które sformułowania autorka uzna za zgodne z FR-012.
- **Decision**: FIXED

### F3 — Faza 3 w planie testów zostanie „complete”, a połowa celu przejdzie do S-02

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: End-State Alignment
- **Location**: Phase 3 — Plan testów (§3, §5)
- **Detail**: Cel fazy 3 w `test-plan.md` §3 brzmi: „…i że nota poglądowa jest zawsze obecna”, a typy testów to „unit + smoke step”. Plan uczciwie odkłada notę i smoke do S-02 (What We're NOT Doing, §6.5). Ale wiersz w §3 i stan w §5 zostają dla orkiestratora, który oznaczy fazę jako complete. Ryzyko #2 będzie wyglądać na zamknięte.
- **Fix**: W §5 (albo w wierszu §3) dopisać, że ryzyko #2 jest częściowo otwarte do S-02, z odnośnikiem do §6.5.
- **Decision**: FIXED

### F4 — SQL nie zwija białych znaków tak jak walidator

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 2 — LANGUAGE 2 / Critical Implementation Details
- **Detail**: `foldText` (`pairs.mjs:50-52`) zwija białe znaki, więc walidator przyjmie „może mieć\nzwiązek” albo tekst z podwójną spacją. Proponowane `lower(normalize(…))` tego nie robi, więc poprawny CSV da czerwoną bramkę. Plan pomyślał o wielkości liter z tego samego powodu, ale białe znaki pominął.
- **Fix**: W LANGUAGE 2 dodać `regexp_replace(…, '\s+', ' ', 'g')` przed porównaniem i dopisać to w Critical Implementation Details.
- **Decision**: FIXED
