<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Nazwy leków i substancji poza adresami URL

- **Plan**: context/changes/medication-names-out-of-urls/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3
- **Date**: 2026-10-12
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 2 warnings, 3 observations
- **Triage**: Fixed F1, F2, F3, F5; Accepted F4 (2026-10-12)

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | WARNING |
| Success Criteria    | PASS    |

## Weryfikacja

- `npm test` — 420/420 pass.
- `npm run typecheck` — 0 errors.
- `npm run lint` — 0 errors; ostrzeżenia `no-console` w zmienionych plikach logują wyłącznie kody błędów (wzorzec istniejący w repo).
- `npm run smoke` — nie uruchomiony ponownie w przeglądzie (wymaga odsunięcia `.env` i lokalnego Supabase); Progress ma SHA dla 1.4, 2.4, 3.4.
- 3.2 (czułość strażnika) — nie powtórzona ręcznie; w pliku testu jest fixture „a medication name in the address is reported”.
- Zgodność z planem: wszystkie pozycje MATCH. Uzasadnione odstępstwo: `clearCookie` używa `cookies.set(..., { maxAge: 0 })` zamiast `cookies.delete`, bo `delete` wysyła tylko `Expires`, a smoke sprawdza `Max-Age=0` (komentarz w `src/lib/medication-draft.ts:97-100`).
- Po merge'u (z planu, poza Progress): sprawdzić w logach Workera jedno wywołanie `/leki/nowy` po wyszukiwaniu — adres bez nazwy; odnotować, czy log zapisuje nagłówek `Cookie`. Wynik dopisać tutaj.

## Findings

### F1 — Strażnik nie widzi formularza GET

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: scripts/pages/url-params.test.mjs:73-80
- **Detail**: Formularz `<form method="GET">` wkłada `name` każdego pola do adresu. Strażnik tego nie wykrywa — próba na `<form method="GET" action="/leki/nowy"><input name="q" /></form>` dała `[]`. Dokładnie tak powstał wyciek `?q=` w S-02 (`RegistrySearch` był `method="GET"`). Smoke też tego nie złapie: sprawdza tylko `Location` przekierowań i wysyła POST bezpośrednio, nie przez wyrenderowany formularz.
- **Fix**: W plikach `.astro`/`.tsx` zgłaszać `<form>` z `method` GET albo bez `method` a z `action`; nazwy pól traktować jak parametry adresu. Dziś każdy natywny formularz to POST, a formularze tylko-JS mają `onSubmit` bez `action` — skan zostanie zielony. Dodać fixture.
  - Strength: Zamyka dokładnie tę drogę, którą przyszła regresja z S-02.
  - Tradeoff: Regex na JSX/HTML, nie parser — możliwe fałszywe alarmy przy nietypowym zapisie atrybutów.
  - Confidence: HIGH — luka potwierdzona próbą na funkcjach strażnika; wzorzec fixture jak w `page-title.test.mjs`.
  - Blind spot: Formularze budowane dynamicznie (spread propsów z `method`).
- **Decision**: FIXED (Fix now) — `formViolations` w `scripts/pages/url-params.test.mjs`: każdy `<form>` wymaga `method="POST"` (wyjątek: `.tsx` z `onSubmit` bez `action`), `formmethod` inne niż POST zgłaszane; dwa testy fixture. Mutacja `RegistrySearch` na GET: test pada.

### F2 — Strażnik zależy od nazwy zmiennej `*Params`

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: scripts/pages/url-params.test.mjs:75, 125
- **Detail**: Wzorce łapią `.get/.set/...` tylko na zmiennej nazwanej `*params`/`*Params`. Próby dające `[]`: `const qs = new URLSearchParams(); qs.set("nazwa", name)`; `const sp = Astro.url.searchParams; sp.get("nazwa")`; `Object.fromEntries(Astro.url.searchParams)`; `"/leki/nowy?" + key + "=" + v` (wykrywane są tylko klucze w szablonie `?${`). Odczyt przez zmienną (`searchParams.get(name)` bez helpera `*Param`) też przechodzi.
- **Fix**: Zgłaszać `.get/.set/.append(` na każdym obiekcie utworzonym przez `new URLSearchParams(` albo przypisanym z `.searchParams`; zgłaszać `[?&]"\s*\+` jako klucz dynamiczny; dopisać te przypadki jako fixtures.
  - Strength: Lista objętych wzorców przestaje zależeć od konwencji nazewnictwa.
  - Tradeoff: Śledzenie przypisań regexem jest kruche; pełne rozwiązanie wymaga przejścia AST (TypeScript jest już importowany w teście).
  - Confidence: MED — luki potwierdzone próbami; koszt dokładnego AST niezmierzony.
  - Blind spot: Nie sprawdzono, ile fałszywych alarmów da szerszy wzorzec na obecnym `src/`.
- **Decision**: FIXED (Fix now) — `paramObjects` dobiera każdą zmienną przypisaną z `new URLSearchParams(` / `.searchParams`; jako klucz dynamiczny zgłaszane: metoda z kluczem nie-literałem (także `get`), `Object.fromEntries(…searchParams)`, `.entries/.keys/.forEach`, `"?" + key + "="`. `pages/dzienniczek/index.astro` dopisany do `DYNAMIC_KEY_FILES` (`uuidParam(name)`). Fixtures dodane; mutacja `params` na `qs` z `qs.set("nazwa", …)` w `api/medications/index.ts`: test pada. Regex, nie AST — ograniczenie z Tradeoff zostaje.

### F3 — Strażnik nie obejmuje ścieżki adresu

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: scripts/pages/url-params.test.mjs:1-4
- **Detail**: Lesson mówi „ani w ścieżce”, a strażnik sprawdza tylko parametry. `` `/leki/${encodeURIComponent(name)}` `` przechodzi. Dziś żadna trasa tak nie robi.
- **Fix**: Dopisać w komentarzu nagłówkowym testu, że ścieżki nie są sprawdzane i dlaczego dynamiczne segmenty to wyłącznie uuid (`[id]`).
- **Decision**: FIXED (Fix now) — komentarz nagłówkowy `scripts/pages/url-params.test.mjs`: ścieżka niesprawdzana; segmenty `[id]`, `[periodId]` to uuid pod RLS; inny segment wymaga własnego strażnika.

### F4 — `?wariant=<uuid>` pośrednio ujawnia lek

- **Severity**: 💡 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/pages/leki/nowy.astro:40
- **Detail**: uuid wskazuje wiersz `registry_products`, czytelny dla każdego zalogowanego konta. Każdy z kontem może otworzyć `/leki/nowy?wariant=<id>` i zobaczyć nazwę leku — historia, logi i Referer nadal niosą lek, tylko za jednym krokiem. Plan to odnotował (Key Discoveries, brief), lesson dopuszcza identyfikatory. Słabsza ochrona niż `dodano` (id leku konta, chroniony RLS).
- **Fix**: Świadomie zaakceptować i dopisać do briefu/lessona jako znane ograniczenie (alternatywa — wybór wariantu przez POST + ciasteczko — to osobna zmiana).
- **Decision**: ACCEPTED (Fix now) — ryzyko świadomie przyjęte; dopisek w `plan-brief.md` (Open Risks) i Correction (12.10.2026) w lessonie „Żadna nazwa leku ani dawka w adresie URL”. Alternatywa POST + ciasteczko poza tą zmianą.

### F5 — Trasa zapisu ustawia ciasteczko w odpowiedzi 302 bez `no-store`

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/pages/api/medications/index.ts:147-217
- **Detail**: `POST /api/medications` teraz ustawia szkic ulotki przy błędzie i czyści szkice przy sukcesie, ale odpowiada `context.redirect` (302, bez `Cache-Control`). Nowa trasa `draft.ts` i `theme.ts` odpowiadają 303 z `private, no-store`, z komentarzem „odpowiedź niesie Set-Cookie”. Praktyczne ryzyko małe (302 na POST bez nagłówków świeżości nie jest buforowane).
- **Fix**: Dodać `Cache-Control: private, no-store` do przekierowań tej trasy (bez zmiany kodu 302, żeby nie ruszać kroków smoke oczekujących dokładnie 302).
- **Decision**: FIXED (Fix now) — helper `redirect()` w `src/pages/api/medications/index.ts`: 302 + `Cache-Control: private, no-store`, 8 wywołań. `npm test` 422/422, typecheck 0. Smoke nieuruchomiony — do biegu przed merge'em (ciasteczka szkicu w odpowiedzi zbudowanej ręcznie, wzorzec jak `draft.ts`).
