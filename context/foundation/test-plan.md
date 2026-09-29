# Test Plan

> Phased test rollout for this project. Strategy is frozen at the top
> (§1–§5); cookbook patterns at the bottom (§6) fill in as phases ship.
> Read before writing any new test.
>
> Refresh: re-run `/10x-test-plan --refresh` when stale (see §8).
>
> Last updated: 2026-09-28

## 1. Strategy

Testy w tym projekcie trzymają się trzech nienegocjowalnych zasad:

1. **Koszt × sygnał.** Wygrywa najtańszy test, który daje prawdziwy sygnał
   dla danego ryzyka. Nie awansuj testu do e2e, bo e2e „wydaje się
   bezpieczniejsze”. Nie kładź modelu wizyjnego na deterministycznym
   porównaniu, które już łapie regresję.
2. **Obawy autorki są pełnoprawnym dowodem.** Ryzyko zakotwiczone w „boję
   się X, a awaria wyszłaby gdzieś w <obszar>” waży tyle samo co linia PRD
   czy dane o zmianach w kodzie.
3. **Ryzyka to scenariusze, nie miejsca w kodzie.** Ten plan opisuje, _co
   może zawieść_ i _dlaczego uważamy to za prawdopodobne_ — na podstawie
   dokumentów, wywiadu i _sygnału_ z kodu (częstotliwość zmian, struktura,
   stan testów). NIE twierdzi, że wie, która linia odpowiada za awarię. Tę
   wiedzę wytwarza `/10x-research` w każdej fazie rolloutu. Jeśli plan i
   research różnią się co do miejsca awarii, prawdą jest research.

Zakres hot-spotów użyty do oceny prawdopodobieństwa: `src/`, `scripts/`,
`supabase/` (bez `context/`, `docs/`, `.claude/`, locków i buildu).

## 2. Risk Map

Najważniejsze scenariusze awarii, uporządkowane według wpływ ×
prawdopodobieństwo. Kolumna Source cytuje _dowód, który wyniósł ryzyko_ —
nigdy plik jako „miejsce awarii” (patrz §1, zasada 3).

| #   | Risk (failure scenario)                                                                                                                                                       | Impact | Likelihood | Source (evidence — not anchor)                                                                                                                                                   |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Druga osoba po zalogowaniu widzi, zmienia lub usuwa leki albo objawy innego konta, bo nowa tabela lub nowa trasa pominęła izolację per konto                                  | High   | High       | wywiad P1; PRD §Wymagania niefunkcjonalne (izolacja per konto); roadmapa S-02, S-05 (nowe tabele i trasy); hot-spot `supabase/migrations` (7 zmian/30d), `src/pages/api` (9/30d) |
| 2   | Komunikat o kolizji stwierdza przyczynę, sugeruje odstawienie lub zmianę dawki albo pozwala odczytać brak znacznika jako „bezpieczne” — pacjent się przestraszy i odstawi lek | High   | Medium     | wywiad P1; PRD FR-012, FR-007, guardrails; lessons „Filtr języka wymaga formuły”                                                                                                 |
| 3   | Migracja po cichu łamie nienaruszalność historii (nadpisany okres, rdzeń wpisu edytowalny po oknie korekty, wyłączony wyzwalacz), a wycofanie kodu nie cofa migracji          | High   | High       | wywiad P3; hot-spot `supabase/migrations` (7/30d); infrastructure.md rejestr ryzyk (rollback kodu ≠ rollback migracji); roadmapa S-05 (okno korekty jako zaślepka)               |
| 4   | Regresja RLS lub niezmiennika bazy trafia na produkcję, bo sprawdzenia SQL nie biegną przed merge'em, a merge do `main` wdraża                                                | High   | High       | wywiad P4; tech-stack.md (auto-deploy po merge'u); archiwum F-01 (sprawdzenia SQL uruchamiane ręcznie)                                                                           |
| 5   | Nadużycie odzyskiwania dostępu: link działa po wygaśnięciu lub drugi raz, a sesja z linku wychodzi poza ekran nowego hasła i otwiera cudze dane zdrowotne                     | High   | Medium     | roadmapa S-10; archiwum password-recovery (wygaśnięcie sprawdzane tylko ręcznie); hot-spot `src/components/auth` (13/30d), `src/pages/auth` (8/30d)                              |
| 6   | Dane zdrowotne zostają w bazie po usunięciu konta, bo nowa tabela nie jest usuwana razem z kontem                                                                             | High   | Medium     | wywiad P1 (przechowywanie danych medycznych); PRD §Wymagania niefunkcjonalne (usunięcie konta bez kopii); roadmapa S-09                                                          |

Warstwa nadużyć: #1 (autoryzacja, IDOR) i #5 (przejęcie dostępu).
Ryzyka o wysokim wpływie i niskim prawdopodobieństwie (limit CPU Workera,
doręczalność maili bez SMTP) należą do obserwowalności i ręcznej
weryfikacji produkcji, nie do tego rolloutu.

### Risk Response Guidance

| Risk | What would prove protection                                                                                                                                                                          | Must challenge                                                                                          | Context `/10x-research` must ground                                                                                      | Likely cheapest layer                                     | Anti-pattern to avoid                                                               |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| #1   | Konto B nie czyta, nie zmienia i nie usuwa wierszy konta A w każdej tabeli z danymi użytkownika — dla każdej operacji osobno                                                                         | „Jest RLS, więc izolacja działa” — polityka może istnieć tylko dla SELECT albo tylko dla jednej roli    | lista tabel z danymi użytkownika, role, polityki per operacja, zachowanie PostgREST przy odmowie (pusty wynik, nie błąd) | SQL przeciw lokalnej bazie + krok smoke na dwóch kontach  | test z jednym kontem; „brak błędu” uznany za dowód blokady                          |
| #2   | Każdy tekst o kolizji zawiera „może mieć związek” i nie zawiera formuł przyczynowych ani zaleceń; przy każdej kolizji jest nota poglądowa; produkt mówi, że brak ostrzeżenia nie znaczy „bezpieczne” | „Nie ma zakazanego słowa, więc tekst jest poprawny”                                                     | wszystkie źródła tekstów o kolizji (seed, UI), droga tekstu do widoku                                                    | unit (`node:test`), przy UI jeden krok smoke              | wyrocznia skopiowana z walidatora — oczekiwane frazy biorą się z FR-012, nie z kodu |
| #3   | Po każdej migracji zmiana dawki nadal zamyka okres i otwiera nowy, a rdzeń wpisu po zamknięciu okna jest nie do zmiany i nie do usunięcia — także przez rodzica                                      | „Sprawdzenia SQL przechodzą, więc produkcja jest chroniona” — test może podmieniać funkcję okna korekty | wyzwalacze, kaskady, sposób podmiany okna w testach, stan bazy po `supabase db reset`                                    | SQL przeciw lokalnej bazie po pełnym odtworzeniu migracji | `exception when others` zamiast nazwanego błędu                                     |
| #4   | PR łamiący RLS albo niezmiennik nie przechodzi CI, a błąd wskazuje złamane sprawdzenie                                                                                                               | „Mam skrypt, więc jestem chroniona”                                                                     | jak job smoke stawia bazę, jak wynik sprawdzeń zamienia się na kod wyjścia                                               | bramka CI                                                 | bramka, która zawsze kończy się kodem 0; bramka idąca do bazy produkcyjnej          |
| #5   | Link wygasły lub użyty drugi raz nie daje sesji; sesja z linku otwiera wyłącznie ekran nowego hasła i jego endpointy                                                                                 | „Smoke przechodzi, więc przeglądarka też”                                                               | czas życia tokenu lokalnie, reguła rozpoznawania sesji z linku, lista tras chronionych                                   | smoke przez mailpit                                       | smoke dopisuje nagłówki, których przeglądarka nie wyśle                             |
| #6   | Każda tabela z danymi użytkownika jest usuwana razem z kontem                                                                                                                                        | „Dziś kaskady są, więc będą” — każda nowa tabela to nowa okazja do pominięcia                           | powiązania tabel z kontem, kolejność kaskad, tabele współdzielone vs prywatne                                            | SQL sprawdzający katalog bazy                             | lista tabel wpisana ręcznie w test zamiast wyprowadzona z katalogu                  |

## 3. Phased Rollout

Każdy wiersz to osobna faza rolloutu, otwierająca własny folder zmiany
przez `/10x-new`. Status przesuwa się od lewej do prawej; orkiestrator
aktualizuje go, gdy artefakty pojawiają się na dysku.

| #   | Phase name                               | Goal (one line)                                                                                                                 | Risks covered | Test types                         | Status        | Change folder                                      |
| --- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------- | ---------------------------------- | ------------- | -------------------------------------------------- |
| 1   | Bramka SQL w CI                          | Udowodnić, że PR łamiący RLS lub niezmiennik historii nie przejdzie CI                                                          | #4, #1, #3    | CI gate + SQL                      | complete      | context/archive/2026-09-28-testing-sql-gate-in-ci/ |
| 2   | Niezmienniki schematu dla każdej tabeli  | Udowodnić, że nowa tabela bez RLS per operacja lub bez usuwania razem z kontem wywraca bramkę, zanim S-02 i S-05 dodadzą tabele | #1, #3, #6    | integration (SQL na katalogu bazy) | change opened | context/changes/testing-schema-invariants/         |
| 3   | Strażnik języka FR-012                   | Udowodnić, że żaden tekst o kolizji nie stwierdza przyczyny ani nie zaleca zmian, i że nota poglądowa jest zawsze obecna        | #2            | unit + smoke step                  | not started   | —                                                  |
| 4   | Odzyskiwanie dostępu bez kroków ręcznych | Udowodnić automatycznie, że wygasły lub zużyty link nie daje sesji, a sesja z linku nie wychodzi poza ekran nowego hasła        | #5            | smoke / integration                | not started   | —                                                  |

Kolejność: faza 1 jest najtańsza i zamyka lukę z wywiadu (P4). Faza 2
musi wejść przed kolejnymi migracjami (P3). Faza 3 przed UI znaczników
kolizji w S-02. Faza 4 na końcu — smoke już pokrywa większość ścieżki.

## 4. Stack

| Layer              | Tool                                          | Version                    | Notes                                                                  |
| ------------------ | --------------------------------------------- | -------------------------- | ---------------------------------------------------------------------- |
| unit               | `node:test` (`npm test`)                      | Node 22.14.0               | 10 plików w `scripts/`; brak testów w `src/`                           |
| integration (baza) | sprawdzenia SQL przeciw lokalnemu Supabase    | Supabase CLI (latest w CI) | w CI w jobie smoke (`npm run db:check`)                                |
| smoke              | `scripts/smoke.mjs` przeciw `npm run preview` | —                          | w CI na lokalnym Supabase z mailpit                                    |
| e2e w przeglądarce | none yet                                      | —                          | nie planowane; sprawdzenia formularzy ręcznie w przeglądarce (lessons) |
| visual diff        | none                                          | —                          | świadomie poza zakresem, patrz §7                                      |

Stan testów: `sparse` — runner jest, ale testy skupiają się w `scripts/`,
a kod aplikacji nie ma żadnych.

**Stack grounding tools (current session):**

- Docs: none — Context7 not available in current session; checked: 2026-09-28
- Search: WebSearch (web search tool) — not used; no new tool recommended; checked: 2026-09-28
- Runtime/browser: Chrome automation (claude-in-chrome) — not used; possible manual check of forms after header changes; checked: 2026-09-28
- Provider/platform: `gh` CLI (no GitHub/Supabase/Cloudflare MCP) — possible CI status checks; checked: 2026-09-28

## 5. Quality Gates

| Gate                                  | Where                         | Required?                 | Catches                                                                          |
| ------------------------------------- | ----------------------------- | ------------------------- | -------------------------------------------------------------------------------- |
| lint + typecheck                      | pre-commit (lint-staged) + CI | required                  | błędy składni i typów                                                            |
| unit (`npm test`)                     | CI                            | required                  | regresje parsera RPL, tokenów kolorów, nawigacji; po Phase 3 także języka FR-012 |
| smoke                                 | CI (lokalny Supabase)         | required                  | zepsuta ścieżka auth, izolacja dwóch kont, dostęp do tabel współdzielonych       |
| sprawdzenia SQL (RLS i niezmienniki)  | CI                            | required after §3 Phase 1 | złamane RLS, wyzwalacze historii, niezmienniki danych                            |
| niezmienniki katalogu bazy            | CI                            | required after §3 Phase 2 | nowa tabela bez RLS per operacja lub bez usuwania z kontem                       |
| automatyczne wygaśnięcie linku resetu | CI (smoke)                    | required after §3 Phase 4 | link działający po czasie lub drugi raz                                          |

## 6. Cookbook Patterns

### 6.1 Adding a unit test

- TBD — see §3 Phase 3 (wzorzec: walidator tekstu o zdrowiu z wyrocznią z FR-012).

### 6.2 Adding a database invariant check (SQL)

- **Gdzie**: nowy plik `supabase/tests/<nazwa>.sql`. Runner bierze każdy `*.sql` z tego katalogu sam, bez rejestracji. Wzorce: `rls_checks.sql` (schemat, wyzwalacze historii), `account_isolation_checks.sql` (RLS per operacja na dwóch kontach i `anon`).
- **Szkielet pliku**: `\set ON_ERROR_STOP on`, `begin;`, sprawdzenia w blokach `do $$ … $$`, na końcu `rollback;`. Dane testowe jako `postgres`, stałe UUID z puli innej niż w pozostałych plikach.
- **Znacznik ukończenia**: tuż przed `rollback;` blok z `raise notice 'GATE_COMPLETE <nazwa pliku bez .sql>'`. Bez niego runner uznaje plik za czerwony, nawet przy kodzie 0.
- **Nazwany błąd**: łap wyłącznie konkretny SQLSTATE (`42501`, `P0001`, `exclusion_violation`), nigdy `when others`, i sprawdź treść komunikatu (`get stacked diagnostics … = message_text`). Przykłady: blokada RLS → `42501` z „row-level security” albo „permission denied”; wyzwalacz historii → `P0001` z „okno korekty … jest już zamknięte” i nazwą pola.
- **Brak błędu to nie dowód**: gdy blokada daje zero wierszy bez błędu (UPDATE/DELETE cudzego wiersza pod RLS), sprawdź `row_count = 0`, a potem jako `postgres`, że wiersz jest nietknięty.
- **Przełączanie ról**: `set_config('request.jwt.claims', '{"sub":"<uuid>","role":"authenticated"}', true)` i `execute 'set local role authenticated'` (dla `anon`: `{"role":"anon"}`, rola `anon`). Zawsze poza podblokiem `begin … exception … end` — w środku cofnie się razem z błędem i reszta pobiegnie jako `postgres`. Blok zaczyna się asercją `current_user` i `auth.uid()`, po każdym przypadku `execute 'reset role'`.
- **Kontrprzykład właściciela**: każda blokada ma obok ten sam zapis wykonany przez właściciela na swoim wierszu, z `row_count = 1`. Bez tego blokada może wynikać z literówki, a nie z polityki.
- **Uruchomienie**: `npm run db:check` (wymaga `npx supabase start`), pojedynczy plik: `node scripts/db-checks.mjs supabase/tests/<nazwa>.sql`. Plik biegnie w transakcji z rollbackiem, nic nie zostaje w bazie.
- **CI**: job `smoke`, krok „SQL checks”, zaraz po starcie lokalnego Supabase. Czerwony krok zatrzymuje deploy.
- **Reguły katalogu**: `schema_invariants_checks.sql` wyprowadza tabele z danymi konta z katalogu bazy (domknięcie kluczy obcych do `auth.users`) i sprawdza ich strukturę (INVARIANT 1–8). `account_isolation_checks.sql` bierze ten sam zbiór i dowodzi zachowania. Nowej tabeli nie wpisuje się do listy w sprawdzeniu — patrz §6.4.
- **Próbka czerwonej bramki**: nowa reguła dostaje próbkę w `scripts/db-checks/probes/` — `begin;` i DDL psujące jedną regułę. Runner dokleja ją przed plik sprawdzeń: `node scripts/db-checks.mjs --probe <próbka> <plik sprawdzeń>`. W CI dopisz wywołanie `expect_invariant_failure` z oczekiwanym tekstem `… FAILED` (`.github/workflows/ci.yml`, krok „SQL checks”). Próbka pada z innego powodu = niczego nie zmierzyła.

### 6.3 Adding a smoke step

- TBD — see §3 Phase 4 (wzorzec: link z maila przez mailpit, nagłówki jak z przeglądarki).

### 6.4 Adding a new table with user data

Migracja z nową tabelą z danymi konta przejdzie bramkę, gdy ma:

- **klucz obcy do konta**: do `auth.users` albo do istniejącej tabeli konta, z `on delete cascade`. Bez klucza tabela nie należy do żadnego zbioru i pada INVARIANT 1. Inna reguła usuwania niż `cascade` wywraca INVARIANT 2.
- **RLS i cztery polityki w tej samej migracji**: SELECT, INSERT, UPDATE, DELETE, każda osobno dla `authenticated`, z niepustym wyrażeniem wiążącym wiersz z `auth.uid()`. Bez `for all` i bez `using (true)`.
- **`revoke truncate on public.<tabela> from anon, authenticated`**: `TRUNCATE` omija RLS i strażników historii (INVARIANT 6).
- **nowa funkcja `security definer`**: `revoke execute … from anon` jawnie. `revoke … from public` nie wystarcza (INVARIANT 7).

Potem w sprawdzeniach i smoke:

- **wiersz w mapie danych testowych** `isolation_fixtures` w `supabase/tests/account_isolation_checks.sql` i wiersze kont A i B wstawione w ISOLATION 0. Bez nich pada `ISOLATION 0 FAILED: <tabela> has no test data`. Z mapą tabela sama przechodzi ISOLATION 1–6: odczyt, zapis, zmiana, przepięcie, usunięcie i usunięcie konta.
- **nowy strażnik historii** (wyzwalacz blokujący zmianę rdzenia wpisu): wpis na liście w INVARIANT 8 `schema_invariants_checks.sql`. Strażnik nie wynika ze struktury bazy.
- **cztery kroki izolacji** w `scripts/smoke.mjs` (`isolationTargets`). Lista ręczna — bramka SQL jej nie pilnuje, pilnuje tylko ta checklista.
- **`npm run db:check` lokalnie przed PR** (wymaga `npx supabase start` i `npx supabase db reset` po nowej migracji).

Tabela wspólna tylko do odczytu (słownik, rejestr) to świadomie inna droga: bez klucza do konta, dopisana do listy tabel wspólnych w **obu** plikach (`schema_invariants_checks.sql` i `account_isolation_checks.sql`), wyłącznie polityki SELECT i `revoke insert, update, delete, truncate … from anon, authenticated` (INVARIANT 5).

### 6.5 Per-rollout-phase notes

(Uzupełniane po każdej fazie.)

- **Faza 2 (niezmienniki schematu)**: katalog bazy wyznacza zbiór tabel konta i łapie jawne braki: brak klucza lub kaskady, brak RLS, brak polityki na operację, `TRUNCATE`, `EXECUTE` dla `anon`, brak strażnika. Katalog nie powie, czy polityka faktycznie wiąże wiersz z kontem — `using (medication_id is not null)` przejdzie każdą regułę strukturalną. To dowodzi wyłącznie zachowanie na dwóch kontach (ISOLATION 1–6). Dlatego brak danych testowych dla tabeli z katalogu to porażka, nie pominięcie.

## 7. What We Deliberately Don't Test

- **Zrzuty ekranu i porównania wyglądu** — autorka ogląda ekrany sama, koszt utrzymania przewyższa sygnał. Kontrast i kolory na sztywno pilnują istniejące testy tokenów. Wróć do tematu, jeśli regresje wizualne zaczną trafiać na produkcję. (Source: Phase 2 interview Q5.)

## 8. Freshness Ledger

- Strategy (§1–§5) last reviewed: 2026-09-28
- Stack versions last verified: 2026-09-28
- AI-native tool references last verified: 2026-09-28

Refresh (`/10x-test-plan --refresh`) when:

- a new top-3 risk surfaces from the roadmap or archive,
- a recommended tool's `checked:` date is older than three months,
- the project's tech stack changes (new framework, new test runner),
- §7 negative-space no longer matches what the team believes.
