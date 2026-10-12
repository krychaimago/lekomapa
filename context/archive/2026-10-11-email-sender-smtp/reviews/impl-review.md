<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Własny nadawca maili (F-05)

- **Plan**: context/changes/email-sender-smtp/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3
- **Date**: 2026-10-11
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 2 warnings, 4 observations

Uwaga: faza 3 ma otwarty krok 3.10 — przegląd obejmuje fazę 3 mimo to, bo kod i panele są już na produkcji (PR #89, #90). Bramki: `npm test` 405/405, `npm run lint` 0 błędów (60 ostrzeżeń sprzed zmiany), `npm run typecheck` 0, `npm run build` OK, `grep -rn "wysyła Supabase" src` pusty, `dig` MX/SPF/DMARC zgodne z kryteriami, `/prywatnosc` na produkcji pokazuje nowe zdanie.

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | WARNING |
| Scope Discipline    | WARNING |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | WARNING |

## Findings

### F1 — Odnośniki z token_hash przechodzą przez serwer Brevo

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: panel Brevo (śledzenie kliknięć); context/foundation/infrastructure.md:86
- **Detail**: Plan (faza 3, krok 1) wymagał wyłączenia śledzenia właśnie dlatego, że Brevo podmienia odnośniki z `token_hash`. Pomiar: odnośnik prowadzi przez `*.sendibt3.com`. Brevo zna więc ważne przez godzinę odnośniki resetu hasła i potwierdzenia adresu. Łagodzi to: token zużywa dopiero przycisk na `/auth/confirm` (samo przekierowanie go nie zużywa), Brevo jest podmiotem przetwarzającym. Decyzja autorki (akceptacja + prośba do supportu) dotyczyła prywatności; rejestr ryzyk nie nazywa strony bezpieczeństwa (token u trzeciej strony) ani warunku zmiany dostawcy, gdy Brevo odmówi.
- **Fix A ⭐ Recommended**: Wiersz w `## Rejestr ryzyk`: odnośniki resetu i potwierdzenia przechodzą przez Brevo; przeciwdziałanie: prośba do supportu, a przy odmowie zmiana dostawcy przed wpuszczeniem innych osób.
  - Strength: Zapisuje decyzję i warunek wyjścia, zero zmian na produkcji.
  - Tradeoff: Ryzyko zostaje do odpowiedzi Brevo.
  - Confidence: HIGH — wzorzec rejestru ryzyk już używany w tej zmianie.
  - Blind spot: Nie wiadomo, jak długo Brevo trzyma adresy przekierowań w logach.
- **Fix B**: Zmiana dostawcy na takiego, który na darmowym planie pozwala wyłączyć śledzenie (np. Resend).
  - Strength: Usuwa ryzyko u źródła; odnośnik prowadzi wprost na `lekomapa.pl`.
  - Tradeoff: Powtórka fazy 1 i 3 (DNS, SMTP, testy na produkcji) i zmiana strony prywatności.
  - Confidence: MED — nie sprawdzono warunków planów darmowych innych dostawców.
  - Blind spot: Odpowiedź Brevo może uczynić zmianę zbędną.
- **Decision**: FIXED (Fix A, wariant najszybszy) — support Brevo 12.10.2026 odmówił wyłączenia śledzenia i nagłówka wypisu; autorka akceptuje Brevo na etapie demonstracyjnym. Rejestr ryzyk: nowy wiersz o tokenie u Brevo, wiersz o wypisie potwierdzony (N → Ś), opis nadawcy zaktualizowany.

### F2 — Krok 3.10 otwarty, zmiana nie ma ścieżki do zamknięcia

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Success Criteria
- **Location**: context/changes/email-sender-smtp/plan.md (## Progress, 3.10)
- **Detail**: 3.10 nie przejdzie bez zgody Brevo. Notatki w `change.md` opisują dalsze kroki (usunąć zdanie o śledzeniu, sprawdzić odnośnik), ale plan nie mówi, czy `/10x-archive` czeka na Brevo. Roadmapa F-05 stoi na `in-progress`, a F-05 „musi być done przed wpuszczeniem innych osób”.
- **Fix A ⭐ Recommended**: Zostawić 3.10 otwarte do odpowiedzi Brevo; archiwizacja i F-05 `done` dopiero po niej.
  - Strength: Progress mówi prawdę; zgodne z decyzją zapisaną w `change.md`.
  - Tradeoff: Zmiana wisi w `context/changes/` nieokreślony czas.
  - Confidence: HIGH — konwencja Progress nie pozwala zmieniać tytułu kroku.
  - Blind spot: Brevo może nie odpowiedzieć.
- **Fix B**: Dopisać przy 3.10 „— odłożone: issue #N” i wynieść pracę do osobnego issue; archiwizować teraz.
  - Strength: F-05 zamknięte; pozostała praca widoczna w issue.
  - Tradeoff: Archiwum z niewykonanym krokiem; łatwo zgubić usunięcie zdania o śledzeniu.
  - Confidence: MED — zależy, czy `/10x-archive` przyjmuje niezaznaczony krok.
  - Blind spot: Nie sprawdzono zachowania `/10x-archive` przy otwartym kroku.
- **Decision**: FIXED (Fix A) — dopisek przy 3.10 w Progress i notatka w `change.md`; zmiana gotowa do archiwizacji, F-05 `done` z odnotowanym wyjątkiem.

### F3 — 3.7 zaznaczone, reset na poczcie polskiej niesprawdzony

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: context/changes/email-sender-smtp/plan.md (## Progress, 3.7)
- **Detail**: Kryterium: „rejestracja i reset jak wyżej, oba maile w odebranych”. Notatka w `change.md`: „reset na WP nie sprawdzany”. Krok `[x]` mimo braku połowy dowodu.
- **Fix**: Wykonać reset na WP (mail w odebranych), albo dopisać przy 3.7 „— reset na WP niesprawdzony, patrz change.md”.
- **Decision**: FIXED — test 12.10.2026: reset na WP w Odebranych, wynik w `change.md`. Przy teście wyszły dwa maile z potwierdzeniem (podwójne wysłanie formularza rejestracji) — osobne issue.

### F4 — SPF kończy się `~all`, plan mówił `-all`

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: DNS Cloudflare, TXT `lekomapa.pl` (`v=spf1 include:_spf.mx.cloudflare.net ~all`)
- **Detail**: „Critical Implementation Details” wymagało zakończenia `-all`; jest `~all` z kreatora Email Routing. Maile Brevo nie zależą od tego (koperta `sender-sib.com`, DMARC przez DKIM), a DMARC `p=none` i tak nic nie odrzuca. Kryteria 1.2 nie sprawdzały zakończenia, więc dryf przeszedł.
- **Fix**: Zmienić w Cloudflare na `-all` i sprawdzić `dig +short TXT lekomapa.pl`, albo dopisać do notatek, że `~all` zostaje świadomie.
- **Decision**: FIXED — SPF w Cloudflare zmieniony na `-all` 12.10.2026; `dig` (autorytatywny, 1.1.1.1, 8.8.8.8) pokazuje jeden rekord z `-all`. Wynik w `change.md`.

### F5 — Rozszerzenia poza kontraktem planu

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: src/lib/copy/terms.ts:76; context/foundation/infrastructure.md (Rejestr ryzyk)
- **Detail**: Plan podawał dokładne brzmienie zdania na stronie prywatności; wdrożone ma dodatkowe zdanie o śledzeniu Brevo. Rejestr ryzyk ma dwa niezaplanowane wiersze (klucz SMTP po 90 dniach, nagłówek wypisu). Wszystko wynika z pomiarów w fazie 3 i jest opisane w `change.md` — łagodne, ale plan (źródło prawdy dla review) o nich nie wie.
- **Fix**: Krótki dopisek w planie (faza 3, „Changes Required”) z odsyłaczem do notatek w `change.md`.
- **Decision**: FIXED — dopisek w planie (faza 3, „Changes Required”) z odsyłaczem do `change.md`.

### F6 — Zdanie o śledzeniu „bez łączenia z adresem” niesprawdzone u źródła

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/copy/terms.ts:76
- **Detail**: Strona prywatności twierdzi, że Brevo liczy otwarcia i kliknięcia „bez łączenia ich z adresem e-mail”. Podstawa: ustawienie Anonymous = Yes w panelu. W repozytorium brak odsyłacza do dokumentacji Brevo, co dokładnie robi ten tryb (np. czy logi przekierowań też są anonimowe). Strona prywatności to deklaracja wobec użytkowniczki.
- **Fix**: Dopisać w `change.md` link do dokumentacji Brevo potwierdzającej działanie trybu anonimowego; jeśli dokumentacja mówi mniej — złagodzić zdanie.
- **Decision**: FIXED — potwierdzenie supportu Brevo (12.10.2026) i link do dokumentacji trybu anonimowego w `change.md`; strona prywatności bez zmian.
