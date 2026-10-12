# Nazwy leków i substancji poza adresami URL — plan implementacji

## Overview

Po S-02 nazwa leku i substancji trafia do adresu URL w sześciu miejscach ścieżki dodawania leku (issue #57, finding F6 z impl-review S-02). Adres zostaje w historii przeglądarki, zakładkach, nagłówku Referer i logach Cloudflare. Plan przenosi wpisany tekst do treści żądań POST i krótkotrwałych ciasteczek HttpOnly, wybór wariantu opiera na identyfikatorze produktu i dokłada strażnika: test kodu w `npm test` plus sprawdzenie adresów przekierowań w smoke.

## Current State Analysis

- `/leki/nowy` (`src/pages/leki/nowy.astro:2-7, 32-35`) działa na GET: `?q=` (wyszukiwanie), `?nazwa=` (warianty jednej nazwy), `?wariant=` (zaznaczony wariant), `?error=`.
- Lista wyników linkuje `?nazwa=<nazwa>` (`nowy.astro:138`), podpowiedź nawiguje na `?nazwa=` (`src/components/medications/RegistrySearch.tsx:25-27, 55-58`), formularz wyszukiwania to `method="GET"` z polem `q` (`RegistrySearch.tsx:106, 114`).
- Podpowiedzi: `fetch` na `GET /api/registry/search?q=` (`src/components/hooks/useRegistrySuggestions.ts:43`, `src/pages/api/registry/search.ts:26-50`).
- `RegistryNameGroup` to `{ name, variants }` — bez identyfikatora (`src/lib/services/medications.ts:22-37`); `searchRegistryNames` czyta tylko `product_name` (`src/lib/services/registry-search.ts:30-46`).
- Trasa zapisu `POST /api/medications` (`src/pages/api/medications/index.ts:74-110`) przy błędzie odsyła: rejestr `?nazwa=&wariant=&error=`, ulotka `?nazwa=&substancja=&data=&error=`, brak dopasowania `?nazwa=&data=&niedopasowana=`. Komentarz w liniach 74-75 twierdzi, że dane zdrowotne nie podróżują w URL — fałsz.
- Formularz rejestru wysyła ukryte pole `nazwa` (`src/components/medications/AddMedicationForm.tsx:34`) wyłącznie po to, żeby trasa zapisu odesłała je w adresie.
- `/leki/nowy/z-ulotki` (`src/pages/leki/nowy/z-ulotki.astro:4-8, 19-27, 49-55`) czyta `?nazwa=`, `?substancja=`, `?data=`, `?niedopasowana=`, `?error=`; linki „podobne substancje” budują adres z nazwą leku i substancji.
- Jedyne własne ciasteczko projektu to motyw (`src/lib/theme.ts:11-16`, zapis w `src/pages/api/preferences/theme.ts` z `secure` zależnym od protokołu i odpowiedzią 303 `no-store`).
- Wylogowanie (`src/pages/api/auth/signout.ts`) i usunięcie konta (`src/pages/api/account/delete.ts:116`) czyszczą tylko ciasteczka sesji.
- Smoke wywołuje `GET /api/registry/search?q=ibu` (`scripts/smoke.mjs:2280-2310`); galeria E2E czeka na `?error=` po pustym formularzu z ulotki (`tests/e2e/dark-gallery.spec.ts:149-160`).
- Wzorzec strażnika czytającego kod stron: `scripts/pages/page-title.test.mjs`.
- Logi Workera są włączone (`wrangler.jsonc` → `observability.enabled`).

## Desired End State

- Żadna nazwa leku, nazwa substancji, dawka ani tekst wyszukiwania nie pojawia się w adresie strony ani w adresie żądania `fetch` w ścieżce dodawania leku — z JS i bez JS.
- Wyszukiwanie i „podobne substancje” działają bez JavaScriptu; odświeżenie i „Wstecz” nie pokazują komunikatu o ponownym wysłaniu formularza.
- Jedyne parametry adresu na `/leki/nowy`: `?wariant=<uuid>` i `?error=<kod>`; na `/leki/nowy/z-ulotki`: `?error=<kod>`.
- Stare adresy z `?q=`, `?nazwa=`, `?substancja=`, `?niedopasowana=`, `?data=` są ignorowane (pusty formularz).
- `npm test` odrzuca każdy parametr adresu w `src/` spoza listy dozwolonych; smoke odrzuca każde przekierowanie w ścieżce dodawania leku, którego adres zawiera wysłaną nazwę leku albo substancji.

Weryfikacja: `npm test`, `npm run typecheck`, `npm run lint`, `npm run smoke` przeciw lokalnemu Supabase, ręczne przejście ścieżek w przeglądarce z podglądem historii.

### Key Discoveries:

- Lesson „Żadna nazwa leku ani dawka w adresie URL” (`context/foundation/lessons.md`) wprost wskazuje kierunek: POST, identyfikatory, krótkotrwałe ciasteczko HttpOnly, test zamiast komentarza.
- Lesson „Smoke wysyła nagłówki tak jak przeglądarka” — nowa trasa przyjmuje formularze z `/leki/nowy` i `/leki/nowy/z-ulotki`; smoke liczy `Origin` przez `formOrigin`, nie dopisuje go.
- Kod błędu w `?error=` nie jest daną zdrowotną i zostaje — ten sam wzorzec mają wszystkie ekrany `/leki/[id]/*`.
- `?wariant=<uuid>` to identyfikator wiersza `registry_products`, czytelnego dla każdego zalogowanego konta (`supabase/migrations/20260924120000_registry_schema.sql:143`). Lesson dopuszcza identyfikatory w URL; ryzyko odnotowane w briefie.
- `npm test` uruchamia `node --experimental-strip-types` — moduł z czystą logiką ciasteczka nie może importować przez alias `@/` (wzorzec: `src/lib/services/medications.ts`).

## What We're NOT Doing

- Nie obsługujemy starych adresów z nazwą (decyzja: ignorować) — bez przepisywania do ciasteczka i bez wyjątku w strażniku.
- Nie zmieniamy parametrów `?error=`, `?dodano=`, `?usunieto=` i innych identyfikatorów/flag na pozostałych ekranach.
- Nie dodajemy testu E2E przeglądającego historię adresów (decyzja: test kodu + smoke).
- Nie czyścimy historycznych logów Cloudflare ani historii przeglądarek.
- Nie zmieniamy wyglądu ekranów poza zamianą linków „podobne substancje” na przyciski.
- Nie ruszamy ekranów dzienniczka — nie przenoszą nazw w URL.

## Implementation Approach

Jeden moduł ciasteczek szkicu (`src/lib/medication-draft.ts`) i jedna trasa `POST /api/medications/draft` obsługują oba ekrany: zapisują tekst w ciasteczku HttpOnly ograniczonym ścieżką i czasem (10 min) i odpowiadają 303 na czysty adres (wzorzec Post/Redirect/Get z trasy motywu). Trasa zapisu leku przy błędzie odsyła tylko identyfikator i kod, a stan formularza z ulotki zapisuje w tym samym ciasteczku. Każdy szkic niesie identyfikator konta — inne konto w tej samej przeglądarce go nie odczyta. Wybór nazwy idzie przez identyfikator pierwszego produktu grupy (`?wariant=`), a strona sama ustala nazwę i listę wariantów. Strażnik powstaje na końcu, gdy kod jest już czysty.

## Critical Implementation Details

- **Ścieżka ciasteczek.** Ciasteczko wyszukiwania ma `path: "/leki/nowy"`, szkic ulotki `path: "/leki/nowy/z-ulotki"`. Trasa `/api/medications/draft` może je ustawić (atrybut `Path` nie musi pasować do adresu odpowiedzi), ale `cookies.delete` musi podać tę samą ścieżkę, inaczej przeglądarka nie usunie ciasteczka.
- **Ciasteczko a inne konto.** Wylogowanie czyści ciasteczka, ale zmiana konta bez wylogowania (wygasła sesja, logowanie innym kontem) już nie — dlatego odczyt porównuje zapisany identyfikator konta z `locals.user.id` i przy niezgodności traktuje szkic jak pusty.

## Phase 1: Rejestr bez nazwy w adresie

### Overview

Wyszukiwanie, wybór nazwy, podpowiedzi i powrót po błędzie zapisu z rejestru przestają przenosić nazwę w adresie. Powstaje mechanizm ciasteczka szkicu i trasa `POST /api/medications/draft`, używane też w fazie 2.

### Changes Required:

#### 1. Moduł ciasteczek szkicu

**File**: `src/lib/medication-draft.ts` (nowy)

**Intent**: Jedno miejsce z nazwami, opcjami, schematami i odczytem/zapisem/czyszczeniem obu ciasteczek, żeby trasy i strony nie powielały reguł.

**Contract**:

- `REGISTRY_SEARCH_COOKIE = "lekomapa-registry-search"` (`path: "/leki/nowy"`), `LEAFLET_DRAFT_COOKIE = "lekomapa-leaflet-draft"` (`path: "/leki/nowy/z-ulotki"`); oba `httpOnly`, `sameSite: "lax"`, `maxAge: 600`, `secure` wg protokołu żądania.
- Wartość: JSON z `userId` i polami — wyszukiwanie `{ userId, q }`; szkic ulotki `{ userId, productName, substanceName, startedOn, unmatched: boolean }`. Każdy tekst przycięty do 200 znaków; `startedOn` tylko poprawna data ISO. Dawka nigdy nie trafia do ciasteczka.
- Czyste funkcje bez importów przez `@/` (testowalne w `node --test`): `parseRegistrySearch(raw, userId)` i `parseLeafletDraft(raw, userId)` zwracają szkic albo `null` (zły JSON, zły kształt, inne konto).
- Funkcje na `AstroCookies`: zapis, odczyt i `clearMedicationDrafts(cookies)` czyszczące oba ciasteczka z ich ścieżkami.

#### 2. Trasa szkicu

**File**: `src/pages/api/medications/draft.ts` (nowy)

**Intent**: Przyjmuje tekst w treści formularza, zapisuje go w ciasteczku i wraca na czysty adres ekranu.

**Contract**: `POST`, `export const prerender = false`, sama pilnuje sesji jak `/api/medications` (`401` bez użytkownika albo przy sesji z odnośnika resetu). Pole `kind`:

- `search` + `q` → ciasteczko wyszukiwania, `303` na `/leki/nowy`; pusty tekst czyści ciasteczko,
- `leaflet` + `productName`, `substanceName`, `startedOn` → szkic ulotki z `unmatched: false`, `303` na `/leki/nowy/z-ulotki`,
- inna wartość → `303` na `/leki/nowy` bez zmian w ciasteczkach.
  Odpowiedź z `Cache-Control: private, no-store`. W phase 1 obsługiwane oba `kind`; z `leaflet` korzysta faza 2.

#### 3. Grupa wyników z identyfikatorem

**Files**: `src/lib/services/medications.ts`, `src/lib/services/registry-search.ts`, `scripts/medications/medications.test.mjs`

**Intent**: Wynik wyszukiwania musi dać identyfikator, na który można zalinkować zamiast nazwy.

**Contract**: `RegistryNameGroup` dostaje `productId: string` — identyfikator pierwszego wiersza grupy w kolejności wyniku. `groupRegistryResults` przyjmuje `{ id, product_name }[]`; `searchRegistryNames` czyta `id, product_name`. Test: grupa niesie id swojego pierwszego wiersza.

#### 4. Strona `/leki/nowy`

**File**: `src/pages/leki/nowy.astro`

**Intent**: Strona czyta wyszukiwany tekst z ciasteczka, a nazwę i warianty ustala z `?wariant=`.

**Contract**:

- Czyta wyłącznie `?wariant=` (tylko poprawny uuid) i `?error=`; `?q=` i `?nazwa=` ignorowane.
- `?wariant=<uuid>` → odczyt `product_name` tego produktu, potem warianty o tej nazwie jak dziś; zaznaczony ten produkt. Nieznany uuid → stan „brak wyników”.
- Bez `?wariant=` → tekst z ciasteczka wyszukiwania; jedna nazwa w wynikach pokazuje od razu warianty (jak dziś).
- Lista wyników linkuje `/leki/nowy?wariant=<productId>`.
- Komentarz nagłówkowy opisuje nowy kontrakt.

#### 5. Wyszukiwarka i podpowiedzi

**Files**: `src/components/medications/RegistrySearch.tsx`, `src/components/hooks/useRegistrySuggestions.ts`, `src/pages/api/registry/search.ts`

**Intent**: Formularz i podpowiedzi przenoszą tekst w treści żądania; wybór podpowiedzi prowadzi na identyfikator.

**Contract**:

- Formularz: `method="POST"`, `action="/api/medications/draft"`, ukryte `kind=search`, pole `q`.
- Wybór podpowiedzi → `window.location.assign("/leki/nowy?wariant=<productId>")`.
- Hook: `fetch(SEARCH_PATH, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ q }) })`; `isNameGroup` wymaga też `productId`.
- Trasa: `POST` czyta `{ q }` z JSON (zły JSON → `400 invalidQuery`); odpowiedź `{ names: { name, variants, productId }[] }`. `GET` usunięty (Astro odpowie 404/405 bez handlera).

#### 6. Zapis z rejestru — powrót po błędzie

**Files**: `src/pages/api/medications/index.ts`, `src/components/medications/AddMedicationForm.tsx`

**Intent**: Błąd zapisu z rejestru wraca wyłącznie z identyfikatorem wariantu i kodem; udany zapis czyści szkice.

**Contract**: gałąź rejestru `errorRedirect` → `/leki/nowy?wariant=<uuid>&error=<kod>` (bez wariantu: `/leki/nowy?error=<kod>`). Ukryte pole `nazwa` usunięte z formularza. Po udanym zapisie (dowolne źródło) `clearMedicationDrafts`.

#### 7. Czyszczenie przy wylogowaniu i usunięciu konta

**Files**: `src/pages/api/auth/signout.ts`, `src/pages/api/account/delete.ts`

**Intent**: Wpisany tekst nie zostaje w przeglądarce po zakończeniu sesji.

**Contract**: obie trasy wołają `clearMedicationDrafts(context.cookies)` przed przekierowaniem.

#### 8. Testy i smoke

**Files**: `scripts/medications/medication-draft.test.mjs` (nowy), `scripts/smoke.mjs`

**Intent**: Logika ciasteczka i nowa trasa podpowiedzi są sprawdzane.

**Contract**:

- Test jednostkowy `parseRegistrySearch` / `parseLeafletDraft`: poprawny szkic; inne konto → `null`; zły JSON → `null`; tekst > 200 znaków przycięty; zła data odrzucona; brak pola dawki w wyniku nawet gdy było w wejściu.
- Smoke: krok podpowiedzi wysyła `POST` z JSON `{ q: "ibu" }` (cookie sesji, bez dopisanego `Origin` — `fetch` z tej samej domeny), oczekuje niepustej listy z `productId`; krok anonimowy: `401`. Nowy krok: `POST /api/medications/draft` z `kind=search` (Origin z `formOrigin("/leki/nowy")`) → `303` na dokładnie `/leki/nowy`, a `GET /leki/nowy` z tym ciasteczkiem pokazuje szukaną nazwę w wynikach.
- Smoke, nowy krok czyszczenia: odpowiedź `POST /api/auth/signout` i odpowiedź udanego zapisu leku (`POST /api/medications`) mają w nagłówkach `Set-Cookie` usunięcie obu ciasteczek — `lekomapa-registry-search` z `Path=/leki/nowy` i `lekomapa-leaflet-draft` z `Path=/leki/nowy/z-ulotki`, każde z `Max-Age=0`. Smoke czyta surowe nagłówki `Set-Cookie` (`getSetCookie()`), bo jego słownik ciasteczek gubi atrybut `Path`. Usunięcie konta woła tę samą `clearMedicationDrafts` — bez osobnego kroku.

### Success Criteria:

#### Automated Verification:

- Testy jednostkowe przechodzą: `npm test`
- Typy przechodzą: `npm run typecheck`
- Lint przechodzi: `npm run lint`
- Smoke przechodzi przeciw lokalnemu Supabase (`.env` odsunięty, stary podgląd zatrzymany): `npm run smoke`

#### Manual Verification:

- Wyszukanie „Ibuprom” przyciskiem „Szukaj”, wybór nazwy z listy i wybór podpowiedzi: pasek adresu i historia przeglądarki pokazują wyłącznie `/leki/nowy` i `/leki/nowy?wariant=<uuid>`
- Odświeżenie wyników wyszukiwania pokazuje te same wyniki bez komunikatu o ponownym wysłaniu formularza
- Wyszukiwanie działa z wyłączonym JavaScriptem
- W zakładce Sieć żądanie podpowiedzi to `POST /api/registry/search` bez parametrów w adresie
- Stary adres `/leki/nowy?nazwa=Ibuprom` pokazuje pusty formularz wyszukiwania
- Po wylogowaniu i zalogowaniu innym kontem `/leki/nowy` nie pokazuje poprzedniego wyszukiwania

**Implementation Note**: Po zielonej weryfikacji automatycznej zatrzymaj się na ręczne potwierdzenie przed fazą 2.

---

## Phase 2: Formularz z ulotki bez nazwy w adresie

### Overview

Błędy zapisu, stan „brak dopasowania” i „podobne substancje” przenoszą wpisany tekst w ciasteczku szkicu ulotki zamiast w adresie.

### Changes Required:

#### 1. Zapis z ulotki — powrót po błędzie

**File**: `src/pages/api/medications/index.ts`

**Intent**: Błąd i brak dopasowania zapisują nazwę, substancję i datę w szkicu ulotki i wracają na adres bez nazwy.

**Contract**: gałąź ulotki `errorRedirect` → szkic z `unmatched: false`, przekierowanie `/leki/nowy/z-ulotki?error=<kod>`. `noMatchRedirect` → szkic z wpisaną substancją i `unmatched: true`, przekierowanie `/leki/nowy/z-ulotki`. `leafletParams` usunięte. Fałszywy komentarz (linie 74-75 i 85-86) zastąpiony opisem: w adresie tylko kod błędu, tekst w ciasteczku HttpOnly, dawka nigdzie.

#### 2. Strona `/leki/nowy/z-ulotki`

**File**: `src/pages/leki/nowy/z-ulotki.astro`

**Intent**: Pola i stan „brak dopasowania” pochodzą ze szkicu, nie z adresu; podobne substancje to przyciski.

**Contract**:

- Czyta wyłącznie `?error=` z adresu; pozostałe wartości ze szkicu ulotki (`unmatched` wyznacza stan „brak dopasowania”, data z tą samą kontrolą co dziś: poprawna i nie z przyszłości).
- Każda podobna nazwa to przycisk w osobnym formularzu `POST /api/medications/draft` z ukrytymi `kind=leaflet`, `productName`, `startedOn` i `substanceName=<podobna nazwa>`. Wygląd przycisku jak dzisiejszego linku-kafelka (te same klasy tokenów).
- Komentarz nagłówkowy opisuje nowy kontrakt.

#### 3. Galeria E2E

**File**: `tests/e2e/dark-gallery.spec.ts`

**Intent**: Stan „puste pola — błąd” nadal ma na co czekać.

**Contract**: `toHaveURL(/[?&]error=/)` zostaje — kod błędu dalej trafia do adresu; sprawdź, że stan renderuje się po zmianie. Bez innych zmian, jeśli przechodzi.

#### 4. Smoke

**File**: `scripts/smoke.mjs`

**Intent**: Ścieżki błędu i braku dopasowania formularza z ulotki dostają pierwsze kroki smoke — dziś każdy zapis z ulotki wysyła `confirmUnverified: "1"` i sprawdza tylko sukces (`scripts/smoke.mjs:623-660`).

**Contract**: nowy krok „brak dopasowania”: zapis z wymyśloną substancją bez zaznaczonego pola → `302`/`303` na dokładnie `/leki/nowy/z-ulotki`, a `GET` tej strony z ciasteczkami odpowiedzi pokazuje komunikat braku dopasowania i wpisaną substancję w polu. Nowy krok błędu: pusta nazwa → dokładnie `/leki/nowy/z-ulotki?error=productNameRequired`.

### Success Criteria:

#### Automated Verification:

- Testy jednostkowe przechodzą: `npm test`
- Typy przechodzą: `npm run typecheck`
- Lint przechodzi: `npm run lint`
- Smoke przechodzi przeciw lokalnemu Supabase: `npm run smoke`

#### Manual Verification:

- Zapis z substancją „ibuprofn”: strona pokazuje „brak dopasowania” z podobnymi nazwami, adres to `/leki/nowy/z-ulotki`, nazwa leku i data wracają w polach, dawka nie
- Kliknięcie podobnej nazwy wypełnia pole substancji, adres bez nazwy; działa też z wyłączonym JavaScriptem
- Błąd daty z przyszłości: adres `/leki/nowy/z-ulotki?error=futureDate`, wpisane pola wracają
- Udany zapis, potem ponowne wejście na `/leki/nowy/z-ulotki`: formularz pusty

**Implementation Note**: Po zielonej weryfikacji automatycznej zatrzymaj się na ręczne potwierdzenie przed fazą 3.

---

## Phase 3: Strażnik reguły

### Overview

Test kodu i kroki smoke pilnują, że nazwa leku nie wróci do adresu.

### Changes Required:

#### 1. Test parametrów adresu

**File**: `scripts/pages/url-params.test.mjs` (nowy)

**Intent**: Każdy nowy parametr adresu w `src/` wymaga świadomego wpisu na liście dozwolonych.

**Contract**:

- Skanuje `src/**/*.{ts,tsx,astro}` i zbiera nazwy parametrów z: `searchParams.get("x")`, `URLSearchParams({ x: … })`, `.set("x", …)` na obiektach `URLSearchParams`, wywołań helperów `*Param("x")` (np. `uuidParam("notatka")` w `src/pages/dzienniczek/index.astro:47`, `readParam("…")` w `src/pages/leki/nowy/z-ulotki.astro:20-23`), literałów `?x=` / `&x=` w stringach i szablonach.
- Przed skanem usuwa komentarze (`//`, `/* */`, `<!-- -->` i `{/* */}`), żeby przykłady `?x=` w komentarzach (`src/lib/copy/*`, `src/lib/auth/confirm-link.ts`) nie dawały fałszywych alarmów.
- Klucz składany w locie (`?${…}=` / `&${…}=`): test pada, chyba że plik jest na liście `DYNAMIC_KEY_FILES` z jednozdaniowym uzasadnieniem, skąd biorą się możliwe nazwy. Dziś jeden wpis: `EditEntryForm.tsx` (`?${successParam}=`, wartość tylko z dozwolonych flag sukcesu dzienniczka). Komentarz nad listą: nowy wpis tylko, gdy klucz pochodzi ze stałego zbioru nazw z `ALLOWED_URL_PARAMS`.
- `ALLOWED_URL_PARAMS` — obecne identyfikatory, kody i flagi (m.in. `error`, `error_code`, `code`, `token_hash`, `type`, `expired`, `reset`, `confirmed`, `wariant`, `dodano`, `usunieto`, `zmieniono`, `poprawiono`, `cofnieto`, `zakonczenie`, `notatka`); dokładny zbiór ustalony przy implementacji z bieżącego kodu, bez `q`, `nazwa`, `substancja`, `niedopasowana`, `data`.
- Komunikat przy porażce: plik, parametr, odwołanie do lessona „Żadna nazwa leku ani dawka w adresie URL”.
- Komentarz nad listą: nowy wpis tylko dla identyfikatora, kodu albo stałej flagi, nigdy tekstu wpisanego przez użytkowniczkę.
- Dowód czułości: test pada, gdy przywrócić `?nazwa=` w `nowy.astro` (sprawdzone ręcznie i cofnięte).

#### 2. Smoke — brak nazwy w adresach przekierowań

**File**: `scripts/smoke.mjs`

**Intent**: Smoke sprawdza prawdziwe wartości w odpowiedziach serwera, nie tylko kod.

**Contract**: wspólna funkcja sprawdzająca, że `location` nie zawiera (bez względu na wielkość liter i kodowanie URL) wysłanej nazwy leku ani substancji. Wołana we wszystkich krokach ścieżki dodawania: trasa szkicu (`search`, `leaflet`), zapis z rejestru (sukces i błąd), zapis z ulotki (sukces, błąd, brak dopasowania). Na wzór istniejącego `noDoseInUrl` (`scripts/smoke.mjs:841`).

#### 3. Lesson

**File**: `context/foundation/lessons.md`

**Intent**: Lesson wskazuje, który test pilnuje reguły.

**Contract**: dopisek w lessonie „Żadna nazwa leku ani dawka w adresie URL”: regułę pilnuje `scripts/pages/url-params.test.mjs` i krok smoke; nowy parametr wymaga wpisu w `ALLOWED_URL_PARAMS`.

### Success Criteria:

#### Automated Verification:

- Testy jednostkowe przechodzą, w tym nowy test parametrów: `npm test`
- Test parametrów pada po tymczasowym przywróceniu `?nazwa=` w `src/pages/leki/nowy.astro`
- Typy i lint przechodzą: `npm run typecheck && npm run lint`
- Smoke przechodzi przeciw lokalnemu Supabase: `npm run smoke`

**Implementation Note**: Faza 3 kończy zmianę; po merge'u `/10x-impl-review`. Faza nie ma bramki ręcznej — jedyne sprawdzenie ręczne da się wykonać dopiero na produkcji.

**Po merge'u** (poza Progress, nie blokuje commita fazy): w logach Workera w panelu Cloudflare jedno wywołanie `/leki/nowy` po wyszukiwaniu — adres bez nazwy; odnotuj, czy log zapisuje nagłówek `Cookie`. Wynik wpisz do raportu `/10x-impl-review`.

---

## Testing Strategy

### Unit Tests:

- `parseRegistrySearch` / `parseLeafletDraft`: inne konto, zły JSON, przycięcie, zła data, brak dawki.
- `groupRegistryResults`: `productId` pierwszego wiersza grupy.
- Strażnik parametrów adresu ze sprawdzoną czułością.

### Integration Tests:

- Smoke: trasa szkicu, podpowiedzi przez POST (zalogowany i anonimowy), ścieżki błędu i braku dopasowania ulotki, brak nazwy w każdym `location`.

### Manual Testing Steps:

1. Wyszukaj lek, wybierz nazwę, wybierz podpowiedź — sprawdź historię przeglądarki.
2. Powtórz z wyłączonym JavaScriptem.
3. Formularz z ulotki: literówka w substancji → podobna nazwa → zapis.
4. Wyloguj, zaloguj innym kontem, wejdź na `/leki/nowy` i `/leki/nowy/z-ulotki` — puste.

## Performance Considerations

Strona z `?wariant=` robi jedno dodatkowe zapytanie (nazwa produktu po id) przed listą wariantów. Pomijalne.

## Migration Notes

Brak migracji bazy. Stare zakładki z `?q=` / `?nazwa=` otwierają pusty formularz (decyzja).

## References

- Issue: #57
- Finding F6: `context/archive/2026-09-29-add-medication-with-interaction-flag/reviews/impl-review.md`
- Lesson: `context/foundation/lessons.md` → „Żadna nazwa leku ani dawka w adresie URL”, „Smoke wysyła nagłówki tak jak przeglądarka”, „Lokalne bramki sprawdź…”, „Zatrzymaj stary podgląd…”
- Wzorzec ciasteczka i 303: `src/pages/api/preferences/theme.ts`, `src/lib/theme.ts:11-16`
- Wzorzec strażnika: `scripts/pages/page-title.test.mjs`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Rejestr bez nazwy w adresie

#### Automated

- [x] 1.1 Testy jednostkowe przechodzą: `npm test` — 84aee21
- [x] 1.2 Typy przechodzą: `npm run typecheck` — 84aee21
- [x] 1.3 Lint przechodzi: `npm run lint` — 84aee21
- [x] 1.4 Smoke przechodzi przeciw lokalnemu Supabase (`.env` odsunięty, stary podgląd zatrzymany): `npm run smoke` — 84aee21

#### Manual

- [x] 1.5 Wyszukanie „Ibuprom” przyciskiem „Szukaj”, wybór nazwy z listy i wybór podpowiedzi: pasek adresu i historia przeglądarki pokazują wyłącznie `/leki/nowy` i `/leki/nowy?wariant=<uuid>` — 84aee21
- [x] 1.6 Odświeżenie wyników wyszukiwania pokazuje te same wyniki bez komunikatu o ponownym wysłaniu formularza — 84aee21
- [x] 1.7 Wyszukiwanie działa z wyłączonym JavaScriptem — 84aee21
- [x] 1.8 W zakładce Sieć żądanie podpowiedzi to `POST /api/registry/search` bez parametrów w adresie — 84aee21
- [x] 1.9 Stary adres `/leki/nowy?nazwa=Ibuprom` pokazuje pusty formularz wyszukiwania — 84aee21
- [x] 1.10 Po wylogowaniu i zalogowaniu innym kontem `/leki/nowy` nie pokazuje poprzedniego wyszukiwania — 84aee21

### Phase 2: Formularz z ulotki bez nazwy w adresie

#### Automated

- [x] 2.1 Testy jednostkowe przechodzą: `npm test` — f6b9626
- [x] 2.2 Typy przechodzą: `npm run typecheck` — f6b9626
- [x] 2.3 Lint przechodzi: `npm run lint` — f6b9626
- [x] 2.4 Smoke przechodzi przeciw lokalnemu Supabase: `npm run smoke` — f6b9626

#### Manual

- [x] 2.5 Zapis z substancją „ibuprofn”: strona pokazuje „brak dopasowania” z podobnymi nazwami, adres to `/leki/nowy/z-ulotki`, nazwa leku i data wracają w polach, dawka nie — f6b9626
- [x] 2.6 Kliknięcie podobnej nazwy wypełnia pole substancji, adres bez nazwy; działa też z wyłączonym JavaScriptem — f6b9626
- [x] 2.7 Błąd daty z przyszłości: adres `/leki/nowy/z-ulotki?error=futureDate`, wpisane pola wracają — f6b9626
- [x] 2.8 Udany zapis, potem ponowne wejście na `/leki/nowy/z-ulotki`: formularz pusty — f6b9626

### Phase 3: Strażnik reguły

#### Automated

- [x] 3.1 Testy jednostkowe przechodzą, w tym nowy test parametrów: `npm test`
- [x] 3.2 Test parametrów pada po tymczasowym przywróceniu `?nazwa=` w `src/pages/leki/nowy.astro`
- [x] 3.3 Typy i lint przechodzą: `npm run typecheck && npm run lint`
- [x] 3.4 Smoke przechodzi przeciw lokalnemu Supabase: `npm run smoke`
