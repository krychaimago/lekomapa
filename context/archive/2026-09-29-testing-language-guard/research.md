---
date: 2026-09-29T14:16:49+0200
researcher: Claude (Opus 5.5) na zlecenie autorki
git_commit: 6c9129331aa893f88e486715899085cbaad2dcac
branch: main
repository: krychaimago/lekomapa
topic: "Ugruntowanie fazy 3 planu testów — ryzyko #2 (język komunikatów o kolizji, FR-012)"
tags: [research, testing, fr-012, interaction-pairs, pairs-validator]
status: complete
last_updated: 2026-09-29
last_updated_by: Claude (Opus 5.5)
---

# Research: faza 3 planu testów — strażnik języka FR-012 (ryzyko #2)

**Date**: 2026-09-29T14:16:49+0200
**Git Commit**: 6c91293 (`main`; niezacommitowane: `context/foundation/test-plan.md`, ten folder)
**Repository**: krychaimago/lekomapa

## Research Question

Ugruntować w kodzie ryzyko #2 z `context/foundation/test-plan.md` §2: komunikat o kolizji stwierdza przyczynę, sugeruje odstawienie lub zmianę dawki albo pozwala odczytać brak znacznika jako „bezpieczne”. Zweryfikować wytyczne odpowiedzi na ryzyko (nie przyjmować ich na ślepo), znaleźć istniejące testy, wskazać najtańszą warstwę testu i oznaczyć ryzyka spekulatywne.

## Summary

- **Dziś tekst o kolizji ma dokładnie jedno źródło i nie dociera do użytkowniczki.** Źródło: kolumna `interaction_pairs.description` (24 wiersze), wgrywana migracją generowaną z `supabase/seed-data/interaction_pairs.csv`. W `src/` nic nie czyta tej tabeli (zero wywołań `.from(`/`.rpc(` w `src/`; typ `InteractionPair` w `src/types.ts:168-181` nie jest nigdzie importowany). Nota poglądowa i zdanie „brak ostrzeżenia ≠ bezpieczne” nie istnieją w kodzie — powstaną w S-02 (roadmapa: status `ready`).
- **Walidator `scripts/rpl/pairs.mjs` sprawdza CSV, nie bazę.** Wymaga frazy „może mieć związek” (`pairs.mjs:44`, `:111-112`) i odrzuca 18 rdzeni (`:21-40`). Test `pairs.test.mjs` sprawdza, że plik CSV w repo przechodzi walidator. Nic nie sprawdza, że **migracja** (albo przyszła migracja z `update interaction_pairs set description = …`) niesie tekst zgodny z FR-012 — w bazie jest tylko `check (btrim(description) <> '')` (`20260924120000_registry_schema.sql:112-114`).
- **„Nie ma zakazanego słowa, więc tekst jest poprawny” — potwierdzone jako fałszywe, pomiarem.** 14 zdań łamiących FR-012 przechodzi przez `forbiddenWordsIn` bez trafienia (m.in. „Połączenie wywoła krwawienie.”, „Połączenie jest bezpieczne.”, „Objawy są wynikiem interakcji.”, „Zamień ibuprofen na paracetamol.”). Wymóg frazy też nie wystarcza: fraza musi wystąpić _gdziekolwiek_ w opisie, więc drugie zdanie może być przyczynowe.
- **Wytyczna #2 jest trafna, ale wymaga trzech korekt** (szczegóły niżej): (1) warstwa „przy UI jeden krok smoke” dziś nie ma czego testować — UI nie istnieje; (2) brak warstwy na stanie bazy po migracjach; (3) zakaz „wyroczni skopiowanej z walidatora” jest dziś częściowo łamany w `pairs.test.mjs`.
- **Najtańsza użyteczna warstwa teraz**: unit (`node:test`) z korpusem przypadków wyprowadzonym z FR-012/PRD + sprawdzenie SQL na treści `interaction_pairs` po `db reset`. Krok smoke i test noty/zdania o bezpieczeństwie — dopiero razem z S-02 albo jako kontrakt, który S-02 musi spełnić.

## Detailed Findings

### 1. Wymagania — skąd biorą się oczekiwane frazy (wyrocznia z FR-012, nie z kodu)

Dosłowne brzmienie w `context/foundation/prd.md`:

- `:144` FR-012: „nigdy nie stwierdzają, że lek powoduje objaw (tylko „może mieć związek"), nigdy nie sugerują odstawienia leku ani zmiany dawki i nigdy nie porządkują leków według stopnia podejrzenia”; `:145`: „wymaganie, nie wytyczna — ma podlegać sprawdzeniu”.
- `:132` FR-007: „nota o charakterze informacyjnym przy każdej informacji o kolizji”.
- `:65` US-01: „stale widoczna jest nota o jej charakterze poglądowym wraz z zachętą do konsultacji z lekarzem lub farmaceutą”.
- `:66` US-01: „nie stwierdza zakazu łączenia leków ani nie porządkuje leków według stopnia podejrzenia”.
- `:67` US-01: brak znacznika „nie jest równoznaczne z potwierdzeniem bezpieczeństwa”.
- `:49` guardrail: „Brak ostrzeżenia nie oznacza „bezpieczne". Zbiór reguł jest z założenia niepełny i produkt musi mówić to wprost”.

Wniosek dla wyroczni: FR-012 daje jedną frazę pozytywną wprost („może mieć związek”) i trzy **klasy** zakazane (przyczyna, odstawienie/zmiana dawki, ranking podejrzeń), a US-01 dodaje czwartą (zakaz łączenia). Klasa to nie lista słów — test musi nieść przykłady zdań z każdej klasy, napisane z PRD, a nie rdzenie z `FORBIDDEN_WORDS`.

Brzmienie noty i zdania o bezpieczeństwie **nie jest rozstrzygnięte**. Jedyne konkretne: `context/changes/auth-login-design/design-draft.md:187` („Informacja poglądowa — w razie niepokoju skonsultuj z lekarzem lub farmaceutą. Brak oznaczenia nie znaczy, że połączenie jest bezpieczne.”), ale `:182` zastrzega, że zasady obowiązują „niezależnie od tego, jak ostatecznie zabrzmią konkretne zdania”. Wcześniejsza wersja bez części o bezpieczeństwie: `context/foundation/shape-notes.md:99`. Rozbieżność miejsca: design-draft „pod listą”, PRD FR-007 „przy każdej informacji o kolizji”.

### 2. Droga tekstu — od źródła do widoku

| Etap             | Gdzie                                                                                                 | Co pilnuje FR-012                                                                                                  |
| ---------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| CSV autorki      | `supabase/seed-data/interaction_pairs.csv` (24 wiersze danych)                                        | `validatePairs` w `scripts/rpl/pairs.mjs:90-160`                                                                   |
| Generator        | `scripts/rpl/generate.mjs:324-346` woła `loadPairs` i odmawia przy błędach                            | pośrednio — walidator                                                                                              |
| Migracja         | `supabase/migrations/20260924130100_interaction_pairs_seed.sql` (24 wiersze)                          | **nic** — plik można edytować ręcznie mimo nagłówka „do not edit by hand” (`:2`)                                   |
| Kolejna migracja | dowolny `insert`/`update` na `interaction_pairs`                                                      | **nic** — `description` ma tylko `check (btrim(description) <> '')` (`20260924120000_registry_schema.sql:112-114`) |
| Baza             | `interaction_pairs`, tylko SELECT dla `authenticated`, zapis odebrany (`registry_schema.sql:138-159`) | użytkowniczka nie może wpisać tekstu — źródłem są wyłącznie migracje                                               |
| UI               | brak (`src/` nie odpytuje tej tabeli)                                                                 | —                                                                                                                  |

Zmierzone dziś: 24 z 24 opisów w CSV i 24 z 24 w migracji zawierają „może mieć związek” (`grep -c`). Przeczytane wszystkie 24 opisy w CSV: każdy ma schemat „…mogą wchodzić w interakcję. Jednoczesne przyjmowanie może mieć związek z …”; żaden nie zawiera formuły przyczynowej, zalecenia ani oceny bezpieczeństwa. Obecne dane są poprawne.

Rzeczywista ścieżka awarii dziś (bez UI): kolejna para dodana ręcznie do migracji albo migracja poprawiająca opis z pominięciem generatora. Ścieżka po S-02: kod UI składa własny tekst (znacznik, nota, zdanie o braku ostrzeżenia, podsumowanie w S-08) — żaden walidator go nie widzi.

### 3. Walidator — co łapie, czego nie

`scripts/rpl/pairs.mjs`:

```js
// :44
export const REQUIRED_WORDING = "może mieć związek";
// :111-112
if (!foldText(row.description).includes(foldText(REQUIRED_WORDING))) {
  return { reason: "missing_required_wording", ...
```

Normalizacja (`:48-52`): NFC, `toLocaleLowerCase("pl")`, zwinięte białe znaki. Dopasowanie rdzeni: `includes` na podciągu (`:54-57`).

Pomiar (`node -e` na `forbiddenWordsIn`, 2026-09-29) — **puste trafienie dla wszystkich 14 zdań**:

- przyczyna: „Połączenie wywoła krwawienie.”, „Połączenie wywołało krwawienie.” (rdzeń `wywołuj` nie łapie aspektu dokonanego), „Lek odpowiada za objawy.”, „Objawy są wynikiem interakcji.”, „Objawy wynikają z interakcji.”, „Połączenie zwiększa ryzyko krwawień.”
- zalecenie: „Przerwanie leczenia jednym z leków.” (`przerwij` nie łapie „przerwanie”/„przerwać”), „Nie bierz obu leków razem.”, „Zrezygnuj z jednego z leków.”, „Zmniejsz ilość leku.”, „Ogranicz przyjmowanie ibuprofenu.”, „Zamień ibuprofen na paracetamol.”
- bezpieczeństwo: „Połączenie jest bezpieczne.” (lista ma tylko `niebezpieczn`)
- ranking: „Ten lek jest najbardziej podejrzany.”

Każde z nich z dopisanym „może mieć związek” zostałoby **przyjęte**. To dowód, że wymóg frazy + lista rdzeni to bramka konieczna, nie wystarczająca — zgodnie z komentarzem w `pairs.mjs:17-19` („a description that passes it can still be wrong, which is why the author reads every one”).

Uwaga o `dawk` (`:37`): rdzeń odrzuca każde użycie słowa „dawka”, także neutralne. Świadome — `impl-review.md` F3 zapisał to jako tradeoff.

### 4. Istniejące testy

`scripts/rpl/pairs.test.mjs` (w `npm test`, glob `scripts/**/*.test.mjs` w `package.json:15`; `npm test` biegnie w jobie `ci`, `.github/workflows/ci.yml:21`):

- `:150-158` — test na każdy rdzeń, **generowany pętlą z `FORBIDDEN_WORDS`** zaimportowanego z walidatora. To wyrocznia z kodu: usunięcie rdzenia usuwa też jego test. Częściowo osłonięte przez `:170-191`, który przypina listę dosłownie — ale przypięcie listy chroni listę, nie FR-012.
- `:193-214` — sześć zdań pisanych ręcznie („prowadzi do krwawień”, „jest przyczyną” …). Niezależne od kodu, ale dobrane pod rdzenie dopisane po F3, nie pod klasy FR-012.
- `:216-231` — brak frazy daje błąd; dopasowanie niezależne od wielkości liter i NFD.
- `:287-290` — plik CSV z repo przechodzi walidator. **Nie sprawdza migracji.**

`scripts/rpl/generate.test.mjs:28` — fixture „Leki mogą wchodzić w interakcję.” bez frazy; `buildPairsSeedSql` nie waliduje sam, tylko `main()` przez `loadPairs` (`generate.mjs:334-346`). Nie jest to luka produkcyjna, ale test generatora nie pilnuje FR-012.

`supabase/tests/rls_checks.sql` CHECK 11 (`:690-720`) sprawdza, że pary istnieją; CHECK 12 (`:752-805`) — ograniczenia kodów ATC i unikalność. Żadne sprawdzenie SQL nie patrzy na treść `description`.

`scripts/smoke.mjs:329-340`, `:378`, `:413` — `interaction_pairs` tylko jako tabela wspólna do testu RLS (odczyt po zalogowaniu, zapis odrzucony `42501`). Tekst opisu nie jest oceniany.

Brak jakiegokolwiek testu noty poglądowej, zdania „brak ostrzeżenia ≠ bezpieczne” i zakazu rankingu — bo nie ma kodu, który je wytwarza.

### 5. Weryfikacja wytycznych odpowiedzi na ryzyko #2

| Element wytycznej                                    | Werdykt                           | Uzasadnienie                                                                                                                                                                                                   |
| ---------------------------------------------------- | --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| „każdy tekst o kolizji zawiera „może mieć związek””  | **trafne, zawęzić**               | Dotyczy opisów par. Nota i zdanie o bezpieczeństwie to też tekst o kolizji, ale PRD nie wymaga w nich tej frazy (`prd.md:65`, `:67`) — nie przenosić wymogu na nie.                                            |
| „nie zawiera formuł przyczynowych ani zaleceń”       | **trafne**                        | Pomiar w §3 pokazuje, że dziś nie jest to udowodnione dla dowolnego nowego tekstu.                                                                                                                             |
| „przy każdej kolizji jest nota poglądowa”            | **trafne, dziś nietestowalne**    | Brak UI. Brzmienie i miejsce nierozstrzygnięte (design-draft vs FR-007). Test powstaje z S-02.                                                                                                                 |
| „produkt mówi, że brak ostrzeżenia ≠ bezpieczne”     | **trafne, dziś nietestowalne**    | Jak wyżej. Dziś tylko w komentarzu SQL tabeli (`registry_schema.sql:130`) i JSDoc typu — nie trafia do użytkowniczki.                                                                                          |
| challenge „nie ma zakazanego słowa → tekst poprawny” | **potwierdzone pomiarem**         | 14 z 14 przypadków w §3.                                                                                                                                                                                       |
| anti-pattern „wyrocznia skopiowana z walidatora”     | **trafne; częściowo łamane dziś** | `pairs.test.mjs:160` generuje testy z `FORBIDDEN_WORDS`.                                                                                                                                                       |
| warstwa „unit, przy UI jeden krok smoke”             | **niepełna**                      | Brakuje warstwy stanu bazy: walidator nie widzi migracji. Smoke bez UI nie ma czego sprawdzić.                                                                                                                 |
| brakujący element                                    | **dopisać**                       | FR-012 „nigdy nie porządkują leków według stopnia podejrzenia” i US-01 „zakaz łączenia” — nie ma ich w wytycznej. Zakaz łączenia łapie rdzeń `nie łącz`; ranking to własność UI (kolejność listy), nie tekstu. |

### 6. Najtańsza użyteczna warstwa

1. **Unit — korpus FR-012 niezależny od walidatora** (`node:test`, nowy plik obok `pairs.test.mjs` albo sekcja w nim). Stałe napisane z PRD: fraza pozytywna jako literał „może mieć związek” (nie import `REQUIRED_WORDING`), zdania zakazane pogrupowane w klasy z §1. Oczekiwanie: każde zdanie zakazane + fraza → błąd walidatora. Dziś 14 z §3 będzie czerwonych — plan musi zdecydować: rozszerzyć filtr czy jawnie oznaczyć znane luki (`test.todo`), inaczej test będzie kłamał albo blokował CI.
2. **SQL po `db reset`** (`supabase/tests/`, wzorzec §6.2 planu testów): każdy wiersz `interaction_pairs.description` zawiera „może mieć związek” (literał). To jedyna warstwa widząca to, co faktycznie czyta aplikacja; łapie ręczną edycję migracji i przyszłe `update`. Tanie: bramka SQL już biegnie w CI (faza 1). Nie powielać listy rdzeni w SQL — to byłaby druga kopia wyroczni z kodu.
3. **Wariant silniejszy (zmiana produktu, nie testu)**: `check (description like '%może mieć związek%')` na kolumnie. Gwarancja w bazie, ale wymaga migracji i decyzji autorki — przesądza, że każdy przyszły tekst w tej kolumnie niesie frazę.
4. **Smoke / test UI** — odłożyć do S-02. Warunek do wpisania w plan S-02: nota i zdanie o bezpieczeństwie w jednym module copy (wzorzec: `src/lib/copy/password-recovery.ts`), żeby unit mógł je sprawdzić bez przeglądarki.

## Code References

- `scripts/rpl/pairs.mjs:17-40` — `FORBIDDEN_WORDS`, 18 rdzeni
- `scripts/rpl/pairs.mjs:42-44` — `REQUIRED_WORDING`
- `scripts/rpl/pairs.mjs:48-57` — normalizacja i dopasowanie podciągu
- `scripts/rpl/pairs.mjs:90-116` — kolejność: rdzenie, potem fraza
- `scripts/rpl/pairs.test.mjs:160-168` — testy generowane z listy walidatora
- `scripts/rpl/pairs.test.mjs:287-290` — CSV z repo przechodzi walidator
- `scripts/rpl/generate.mjs:334-346` — generator odmawia przy błędach walidatora
- `supabase/migrations/20260924120000_registry_schema.sql:111-114` — `description`, tylko check niepustości
- `supabase/migrations/20260924120000_registry_schema.sql:138-159` — RLS: tylko SELECT, zapis odebrany
- `supabase/migrations/20260924130100_interaction_pairs_seed.sql` — 24 opisy
- `supabase/tests/rls_checks.sql:690-805` — CHECK 11–12, bez treści opisu
- `scripts/smoke.mjs:329-340` — `interaction_pairs` jako cel testu RLS
- `src/types.ts:168-181` — `InteractionPair`, nieużywany
- `context/foundation/prd.md:49, 65-67, 132, 144-145` — wyrocznia

## Architecture Insights

- Tabela wspólna tylko do odczytu zamyka drogę tekstu od użytkowniczki — jedynym wejściem są migracje. To czyni sprawdzenie SQL na stanie po `db reset` kompletnym dla dzisiejszego źródła.
- Walidator żyje w `scripts/rpl/` (narzędzie autorki), nie w `src/`. Tekst UI z S-02 nie przejdzie przez niego — potrzebny osobny punkt sprawdzenia albo współdzielony moduł.
- Fraza „może mieć związek” jest wymagana na poziomie całego opisu, nie zdania. Opis dwuzdaniowy może mieć frazę w jednym zdaniu i przyczynę w drugim.

## Historical Context (from prior changes)

- `context/archive/2026-09-23-interaction-rules-seed/reviews/impl-review.md:70-82` (F3) — filtr miał luki i nie wymagał frazy; decyzja „FIXED + ACCEPTED-AS-RULE”: dopisane rdzenie `prowadz`, `przyczyn`, `skutk`, `dawk`, `przesta`, `unika` i wymóg frazy. **Werdykt: supported** — kod (`pairs.mjs:34-44`, `:111`) to zawiera.
- `context/foundation/lessons.md`, „Filtr języka wymaga formuły” — zdanie „Walidator nie sprawdza też pozytywnie, że opis zawiera „może mieć związek”” **contradicted** przez obecny kod (`pairs.mjs:111-112`); opis problemu sprzed F3. Zdanie, że lista przepuszcza „prowadzi do krwawień”, „jest przyczyną”, „skutkuje”, „dostosuj dawkę”, „unikaj” — **contradicted** dla tych pięciu (test `pairs.test.mjs:193-214` je łapie). Reguła („zawsze wymaga formuły, lista to uzupełnienie”) — **supported** i potwierdzona pomiarem w §3. Kotwica `pairs.mjs:21-34` w lekcji jest nieaktualna (lista kończy się na `:40`).
- `context/foundation/roadmap.md:115` — F-02 odkłada barierę „brak ostrzeżenia” do S-02. `:194-208` — S-02 (`ready`) obejmuje FR-006, FR-007, FR-012; `:204` wymienia notę i brak znacznika jako ryzyko.

## Related Research

- `context/archive/2026-09-23-interaction-rules-seed/plan.md:418, 538-548` — pierwotna decyzja o kolumnie `description` i liście rdzeni.
- `context/changes/auth-login-design/design-draft.md:180-187` — robocze brzmienie noty.

## Open Questions

1. **Czerwone przypadki z §3**: rozszerzyć filtr (koszt: kolejne rdzenie, ryzyko fałszywych alarmów jak `dawk`) czy zapisać jako znane luki w teście (`test.todo`) i oprzeć się na czytaniu przez autorkę? Decyzja produktowa — przesądza, czy walidator ma ambicję kompletności.
2. **Check w bazie czy tylko sprawdzenie SQL?** `check` na kolumnie to zmiana schematu (migracja), sprawdzenie w `supabase/tests/` to tylko test.
3. **Brzmienie i miejsce noty** (pod listą vs przy każdej informacji) — do rozstrzygnięcia w S-02; faza 3 może zostawić kontrakt („moduł copy + test obecności”) bez brzmienia.
4. **Zakres fazy 3 względem S-02**: plan testów (§3) mówi „faza 3 przed UI znaczników kolizji w S-02”. Część wytycznej (nota, bezpieczeństwo, smoke) da się dziś spełnić tylko jako kontrakt dla S-02, nie jako działający test.
