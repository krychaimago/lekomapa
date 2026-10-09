# Okno korekty wpisu dzienniczka (S-07) — plan implementacji

## Overview

Użytkowniczka może poprawić wpis dzienniczka (data i godzina, objawy, nasilenie, notatka) w oknie korekty — 24 h od zapisu, zegarem serwera — oraz usunąć wpis dodany przez pomyłkę, wyłącznie w tym oknie. Po zamknięciu okna rdzeń wpisu jest tylko do odczytu, a notatkę można zmienić zawsze (FR-009). Reguła w bazie istnieje od S-05; S-07 dokłada drogę do niej: funkcje zapisu z nazwanymi kodami, trasy API, ekran wpisu i ekran usunięcia.

## Current State Analysis

- Baza pilnuje okna od S-05 (`supabase/migrations/20261005130000_symptom_journal.sql`): po 24 h wyzwalacze odrzucają zmianę `occurred_at` (:223-246), dodanie, zmianę, przeniesienie i usunięcie objawu (:291-380) oraz usunięcie wpisu (:251-274) błędem `P0001` „okno korekty … jest już zamknięte”. Notatka zostaje edytowalna (:230-231). SE001 (co najmniej jeden objaw) sprawdzany przy zatwierdzeniu transakcji (:468-476); SE002/SE003 (przyszłość, ponad 14 dni wstecz) liczone od `now()` przy każdej zmianie `occurred_at`, zapis tej samej wartości przechodzi (:396-399).
- Sprawdzenia SQL już dowodzą reguły przy bezpośrednich zapisach do tabel: `supabase/tests/symptom_journal_checks.sql` JOURNAL 6 (okno 23 h 59 min vs 24 h, :460-555) i JOURNAL 7 (notatka po 3 dniach, :558-582). Brak funkcji poprawy i usunięcia, więc nie ma czego testować przez RPC.
- Jedyny zapis z aplikacji to `add_symptom_entry` przez `POST /api/journal` (`src/pages/api/journal/index.ts`) — fetch z JSON, kody SE001–SE005 mapowane na `JOURNAL_COPY.apiErrors`.
- Lista `src/pages/dzienniczek/index.astro` pokazuje „Możesz poprawić do {do}” (:187-189) bez drogi poprawy — finding F4 z impl-review S-05, celowo odłożony do S-07. Po zapisie (`?dodano=<uuid>`) pokazuje komunikat, podświetla kartę i składa pytanie do lekarza (`loadDoctorQuestions`, :105-109).
- Wzorzec do naśladowania to leki: ekran poprawy okresu `src/pages/leki/[id]/okresy/[periodId]/poprawa.astro` (stan otwarty: formularz; zamknięty: komunikat, bez przekierowania), ekran usunięcia `src/pages/leki/[id]/usun.astro` (potwierdzenie + zwykły formularz POST, przycisk `outline`, nie `destructive`), funkcje SQL z nazwanym kodem „okno zamknięte” sprawdzanym przed wyzwalaczem (DP009 w `20261005140000_correct_dosage_period.sql:74-78`, MD010 w `delete_medication`).
- Trasy `/dzienniczek/<id>...` są chronione i objęte kontrolą warunków automatycznie (`matchesNavHref` w `src/lib/navigation.ts:22-24`). Trasy `/api/journal/*` pilnują sesji same (wzorzec `src/pages/api/journal/index.ts:92-97`).
- Pytanie do lekarza przeliczane przy każdym wyświetleniu (S-06), więc poprawka trafia do niego bez osobnej pracy.

## Desired End State

- Na liście dzienniczka każdy wpis ma link „Popraw wpis” prowadzący do `/dzienniczek/<id>`.
- Ekran wpisu w oknie korekty: formularz z bieżącymi wartościami (data i godzina, objawy z nasileniem, notatka), przycisk zapisu, informacja „do kiedy” i link do usunięcia wpisu dodanego przez pomyłkę.
- Ekran wpisu po zamknięciu okna: data, objawy i nasilenie tylko do odczytu z wyjaśnieniem, że należą do historii; notatka edytowalna z własnym przyciskiem zapisu.
- Zapis poprawki przekierowuje na `/dzienniczek?poprawiono=<id>`: komunikat z nazwami objawów i nowym „do kiedy”, podświetlona karta, pytanie do lekarza złożone od nowa. Zapis samej notatki przekierowuje na `/dzienniczek?notatka=<id>` z komunikatem, bez pytania. Usunięcie przekierowuje na `/dzienniczek?usunieto=1`.
- Gdy okno zamknie się między otwarciem ekranu a zapisem, nic się nie zapisuje, formularz zachowuje wpisane dane i pokazuje komunikat o zamkniętym oknie (z godziną) oraz że notatkę można zmienić po odświeżeniu strony.
- W żadnym adresie URL nie ma nazwy objawu ani notatki — wyłącznie uuid.
- Weryfikacja: `npm run db:check`, `npm test`, `npm run smoke` (przeciw lokalnemu Supabase), sprawdzenie ręczne w przeglądarce.

### Key Discoveries:

- Wyzwalacze zwracają ogólny `P0001`; funkcje leków sprawdzają okno same, żeby zwrócić nazwany kod (`20261005140000_correct_dosage_period.sql:17-19`). Ten sam wzorzec tu: `SE007`.
- `SE006` i `SE007` są wolne (grep po `supabase/`, `src/`, `scripts/`).
- `symptom_entries_guard_occurred_at` przepuszcza niezmienioną wartość (`20261005130000_symptom_journal.sql:396-399`) — wpis datowany blisko granicy 14 dni da się poprawić w objawach bez ruszania daty.
- Testy SQL cofają `created_at` przez `pg_temp.backdate` z wyłączeniem wyłącznie wyzwalacza `freeze_created_at` (`symptom_journal_checks.sql:116-157`); nigdy `session_replication_role = replica`.
- `scripts/auth/route-coverage.test.mjs` sam sprawdzi nowe strony `.astro` pod `/dzienniczek`.
- `scripts/fr012/journal-copy.test.mjs` sam przepuści każdy nowy tekst z `JOURNAL_COPY` przez filtr FR-012.
- Smoke sprawdza brak danych zdrowotnych w URL wyłącznie dla ścieżek dopisanych do `journal.paths` (`scripts/smoke.mjs:1180`, krok :1373-1387).

## What We're NOT Doing

- Żadnej zmiany reguły 14 dni: przy poprawie granica liczona od chwili poprawy, tak jak działa baza dziś (decyzja P4). Brzegowy przypadek (wpis datowany prawie 14 dni wstecz, poprawa godziny o kilka minut wcześniej następnego dnia) zostaje odrzucony kodem SE003.
- Żadnego częściowego zapisu: gdy okno zamknie się w trakcie edycji, notatka też się nie zapisuje (decyzja P3).
- Żadnej edycji notatki bezpośrednio na liście (decyzja P1).
- Żadnych testów E2E w Playwright (decyzja P5); `test-plan.md` bez zmian.
- Żadnych zmian w wyzwalaczach S-05 ani w oknie leków; bez nowej tabeli.
- Żadnej historii zmian notatki — notatka nie jest rdzeniem wpisu.
- Brak `.limit` w zapytaniu listy (follow-up S-05) — poza zakresem.

## Implementation Approach

Trzy funkcje SQL `security invoker` (RLS działa jak przy zwykłych zapisach) z nazwanymi kodami, sprawdzające okno przed wyzwalaczami, żeby aplikacja dostała `SE007` zamiast ogólnego `P0001`. Wyzwalacze S-05 zostają jako druga linia obrony. Poprawa i notatka idą przez fetch z JSON w treści żądania (formularz zachowuje stan po błędzie, nic nie trafia do URL), usunięcie przez zwykły formularz POST z ekranem potwierdzenia, jak przy lekach. Ekran wpisu to jedna strona `.astro` z jednym komponentem React w dwóch stanach.

## Critical Implementation Details

- **Pole daty przy poprawie**: atrybut `min` pola `datetime-local` nie może być późniejszy niż zapisana wartość, inaczej przeglądarka zablokuje wysłanie niezmienionego formularza wpisu datowanego blisko granicy 14 dni. `min` = wcześniejsza z (`earliestEntryLocal()`, zapisana wartość). Nietknięte pole wysyła `null` = „bez zmiany” — odwrotnie niż przy dodawaniu, gdzie `null` znaczy „chwila zapisu”.
- **Kolejność w `correct_symptom_entry`**: najpierw sesja (28000), potem wpis i właściciel (SE006, z `for update`), potem okno (SE007), dopiero potem walidacja treści (SE001, SE004, SE005). Inaczej po zamknięciu okna użytkowniczka dostanie błąd treści zamiast informacji, że okno minęło.

## Phase 1: Funkcje bazy dla poprawy, notatki i usunięcia

### Overview

Migracja z trzema funkcjami zapisu i ich sprawdzenia SQL. Bez nowej tabeli i bez zmian w wyzwalaczach.

### Changes Required:

#### 1. Migracja

**File**: `supabase/migrations/20261009120000_journal_correction.sql`

**Intent**: Dać aplikacji atomową poprawę wpisu, zmianę notatki i usunięcie wpisu z nazwanymi kodami, zamiast trzech osobnych zapisów do tabel, z których każdy może się udać osobno. Nagłówek w stylu migracji S-05: co zmienia, przykłady z datami z rokiem.

**Contract**:

- `correct_symptom_entry(p_entry_id uuid, p_occurred_local timestamp, p_items jsonb, p_note text) returns uuid`, `security invoker`, `search_path = ''`. Kody w kolejności: `28000` brak sesji; `SE006` wpis nie istnieje albo należy do innego konta (odczyt z `for update`); `SE007` okno zamknięte (`now() >= correction_window_end(created_at)`); `SE001` brak objawów; `SE004` duplikat; `SE005` objaw spoza listy; potem z wyzwalaczy `SE002`/`SE003`. `p_occurred_local` null = data bez zmian (nie „teraz”); wartość czytana `at time zone 'Europe/Warsaw'` jak w `add_symptom_entry`. Objawy: usunięte z wpisu kasowane, pozostałe dostają nowe nasilenie, nowe dodawane (wiersze niezmienionych objawów zostają). Notatka: `nullif(btrim(p_note), '')`.
- Sprawdzenia SE001/SE004/SE005 skopiowane z `add_symptom_entry` (`20261005130000_symptom_journal.sql:505-529`) do `correct_symptom_entry`, z komentarzem wskazującym oryginał. Bez wspólnej funkcji pomocniczej — `add_symptom_entry` zostaje bez zmian. Zgodność obu kopii pilnują sprawdzenia SQL obu funkcji.
- `set_symptom_entry_note(p_entry_id uuid, p_note text) returns uuid`, `security invoker`. Kody: `28000`, `SE006`. Działa niezależnie od okna. Pusta notatka = brak notatki.
- `delete_symptom_entry(p_entry_id uuid) returns uuid`, `security invoker`. Kody: `28000`, `SE006`, `SE007`.
- Komunikaty błędów po polsku, bez stwierdzania przyczyny objawu (FR-012).
- `revoke execute … from public, anon`; `grant execute … to authenticated` dla wszystkich trzech. `comment on function` z przykładem i listą kodów.

#### 2. Sprawdzenia SQL

**Files**: `supabase/tests/journal_correction_checks.sql` (nowy), `supabase/tests/medication_interaction_checks.sql` (INTERACTION 11)

**Intent**: Dowieść każdego kodu i każdej ścieżki nowych funkcji, w stylu `symptom_journal_checks.sql`, kończąc `GATE_COMPLETE`. Pomocniki `pg_temp.backdate`, `try_code`, `act_as` są definiowane per plik (`pg_temp`), więc skopiowane do nowego pliku; `try_code` rozszerzony o `SE006` i `SE007` (dziś łapie wyłącznie `28000` i SE001–SE005, `symptom_journal_checks.sql:180`).

**Contract**:

- Okno otwarte (23 h 59 min): poprawa daty, zamiana objawu, zmiana nasilenia, dodanie i usunięcie objawu — stan po poprawie odczytany i porównany; usunięcie wpisu przechodzi i kasuje jego objawy.
- Okno zamknięte (24 h): `correct_symptom_entry` → `SE007`, `delete_symptom_entry` → `SE007`, wpis i objawy bez zmian; `set_symptom_entry_note` przechodzi (zmiana i wyczyszczenie notatki).
- Poprawa bez daty (`p_occurred_local` null) zostawia `occurred_at` bez zmian.
- Wpis datowany 13 dni 23 h wstecz, poprawa samego objawu w oknie przechodzi (niezmieniona data).
- Konto B na wpisie konta A: wszystkie trzy funkcje → `SE006`, wpis A bez zmian.
- Brak sesji → `28000` dla każdej z trzech funkcji (w nowym pliku).
- Uprawnienia (`anon` bez `EXECUTE`, `authenticated` z) wyłącznie w istniejącym rejestrze: trzy nowe sygnatury dopisane do tablicy INTERACTION 11 w `supabase/tests/medication_interaction_checks.sql` (:556-570), licznik w nagłówku (:17) z „thirteen” na „sixteen” z dopiskiem o funkcjach S-07. Nowy plik nie powtarza tej kontroli.
- Każdy test SE001 poprzedzony `set constraints … immediate` (jak `symptom_journal_checks.sql:38-41`) — odroczone sprawdzenie nie odpali się przy teście kończonym wycofaniem.
- Każdy test blokady łapie nazwany kod, nigdy `when others` (lesson „Bramka musi odróżnić blokadę od niewykonania”).

### Success Criteria:

#### Automated Verification:

- Migracja wchodzi na czystą bazę: `npx supabase db reset`
- Wszystkie sprawdzenia SQL przechodzą, w tym nowy plik: `npm run db:check`
- Testy jednostkowe przechodzą: `npm test`

#### Manual Verification:

- Autorka czyta nagłówek migracji i potwierdza, że przykłady opisują FR-009 (okno 24 h od zapisu, notatka zawsze)

**Implementation Note**: Po zielonych sprawdzeniach automatycznych pauza na potwierdzenie ręczne przed fazą 2.

---

## Phase 2: Trasy API i teksty

### Overview

Trzy trasy pod `/api/journal/[id]`, teksty błędów i komunikatów w `JOURNAL_COPY`, kroki smoke przez HTTP.

### Changes Required:

#### 1. Teksty

**File**: `src/lib/copy/journal.ts`

**Intent**: Wszystkie nowe teksty widoczne dla użytkowniczki w jednym module, objęte filtrem FR-012 przez istniejący test.

**Contract**:

- Nowe klucze `apiErrors`: `entryNotFound` (SE006), `correctionWindowClosed` (SE007) z markerem `{o}` na koniec okna, np. „Okno korekty tego wpisu zamknęło się {o}. Data, godzina, objawy i nasilenie są już częścią historii. Notatkę możesz zmienić po odświeżeniu strony.”, oraz `deleteWindowClosed`.
- Nowa grupa `entry` (ekran wpisu): tytuł, link „Popraw wpis”, „Możesz poprawić do {do}”, wyjaśnienie stanu zamkniętego, etykiety przycisków („Zapisz poprawkę”, „Zapisz notatkę”), link „Usuń wpis dodany przez pomyłkę”.
- Nowa grupa `deletion` (ekran usunięcia): tytuł, wyjaśnienie, przycisk, stan zamknięty — wzorem `MEDICATION_COPY.deletion`.
- Nowe komunikaty listy: `corrected` / `correctedWithDeadline` (z `{objawy}`, `{do}`), `noteSaved`, `deleted`.
- Wyłącznie pola tekstowe z markerami, bez funkcji (nagłówek modułu).

#### 2. Trasy API

**Files**: `src/pages/api/journal/[id].ts`, `src/pages/api/journal/[id]/note.ts`, `src/pages/api/journal/[id]/delete.ts`

**Intent**: Wywołać nowe funkcje jako zalogowana użytkowniczka i zwrócić wyłącznie klucz błędu albo id.

**Contract**:

- Wszystkie: `export const prerender = false`, `POST`, 401 bez sesji i przy sesji z odnośnika resetu hasła, id z URL przez `z.uuid()` (zły → 404 bez echa), błędy logowane wyłącznie kodem, `Cache-Control: private, no-store`.
- `[id].ts` (poprawa): wyłącznie `application/json` (415 inaczej), schemat zod jak w `index.ts` (wspólny schemat objawów wydzielony, nie skopiowany), `occurredLocal` nullable = bez zmiany. Mapowanie: SE001–SE007, 28000. Sukces 200 `{ id }`.
- `note.ts`: JSON, `{ note: string | null }`, max 200 znaków. Mapowanie SE006, 28000. Sukces 200 `{ id }`.
- `delete.ts`: zwykły formularz (bez pól), wzorem `src/pages/api/medications/[id]/delete.ts`. Błąd → przekierowanie `/dzienniczek/<id>/usun?error=<klucz>`, sukces → `/dzienniczek?usunieto=1`.

#### 3. Smoke przez HTTP

**File**: `scripts/smoke.mjs`

**Intent**: Dowieść ścieżki od żądania HTTP do bazy dla nowych tras, w istniejącym bloku `journalFlowSteps`.

**Contract**:

- Poprawa na osobnym wpisie dodanym w smoke na potrzeby tego kroku (nie na `journal.entryId` — na nim i na `journal.symptom` stoją kroki S-06: pytanie do lekarza, podsumowanie wizyty, kontrola wycieku w URL): 200, w bazie nowy objaw i nasilenie, data bez zmian przy `occurredLocal: null`.
- Do listy zakazanych tekstów w kontroli wycieku w URL (`scripts/smoke.mjs`, krok :1373-1387) dopisane nazwa objawu wstawionego poprawką i tekst notatki z poprawki.
- Zmiana notatki: 200, notatka w bazie.
- Poprawa bez objawów: 422 `noSymptoms`.
- Bez sesji: 401 na każdej z trzech tras.
- Konto B na wpisie konta A (w krokach izolacji): poprawa i notatka → `entryNotFound`, usunięcie → przekierowanie z `error=entryNotFound`; wpis A bez zmian.
- Usunięcie świeżego wpisu: przekierowanie na `/dzienniczek?usunieto=1`, wpisu nie ma w bazie.
- Każda nowa ścieżka dopisana do `journal.paths`.
- Nagłówki jak z przeglądarki (lesson „Smoke wysyła nagłówki tak jak przeglądarka”).

### Success Criteria:

#### Automated Verification:

- Testy jednostkowe i filtr FR-012 dla nowych tekstów przechodzą: `npm test`
- Typy przechodzą: `npm run typecheck`
- Lint przechodzi: `npm run lint`
- Smoke przeciw lokalnemu Supabase przechodzi z nowymi krokami: `npm run smoke`

#### Manual Verification:

- Autorka czyta nowe teksty w `src/lib/copy/journal.ts` i potwierdza brzmienie

**Implementation Note**: Przed smoke zatrzymaj stary podgląd i odsuń `.env` (lessons). Pauza na potwierdzenie ręczne przed fazą 3.

---

## Phase 3: Ekran wpisu, ekran usunięcia i lista

### Overview

Strony i formularz, link z listy, komunikaty po poprawce, notatce i usunięciu, kroki smoke dla stron.

### Changes Required:

#### 1. Formularz wpisu

**File**: `src/components/journal/EditEntryForm.tsx` (nowy). `src/components/journal/NewEntryForm.tsx` bez zmian — `SymptomPicker` jest sterowany propsami (`SymptomPicker.tsx:21-37`), więc `EditEntryForm` wypełnia go sam.

**Intent**: Jeden komponent w dwóch stanach. W oknie: pola jak przy dodawaniu (ponowne użycie `SymptomPicker`), wypełnione bieżącymi wartościami, wysyłka do `/api/journal/<id>`. Po zamknięciu okna: tylko pole notatki, wysyłka do `/api/journal/<id>/note`. Po błędzie stan formularza zostaje (decyzja P3).

**Contract**:

- `minOccurred` wyliczany czystą funkcją `minOccurredLocal(occurredLocal: string, now?: Date): string` w `src/lib/services/journal.ts` (obok `earliestEntryLocal`, :150): wcześniejsza z (`earliestEntryLocal(now)`, `occurredLocal`). Test obowiązkowy w `scripts/journal/journal.test.mjs`: wpis z 26.09.2026 08:00 zapisany 09.10.2026, poprawiany 10.10.2026 09:00 (granica 14 dni: 26.09.2026 09:00) → `min` = zapisana wartość; wpis świeży → `min` = granica 14 dni.
- Props: `entryId`, `windowOpen`, `windowEndsAt` (ISO), `occurred` (`YYYY-MM-DDTHH:MM`, czas polski), `minOccurred` (patrz Critical Implementation Details), `items` (wybrane objawy z nasileniem), `note`, katalog objawów i terminy wyszukiwania.
- Nietknięta data → `occurredLocal: null`.
- `correctionWindowClosed` wyświetlany z `{o}` = `formatWarsawDateTime(windowEndsAt)`.
- Sukces → `window.location.assign('/dzienniczek?poprawiono=<id>')` albo `?notatka=<id>`; w URL wyłącznie uuid.

#### 2. Ekran wpisu

**File**: `src/pages/dzienniczek/[id].astro`

**Intent**: Wczytać wpis z objawami i `correction_window_ends_at`, ustalić stan okna zegarem serwera i pokazać formularz w odpowiednim stanie. Po zamknięciu okna data, objawy i nasilenie jako tekst tylko do odczytu nad formularzem notatki, z wyjaśnieniem. W oknie link do `/dzienniczek/<id>/usun`.

**Contract**: id przez `z.uuid()`; nieznany albo cudzy wpis → 404 z tym samym komunikatem; błąd odczytu → 500. Wzorzec: `src/pages/leki/[id]/okresy/[periodId]/poprawa.astro`.

#### 3. Ekran usunięcia

**File**: `src/pages/dzienniczek/[id]/usun.astro`

**Intent**: Potwierdzenie usunięcia wpisu dodanego przez pomyłkę: data i objawy wpisu, wyjaśnienie, „do kiedy”, formularz POST do `/api/journal/<id>/delete` z przyciskiem `outline`. Po zamknięciu okna wyłącznie komunikat i link powrotu.

**Contract**: wzorzec `src/pages/leki/[id]/usun.astro`; `?error=<klucz>` przez `apiErrorMessage`.

#### 4. Lista dzienniczka

**File**: `src/pages/dzienniczek/index.astro`

**Intent**: Link „Popraw wpis” na każdej karcie (w obu stanach okna, decyzja P1). Obsługa `?poprawiono=<uuid>` jak `?dodano=` (komunikat poprawki z nazwami objawów i „do kiedy”, podświetlenie, pytanie do lekarza od nowa), `?notatka=<uuid>` (komunikat, podświetlenie, bez pytania), `?usunieto=1` (komunikat).

**Contract**: parametry walidowane `z.uuid()` / stałą wartością; nic z URL nie trafia na ekran. Jeden identyfikator podświetlonego wpisu wyznaczany z `dodano` albo `poprawiono` (albo `notatka`).

#### 5. Smoke dla stron

**File**: `scripts/smoke.mjs`

**Intent**: Strony renderują się po HTTP i nie przenoszą danych zdrowotnych w URL.

**Contract**: `/dzienniczek/<id>` 200 z polami formularza; `/dzienniczek/<id>/usun` 200; `/dzienniczek?poprawiono=<id>` pokazuje komunikat poprawki i pytanie do lekarza; zły uuid → 404; każda ścieżka w `journal.paths`.

### Success Criteria:

#### Automated Verification:

- Pokrycie tras (nowe strony chronione i za kontrolą warunków), test `minOccurredLocal` i pozostałe testy przechodzą: `npm test`
- Typy przechodzą: `npm run typecheck`
- Lint przechodzi: `npm run lint`
- Build przechodzi: `npm run build`
- Smoke przeciw lokalnemu Supabase przechodzi z krokami stron: `npm run smoke`

#### Manual Verification:

- W oknie: zamiana objawu i zmiana nasilenia widoczne na liście po zapisie, z komunikatem poprawki i nowym pytaniem do lekarza
- Po zamknięciu okna (wpis cofnięty `created_at` w lokalnej bazie): data, objawy i nasilenie tylko do odczytu, notatkę da się zmienić i wyczyścić
- Okno zamknięte między otwarciem ekranu a zapisem: nic się nie zapisuje, wpisane dane zostają w formularzu, komunikat z godziną zamknięcia
- Usunięcie wpisu dodanego przez pomyłkę w oknie znika z listy; po zamknięciu okna ekran usunięcia nie ma przycisku
- Wpis datowany blisko granicy 14 dni: niezmieniony formularz da się wysłać (pole daty nie blokuje)
- Ekran wpisu czytelny na telefonie (szerokość 375 px), formularz działa w prawdziwej przeglądarce
- Pasek adresu na każdym kroku zawiera wyłącznie uuid, bez nazwy objawu i notatki

**Implementation Note**: Po zielonych sprawdzeniach automatycznych pauza na potwierdzenie ręczne.

---

## Testing Strategy

### Unit Tests:

- Filtr FR-012 dla nowych tekstów `JOURNAL_COPY` — istniejący `scripts/fr012/journal-copy.test.mjs`, bez zmian.
- Pokrycie tras — istniejący `scripts/auth/route-coverage.test.mjs`, bez zmian.
- `minOccurredLocal` w `src/lib/services/journal.ts` — test obowiązkowy w `scripts/journal/journal.test.mjs` (wartość zapisana wcześniejsza niż granica → `min` = wartość zapisana; świeży wpis → `min` = granica).

### Integration Tests:

- `supabase/tests/journal_correction_checks.sql` — kody i ścieżki nowych funkcji (faza 1).
- `scripts/smoke.mjs` — trasy API, izolacja kont, strony, brak danych zdrowotnych w URL (fazy 2 i 3).

### Manual Testing Steps:

1. Dodaj wpis „ból głowy, umiarkowane”, otwórz „Popraw wpis”, zamień na „zawroty głowy, silne”, zapisz — komunikat poprawki, karta podświetlona, pytanie do lekarza o zawroty głowy.
2. W lokalnej bazie cofnij `created_at` wpisu o 25 h (z wyłączonym wyzwalaczem `symptom_entries_freeze_created_at`), otwórz ekran — rdzeń tylko do odczytu, zmień notatkę.
3. Otwórz ekran wpisu, cofnij `created_at` w bazie, zapisz zmianę objawu — komunikat o zamkniętym oknie, dane zostają w formularzu, nic się nie zmieniło na liście.
4. Dodaj wpis, usuń go jako dodany przez pomyłkę — znika z listy z komunikatem.

## Performance Considerations

Ekran wpisu czyta jeden wpis i katalog objawów (jak `/dzienniczek/nowy`). Bez nowych zapytań na liście poza istniejącym.

## Migration Notes

Migracja dodaje wyłącznie funkcje; nie zmienia danych ani wyzwalaczy. Po merge'u: `npx supabase db push` i sprawdzenie listy migracji na produkcji (lesson „Po merge'u migracji wykonaj db push”).

## References

- PRD: `context/foundation/prd.md` FR-009 (:152), pytanie 5 (:243)
- Roadmapa: `context/foundation/roadmap.md` S-07 (:297-309)
- Migracja dzienniczka: `supabase/migrations/20261005130000_symptom_journal.sql`
- Wzorzec poprawy: `supabase/migrations/20261005140000_correct_dosage_period.sql`, `src/pages/api/medications/[id]/periods/[periodId].ts`, `src/pages/leki/[id]/okresy/[periodId]/poprawa.astro`
- Wzorzec usunięcia: `src/pages/leki/[id]/usun.astro`, `src/pages/api/medications/[id]/delete.ts`
- Sprawdzenia SQL: `supabase/tests/symptom_journal_checks.sql` (JOURNAL 6, 7)
- Odłożone z S-05: `context/archive/2026-10-05-symptom-journal-entry/reviews/impl-review.md` F4 (:86-103)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Funkcje bazy dla poprawy, notatki i usunięcia

#### Automated

- [x] 1.1 Migracja wchodzi na czystą bazę: `npx supabase db reset` — 0275d39
- [x] 1.2 Wszystkie sprawdzenia SQL przechodzą, w tym nowy plik: `npm run db:check` — 0275d39
- [x] 1.3 Testy jednostkowe przechodzą: `npm test` — 0275d39

#### Manual

- [x] 1.4 Autorka czyta nagłówek migracji i potwierdza, że przykłady opisują FR-009 (okno 24 h od zapisu, notatka zawsze) — 0275d39

### Phase 2: Trasy API i teksty

#### Automated

- [x] 2.1 Testy jednostkowe i filtr FR-012 dla nowych tekstów przechodzą: `npm test` — 1bcbb03
- [x] 2.2 Typy przechodzą: `npm run typecheck` — 1bcbb03
- [x] 2.3 Lint przechodzi: `npm run lint` — 1bcbb03
- [x] 2.4 Smoke przeciw lokalnemu Supabase przechodzi z nowymi krokami: `npm run smoke` — 1bcbb03

#### Manual

- [x] 2.5 Autorka czyta nowe teksty w `src/lib/copy/journal.ts` i potwierdza brzmienie — 1bcbb03

### Phase 3: Ekran wpisu, ekran usunięcia i lista

#### Automated

- [x] 3.1 Pokrycie tras (nowe strony chronione i za kontrolą warunków), test `minOccurredLocal` i pozostałe testy przechodzą: `npm test` — 8df53f3
- [x] 3.2 Typy przechodzą: `npm run typecheck` — 8df53f3
- [x] 3.3 Lint przechodzi: `npm run lint` — 8df53f3
- [x] 3.4 Build przechodzi: `npm run build` — 8df53f3
- [x] 3.5 Smoke przeciw lokalnemu Supabase przechodzi z krokami stron: `npm run smoke` — 8df53f3

#### Manual

- [x] 3.6 W oknie: zamiana objawu i zmiana nasilenia widoczne na liście po zapisie, z komunikatem poprawki i nowym pytaniem do lekarza — 8df53f3
- [x] 3.7 Po zamknięciu okna (wpis cofnięty `created_at` w lokalnej bazie): data, objawy i nasilenie tylko do odczytu, notatkę da się zmienić i wyczyścić — 8df53f3
- [x] 3.8 Okno zamknięte między otwarciem ekranu a zapisem: nic się nie zapisuje, wpisane dane zostają w formularzu, komunikat z godziną zamknięcia — 8df53f3
- [x] 3.9 Usunięcie wpisu dodanego przez pomyłkę w oknie znika z listy; po zamknięciu okna ekran usunięcia nie ma przycisku — 8df53f3
- [x] 3.10 Wpis datowany blisko granicy 14 dni: niezmieniony formularz da się wysłać (pole daty nie blokuje) — 8df53f3
- [x] 3.11 Ekran wpisu czytelny na telefonie (szerokość 375 px), formularz działa w prawdziwej przeglądarce — 8df53f3
- [x] 3.12 Pasek adresu na każdym kroku zawiera wyłącznie uuid, bez nazwy objawu i notatki — 8df53f3
