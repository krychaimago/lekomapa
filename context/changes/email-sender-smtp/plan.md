# Własny nadawca maili (F-05) — plan wdrożenia

## Overview

Produkcja wysyła maile z odnośnikami (potwierdzenie adresu, reset hasła) domyślnym nadawcą Supabase. Dochodzą tylko na adresy członków zespołu projektu Supabase, a szablonów nie da się edytować. Zmiana przełącza wysyłkę na SMTP Brevo z nadawcą `Lekomapa <kontakt@lekomapa.pl>`, wkleja oba polskie szablony i zamyka trzy kroki odłożone przez wcześniejsze zmiany. Roadmapa: F-05, issue #44.

## Current State Analysis

- Domena `lekomapa.pl` działa (pomiar 11.10.2026): rejestrator OVH, serwery nazw Cloudflare, aplikacja odpowiada pod `https://lekomapa.pl`.
- DNS w Cloudflare niesie pocztę OVH: MX `mx1/mx2/mx3.mail.ovh.net`, SPF na korzeniu `v=spf1 include:mx.ovh.com -all`. Wpisu `_dmarc` brak.
- Skrzynki `kontakt@lekomapa.pl` jeszcze nie ma i nie da się jej założyć: panel OVH (E-maile przy `lekomapa.pl`) pokazuje „Nie masz możliwości utworzenia konta e-mail.” (pomiar 11.10.2026). MX wskazują OVH, ale nie obsługują żadnej skrzynki — mail na adres w `lekomapa.pl` wraca dziś do nadawcy.
- Decyzja 11.10.2026 (wariant B z trzech: brak skrzynki / przekierowanie Cloudflare / płatna poczta OVH): odpowiedzi odbiera Cloudflare Email Routing i przekazuje na `krysko.anna@gmail.com`, ten sam adres, który `/prywatnosc` podaje jako kontakt.
- Strona prywatności mówi „Maile z odnośnikami wysyła Supabase.” (`src/lib/copy/terms.ts:76`, `PRIVACY_COPY`). Po przełączeniu to zdanie przestaje być prawdą.
- Warunki v1 (`context/foundation/terms-of-use-v1.md`, `TERMS_V1`) nie wspominają, kto wysyła maile — zostają bez zmian.
- Panel produkcji Supabase: „Set up custom SMTP to edit templates. Emails will be sent using the default templates.” Dlatego czekają:
  - `password-recovery` 3.7 (szablon resetu) i 3.8 (reset na produkcji) — `context/changes/password-recovery/change.md:47-56`,
  - `terms-acceptance-on-signup` 5.5 (szablon potwierdzenia) — `context/archive/2026-10-07-terms-acceptance-on-signup/plan.md:646-649`.
- Do tego czasu reset hasła na produkcji kończy się ekranem „Odnośnik nie działa” dla każdego (pomiar w `password-recovery/change.md:51-56`).
- Lokalnie maile łapie mailpit (`supabase/config.toml`, sekcja `[auth.email.smtp]` zakomentowana); smoke i E2E na tym polegają.

## Desired End State

- Osoba spoza zespołu Supabase zakłada konto i dostaje polski mail „Lekomapa: potwierdź adres e-mail” od `Lekomapa <kontakt@lekomapa.pl>`; odnośnik potwierdza adres.
- Ta sama osoba prosi o reset hasła, dostaje „Lekomapa: ustaw nowe hasło” i ustawia nowe hasło na produkcji.
- W Gmailu „Pokaż oryginał” pokazuje SPF, DKIM i DMARC = PASS; mail jest w odebranych także na poczcie polskiej (WP, Onet albo Interia).
- Strona `/prywatnosc` mówi, kto wysyła maile i dokąd trafiają odpowiedzi.
- Mail wysłany na `kontakt@lekomapa.pl` trafia przez Cloudflare Email Routing do skrzynki Gmail autorki.

### Key Discoveries:

- Zdanie o nadawcy żyje w `PRIVACY_COPY`, nie w warunkach — zmiana nie wymaga wersji 2 warunków, migracji ani ponownej akceptacji (`src/lib/copy/terms.ts:54-104`; wzorzec wersjonowania dotyczy tylko `TERMS_V1`).
- Tekst strony prywatności pilnuje wyłącznie filtr słów zakazanych `scripts/fr012/terms-copy.test.mjs:41-45`; żaden test nie przypina treści zdania.
- Kroki wklejania szablonów są już opisane w `README.md:80-94` (temat, treść z `supabase/templates/*.html`, sprawdzenie odnośnika po zapisie).
- Zmianę strony prywatności poprzednio wprowadzono tak samo, bez nowego testu (`8bbfeac`, account-deletion-cascade faza 3).

## What We're NOT Doing

- Warunki korzystania w wersji 2 — rozważone i odrzucone po stwierdzeniu, że zdanie o nadawcy jest na stronie prywatności.
- Zmiany w lokalnym `supabase/config.toml` — lokalnie zostaje mailpit i `email_sent = 2`.
- Płatna poczta w OVH i wysyłanie odpowiedzi z adresu `kontakt@lekomapa.pl` (Gmail „Wyślij jako”) — odpowiedzi autorka pisze ze swojego Gmaila.
- Przekierowania na inne adresy niż `krysko.anna@gmail.com` i reguła „catch-all” — przekierowany jest wyłącznie `kontakt@`.
- Zmiany w kodzie tras auth, w `src/lib/auth/confirm-link.ts` i w szablonach `supabase/templates/*.html`.
- Usunięcie dopisku „Sent with Brevo” (płatny plan) — tylko sprawdzamy, czy się pojawia.
- Nowy test automatyczny dla treści strony prywatności.
- Monitorowanie doręczalności i alerty o limicie Brevo (obserwowalność należy do F-06).
- Edycja zarchiwizowanego planu `terms-acceptance-on-signup` — zamknięcie kroku 5.5 zapisujemy w tej zmianie.

## Implementation Approach

Kolejność skraca do minut okno, w którym strona prywatności i faktyczny nadawca się rozjeżdżają: najpierw cała konfiguracja poza kodem, bez przełączania Supabase; potem merge nowego zdania (merge do `main` wdraża); tego samego dnia przełączenie SMTP w panelu i sprawdzenie. Operacje na produkcji (panele Brevo, Cloudflare, Supabase) wykonuje autorka ręcznie wg `context/foundation/infrastructure.md`; agent podaje dokładne wartości i kolejność. Sekret SMTP Brevo istnieje wyłącznie w panelu Supabase — nie trafia do repozytorium, `.env` ani sekretów Workera.

## Critical Implementation Details

- **Jeden wpis SPF.** Na korzeniu może być tylko jeden rekord `v=spf1` — dwa rekordy SPF unieważniają oba. Kreator Email Routing i panel Brevo mogą każdy proponować własny. Scal je w jeden: `include:_spf.mx.cloudflare.net` (Cloudflare) plus `include:spf.brevo.com`, jeśli Brevo o niego prosi, zakończone `-all`. `include:mx.ovh.com` usuń — OVH nie wysyła ani nie odbiera poczty tej domeny.
- **MX przechodzą na Cloudflare.** Kreator Email Routing usuwa MX OVH i dodaje `route1/2/3.mx.cloudflare.net`. Nic nie tracimy, bo MX OVH nie obsługują żadnej skrzynki. Adres docelowy `krysko.anna@gmail.com` trzeba potwierdzić odnośnikiem z maila od Cloudflare, inaczej reguła nie działa.
- **Wpisy Brevo bez proxy.** Rekordy CNAME z panelu Brevo (DKIM) dodaj w Cloudflare jako „DNS only” (szara chmurka). Z pomarańczową chmurką Cloudflare podstawia własne adresy i DKIM nie przejdzie weryfikacji.
- **Nie zmieniaj serwerów DNS w OVH.** Panel OVH może proponować „konfigurację automatyczną” albo powrót strefy do OVH — odrzuć. Powrót serwerów nazw odcina aplikację od domeny.
- **Hasło SMTP to klucz SMTP z Brevo**, nie hasło konta Brevo. Login SMTP Brevo bywa inny niż adres konta — przepisz go z panelu (SMTP & API → SMTP).

## Phase 1: Przygotowanie poza kodem

### Overview

Przekierowanie odpowiedzi, konto Brevo i potwierdzona domena — wszystko gotowe do przełączenia, a produkcja dalej wysyła przez Supabase.

### Changes Required:

#### 1. Przekierowanie w Cloudflare Email Routing

**File**: panel Cloudflare → `lekomapa.pl` → Email → Email Routing

**Intent**: Odpowiedzi na maile lekomapy trafiają do skrzynki autorki w Gmailu.

**Contract**: Adres docelowy `krysko.anna@gmail.com` potwierdzony. Jedna reguła: `kontakt@lekomapa.pl` → `krysko.anna@gmail.com`; catch-all wyłączony. MX OVH zastąpione przez `route1/2/3.mx.cloudflare.net`; SPF scalony wg „Critical Implementation Details”.

#### 2. Konto Brevo i aktywacja SMTP

**File**: panel Brevo

**Intent**: Dostawca wysyłki z aktywnym SMTP do maili transakcyjnych.

**Contract**: Konto na darmowym planie. SMTP aktywne (SMTP & API → SMTP pokazuje serwer `smtp-relay.brevo.com`, port 587 i login). Jeśli Brevo wymaga prośby o aktywację — faza czeka na odpowiedź.

#### 3. Domena w Brevo i DNS w Cloudflare

**File**: panel Brevo (Senders, Domains & Dedicated IPs → Domains), panel Cloudflare → `lekomapa.pl` → DNS

**Intent**: Brevo może wysyłać w imieniu `lekomapa.pl`, a odbiorcy widzą podpis DKIM i politykę DMARC.

**Contract**: Wpisy dokładnie z panelu Brevo (kod weryfikacji TXT, DKIM, DMARC), z ograniczeniami z „Critical Implementation Details”. Brak istniejącego `_dmarc`, więc DMARC to nowy wpis; politykę bierzemy z propozycji Brevo (`p=none`). Brevo pokazuje domenę jako uwierzytelnioną. Nadawca `kontakt@lekomapa.pl` dodany w Senders.

#### 4. Zapis stanu w tej zmianie

**File**: `context/changes/email-sender-smtp/change.md`

**Intent**: Ślad, co ustawiono, bez sekretów — do review i do przełączenia w fazie 3.

**Contract**: Sekcja w `## Notes`: data, nazwy dodanych wpisów DNS (typ + nazwa, bez wartości kluczy), wynik `dig` z kryteriów, czy Brevo wymagało aktywacji SMTP.

### Success Criteria:

#### Automated Verification:

- MX na Cloudflare: `dig +short MX lekomapa.pl` zwraca trzy serwery `mx.cloudflare.net` i żadnego `mail.ovh.net`
- Dokładnie jeden SPF na korzeniu: `dig +short TXT lekomapa.pl | grep -c "v=spf1"` zwraca `1`, a rekord zawiera `include:_spf.mx.cloudflare.net` i nie zawiera `include:mx.ovh.com`
- DMARC istnieje: `dig +short TXT _dmarc.lekomapa.pl` zwraca rekord `v=DMARC1`
- Wpisy DKIM z panelu Brevo rozwiązują się poleceniem `dig` (nazwy zapisane w `change.md`)
- Aplikacja dalej odpowiada: `curl -sI https://lekomapa.pl` zwraca 302 na `/auth/signin`

#### Manual Verification:

- Mail wysłany z obcej skrzynki na `kontakt@lekomapa.pl` jest w Gmailu `krysko.anna@gmail.com`
- Panel Cloudflare Email Routing pokazuje adres docelowy jako potwierdzony i jedną regułę dla `kontakt@`
- Panel Brevo pokazuje domenę `lekomapa.pl` jako uwierzytelnioną i nadawcę `kontakt@lekomapa.pl`
- Panel Brevo pokazuje dane SMTP (serwer, port, login); klucz SMTP powstaje dopiero w fazie 3
- Panel Supabase dalej ma wyłączony custom SMTP (nic nie przełączone przed fazą 3)

**Implementation Note**: Wszystkie kroki wykonuje autorka w panelach; agent podaje wartości i sprawdza `dig`. Faza nie ma commita kodu — commit obejmuje tylko notatki w `change.md`.

---

## Phase 2: Strona prywatności i dokumenty

### Overview

Tekst produktu i dokumentacja mówią prawdę o nowym nadawcy. Merge tej fazy wdraża zmianę na produkcję, więc idzie tego samego dnia co faza 3.

### Changes Required:

#### 1. Zdanie o nadawcy na stronie prywatności

**File**: `src/lib/copy/terms.ts`

**Intent**: Strona prywatności nazywa firmy, które widzą adres e-mail przy mailach z odnośnikami.

**Contract**: W `PRIVACY_COPY`, sekcja „Gdzie leżą dane”, punkt „Maile z odnośnikami wysyła Supabase.” zastąpiony zdaniem: „Maile z odnośnikami wysyła Brevo (Francja). Odpowiedzi na nie Cloudflare przekazuje do skrzynki Gmail (Google) osoby odpowiedzialnej za serwis.” `TERMS_V1` i `CURRENT_TERMS_VERSION` bez zmian.

#### 2. README — sekcja Supabase

**File**: `README.md`

**Intent**: Zastąpić zdanie o ograniczeniu do zespołu opisem własnego SMTP, tak żeby następna osoba wiedziała, gdzie żyje konfiguracja.

**Contract**: Linia 96 („Do czasu własnego nadawcy maili (F-05)…”) zastąpiona krótkim akapitem: produkcja wysyła przez SMTP Brevo (`smtp-relay.brevo.com:587`), nadawca `Lekomapa <kontakt@lekomapa.pl>`, limit 30 maili na godzinę w Authentication → Rate Limits, klucz SMTP wyłącznie w panelu Supabase, wpisy DNS w Cloudflare (nie zmieniać serwerów DNS w OVH, jeden rekord SPF), odpowiedzi na `kontakt@` przekierowuje Cloudflare Email Routing na `krysko.anna@gmail.com`. Lokalnie bez zmian — mailpit.

#### 3. Infrastruktura — nowa zależność

**File**: `context/foundation/infrastructure.md`

**Intent**: Brevo i Cloudflare Email Routing są nowymi zewnętrznymi zależnościami produkcji.

**Contract**: W `## Rejestr ryzyk` wiersz: dzienny limit darmowego Brevo (300) i godzinowy limit Supabase (30) — po wyczerpaniu nowe osoby nie dostają potwierdzenia ani resetu, a trasy nie pokazują błędu dostawcy; łagodzenie: limit 30/h, obserwacja w F-06. W `## Historia operacyjna` wpis z datą przełączenia (uzupełniany w fazie 3).

### Success Criteria:

#### Automated Verification:

- Testy przechodzą, w tym filtr słów zakazanych dla strony prywatności: `npm test`
- Lint przechodzi: `npm run lint`
- Typy przechodzą: `npm run typecheck`
- Build przechodzi: `npm run build`
- Starego zdania nie ma w kodzie: `grep -rn "wysyła Supabase" src` nie zwraca nic
- CI na `main` po merge'u zielone (joby `ci`, `smoke`, `deploy`)

#### Manual Verification:

- `https://lekomapa.pl/prywatnosc` pokazuje nowe zdanie w sekcji „Gdzie leżą dane”
- `https://lekomapa.pl/warunki` bez zmian (wersja 1, obowiązuje od 08.10.2026)
- Faza 1 zakończona przed merge'em; faza 3 zaplanowana na ten sam dzień

**Implementation Note**: Nie merguj, dopóki faza 1 nie jest zakończona — inaczej strona dłużej mówi „Brevo”, a wysyła Supabase.

---

## Phase 3: Przełączenie i sprawdzenie na produkcji

### Overview

Supabase wysyła przez Brevo, szablony są polskie, a reset hasła i potwierdzenie adresu działają dla osób spoza zespołu.

### Changes Required:

#### 1. SMTP w panelu Supabase

**File**: panel Supabase (produkcja) → Authentication → Emails → SMTP Settings

**Intent**: Przełączenie wysyłki z domyślnego nadawcy na Brevo.

**Contract**: Custom SMTP włączony; host `smtp-relay.brevo.com`, port `587`, login i klucz SMTP z Brevo; sender email `kontakt@lekomapa.pl`, sender name `Lekomapa`. Authentication → Rate Limits: maile na godzinę = `30`. Po zapisie otwórz ustawienia jeszcze raz i sprawdź, że wartości zostały. Klucz SMTP generowany w Brevo dopiero w tym kroku i wklejany od razu do Supabase. Przed włączeniem: w Brevo (maile transakcyjne) wyłączone śledzenie kliknięć i otwarć — inaczej Brevo podmienia odnośniki z `token_hash` na własne przekierowania.

#### 2. Szablony maili

**File**: panel Supabase → Authentication → Email Templates

**Intent**: Zamknięcie odłożonych kroków 3.7 (`password-recovery`) i 5.5 (`terms-acceptance-on-signup`).

**Contract**: Kroki z `README.md:80-94` dla „Reset Password” i „Confirm signup”: temat i treść z `supabase/templates/recovery.html` oraz `supabase/templates/confirmation.html`; po zapisie odnośniki zawierają `{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=recovery` i `…&type=email`.

#### 3. Zamknięcie zaległych kroków

**File**: `context/changes/password-recovery/plan.md`, `context/changes/email-sender-smtp/change.md`, `context/foundation/infrastructure.md`

**Intent**: Ślad, że zaległe kroki są wykonane i kiedy przełączono nadawcę.

**Contract**: W `password-recovery/plan.md` wiersze Progress 3.7 i 3.8 odznaczone z SHA commita tej fazy (tytuły bez zmian). Zamknięcie 5.5 z zarchiwizowanej zmiany — notatka w `email-sender-smtp/change.md` (archiwum jest niezmienne). Wpis w `## Historia operacyjna` w `infrastructure.md` z datą przełączenia.

### Success Criteria:

#### Automated Verification:

- Nagłówki maila z Gmaila (zapisane do pliku w scratchpadzie) zawierają `spf=pass`, `dkim=pass` z domeną `lekomapa.pl` i `dmarc=pass`: `grep -E "spf=pass|dkim=pass|dmarc=pass"`
- Przekierowanie bez zmian: `dig +short MX lekomapa.pl` zwraca trzy serwery `mx.cloudflare.net`

#### Manual Verification:

- Panel Supabase po ponownym otwarciu pokazuje custom SMTP Brevo, nadawcę `Lekomapa <kontakt@lekomapa.pl>` i limit 30 na godzinę
- Oba szablony w panelu po ponownym otwarciu zawierają odnośniki z `token_hash`
- Gmail spoza zespołu Supabase: rejestracja → mail „Lekomapa: potwierdź adres e-mail” w odebranych → potwierdzenie → logowanie hasłem działa
- Gmail spoza zespołu: reset hasła → mail „Lekomapa: ustaw nowe hasło” → nowe hasło ustawione → logowanie nowym hasłem działa
- Poczta polska (WP, Onet albo Interia) spoza zespołu: rejestracja i reset jak wyżej, oba maile w odebranych (nie w spamie)
- Odnotowane, czy w stopce maila jest dopisek „Sent with Brevo”
- Konta testowe usunięte przez Konto → Usuń konto

**Implementation Note**: Konfigurację w panelach wykonuje autorka. Agent zapisuje nagłówki tylko w scratchpadzie — nie commituje treści maili ani adresów testowych. Po fazie: `/10x-impl-review`, a po merge'u `/10x-archive` przesuwa F-05 na `done`.

---

## Testing Strategy

### Unit Tests:

- Bez nowych testów. Istniejący `scripts/fr012/terms-copy.test.mjs` przepuszcza nowe zdanie przez filtr słów zakazanych; `scripts/terms/terms-text.test.mjs` potwierdza, że `TERMS_V1` nie zmieniło się względem `terms-of-use-v1.md`.

### Integration Tests:

- Smoke i E2E bez zmian — chodzą przeciw lokalnemu Supabase z mailpitem, nie dotykają Brevo.

### Manual Testing Steps:

1. Przed merge'em fazy 2: `dig` z kryteriów fazy 1 i mail testowy na `kontakt@lekomapa.pl` (ma dojść do Gmaila).
2. Po merge'u: `/prywatnosc` na produkcji.
3. Zaraz potem: przełączenie SMTP, szablony, rejestracja i reset na dwóch obcych adresach, nagłówki z Gmaila.

## Migration Notes

- Brak migracji bazy. Brak zmiany warunków — nikt nie akceptuje ponownie.
- Wycofanie: w panelu Supabase wyłączyć custom SMTP (wraca domyślny nadawca i domyślne szablony) i przywrócić zdanie „Maile z odnośnikami wysyła Supabase.” osobnym commitem. Wpisy DNS Brevo i przekierowanie Cloudflare mogą zostać — nie zależą od nadawcy w Supabase.

## References

- Roadmapa: `context/foundation/roadmap.md` — F-05, issue #44
- Zaległy reset i szablon: `context/changes/password-recovery/change.md:47-56`
- Zaległy szablon potwierdzenia: `context/archive/2026-10-07-terms-acceptance-on-signup/plan.md:646-649`
- Kroki szablonów: `README.md:80-94`
- Strona prywatności: `src/lib/copy/terms.ts:54-104`
- Dostęp do produkcji: `context/foundation/infrastructure.md` — `## Dostęp agenta do produkcji`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Przygotowanie poza kodem

#### Automated

- [x] 1.1 MX na Cloudflare: `dig +short MX lekomapa.pl` zwraca trzy serwery `mx.cloudflare.net` — 022ad43
- [x] 1.2 Dokładnie jeden SPF na korzeniu, zawiera `include:_spf.mx.cloudflare.net`, bez `include:mx.ovh.com` — 022ad43
- [x] 1.3 DMARC istnieje: `dig +short TXT _dmarc.lekomapa.pl` zwraca `v=DMARC1` — 022ad43
- [x] 1.4 Wpisy DKIM z panelu Brevo rozwiązują się poleceniem `dig` — 022ad43
- [x] 1.5 Aplikacja dalej odpowiada: `curl -sI https://lekomapa.pl` zwraca 302 na `/auth/signin` — 022ad43

#### Manual

- [x] 1.6 Mail z obcej skrzynki na `kontakt@lekomapa.pl` jest w Gmailu `krysko.anna@gmail.com` — 022ad43
- [x] 1.7 Brevo pokazuje domenę `lekomapa.pl` jako uwierzytelnioną i nadawcę `kontakt@lekomapa.pl` — 022ad43
- [x] 1.8 Brevo pokazuje dane SMTP (klucz powstaje w fazie 3) — 022ad43
- [x] 1.9 Supabase dalej ma wyłączony custom SMTP — 022ad43
- [x] 1.10 Cloudflare Email Routing: adres docelowy potwierdzony, jedna reguła dla `kontakt@` — 022ad43

### Phase 2: Strona prywatności i dokumenty

#### Automated

- [x] 2.1 Testy przechodzą: `npm test`
- [x] 2.2 Lint przechodzi: `npm run lint`
- [x] 2.3 Typy przechodzą: `npm run typecheck`
- [x] 2.4 Build przechodzi: `npm run build`
- [x] 2.5 Starego zdania nie ma w kodzie: `grep -rn "wysyła Supabase" src` nie zwraca nic
- [ ] 2.6 CI na `main` po merge'u zielone (`ci`, `smoke`, `deploy`)

#### Manual

- [ ] 2.7 `/prywatnosc` na produkcji pokazuje nowe zdanie
- [ ] 2.8 `/warunki` na produkcji bez zmian
- [ ] 2.9 Faza 1 zakończona przed merge'em; faza 3 tego samego dnia

### Phase 3: Przełączenie i sprawdzenie na produkcji

#### Automated

- [ ] 3.1 Nagłówki maila z Gmaila zawierają `spf=pass`, `dkim=pass` (lekomapa.pl) i `dmarc=pass`
- [ ] 3.2 Przekierowanie bez zmian: MX zwraca trzy serwery `mx.cloudflare.net`

#### Manual

- [ ] 3.3 Supabase pokazuje SMTP Brevo, nadawcę `Lekomapa <kontakt@lekomapa.pl>` i limit 30/h
- [ ] 3.4 Oba szablony w panelu zawierają odnośniki z `token_hash`
- [ ] 3.5 Gmail spoza zespołu: rejestracja, potwierdzenie i logowanie działają
- [ ] 3.6 Gmail spoza zespołu: reset hasła i logowanie nowym hasłem działają
- [ ] 3.7 Poczta polska spoza zespołu: oba maile w odebranych
- [ ] 3.8 Odnotowane, czy jest dopisek „Sent with Brevo”
- [ ] 3.9 Konta testowe usunięte
- [ ] 3.10 Brevo: śledzenie kliknięć i otwarć wyłączone; odnośnik w mailu testowym prowadzi wprost na `lekomapa.pl`
