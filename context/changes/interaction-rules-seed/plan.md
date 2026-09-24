# Pary kolizji na grupach ATC i rejestr leków — plan wdrożenia

## Overview

Do bazy trafiają dwa zbiory dostarczane razem z produktem:

- **Rejestr leków**: nazwy handlowe ze składem i kodami ATC, przepisane z Rejestru Produktów Leczniczych (RPL) i zawężone do grup objętych parami.
- **Około 20 par kolizji** zapisanych na grupach ATC.

Oba zbiory są wspólne i tylko do odczytu, z RLS w tej samej migracji.

Sedno zmiany to wyprowadzenie **kodu ATC każdej substancji**. RPL podaje kod dla całego leku, a para działa na kodzie substancji. Przykład, na którym oparto decyzję:

- Na liście jest Ibuprom (`M01AE01`), a w bazie para `C09CA × M01AE`.
- **Diovan** (walsartan, `C09CA03`) daje znacznik.
- **Exforge HCT** ma ten sam walsartan, ale RPL podaje dla całego leku kod `C09DX01`. Bez wyprowadzenia kodów substancji znacznika nie ma.
- Po wyprowadzeniu walsartan w Exforge dostaje `C09CA03`, tak jak w Diovanie, i Exforge zachowuje się jak Diovan.

Fundament F-02 z `context/foundation/roadmap.md`, issue #10. Odblokowuje S-02 (gwiazdę przewodnią).

## Current State Analysis

- **F-01 jest wdrożone** (`supabase/migrations/20260922120000_medication_schema.sql`):
  - `medication_substances.atc_code` jest `not null` (`:52`).
  - `medications.registry_medication_id` nie ma klucza obcego. To dług jawnie przekazany F-02 (`:25-27`, `:38-39`).
- **Wzorce do powtórzenia:**
  - RLS per-operacja i per-rola: `20260922120000_medication_schema.sql:106-216`.
  - Sprawdzenia SQL w jednej transakcji z rollbackiem i nazwanymi błędami: `supabase/tests/rls_checks.sql`.
  - Kroki izolacji w `scripts/smoke.mjs:157-272`, uruchamiane wyłącznie przeciw lokalnemu Supabase.
- **`supabase/seed.sql` nie dociera na produkcję.** Działa tylko przy `db reset` (`supabase/config.toml:60-65`). Dane produktu muszą więc wejść migracją.
- **Brak narzędzia do testów jednostkowych.** README (`README.md:114`) zapowiada testy „razem z pierwszym serwisem". Wbudowany `node --test` nie wymaga zależności.
- **Pomiar RPL (research 2026-09-23, snapshot `stanNaDzien="2026-09-23"`):**
  - **Źródło:** XML v6.0.0 (~74 MB), licencja CC BY 4.0, aktualizowany codziennie. Adres: `https://rejestry.ezdrowie.gov.pl/api/rpl/medicinal-products/public-pl-report/6.0.0/overall.xml`.
  - **Rozmiar:** 22 909 produktów, w tym 20 258 dla ludzi.
  - **Kody ATC tylko per produkt:**
    - `kodyATC/kodATC` może wystąpić 0..n razy.
    - `substancjaCzynna` nie ma atrybutu ATC (potwierdzone w XSD).
    - Leki złożone mają kod kombinacji (Exforge HCT → `C09DX01`).
  - **Braki i niepełne kody:**
    - 1 107 produktów bez żadnego ATC.
    - Część kodów kończy się na poziomie grupy: 539 pięcioznakowych, 111 czteroznakowych, 11 trzyznakowych.
    - 943 produkty dla ludzi nie mają żadnej substancji.
  - **Nazwy substancji:** łacińskie, z solą albo bez („Amlodipinum" 259×, „Amlodipini besilas" 118×, „Amlodipini maleas" 7×). Polskich nazw brak.
  - **Duplikaty nazw:** 20 258 produktów ma tylko 9 591 różnych nazw (Xanax 47×).
    - Import równoległy (`typProcedury="IR"`) to 4 351 osobnych produktów.
    - 334 nazwy mają wklejoną dawkę.
  - **Ważność pozwolenia:** `waznoscPozwolenia` bywa datą, „Bezterminowe", „Pozwolenie zawieszone" albo jest puste. Znaczenie daty z przeszłości jest niepotwierdzone.
  - **Skala po zawężeniu:** C09AA 214, C09DA 167, M01AE 320, C10AA 281. Zawężony zbiór to rząd 1,5–3 tys. produktów.
- **Pomiar z Fazy 1 (2026-09-24, 15 grup roboczych, `registry-measurement.md`)** ujawnił luki, których pierwotny kontrakt nie obsługuje:
  - **65 produktów w zakresie bez żadnej substancji**, w tym Concor, Betaloc ZOK, Sintrom, Karbis, Aspirin Cardio. 63 z nich to import równoległy (`IR`) i 63 mają w RPL produkt o tej samej nazwie z pełnym składem. Wszystkie 63 mają odpowiednika o tej samej nazwie i tym samym zbiorze kodów (zmierzone przy przeglądzie planu). 2 pozostałe to Clopidogrel Krka (100290549) i Nurofen dla dzieci o smaku truskawkowym (100307830). Nurofen uzupełnia się z kodu produktu. Clopidogrel nie, bo kod `B01AC04` wskazuje trzy hasła słownika (`clopidogrelum`, `clopidogrelum hydrosulfas`, `clopidogrelum besilate`) — w `SALT_WORDS` brakuje słów `hydrosulfas` i `besilate`. Bez składu produkt nie dostałby znacznika nigdy, bo dopasowanie działa na kodach substancji.
  - **41 substancji `unmatched`**:
    - 28 to sakubitryl, który nie ma własnego kodu ATC w ogóle (istnieje wyłącznie w kombinacji `C09DX04`),
    - reszta to polskie nazwy z literówką („Atorwastyatyna z L-lizyną” w Amlatorze), substancje bez produktu jednoskładnikowego w RPL (kodeina, chlorfenamina, amiloryd, tribenozyd) i składniki pomocnicze wpisane jako czynne (celuloza, tlenek magnezu).
  - **36 remisów `derived_ambiguous`**, głównie różne drogi podania jednej substancji (aspiryna `A01AD05`/`B01AC06`/`N02BA01`). Przez remis do zakresu wchodzą produkty spoza grup (Venogel przez diklofenak).
  - **Błędy źródła**: Thinban (rywaroksaban) ma kod metforminy `A10BA02` i przez to zanieczyszcza słownik; 2 kody „BRAK”.
  - **Wniosek**: samo wyprowadzanie z RPL zostawia ciche braki znaczników. Luki domyka automatyczne uzupełnienie składu z RPL i ręcznie sprawdzony plik poprawek (Faza 1 pkt 7–8, Faza 3 pkt 3).

## Desired End State

- **Migracja schematu** tworzy `registry_products`, `registry_substances` i `interaction_pairs`:
  - RLS z jedną polityką `select` dla `authenticated`, bez polityk zapisu, bez dostępu dla `anon`.
  - Zmienia F-01: kod substancji może być pusty, a `registry_medication_id` dostaje klucz obcy do rejestru.
- **Dwie wygenerowane migracje danych:**
  - rejestr zawężony do grup ze sprawdzonych par,
  - pary sprawdzone przez autorkę.
  - Obie są powtarzalne z przypiętego pliku RPL i jego skrótu.
- **`scripts/rpl/`:**
  - pobieranie, parsowanie i normalizacja nazw substancji,
  - wyprowadzanie kodów substancji i filtr zakresu,
  - generowanie SQL i raport pomiaru,
  - testy `node --test`.
- **`supabase/seed-data/interaction_pairs.csv`**: pary z opisem, źródłem i datą sprawdzenia wpisaną przez autorkę.
- **`supabase/seed-data/substance-corrections.csv`**: poprawki luk, których RPL nie domyka (aliasy nazw, kody substancji bez leku jednoskładnikowego, rozstrzygnięte remisy, błędy źródła), przygotowane przez agenta ze źródłem przy każdym wierszu i sprawdzone przez autorkę.
- **Każdy produkt w zakresie ma skład**, także import równoległy bez składu w RPL (uzupełniony z odpowiednika albo z kodu produktu, z zapisanym pochodzeniem). Wyjątki są wypisane w raporcie.
- **`npx supabase db reset`** przechodzi czysto. Sprawdzenia SQL i `npm run smoke` dowodzą, że:
  - zalogowane konto czyta rejestr i pary,
  - nie może ich zmienić,
  - niezalogowany nie widzi nic.

Weryfikacja końcowa: `npx supabase db reset`, potem sprawdzenia SQL, `npm test` i `npm run smoke` przeciw lokalnemu podglądowi.

### Key Discoveries:

- **Kod substancji w leku złożonym trzeba wyprowadzić.** Słownik „znormalizowana nazwa substancji → kody ATC" powstaje z produktów jednoskładnikowych **całego** RPL, nie zawężonego zbioru. Gdyby Diovan był spoza wybranych grup, walsartan w Exforge nie miałby skąd wziąć kodu.
- **Filtr zakresu musi patrzeć na kody substancji, nie tylko na kod produktu.** Exforge HCT (`C09DX01`) należy do zbioru, bo zawiera walsartan (`C09CA03`).
- **Remisy kodów są realne.** Ibuprofen ma w RPL kod `M01AE01` (tabletki) i `M02AA13` (żel). Rozstrzyga najdłuższy wspólny początek z kodem produktu. Przy remisie zapisywane są wszystkie kandydujące kody: więcej znaczników zamiast cichego braku (`context/foundation/lessons.md`, „Niepełny zbiór reguł to co innego niż wyrzucone dane").
- **Naiwna normalizacja „pierwsze słowo" się myli.** „Acidum acetylsalicylicum" to jedna substancja z dwóch słów. Normalizacja usuwa słowa soli i hydratów z listy, a nie ucina nazwę.
- **Licencja CC BY 4.0 wymaga podania źródła.** README dostaje wzmiankę w tej zmianie. Wzmianka w interfejsie należy do S-02.

## What We're NOT Doing

- Żadnego wyszukiwania leku, ekranu dodawania ani znacznika kolizji w interfejsie. To S-02, podobnie jak grupowanie duplikatów nazw (Xanax 47×) przy wyszukiwaniu.
- Żadnej logiki dopasowania par do leków użytkowniczki w kodzie aplikacji. F-02 daje dane i opisuje regułę dopasowania w komentarzu tabeli. Implementacja należy do S-02.
- Żadnego automatycznego pobierania ani wgrywania zewnętrznego indeksu ATC (WHO ani innego). Generator bierze kody i skład wyłącznie z RPL. Luki, których RPL nie domyka, uzupełnia ręcznie sprawdzony plik poprawek (`supabase/seed-data/substance-corrections.csv`), w którym każdy wiersz ma źródło (ChPL, ulotka, wyszukiwarka ATC WHO) i datę sprawdzenia wpisaną przez autorkę. Sprawdzenie pojedynczego braku w innym źródle to weryfikacja, nie integracja.
- Żadnego odrzucania pozycji po dacie ważności pozwolenia ani po imporcie równoległym. Wgrywane są wszystkie produkty dla ludzi z zakresu. Pola ważności są zapisane surowo, bez interpretacji.
- Żadnego odświeżania rejestru ani rozszerzenia na pełny RPL (roadmapa, `## Parked`).
- Żadnego wpisu par do bazy bez daty sprawdzenia wpisanej przez autorkę. Agent przygotowuje szkic, ale nie wpisuje `verified_on`.
- Żadnego wgrywania surowego pliku RPL (74 MB) do repozytorium. Trafia do `.cache/`, a w repozytorium zostaje manifest ze skrótem.
- Żadnego wdrożenia migracji na produkcję w ramach tej zmiany. Patrz `## Migration Notes`.
- Żadnej zmiany zarchiwizowanego planu F-01. Zmiana schematu F-01 idzie nową migracją.

## Implementation Approach

Pomiar przed migracją, zgodnie z wymogiem z issue #10:

- **Faza 1** buduje skrypt i raport liczb na prawdziwym RPL, zanim powstanie jakakolwiek tabela.
- **Faza 2** zakłada schemat.
- **Faza 3** to praca autorki nad parami.
- **Faza 4** generuje migracje danych z przypiętego pliku i sprawdzonych par.

Dane wchodzą migracjami wygenerowanymi skryptem, nie importem do bazy:

- lokalnie, w CI i na produkcji jest ten sam stan,
- agent nie potrzebuje klucza do produkcji,
- a stan bazy wynika z repozytorium.

Zakres rejestru to filtr przy generowaniu. Nigdzie w bazie nie ma flagi „w zakresie" (`lessons.md`, „Zakres zbioru dostarczonego z produktem to filtr przy wczytywaniu, nie flaga w bazie"):

- Lista grup to grupy występujące w sprawdzonych parach. Osobnej listy do pilnowania nie ma.
- Nowa para z nową grupą oznacza ponowne uruchomienie generatora. Kolejna migracja dogrywa brakujące produkty i nie rusza istniejących.

## Critical Implementation Details

- **Kolejność migracji:** schemat, potem rejestr, potem pary. Klucz obcy `medications.registry_medication_id` powstaje w migracji schematu, zanim istnieje jakikolwiek wiersz rejestru. W żadnym środowisku `medications.registry_medication_id` nie jest jeszcze wypełnione, bo S-02 nie istnieje. Klucz obcy dodany bez `not valid` przejdzie od razu.
- **Idempotencja migracji danych:**
  - Produkty są wstawiane z `on conflict (rpl_id) do nothing`.
  - Substancje wyłącznie dla produktów faktycznie wstawionych w tej migracji, czyli przez `returning` z wstawienia produktów, nie przez złączenie z całą tabelą.
  - Inaczej migracja dogrywająca zdublowałaby skład produktów wgranych wcześniej.
- **Skrót pliku RPL jest bramką generatora.** Generator odmawia pracy, gdy skrót pliku w `.cache/` różni się od `supabase/seed-data/rpl-snapshot.json`. RPL zmienia się codziennie, więc ponowne pobranie daje inne dane niż te, które opisuje manifest.

---

## Faza 1: Skrypt RPL i pomiar

### Overview

Pobranie RPL, parser, normalizacja nazw, wyprowadzenie kodów substancji, filtr zakresu i raport liczb. Bez bazy. Autorka czyta raport, zanim powstanie schemat.

### Changes Required:

#### 1. Pobieranie i manifest

**File**: `scripts/rpl/download.mjs`, `supabase/seed-data/rpl-snapshot.json`, `.gitignore`

**Intent**: Przypiąć dokładny stan RPL, z którego powstają dane, żeby generowanie było powtarzalne mimo codziennych zmian rejestru.

**Contract**:

- Pobiera XML v6.0.0 z adresu w `## Current State Analysis` do `.cache/rpl/overall-6.0.0-<stanNaDzien>.xml`.
- Zapisuje manifest `{ url, schemaVersion: "6.0.0", stanNaDzien, sha256, bytes, downloadedAt }`.
- `.cache/` trafia do `.gitignore`.
- Istniejący manifest jest nadpisywany wyłącznie z flagą `--refresh`.

#### 2. Parser i model produktu

**File**: `scripts/rpl/parse.mjs`, `package.json`

**Intent**: Zamienić XML na listę produktów z polami potrzebnymi generatorowi i z pełną treścią źródłową do zapisu przy wierszu.

**Contract**:

- `fast-xml-parser` w `devDependencies`. Skrypty chodzą w Node, nie w workerd.
- Produkt:
  - `{ rplId, productName, commonName, strength, form, procedureType, authorizationNumber, authorizationValidity, holder, species, atcCodes: string[], substances: [{ position, name }], raw }`,
  - gdzie `raw` to cały sparsowany element `produktLeczniczy`, także opakowania.
- Odrzucane są wyłącznie produkty weterynaryjne (`rodzajPreparatu`).
- Każdy kod ATC ze źródła jest czyszczony (wielkie litery, bez spacji) i sprawdzany tą samą regułą kształtu co w bazie (`medication_substances_atc_code_check`). Kod, który po oczyszczeniu nadal jest błędny, nie trafia do `atcCodes`, tylko do listy odrzuconych kodów (produkt, surowa wartość). Lista trafia do raportu pomiaru i nagłówka migracji. Bez tego jeden zły kod w źródle wywraca całą migrację przy `db reset` i w CI.

#### 3. Normalizacja nazw substancji

**File**: `scripts/rpl/normalize.mjs`

**Intent**: Uznać różne zapisy jednej substancji za tę samą substancję, żeby słownik kodów trafiał w leki złożone.

**Contract**:

- Funkcja `normalizeSubstanceName(name) → string`:
  - małe litery, bez znaków diakrytycznych, bez nawiasów,
  - usunięte słowa soli i hydratów z listy w module (`besilas`, `maleas`, `kalicum`, `natricum`, `calcicum`, `hydrochloridum`, `tartras`, `trihydricum` i dalsze, uzupełniane pomiarem; po rewizji 2026-09-24 także `hydrosulfas` i `besilate`),
  - po usunięciu soli pierwsze słowo w dopełniaczu wraca do mianownika (`amlodipini` → `amlodipinum`).
- Nazwa wielowyrazowa bez słów soli zostaje wielowyrazowa („acidum acetylsalicylicum").

#### 4. Wyprowadzenie kodów substancji i filtr

**File**: `scripts/rpl/derive.mjs`

**Intent**: Dać każdej substancji jej własny kod ATC, a nie kod całego leku, i wybrać produkty z zakresu po kodach substancji.

**Contract**:

- **Słownik:** `buildSubstanceIndex(products)`, z **wszystkich** produktów jednoskładnikowych dla ludzi. Zwraca mapę `znormalizowana nazwa → zbiór kodów ATC`.
- **Kody substancji:** `deriveSubstanceCodes(product, index)` zwraca `[{ position, name, normalizedName, atcCode, atcSource }]`:
  - **Produkt jednoskładnikowy:** kody produktu, `atcSource = 'product'`. Kilka kodów produktu to kilka wierszy.
  - **Produkt wieloskładnikowy:** kandydaci ze słownika.
    - Jeden kandydat: `'derived'`.
    - Kilku kandydatów: wygrywa kod o najdłuższym wspólnym początku z którymkolwiek kodem produktu (`'derived'`). Przy remisie wszystkie zwycięskie kody, każdy jako osobny wiersz, z `'derived_ambiguous'`.
    - Brak kandydata: `atcCode = null`, `'unmatched'`.
  - **Produkt bez substancji:** brak wierszy substancji.
- **Filtr zakresu:** `inScope(productWithCodes, groups)`. Produkt jest w zakresie, gdy którykolwiek kod substancji albo kod produktu zaczyna się od którejkolwiek grupy.

#### 5. Raport pomiaru

**File**: `scripts/rpl/measure.mjs`, wynik w `context/changes/interaction-rules-seed/registry-measurement.md`

**Intent**: Pokazać autorce liczby, zanim dane staną się migracją. Pomiar przed decyzją, nie po niej.

**Contract**:

- Wejście:
  - plik z manifestu (skrót sprawdzany),
  - robocza lista grup z flagi `--groups`: grupy kandydujące przygotowane przez agenta, zapisane w raporcie.
- Raport podaje:
  - liczbę produktów dla ludzi i w zakresie,
  - dla substancji produktów wieloskładnikowych w zakresie: liczbę `derived`, `derived_ambiguous` i `unmatched`,
  - pełną listę `unmatched` i `derived_ambiguous` w zakresie (nazwa produktu, substancja, kandydaci),
  - znormalizowane nazwy, którym słownik przypisuje kody z różnych grup anatomicznych (pierwsza litera kodu), jako podejrzenie błędnej normalizacji,
  - szacowany rozmiar migracji danych w MB,
  - rozkład Exforge HCT, Diovanu i Ibupromu jako próbkę kontrolną.
- Po dodaniu pkt 7–8 raport pokazuje liczby **przed i po** uzupełnieniu składu i poprawkach oraz osobne listy:
  - produkty z uzupełnionym składem (skąd: produkt o tej samej nazwie albo kod produktu),
  - produkty w zakresie nadal bez składu,
  - zastosowane poprawki,
  - poprawki oczekujące (bez `verified_on`) i poprawki odrzucone przez walidację, z powodem,
  - substancje `unmatched` potwierdzone poprawką `confirmed_unmatched` osobno od niewyjaśnionych,
  - remisy potwierdzone poprawką `confirmed_ambiguous` osobno od nierozstrzygniętych,
  - sekcja „Luki bez źródła”: każda luka w zakresie (produkt bez składu, `unmatched`, remis, nazwa z kodami z różnych grup anatomicznych używana w zakresie) bez żadnego wiersza poprawki, z liczbą w tabeli liczb.

#### 6. Testy jednostkowe

**File**: `scripts/rpl/*.test.mjs`, `scripts/rpl/fixtures/sample.xml`, `package.json`, `.github/workflows/ci.yml`

**Intent**: Utrwalić reguły wyprowadzania kodów na przypadkach, na których podjęto decyzje, żeby późniejsza poprawka normalizacji ich nie cofnęła.

**Contract**:

- Fixture z prawdziwych wpisów RPL (CC BY 4.0):
  - Diovan, Exforge HCT, Ibuprom,
  - ibuprofen w żelu,
  - produkt ibuprofenu złożonego z kodem `M01AE51`,
  - produkt z „Amlodipini besilas",
  - produkt bez substancji, produkt weterynaryjny.
- Skrypt `"test": "node --test \"scripts/**/*.test.mjs\""`. Wzorzec, nie katalog: od Node 21 `node --test scripts/` kończy się błędem „Cannot find module" i nie uruchamia żadnego testu (zmierzone przy przeglądzie planu).
- Krok `npm test` w jobie `ci`.
- Przypadki obowiązkowe:
  - walsartan w Exforge HCT dostaje `C09CA03` (`derived`),
  - ibuprofen w produkcie `M01AE51` dostaje `M01AE01`, nie `M02AA13`,
  - „Amlodipini besilas" i „Amlodipinum" normalizują się tak samo,
  - „Acidum acetylsalicylicum" nie skraca się do „acidum",
  - Exforge HCT jest w zakresie przy grupie `C09CA`,
  - produkt weterynaryjny odpada,
  - substancja bez kandydata ma `null` i `unmatched`,
  - kod `c09ca03 ` po oczyszczeniu wchodzi jako `C09CA03`, a kod `C09X` jest odrzucony i zgłoszony.
  - (Adaptacja z implementacji: `C09X` spełnia regułę kształtu z bazy, więc test używa `BRAK` i `C09CA0` jako kodów odrzucanych, a `C09X` jako przyjmowanego.)
- Przypadki obowiązkowe dla pkt 7–8:
  - import równoległy bez składu dostaje skład produktu o tej samej nazwie i tym samym kodzie (`composition_source = 'sibling'`),
  - produkt bez składu i bez takiego odpowiednika dostaje substancję z kodu produktu, gdy słownik wskazuje dokładnie jedną nazwę (`'atc_reverse'`); przy kilku nazwach zostaje bez składu i trafia do raportu,
  - poprawka `alias` sprawia, że „Atorwastyatyna z L-lizyną” dostaje kod atorwastatyny,
  - poprawka `index_exclude` usuwa kod `A10BA02` z kandydatów rywaroksabanu,
  - poprawka `product_substance_code` rozstrzyga remis w jednym produkcie i daje `atc_source = 'corrected'`,
  - poprawka bez `verified_on` nie zmienia wyniku i jest zgłoszona jako oczekująca,
  - poprawka z nieistniejącym `rpl_id` albo kodem o złym kształcie jest błędem walidacji,
  - `product_composition` dla produktu bez składu przechodzi walidację, a dla produktu ze składem jest błędem,
  - `product_substance_code` dla substancji dodanej przez uzupełnienie składu (pkt 7) przechodzi walidację,
  - `confirmed_ambiguous` przenosi remis do listy potwierdzonych i nie zmienia wierszy substancji.

#### 7. Uzupełnienie składu produktów bez substancji

**File**: `scripts/rpl/derive.mjs`

**Intent**: Nie zostawiać bez znacznika leku, którego skład RPL zna, tylko zapisał go przy innym wpisie. Pomiar: 63 z 65 produktów bez składu w zakresie to import równoległy z odpowiednikiem ze składem.

**Contract**:

- `fillMissingComposition(products, index)` działa przed wyprowadzeniem kodów, wyłącznie na produktach dla ludzi bez żadnej substancji:
  1. **Odpowiednik:** produkt o tej samej nazwie (bez rozróżniania wielkości liter) i tym samym zbiorze kodów produktu, który ma skład. Gdy odpowiedników z różnym składem jest kilka, wygrywa skład najczęstszy; remis to brak uzupełnienia i wpis do raportu. Skład porównywany jest jako posortowany zbiór nazw znormalizowanych, bez powtórzeń (Seroxat: „Paroxetinum” i „Paroxetini hydrochloridum” to ten sam skład; odpowiednik Dexaku z substancją wpisaną dwa razy liczy się jak z jedną). Kopiowany jest skład źródłowy zwycięskiego odpowiednika, a przy kilku odpowiednikach o tym samym składzie ten o najmniejszym `rpl_id`. `composition_source = 'sibling'`, `composition_source_rpl_id` = identyfikator odpowiednika.
  2. **Kod produktu:** gdy odpowiednika brak, a produkt ma dokładnie jeden pełny (siedmioznakowy) kod i słownik przypisuje ten kod dokładnie jednej znormalizowanej nazwie — jedna substancja o tej nazwie (najczęstszy zapis źródłowy; przy remisie pierwszy alfabetycznie), `composition_source = 'atc_reverse'`.
  3. W pozostałych przypadkach produkt zostaje bez składu i trafia do raportu.
- Produkty ze składem ze źródła mają `composition_source = 'source'`.
- `raw` produktu zostaje nietknięty. Uzupełnienie jest opisane polami, nie wpisane do treści źródłowej.
- Słownik z pkt 4 powstaje wyłącznie ze składów `'source'`, żeby uzupełnienie nie karmiło samo siebie.

#### 8. Plik poprawek substancji — mechanizm

**File**: `scripts/rpl/corrections.mjs`, `scripts/rpl/corrections.test.mjs`, `supabase/seed-data/substance-corrections.csv` (tylko nagłówek; dane w Fazie 3)

**Intent**: Domknąć luki, których RPL sam nie domyka, w sposób sprawdzalny i powtarzalny: każda poprawka ma źródło i datę sprawdzenia autorki, a generator stosuje tylko sprawdzone. Surowe dane RPL zostają nietknięte.

**Contract**:

- CSV w UTF-8, separator `;`, pola w cudzysłowach. Kolumny `kind;rpl_id;substance;target;source;note;verified_on`.
- Rodzaje (`kind`):

| `kind`                   | `rpl_id` | `substance`          | `target`                      | Działanie                                                                                                            |
| ------------------------ | -------- | -------------------- | ----------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `alias`                  | —        | nazwa jak w źródle   | znormalizowana nazwa docelowa | Nazwa normalizuje się do `target` (literówki, nazwy polskie, zapisy soli spoza listy)                                |
| `substance_code`         | —        | znormalizowana nazwa | kod ATC                       | Kandydat dla substancji, której słownik nie zna (brak leku jednoskładnikowego w RPL)                                 |
| `product_substance_code` | wymagany | znormalizowana nazwa | kod ATC                       | Kod tej substancji w tym produkcie, z pierwszeństwem przed wyprowadzeniem (remis, błąd źródła)                       |
| `index_exclude`          | wymagany | —                    | —                             | Produkt nie zasila słownika (błędny kod w źródle, np. Thinban)                                                       |
| `product_composition`    | wymagany | nazwa substancji     | kod ATC albo puste            | Dodaje substancję produktowi bez składu, gdy pkt 7 nie wystarczył                                                    |
| `confirmed_unmatched`    | —        | znormalizowana nazwa | —                             | Potwierdza, że substancja nie ma własnego kodu (sakubitryl); zmienia tylko raport                                    |
| `confirmed_ambiguous`    | wymagany | znormalizowana nazwa | —                             | Potwierdza, że remis w tym produkcie zostaje świadomie (wszystkie kody), uzasadnienie w `note`; zmienia tylko raport |

- Kod z poprawki daje `atc_source = 'corrected'`. Skład z `product_composition` daje `composition_source = 'correction'`.
- `loadCorrections(path, products) → { applied, pending, errors }`:
  - wiersz bez `verified_on` trafia do `pending` i nie działa,
  - błędy walidacji: nieznany `kind`, kod o złym kształcie, `rpl_id` spoza pliku RPL, duplikat klucza (`kind`, `rpl_id`, `substance`),
  - dla `product_substance_code` i `confirmed_ambiguous`: `substance` nieobecna w składzie produktu to błąd. Porównanie idzie na nazwach znormalizowanych po aliasach i po uzupełnieniu składu z pkt 7, więc sprawdzenie działa po pkt 7, nie na surowych produktach,
  - dla `product_composition`: produkt, który ma już skład (ze źródła albo z pkt 7), to błąd. `substance` jest tu z definicji nowa, więc reguły obecności nie stosuje się,
  - `position` substancji z `product_composition` = kolejność wierszy tego produktu w pliku poprawek, od 1,
  - generator (Faza 4) odmawia pracy, gdy `errors` jest niepuste.
- Kolejność stosowania: `index_exclude` i `alias` przed budową słownika, `product_composition` przed pkt 7, `substance_code` i `product_substance_code` przy wyprowadzaniu kodów.
- `measure.mjs` przyjmuje plik poprawek (domyślnie `supabase/seed-data/substance-corrections.csv`).

### Success Criteria:

#### Automated Verification:

- Testy jednostkowe przechodzą: `npm test`
- Lint przechodzi: `npm run lint`
- Pomiar działa na pobranym pliku i zapisuje raport: `node scripts/rpl/download.mjs && node scripts/rpl/measure.mjs --groups <robocza lista>`
- Pomiar odmawia pracy przy pliku o skrócie innym niż w manifeście
- Raport po uzupełnieniu składu ma w zakresie co najwyżej 2 produkty bez składu (zmierzone przed zmianą: 65, z czego 63 do uzupełnienia z odpowiednika; oczekiwane po dopisaniu `hydrosulfas` i `besilate`: 0, bo Nurofen i Clopidogrel Krka uzupełniają się z kodu produktu)

#### Manual Verification:

- Autorka czyta `registry-measurement.md` i potwierdza, że każda luka danych jest pokazana osobno: produkty bez składu, `unmatched`, remisy, poprawki oczekujące
- Autorka sprawdza w RPL 5 produktów z uzupełnionym składem, w tym jeden import równoległy i jeden uzupełniony z kodu produktu, oraz Exforge HCT

**Implementation Note**: Po automatycznej weryfikacji pauza na ręczne potwierdzenie autorki. Akceptacja samych liczb (`unmatched`, remisy) przechodzi do Fazy 3, bo zależy od ostatecznych grup i poprawek. Jeśli raport ujawni fakt sprzeczny z kontraktem tej fazy, wracamy do planu, zanim powstanie schemat.

**Plan revision 2026-09-24**: pkt 7–8 dopisane po pierwszym pomiarze (patrz `## Current State Analysis`). Pierwsza wersja pkt 1–6 jest zaimplementowana, a kryteria 1.1–1.4 wracają do stanu niesprawdzonego, bo obejmują teraz rozszerzony zakres.

---

## Faza 2: Schemat rejestru i par z RLS

### Overview

Jedna migracja tworzy trzy tabele wspólne z RLS, zmienia dwa miejsca w schemacie F-01 i rozszerza sprawdzenia SQL oraz typy.

### Changes Required:

#### 1. Tabela produktów rejestru

**File**: `supabase/migrations/<timestamp>_registry_schema.sql`

**Intent**: Przechować produkt RPL z polami potrzebnymi S-02 i z pełną treścią źródłową, żeby późniejsze reguły nie wymagały ponownego importu.

**Contract**: `public.registry_products`:

| Kolumna                          | Typ           | Uwagi                                                             |
| -------------------------------- | ------------- | ----------------------------------------------------------------- |
| `id`                             | `uuid`        | klucz główny, `gen_random_uuid()`                                 |
| `rpl_id`                         | `text`        | `not null unique`, identyfikator produktu w RPL, klucz dogrywania |
| `product_name`                   | `text`        | `not null`                                                        |
| `common_name`                    | `text`        | `nazwaPowszechnieStosowana`                                       |
| `strength`                       | `text`        | `moc`, surowo                                                     |
| `pharmaceutical_form`            | `text`        |                                                                   |
| `procedure_type`                 | `text`        | `NAR`, `DCP`, `MRP`, `CEN`, `IR` — surowo, bez kontroli wartości  |
| `authorization_number`           | `text`        |                                                                   |
| `authorization_validity`         | `text`        | surowo, bez interpretacji daty                                    |
| `marketing_authorization_holder` | `text`        |                                                                   |
| `atc_codes`                      | `text[]`      | `not null default '{}'`, kody produktu dokładnie jak w źródle     |
| `source_payload`                 | `jsonb`       | `not null`, cały element źródłowy, także opakowania               |
| `snapshot_date`                  | `date`        | `not null`, `stanNaDzien` pliku, z którego pochodzi wiersz        |
| `created_at`                     | `timestamptz` | `not null default now()`                                          |

Komentarz tabeli:

- źródło (RPL, CC BY 4.0),
- zasada, że zakres jest filtrem generatora, a nie właściwością wiersza.

#### 2. Tabela substancji rejestru

**File**: `supabase/migrations/<timestamp>_registry_schema.sql`

**Intent**: Zapisać pełny skład produktu, z kodem każdej substancji i pochodzeniem tego kodu. Tu działa dopasowanie par.

**Contract**: `public.registry_substances`:

| Kolumna                     | Typ        | Uwagi                                                                                                                                       |
| --------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                        | `uuid`     | klucz główny                                                                                                                                |
| `registry_product_id`       | `uuid`     | `not null references registry_products(id) on delete cascade`                                                                               |
| `position`                  | `smallint` | `not null`, kolejność substancji w źródle                                                                                                   |
| `substance_name`            | `text`     | `not null`, surowo ze źródła                                                                                                                |
| `normalized_name`           | `text`     | `not null`                                                                                                                                  |
| `atc_code`                  | `text`     | dopuszcza pustą wartość; ta sama kontrola kształtu co w F-01                                                                                |
| `atc_source`                | `text`     | `not null`, `check` na `'product'`, `'derived'`, `'derived_ambiguous'`, `'corrected'`, `'unmatched'`                                        |
| `composition_source`        | `text`     | `not null`, `check` na `'source'`, `'sibling'`, `'atc_reverse'`, `'correction'`                                                             |
| `composition_source_rpl_id` | `text`     | `rpl_id` odpowiednika przy `'sibling'`, inaczej puste; `check ((composition_source = 'sibling') = (composition_source_rpl_id is not null))` |

Ograniczenia:

- `check ((atc_source = 'unmatched') = (atc_code is null))`,
- `unique nulls not distinct (registry_product_id, position, atc_code)`.

Indeksy na `registry_product_id` oraz `atc_code text_pattern_ops` (dopasowanie po przedrostku).

Komentarz tabeli opisuje regułę dopasowania dla S-02:

- lek koliduje, gdy kod którejkolwiek jego substancji zaczyna się od `group_a`, a kod substancji innego leku od `group_b`, albo odwrotnie,
- `derived_ambiguous` oznacza kilka wierszy jednej substancji.

#### 3. Tabela par kolizji

**File**: `supabase/migrations/<timestamp>_registry_schema.sql`

**Intent**: Trzymać pary na kodach grup ATC, nie na nazwach, z pochodzeniem i datą sprawdzenia, bo zbiór jest z założenia niepełny i będzie weryfikowany.

**Contract**: `public.interaction_pairs`:

| Kolumna       | Typ           | Uwagi                                            |
| ------------- | ------------- | ------------------------------------------------ |
| `id`          | `uuid`        | klucz główny                                     |
| `group_a`     | `text`        | `not null`, kontrola kształtu ATC jak w F-01     |
| `group_b`     | `text`        | `not null`, kontrola kształtu ATC jak w F-01     |
| `description` | `text`        | `not null`, niepusty, język zgodny z FR-012      |
| `source`      | `text`        | `not null`, niepusty (np. „ChPL Diovan pkt 4.5") |
| `verified_on` | `date`        | `not null`                                       |
| `created_at`  | `timestamptz` | `not null default now()`                         |

Ograniczenia:

- `check (group_a <= group_b)` (kolejność kanoniczna, para `A×B` i `B×A` to jedna para),
- `unique (group_a, group_b)`.

Para grupy z samą sobą (`M01AE × M01AE`) jest dopuszczalna. Łapie dwa leki tej samej klasy od różnych lekarzy (Ibuprom z Ketonalem).

#### 4. RLS i uprawnienia

**File**: `supabase/migrations/<timestamp>_registry_schema.sql`

**Intent**: Zbiory wspólne są czytelne dla zalogowanej i niezmienialne z aplikacji. Rola administratora reguł nie powstaje (PRD `## Access Control`).

**Contract**:

- `enable row level security` na trzech tabelach w tej migracji.
- Po jednej polityce `for select to authenticated using (true)`.
- Brak polityk dla `anon` i brak polityk zapisu.
- Dodatkowo `revoke insert, update, delete, truncate` od `anon` i `authenticated` na trzech tabelach. RLS bez polityki zapisu i tak blokuje, a odebrane uprawnienie daje drugą warstwę.

#### 5. Zmiany w schemacie F-01

**File**: `supabase/migrations/<timestamp>_registry_schema.sql`

**Intent**: Dopuścić substancję bez kodu, której słownik nie dopasował, zamiast wymyślać jej kod. Domknąć dług F-01 z kluczem obcym do rejestru.

**Contract**:

- `alter table public.medication_substances alter column atc_code drop not null`, z komentarzem kolumny: pusty kod = substancja zapisana, bez dopasowania do reguł.
- Klucz `medication_substances_medication_id_atc_code_key` (`unique (medication_id, atc_code)`) zastąpiony przez `unique nulls not distinct (medication_id, substance_name, atc_code)`. Po dopuszczeniu pustego kodu stary klucz przepuszczałby drugi wiersz „Extractum X | (pusty)” w tym samym leku, bo domyślnie dwa puste kody uchodzą za różne. Nowy klucz blokuje ten duplikat, a przepuszcza dwie różne substancje bez kodu i jedną substancję z dwoma kodami (remis).
- `medications.registry_medication_id references public.registry_products(id) on delete restrict`: wiersz rejestru, na który wskazuje lek, nie może zniknąć.
- Aktualizacja `comment on column public.medications.registry_medication_id`.
- Wyzwalacze F-01 porównują `is distinct from`, więc pusta wartość ich nie omija.

#### 6. Sprawdzenia SQL

**File**: `supabase/tests/rls_checks.sql`

**Intent**: Nowe tabele dostają sprawdzenia uruchamiane tą samą komendą co F-01. Nagłówek pliku przestaje mówić wyłącznie o schemacie leków.

**Contract**:

- **Uprawnienia:**
  - RLS włączone na trzech tabelach,
  - dokładnie jedna polityka na tabelę, `cmd = SELECT`, rola `authenticated`,
  - brak polityk dla `anon`.
- **Ograniczenia**, każde przez nazwany błąd, nie `when others` (`lessons.md`, „Bramka musi odróżnić blokadę od niewykonania"):
  - odwrócona kolejność grup pada na `check_violation`,
  - duplikat pary na `unique_violation`,
  - zły kształt kodu na `check_violation`,
  - para grupy z samą sobą przechodzi,
  - `unmatched` z kodem i `product` bez kodu padają na `check_violation`,
  - `composition_source = 'sibling'` bez `composition_source_rpl_id` oraz `'source'` z nim padają na `check_violation`,
  - `registry_medication_id` wskazujące nieistniejący produkt pada na `foreign_key_violation`,
  - substancja leku z pustym `atc_code` przechodzi,
  - druga substancja o tej samej nazwie z pustym kodem w tym samym leku pada na `unique_violation`, a druga, inna substancja z pustym kodem przechodzi.
- Zanim warunek zostanie ustawiony na konkretny kod błędu, kod jest mierzony.

#### 7. Typy

**File**: `src/types.ts`

**Intent**: Dać S-02 kontrakt danych rejestru i par bez uruchamiania bazy.

**Contract**:

- `AtcSource = "product" | "derived" | "derived_ambiguous" | "corrected" | "unmatched"`.
- `CompositionSource = "source" | "sibling" | "atc_reverse" | "correction"`.
- Nowe interfejsy `RegistryProduct`, `RegistrySubstance`, `InteractionPair` odwzorowujące kolumny (`source_payload` jako `unknown`).
- `MedicationSubstance.atc_code` i `NewMedicationSubstanceCommand.atc_code` zmieniają się na `string | null`, z poprawionym komentarzem.
- Bez poleceń zapisu dla tabel wspólnych, bo aplikacja do nich nie pisze.

### Success Criteria:

#### Automated Verification:

- Migracja stosuje się czysto na świeżej bazie: `npx supabase db reset`
- Sprawdzenia SQL przechodzą: `docker exec -i $(docker ps -qf name=supabase_db) psql -U postgres -d postgres -f - < supabase/tests/rls_checks.sql`
- Sprawdzenie typów przechodzi: `npm run typecheck`
- Lint i build przechodzą: `npm run lint && npm run build`

#### Manual Verification:

- W Studio trzy nowe tabele mają włączone RLS i po jednej polityce `SELECT`

---

## Faza 3: Pary — szkic agenta i weryfikacja autorki

### Overview

Agent przygotowuje szkic ~20 par w pliku CSV. Autorka sprawdza każdą przy ulotce albo ChPL i wpisuje datę sprawdzenia. Potem agent przygotowuje poprawki substancji dla ostatecznych grup, a autorka sprawdza je tak samo. Do bazy trafia wyłącznie para i poprawka z datą. Faza czeka na pracę autorki.

### Changes Required:

#### 1. Plik par

**File**: `supabase/seed-data/interaction_pairs.csv`

**Intent**: Jedno miejsce, w którym autorka czyta, poprawia i zatwierdza pary w arkuszu, bez dotykania SQL.

**Contract**:

- CSV w UTF-8, separator `;`, pola w cudzysłowach.
- Kolumny `group_a;group_b;description;source;verified_on`.
- Przykładowy wiersz: `C09CA;M01AE;"Sartany i leki z grupy ibuprofenu mogą wchodzić w interakcję";"ChPL Diovan pkt 4.5";2026-10-02`.
- **Szkic agenta:**
  - ~20 par obejmujących 10–14 grup, typowych dla leczenia przewlekłego: nadciśnienie, cholesterol, przeciwkrzepliwe, przeciwbólowe, przeciwdepresyjne,
  - `description` w języku FR-012,
  - `source` jako wskazanie dokumentu i punktu do sprawdzenia,
  - `verified_on` **puste**.
- Autorka poprawia treść i wpisuje datę.

#### 2. Walidacja par

**File**: `scripts/rpl/pairs.mjs`, `scripts/rpl/pairs.test.mjs`

**Intent**: Wyłapać parę niezgodną z FR-012 albo z kształtem danych, zanim trafi do migracji. Język komunikatu podlega sprawdzeniu, nie jest wytyczną.

**Contract**:

- Funkcja `loadPairs(path) → { accepted, skipped, errors }`:
  - kolejność grup sprowadzona do kanonicznej,
  - duplikaty zgłaszane jako błąd,
  - kształt kodów sprawdzany jak w bazie,
  - wiersz bez `verified_on` pominięty i wypisany z powodem.
- `description` zawierające którekolwiek słowo z listy zakazanej to błąd. Lista w module, wielkość liter bez znaczenia: `powoduj`, `wywołuj`, `odstaw`, `przerwij`, `zmień daw`, `zmniejsz daw`, `zwiększ daw`, `nie łącz`, `zakaz`, `nie wolno`, `niebezpieczn`, `groźn`.
- Testy obejmują każdy z tych przypadków.

#### 3. Poprawki substancji — szkic agenta

**File**: `supabase/seed-data/substance-corrections.csv`, `context/changes/interaction-rules-seed/registry-measurement.md`

**Intent**: Autorka nie szuka braków sama. Agent przygotowuje komplet poprawek dla ostatecznych grup, każdą ze źródłem, a autorka tylko sprawdza i zatwierdza.

**Contract**:

- Szkic powstaje **po** zatwierdzeniu par (pkt 1), bo zakres zależy od ostatecznych grup. Agent uruchamia `measure.mjs` na grupach ze sprawdzonych par.
- Szkic obejmuje każdą lukę w zakresie z raportu:
  - każdą substancję `unmatched`: `alias`, `substance_code` albo `confirmed_unmatched`,
  - każdy remis `derived_ambiguous`: `product_substance_code` z kodem właściwym dla postaci i wskazania produktu albo `confirmed_ambiguous` z uzasadnieniem w `note`,
  - każdą nazwę z kodami z różnych grup anatomicznych, używaną w zakresie, której przyczyną jest błąd źródła: `index_exclude` albo `product_substance_code`,
  - każdy produkt nadal bez składu: `product_composition`,
  - składniki pomocnicze wpisane jako czynne: `confirmed_unmatched` z `note`.
- Każdy wiersz ma `source` z konkretnym wskazaniem (link do ChPL lub ulotki w RPL z punktem dokumentu, albo wyszukiwarka ATC WHO z datą dostępu) i `note` z uzasadnieniem w jednym zdaniu.
- `verified_on` **puste**. Agent nie wpisuje daty.
- Luka, dla której agent nie znalazł źródła, zostaje bez wiersza i trafia do sekcji „Luki bez źródła” w raporcie. Poprawka bez źródła nie powstaje.

### Success Criteria:

#### Automated Verification:

- Walidacja par przechodzi bez błędów na pliku z repozytorium: `node scripts/rpl/pairs.mjs supabase/seed-data/interaction_pairs.csv`
- Testy przechodzą: `npm test`
- Walidacja poprawek nie zgłasza błędów, a każda luka w zakresie ma wiersz poprawki albo stoi w sekcji „Luki bez źródła” raportu (wypisanie autorce = ta sekcja): `node scripts/rpl/measure.mjs --groups <grupy z par>`

#### Manual Verification:

- Autorka sprawdziła każdą parę przy ulotce albo ChPL i wpisała `verified_on` dla par, które zostają
- Autorka potwierdza, że żaden `description` nie stwierdza przyczyny, zakazu ani nie sugeruje zmiany leczenia
- Autorka sprawdziła każdą poprawkę substancji przy wskazanym źródle i wpisała `verified_on` dla poprawek, które zostają

**Implementation Note**: Faza 4 nie startuje, dopóki autorka nie potwierdzi punktów ręcznych. Agent nie wpisuje `verified_on` ani w parach, ani w poprawkach.

---

## Faza 4: Migracje danych i bramki

### Overview

Generator pisze dwie migracje danych z przypiętego pliku RPL i sprawdzonych par. Bramki SQL i smoke dowodzą, że dane są na miejscu i tylko do odczytu.

### Changes Required:

#### 1. Generator migracji

**File**: `scripts/rpl/generate.mjs`

**Intent**: Zamienić przypięty RPL i sprawdzone pary na migracje, które da się odtworzyć i bezpiecznie dograć.

**Contract**:

- Wejście: plik z manifestu (skrót sprawdzany), `interaction_pairs.csv` (tylko pary zaakceptowane przez `loadPairs`) i `substance-corrections.csv` (tylko poprawki z `applied`; niepuste `errors` albo niepuste `pending` zatrzymuje generator). Odmowa przy `pending` jest celowa: dogrywanie nie rusza produktów już wgranych, więc poprawka zatwierdzona po wygenerowaniu migracji nie dotarłaby do nich nigdy. Autorka zatwierdza albo usuwa każdy wiersz oczekujący, zanim powstanie migracja.
- Nagłówek migracji rejestru wypisuje dodatkowo zastosowane poprawki (rodzaj, produkt, substancja, źródło, data sprawdzenia) i liczby według `composition_source`.
- Grupy filtra to zbiór `group_a ∪ group_b` zaakceptowanych par.
- Wyjście: `supabase/migrations/<timestamp>_registry_seed.sql` i `<timestamp>_interaction_pairs_seed.sql`, każda z nagłówkiem:
  - adres, wersja schematu RPL, `stanNaDzien`, `sha256`,
  - lista grup,
  - liczby produktów i substancji według `atc_source`,
  - lista kodów odrzuconych przy czyszczeniu,
  - wzmianka o licencji CC BY 4.0.
- **Idempotencja:**
  - produkty z `on conflict (rpl_id) do nothing`,
  - substancje wyłącznie dla produktów wstawionych w tej migracji (`returning`),
  - pary z `on conflict (group_a, group_b) do nothing`.
- Łańcuchy tekstowe i `jsonb` escapowane. Test z apostrofem w nazwie.
- Przy każdym uruchomieniu generator odświeża `context/changes/interaction-rules-seed/registry-measurement.md` na grupach ze sprawdzonych par, w formacie z Fazy 1. Raport z Fazy 1 liczył grupy robocze, więc grupy dodane w Fazie 3 nie miałyby inaczej swojego pomiaru.

#### 2. Sprawdzenia danych

**File**: `supabase/tests/rls_checks.sql`

**Intent**: Dowieść, że dane spełniają niezmienniki, na których S-02 będzie polegać.

**Contract**:

- `registry_products` i `interaction_pairs` mają co najmniej jeden wiersz.
- Każdy produkt ma kod substancji albo kod produktu zaczynający się od grupy którejś pary. Filtr zadziałał, nic spoza zakresu nie weszło.
- Żaden produkt nie ma dwóch wierszy tej samej substancji z tym samym kodem.

#### 3. Kroki smoke dla tabel wspólnych

**File**: `scripts/smoke.mjs`

**Intent**: Zamienić „tylko do odczytu" z deklaracji w migracji na fakt sprawdzany w CI.

**Contract**:

- Dla `registry_products`, `registry_substances` i `interaction_pairs` konto z fixture izolacji:
  - czyta co najmniej jeden wiersz,
  - próba wstawienia kończy się zmierzonym, konkretnym błędem, ustawionym po pomiarze, a nie „jakimkolwiek",
  - próba zmiany i usunięcia istniejącego wiersza zostawia go bez zmian (ponowny odczyt porównuje wartość).
- Odczyt samym kluczem publicznym bez sesji zwraca zero wierszy, a każdy błąd to porażka kroku.
- Kroki działają w tym samym trybie co izolacja (konto jednorazowe, lokalne Supabase) i mają tę samą formę wyjścia `PASS`/`FAIL`/`SKIP`.

#### 4. README

**File**: `README.md`

**Intent**: Opisać, jak odtworzyć i rozszerzyć dane rejestru i par oraz spełnić warunek licencji.

**Contract**: Nowa podsekcja przy `### Migracje`:

- komendy pobierania, pomiaru, walidacji par i generowania,
- plik poprawek substancji: rodzaje, zasada „źródło i data sprawdzenia w każdym wierszu”, poprawka nie zmienia surowych danych RPL,
- zasada „nowa grupa = nowa migracja dogrywająca, bez edycji istniejącej",
- uznanie autorstwa RPL (CC BY 4.0) ze wskazaniem źródła.

W sekcji `## Testy`: `npm test`.

### Success Criteria:

#### Automated Verification:

- Migracje stosują się czysto: `npx supabase db reset`
- Sprawdzenia SQL, w tym sprawdzenia danych, przechodzą (komenda z Fazy 2)
- Ponowne wykonanie migracji danych na tej samej bazie nie zmienia liczby wierszy w trzech tabelach
- Testy przechodzą: `npm test`
- `npm run smoke` przechodzi przeciw lokalnemu Supabase i podglądowi produkcyjnemu, a nowe kroki raportują `PASS`
- Jobs `ci` i `smoke` w CI są zielone na pull requeście

#### Manual Verification:

- Tymczasowe dodanie polityki `insert` dla `authenticated` na `interaction_pairs` sprawia, że `npm run smoke` pada (przywrócić przed commitem)
- Autorka wybiera w Studio dowolny lek złożony z próbki raportu i potwierdza, że każda jego substancja ma kod swojego leku jednoskładnikowego (Exforge HCT pilnują testy jednostkowe, bo jego obecność w danych zależy od wybranych grup)
- Autorka przegląda odświeżony `registry-measurement.md` (puste kody, remisy, kody odrzucone) na ostatecznych grupach i akceptuje go przed commitem migracji danych

---

## Testing Strategy

### Unit Tests:

- `node --test "scripts/**/*.test.mjs"`:
  - normalizacja nazw,
  - wyprowadzenie kodów (jednoskładnikowe, złożone, remis, brak kandydata),
  - filtr zakresu po kodach substancji,
  - walidacja par (kolejność, duplikat, brak daty, słowa zakazane),
  - escapowanie SQL.

### Integration Tests:

- `supabase/tests/rls_checks.sql`: RLS, polityki, ograniczenia, niezmienniki danych.
- `scripts/smoke.mjs`: odczyt dla zalogowanej, blokada zapisu, brak dostępu bez sesji.

### Manual Testing Steps:

1. `node scripts/rpl/download.mjs`, potem `node scripts/rpl/measure.mjs --groups …`. Przeczytać raport.
2. Poprawić i zatwierdzić `interaction_pairs.csv` (daty sprawdzenia).
3. `node scripts/rpl/generate.mjs`, potem `npx supabase db reset` i sprawdzenia SQL.
4. Zatrzymać stary podgląd (`npx astro preview stop`), `npm run build`, `npm run preview`. Potwierdzić, że `SUPABASE_URL` wskazuje lokalną bazę (`lessons.md`), potem `npm run smoke`.

## Performance Considerations

- Migracja danych ma rząd kilku MB, głównie przez `source_payload` z opakowaniami. Faza 1 podaje zmierzony rozmiar.
- `supabase start` w CI stosuje ją przy każdym biegu smoke. Przy tej skali bez znaczenia.
- Indeks `atc_code text_pattern_ops` obsługuje dopasowanie po przedrostku w S-02.

## Migration Notes

- Wdrożenie trzech migracji na produkcję wykonuje autorka (`npx supabase db push`), zgodnie z `context/foundation/infrastructure.md` (operacje na bazie produkcyjnej wykonuje człowiek).
- Rollback Cloudflare cofa kod, nie schemat. Cofnięcie wymaga migracji odwracającej, w tej kolejności:
  1. usunąć klucz obcy z `medications`,
  2. przywrócić `not null` na `medication_substances.atc_code`, co wymaga braku pustych wartości,
  3. usunąć trzy tabele.
- Rozszerzenie zakresu (nowa grupa w parach) to nowa migracja z generatora. Istniejących migracji danych się nie edytuje.
- Poprawka substancji dla produktu już wgranego (np. remis odkryty po dodaniu grupy) nie przejdzie przez generator, bo dogrywanie pomija istniejące produkty. Taka poprawka to osobna, ręcznie pisana migracja aktualizująca `registry_substances` tego produktu, z tym samym wierszem w `substance-corrections.csv` jako źródłem. Automatyzacja tej ścieżki jest poza F-02.
- Aktualizacja RPL do nowszego stanu to decyzja poza M-1 (`## Parked`). Manifest zapisuje stan, z którego pochodzą dane.

## References

- Roadmapa: `context/foundation/roadmap.md`, F-02 (issue #10); rozstrzygnięcie Q-1: issue #2
- Wymagania: `context/foundation/prd.md`, FR-003, FR-006, FR-012, `## Business Logic`, `## Access Control`, `## Non-Goals`
- Reguły: `context/foundation/lessons.md`:
  - RLS w tej samej migracji,
  - niezawężanie danych,
  - zakres jako filtr przy wczytywaniu,
  - bramka odróżnia blokadę od niewykonania,
  - zatrzymanie starego podglądu,
  - lokalna baza bramek.
- F-01: `supabase/migrations/20260922120000_medication_schema.sql`, `context/archive/2026-09-22-medication-schema-rls/plan.md`
- Bramki: `supabase/tests/rls_checks.sql`, `scripts/smoke.mjs:157-272`, `.github/workflows/ci.yml`
- RPL: https://dane.gov.pl/pl/dataset/397,rejestr-produktow-leczniczych; XSD v6.0.0: https://rejestry.ezdrowie.gov.pl/api/rpl/medicinal-products/public-pl-report/6.0.0/xml-schema-definition.xsd

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Skrypt RPL i pomiar

#### Automated

- [x] 1.1 Testy jednostkowe przechodzą: `npm test` — 9861dfa
- [x] 1.2 Lint przechodzi: `npm run lint` — 9861dfa
- [x] 1.3 Pomiar działa na pobranym pliku i zapisuje raport — 9861dfa
- [x] 1.4 Pomiar odmawia pracy przy pliku o skrócie innym niż w manifeście — 9861dfa
- [x] 1.7 Raport po uzupełnieniu składu ma w zakresie co najwyżej 2 produkty bez składu — 9861dfa

#### Manual

- [x] 1.8 Autorka potwierdza, że raport pokazuje każdą lukę danych osobno — 9861dfa
- [x] 1.9 Autorka sprawdza w RPL 5 produktów z uzupełnionym składem oraz Exforge HCT — 9861dfa

### Phase 2: Schemat rejestru i par z RLS

#### Automated

- [x] 2.1 Migracja stosuje się czysto na świeżej bazie: `npx supabase db reset` — 60af365
- [x] 2.2 Sprawdzenia SQL przechodzą — 60af365
- [x] 2.3 Sprawdzenie typów przechodzi: `npm run typecheck` — 60af365
- [x] 2.4 Lint i build przechodzą: `npm run lint && npm run build` — 60af365

#### Manual

- [x] 2.5 W Studio trzy nowe tabele mają włączone RLS i po jednej polityce `SELECT` — 60af365

### Phase 3: Pary — szkic agenta i weryfikacja autorki

#### Automated

- [x] 3.1 Walidacja par przechodzi bez błędów na pliku z repozytorium — 8a52fd4
- [x] 3.2 Testy przechodzą: `npm test` — 8a52fd4
- [x] 3.5 Walidacja poprawek bez błędów, każda luka w zakresie ma wiersz poprawki albo jest wypisana autorce — 8a52fd4

#### Manual

- [x] 3.3 Autorka sprawdziła każdą parę przy ulotce albo ChPL i wpisała `verified_on` — 8a52fd4
- [x] 3.4 Autorka potwierdza, że żaden `description` nie stwierdza przyczyny, zakazu ani nie sugeruje zmiany leczenia — 8a52fd4
- [x] 3.6 Autorka sprawdziła każdą poprawkę substancji przy wskazanym źródle i wpisała `verified_on` — 8a52fd4

### Phase 4: Migracje danych i bramki

#### Automated

- [x] 4.1 Migracje stosują się czysto: `npx supabase db reset` — 7876683
- [x] 4.2 Sprawdzenia SQL, w tym sprawdzenia danych, przechodzą — 7876683
- [x] 4.3 Ponowne wykonanie migracji danych nie zmienia liczby wierszy — 7876683
- [x] 4.4 Testy przechodzą: `npm test` — 7876683
- [x] 4.5 `npm run smoke` przechodzi przeciw lokalnemu Supabase, nowe kroki raportują `PASS` — 7876683
- [x] 4.6 Jobs `ci` i `smoke` w CI są zielone na pull requeście — 7876683

#### Manual

- [x] 4.7 Tymczasowa polityka `insert` na `interaction_pairs` sprawia, że `npm run smoke` pada (przywrócić przed commitem) — 7876683
- [x] 4.8 Autorka wybiera w Studio dowolny lek złożony z próbki raportu i potwierdza, że każda jego substancja ma kod swojego leku jednoskładnikowego — 7876683
- [x] 4.9 Autorka przegląda odświeżony `registry-measurement.md` na ostatecznych grupach i akceptuje go przed commitem migracji danych — 7876683
