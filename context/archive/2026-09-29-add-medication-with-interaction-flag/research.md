---
date: 2026-09-29T21:27:00+02:00
researcher: Claude (Opus 5.5), sesja Claude Code
git_commit: d158284
branch: main
repository: krychaimago/lekomapa
topic: "S-02: co istnieje, czego brakuje i co plan musi rozstrzygnąć przy dodaniu leku po nazwie handlowej ze znacznikiem możliwej kolizji"
tags: [research, s-02, medications, registry, interaction-pairs, rls, fr-012, smoke]
status: complete
last_updated: 2026-09-29
last_updated_by: Claude (Opus 5.5)
---

# Research: S-02 — dodanie leku ze znacznikiem możliwej kolizji

**Date**: 2026-09-29 21:27 CEST
**Researcher**: Claude (Opus 5.5), sesja Claude Code
**Git Commit**: d158284
**Branch**: main
**Repository**: krychaimago/lekomapa

## Research Question

Co repozytorium już daje dla S-02 (`context/foundation/roadmap.md:194-213`, issue #13), czego brakuje w bazie, warstwie aplikacji i testach, jakie wcześniejsze decyzje wiążą plan i które wybory plan musi jeszcze podjąć.

## Summary

- **Dane są, logiki nie ma.** Tabele leków, składu i okresów (F-01) oraz rejestr i 24 pary kolizji (F-02) istnieją z RLS. Nie istnieje żadna funkcja, widok ani kod aplikacji, który dopasowuje pary do leków użytkowniczki, ani żadne RPC do zapisu leku.
- **Dług z F-02 jest nadal otwarty.** Na `medications` nie ma wyzwalacza UPDATE ani kontroli spójności `composition_source` ⇔ `registry_medication_id`.
- **Okno korekty to zaślepka.** `medication_correction_window_open()` zwraca zawsze `true` do S-05, więc każdy nowy wyzwalacz oparty na oknie w S-02 niczego jeszcze realnie nie zablokuje. Test musi to uwzględnić.
- **Warstwa aplikacji ma wzorce, ale nie ma nic domenowego.** `NAV_ITEMS` jest puste, w `src/components/ui/` jest tylko `button.tsx`, nie ma trasy JSON ani helpera smoke czytającego treść strony. zod 4 jest zainstalowany (wbrew `CLAUDE.md`, który mówi, że nie jest).
- **Kontrakt FR-012 zderza się z rdzeniem `dawk`.** Test z kontraktu fazy 3 przepuszcza każdy tekst modułu copy przez `forbiddenWordsIn`, a rdzeń `dawk` odrzuca każdą wzmiankę o dawce. Moduł z notą nie może więc zawierać etykiet formularza.
- **Otwarte wybory dla planu (szczegóły w `## Open Questions`):** ścieżka leku spoza rejestru, klucz unikalności substancji (F7), czy `product_name` należy do rdzenia wpisu, gdzie liczyć kolizję, zapis atomowy czy trzy inserty, kształt wyszukiwarki.

## Detailed Findings

### 1. Baza — tabele konta (F-01)

- `medications` (`supabase/migrations/20260922120000_medication_schema.sql:17-32`): `product_name`, `composition_source in ('registry','leaflet')`, `registry_medication_id`, `discontinued_on`, `created_at`, `updated_at`. Klucz obcy do `registry_products` z `on delete restrict` dodaje `20260924120000_registry_schema.sql:187-191`.
- `medication_substances` (`medication_schema.sql:45-59`): `substance_name`, `atc_code`. Kontrola kształtu ATC przyjmuje każdy poziom (A01 … A01AB02, `:52-56`). F-02 zmieniło `atc_code` na nullable (`registry_schema.sql:168-169`). Klucz unikalny to `unique nulls not distinct (medication_id, substance_name, atc_code)` (`registry_schema.sql:178-183`).
- `dosage_periods` (`medication_schema.sql:71-94`): `dose_text`, `started_on`, `ended_on`, generowana kolumna `period daterange '[)'`, `check (ended_on > started_on)`, `exclude using gist (medication_id with =, period with &&)`.
- **Okno korekty**: `medication_correction_window_open(uuid)` (`medication_schema.sql:222-240`) to zaślepka, która zawsze zwraca `true`. Z komentarza wynika, że S-05 podmieni jej treść. EXECUTE odebrane `anon` i `authenticated` (`20260929120000_revoke_account_truncate_and_window_execute.sql:29`).
- **Wyzwalacze** (`medication_schema.sql:390-408`):
  - chronią rdzeń na `medication_substances` (nazwa, kod, `medication_id`) i na `dosage_periods` (`dose_text`, `started_on`, `medication_id`, ustawione `ended_on`);
  - `medications_guard_delete` blokuje usunięcie przy zamkniętym oknie.
  - **Brak**: wyzwalacza UPDATE na `medications`.
- **RLS**: 12 polityk, 4 operacje × 3 tabele, wszystkie `to authenticated` (`medication_schema.sql:106-216`). Tabele podrzędne sprawdzają właściciela przez `exists (… medications …)`.

### 2. Baza — rejestr i pary (F-02)

- `registry_products` (`registry_schema.sql:19-45`), m.in. `product_name`, `common_name`, `strength`, `pharmaceutical_form`, `atc_codes text[]`, `source_payload`.
- `registry_substances` (`registry_schema.sql:54-83`), m.in. `position`, `substance_name`, `normalized_name`, `atc_code`, `atc_source`.
  - `derived_ambiguous` to jedna substancja zapisana jako kilka wierszy, po jednym na każdy kandydujący kod.
  - `unmatched` oznacza `atc_code = null`.
  - Indeks `atc_code text_pattern_ops` pod dopasowanie prefiksem (`:88-90`).
- `interaction_pairs` (`registry_schema.sql:103-127`):
  - kolumny `group_a <= group_b`, `description` (tekst dla użytkowniczki), `source`, `verified_on`;
  - grupa może tworzyć parę sama ze sobą (M01AE×M01AE).
- **Reguła dopasowania** jest zapisana wyłącznie jako komentarz tabeli (`registry_schema.sql:92-93`). Brzmienie komentarza: kod dowolnej substancji leku zaczyna się od `group_a`, a kod dowolnej substancji _innego_ leku od `group_b`, lub odwrotnie. Sprawdza ją blok 11b w `supabase/tests/rls_checks.sql:707-725`.
- **Zmierzone w lokalnej bazie (2026-09-29)**:
  - `registry_products`: 3273 wiersze, 1101 różnych `product_name`, 1095 różnych `lower(product_name)`;
  - najczęstsze nazwy: Bibloc 42×, Diuver 38×, Triplixam 34×, Norvasc 29×, „Concor Cor 2,5” 28× (dawka wklejona w nazwę);
  - `registry_substances` z `atc_code is null`: 31 wierszy.
  - Nagłówek seeda podaje te same 3273 i 31 oraz 24 pary w 14 grupach (`20260924130000_registry_seed.sql:11-19`).
- **Brak**:
  - funkcji i widoku liczącego kolizje;
  - indeksu wyszukiwania po nazwie (brak `pg_trgm`, brak indeksu na `lower(product_name)`).
  - Przy 3273 wierszach pełny skan `ilike` wystarczy — to wniosek, nie pomiar czasu.

### 3. Baza — zapis leku i bramki SQL

- Nie ma żadnego RPC. `src/types.ts:75-102` definiuje trzy osobne komendy (`NewMedicationCommand`, `NewMedicationSubstanceCommand`, `NewDosagePeriodCommand`). Zapis przez PostgREST to dziś trzy nieatomowe inserty.
- INVARIANT 7 (`supabase/tests/schema_invariants_checks.sql:15-16`) zabrania `anon`/`authenticated` EXECUTE na funkcji `security definer`, która nie jest funkcją wyzwalacza. Nowe RPC musi więc być `security invoker`. Supabase domyślnie nadaje EXECUTE nowym funkcjom, więc potrzebny jest jawny `revoke … from anon`.
- INVARIANT 9 (`schema_invariants_checks.sql:18`): każdy widok w `public` musi być `security_invoker`, inaczej `anon`/`authenticated` nie mogą mieć do niego żadnych uprawnień.
- INVARIANT 8: lista wyzwalaczy historii. Nowy wyzwalacz na `medications` trzeba do niej dopisać (`context/foundation/test-plan.md:153`).
- Bramki:
  - `npm run db:check` → `scripts/db-checks.mjs` uruchamia każdy `supabase/tests/*.sql` w lokalnym kontenerze i wymaga znacznika `GATE_COMPLETE`.
  - Sondy negatywne są w `scripts/db-checks/probes/`, podpięte w `.github/workflows/ci.yml:79-91`.
  - Izolacja per rola działa w `account_isolation_checks.sql` na fiksturach.

### 4. Aplikacja — wzorce

- **Menu i ochrona tras**:
  - `NAV_ITEMS` jest puste (`src/lib/navigation.ts:8`).
  - `PROTECTED_ROUTES = ["/dashboard", ...NAV_ITEMS.map(href)]` (`src/middleware.ts:13`), a dopasowanie prefiksem (`:56-60`) chroni też podtrasy (`/leki/[id]`).
  - Zakładki na telefonie pokazują się dopiero przy niepustym `NAV_ITEMS` (`src/layouts/AppLayout.astro:15, 68-93`).
- **Trasy API**:
  - wzorzec `src/pages/api/auth/password-reset-request.ts`: `formData()` → zod `safeParse` → błąd jako `redirect(?error=<kod z modułu copy>)`, log bez danych osobowych, sukces jako redirect;
  - starsze trasy startera przekazują surowe `error.message` (`signin.ts:18`) — nie kopiować;
  - zod `^4.6.5` jest w `package.json:40`.
- **Formularze**: React z `client:load`, natywny `<form method="POST">`, walidacja w `onSubmit` (`src/components/auth/SignInForm.tsx:36-43`), `useSubmitting` (`src/components/hooks/useSubmitting.ts:5-24`). Trasy JSON nie ma — podpowiedzi przy wyszukiwaniu leku byłyby pierwszą.
- **Moduł copy**:
  - `src/lib/copy/password-recovery.ts`: obiekt `as const`, mapa `apiErrors`, `apiErrorMessage()` z białą listą (`:57-79`);
  - nie ma testu, który mógłby posłużyć za wzór;
  - `scripts/fr012/corpus.mjs:3` zapowiada, że S-02 czyta korpus dla tekstów interfejsu.
- **Tokeny**:
  - bursztynowe `--interaction`, `--interaction-foreground`, `--interaction-border` są w obu motywach (`src/styles/global.css:36-38, 75-77, 118-120`);
  - para `interaction-foreground`/`interaction` jest sprawdzana automatycznie;
  - bursztynowy tekst na `card` lub `background` wymaga wpisu w `EXPLICIT_PAIRS` (`scripts/tokens/contrast.mjs:20-32`).
- **Komponenty shadcn**: jest tylko `button.tsx`. Input, label, card, badge i ewentualne popover/command trzeba dodać przez `npx shadcn@latest add` i oczyścić z klas `dark:`.
- **Typy**: w `src/types.ts` są encje (`:18-65`, `:124-172`), ale brakuje DTO wiersza listy ze znacznikiem, szczegółów leku i wyniku wyszukiwania.
- **Smoke**:
  - kroki to krotki `[name, fn, expected]` (`scripts/smoke.mjs:685-708`);
  - `request()` zwraca tylko `{status, location}` i porzuca treść (`:87-100`) — krok „widok z kolizją zawiera notę” wymaga nowego helpera zwracającego body;
  - fiksturę izolacji zapewniają `createAccount`/`seedMedication` (`:139-177`);
  - `isolationTargets` to ręczna lista.

### 5. Filtr języka a teksty S-02

- `forbiddenWordsIn` (`scripts/rpl/pairs.mjs:75-78`) sprawdza wystąpienie podciągu po NFC i zamianie na małe litery.
- `FORBIDDEN_WORDS` (`pairs.mjs:24-61`) zawiera m.in. `bezpieczn` i `dawk`. Komentarz `pairs.mjs:22` przyznaje, że `dawk` blokuje każdą wzmiankę o dawce.
- Wniosek: moduł copy, który kontrakt każe testować w całości (`roadmap.md:210`), nie może zawierać etykiet „Dawka”, objaśnienia „Dawka ma historię” (`design-draft.md:198`) ani nazwy pola. Makieta pod listą ma zdanie z „bezpieczne” (`design-draft.md:187`) — kontrakt nazywa je jedynym wyjątkiem.
- `REQUIRED_WORDING = "może mieć związek"` (`pairs.mjs:65`) obowiązuje opisy par. Kontrakt S-02 dla tekstów interfejsu wymaga tylko zera trafień oraz istnienia noty i zdania o bezpieczeństwie. FR-006 i makieta używają formuły „może wchodzić w interakcję” (`prd.md:130`, `design-draft.md:185`).

## Code References

- `supabase/migrations/20260922120000_medication_schema.sql:17-94` — tabele konta
- `supabase/migrations/20260922120000_medication_schema.sql:222-240` — zaślepka okna korekty
- `supabase/migrations/20260922120000_medication_schema.sql:390-408` — wyzwalacze historii
- `supabase/migrations/20260924120000_registry_schema.sql:92-93` — reguła dopasowania (komentarz)
- `supabase/migrations/20260924120000_registry_schema.sql:178-183` — klucz unikalny substancji
- `supabase/tests/schema_invariants_checks.sql:10-18` — INVARIANT 3–9
- `supabase/tests/rls_checks.sql:707-725` — przykład dopasowania par
- `src/lib/navigation.ts:8`, `src/middleware.ts:13` — menu i ochrona tras
- `src/pages/api/auth/password-reset-request.ts` — wzorzec trasy
- `src/lib/copy/password-recovery.ts` — wzorzec modułu copy
- `scripts/rpl/pairs.mjs:24-78` — filtr języka
- `scripts/fr012/corpus.mjs` — korpus FR-012
- `scripts/smoke.mjs:87-100, 139-177, 685-708` — helpery i kroki smoke
- `src/styles/global.css:36-38` — tokeny `interaction*`

## Architecture Insights

- Model danych celowo kopiuje skład do `medication_substances`, zamiast odwoływać się do rejestru (`context/archive/2026-09-22-medication-schema-rls/plan-brief.md:40`). Kolizja liczy się z kopii, więc lek z ulotki i lek z rejestru idą tą samą ścieżką.
- Dopasowanie prefiksem kodu ATC przy parach na poziomie 5 znaków. Każdy kod substancji przyjęty z ulotki musi mieć co najmniej 5 znaków, żeby mógł trafić w grupę — wniosek z kształtu danych, nie reguła zapisana w kodzie.
- Ochrona historii jest w bazie (wyzwalacze), nie w aplikacji. Nowa gwarancja na `medications` idzie tym samym torem i do INVARIANT 8.
- Sekrety i dostęp: każda trasa domenowa działa na kliencie z sesji (RLS), nigdy na kluczu serwisowym. Wzorzec `createClient(headers, cookies)` w `src/lib/supabase.ts:5-21`.

## Historical Context (from prior changes)

**Rozstrzygnięte:**

- `context/archive/2026-09-23-interaction-rules-seed/follow-ups/review-fixes.md:5-16`, impl-review F2 — dług przekazany do S-02: wyzwalacz UPDATE i kontrola spójności na `medications`, sprawdzenia z nazwanym błędem `P0001`.
- `context/archive/2026-09-23-interaction-rules-seed/plan.md:88` — wzmianka o źródle RPL (CC BY 4.0) w interfejsie należy do S-02.
- `context/archive/2026-09-23-interaction-rules-seed/plan.md:92-93` — grupowanie duplikatów nazw przy wyszukiwaniu i logika dopasowania par należą do S-02.
- `context/archive/2026-09-23-interaction-rules-seed/plan.md:85-87` oraz lekcja „Niepełny zbiór reguł…” — kopiować pełny skład, łącznie z kandydatami `derived_ambiguous`.
- `context/archive/2026-09-29-testing-language-guard/reviews/plan-review.md:35` — konflikt `bezpieczn`/`dawk` został nazwany. Kontrakt w roadmapie rozwiązał tylko `bezpieczn`.
- `context/foundation/test-plan.md:142-160` (§6.4) — checklista dla nowej tabeli, widoku i funkcji.

**Otwarte:**

- `review-fixes.md:14`, `roadmap.md:205` — czy `product_name` należy do rdzenia wpisu.
- `review-fixes.md:28-36`, `roadmap.md:206` — decyzja F7 o kluczu unikalności substancji.

**Wymaga weryfikacji:**

- Raport z sesji planowania F-02 podaje 20 258 produktów i 9 591 nazw (`interaction-rules-seed/plan.md:40-43`). Te liczby dotyczą całego RPL i nadal są prawdziwe dla źródła. Dla zbioru wgranego do bazy obowiązują zmierzone 3273 produkty i 1101 nazw.

## Related Research

- `context/archive/2026-09-29-testing-language-guard/research.md` — nota i jej miejsce (`:164`) zostawione S-02.
- `context/archive/2026-09-28-testing-sql-gate-in-ci/research.md:102` — brak ochrony INSERT do tabel podrzędnych przy zamkniętym oknie (realne od S-05).

## Open Questions

Wybory dla `/10x-plan`, z tym, co każdy z nich przesądza na później:

1. **Lek spoza rejestru — skąd kod ATC?**
   - Warianty:
     - wybór substancji z listy `registry_substances.normalized_name` (kod przychodzi z danych, lek uczestniczy w regułach);
     - wolny tekst bez kodu (`atc_code = null`, lek nigdy nie dostanie znacznika);
     - lista z ucieczką do wolnego tekstu.
   - Przesądza, czy wymóg FR-003 „na tych samych zasadach” jest spełniony.
   - Non-Goal `prd.md:206` pozwala na jedną substancję, więc preparat złożony z ulotki straci składniki. To napięcie z lekcją „Niepełny zbiór reguł…” — trzeba je nazwać w planie, nie zamiatać.
2. **Substancja bez kodu (31 wierszy w rejestrze, każda z wolnego tekstu).**
   - Jak interfejs mówi, że nie jest sprawdzana żadną regułą? Bez tego brak znacznika wygląda jak potwierdzenie bezpieczeństwa.
3. **F7 — unikalność substancji.**
   - Warianty:
     - normalizacja nazwy przy zapisie — logika jest w Node (`scripts/rpl/normalize.mjs`), nie w SQL;
     - częściowy indeks `(medication_id, atc_code) where atc_code is not null` — nie koliduje z `derived_ambiguous`, bo tam kody są różne.
   - Niezależnie od wyboru zapytanie o kolizje musi deduplikować po `(medication_id, atc_code)` i wykluczać parę leku z samym sobą (M01AE×M01AE).
4. **`product_name` w rdzeniu wpisu.**
   - PRD wymienia jako rdzeń substancję, dawkę i datę rozpoczęcia.
   - Nazwa handlowa poza rdzeniem pozwala poprawić literówkę w leku z ulotki. W rdzeniu blokuje przepięcie nazwy razem z `registry_medication_id`.
5. **Gdzie liczyć kolizję.**
   - Warianty:
     - widok lub funkcja SQL `security invoker`: jedno źródło, testowalne w `db:check`, INVARIANT 9;
     - kod TypeScript w `src/lib/services/`: testowalny `node --test`, ale logika w dwóch miejscach, jeśli S-08 potrzebuje jej w SQL.
   - Plan F-02 mówił „kod aplikacji” (`interaction-rules-seed/plan.md:93`). To opis podziału pracy, nie wybór technologii.
6. **Zapis atomowy.**
   - Warianty:
     - RPC `security invoker` wstawiające lek, skład i pierwszy okres w jednej transakcji;
     - trzy inserty z trasy, z ryzykiem leku bez okresu po błędzie w połowie.
7. **Wyszukiwarka.**
   - Podpowiedzi przez trasę GET JSON (pierwsza taka w repozytorium) albo wyszukiwanie renderowane serwerowo po wysłaniu formularza.
   - Grupowanie 3273 produktów w 1101 nazw — co pokazać przy nazwie z wieloma mocami i postaciami (`strength`, `pharmaceutical_form`).
8. **Podział modułu copy.**
   - Tekst o kolizji (nota, zdanie o bezpieczeństwie, etykieta znacznika) w module testowanym `forbiddenWordsIn`, teksty formularza z „dawką” osobno. Albo jawna lista wyjątków w teście.
   - Plus brzmienie noty: „może wchodzić w interakcję” (FR-006) — czy tekst interfejsu wymaga też „może mieć związek”.
9. **Zaślepka okna korekty.**
   - Wyzwalacz UPDATE na `medications` da się dziś sprawdzić tylko przez tymczasową podmianę funkcji w transakcji testu. Wzorzec już istnieje: `supabase/tests/account_isolation_checks.sql:656-744` podmienia treść funkcji i sprawdza odcisk `md5(pg_get_functiondef(...))` po przywróceniu.
   - Czy UI S-02 w ogóle potrzebuje stanu okna — jeśli tak, potrzebne jest osobne RPC, bo EXECUTE jest odebrane.
10. **Poza zakresem planu, ale blokujące użycie na produkcji:** Q#33 — gdzie leżą prawdziwe dane autorki (`roadmap.md`, Open Roadmap Questions). Nie blokuje implementacji.
