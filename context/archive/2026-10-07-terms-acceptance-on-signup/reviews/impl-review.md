<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: S-01 Konto z akceptacją warunków korzystania

- **Plan**: context/changes/terms-acceptance-on-signup/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3, 4, 5
- **Date**: 2026-10-08
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 2 warnings, 7 observations

Faza 5: kod i kryteria automatyczne sprawdzone. Kroki ręczne 5.5–5.9 czekają na wdrożenie (panel produkcji, ścieżka maila na produkcji, data wejścia w życie). Tak przewiduje plan, to nie jest finding.

Bramki uruchomione 2026-10-08 na commicie c5d77a3:

- `npm test`: 359/359 pass
- `npm run typecheck`: 0 błędów
- `npm run lint`: 0 błędów (42 ostrzeżenia `no-console` w plikach spoza tej zmiany)
- `npm run build`: OK
- `npm run db:check`: 11/11 plików pass, w tym `terms_checks.sql`
- `npm run smoke`: wszystkie kroki pass. Bieg przeciw lokalnemu Supabase, ze starym podglądem zatrzymanym i `.env` odsuniętym na czas biegu. `.env` przywrócony.

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | WARNING |
| Safety & Quality    | WARNING |
| Architecture        | WARNING |
| Pattern Consistency | PASS    |
| Success Criteria    | WARNING |

## Findings

### F1 — Kontrola wersji i ochrona wnętrza działają tylko dla ścieżek wpisanych na listę

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Architecture
- **Location**: src/lib/auth/terms-gate.ts:27-30, src/lib/navigation.ts:16
- **Detail**: Strona jest objęta kontrolą wersji tylko wtedy, gdy jest w `INTERIOR_ROUTES` albo pod `/api/`. Każda inna ścieżka dostaje `allow`. Przyszła strona wnętrza spoza menu (np. `/raport`) bez wpisu w `INTERIOR_ROUTES` byłaby otwarta i dla niezalogowanych, i dla kont bez akceptacji. Nic by tego nie zgłosiło. Pilnuje tego tylko komentarz w kodzie i reguła w CLAUDE.md. Lista ścieżek była taka już przed zmianą (`PROTECTED_ROUTES`), ale S-01 dokłada do niej drugą gwarancję. Dla porównania `isRecoverySession` działa odwrotnie: blokuje wszystko, czego nie zna.
- **Fix A ⭐ Recommended**: Test w `scripts/auth/`, który wylicza strony `src/pages/**/*.astro` i wymaga, żeby każda była w `INTERIOR_ROUTES` albo na jawnej liście publicznej (`/`, `/warunki`, `/prywatnosc`, `/auth/*`).
  - Strength: zgodne z lesson „Regułę pilnuje test, nie komentarz”. Nowa strona bez decyzji wywraca `npm test`.
  - Tradeoff: kolejna lista do utrzymania, choć jej brak wychodzi od razu.
  - Confidence: HIGH — testy w `scripts/**` już czytają pliki repozytorium (`terms-text.test.mjs`, skaner kolorów).
  - Blind spot: strony dynamiczne (`[id].astro`) trzeba dopasować do prefiksu trasy.
- **Fix B**: Odwrócić regułę: wszystko poza jawną listą publiczną jest wnętrzem (fail closed).
  - Strength: zamyka całą klasę błędu, nie tylko ją wykrywa.
  - Tradeoff: zmienia middleware i kontrolę wersji tuż przed merge'em. Potrzebny nowy bieg smoke i sprawdzenie ręczne ekranów publicznych.
  - Confidence: MED — prostsze w teorii, ale dotyka trasy każdego żądania.
  - Blind spot: zasoby statyczne i `/_astro/*`, które middleware też widzi.
- **Decision**: FIXED (Fix A) — `scripts/auth/route-coverage.test.mjs`: każda strona `src/pages/**/*.astro` musi być publiczna, ekranem akceptacji albo w `INTERIOR_ROUTES`; strony wnętrza muszą przechodzić przez `isTermsGatedPath`. Sprawdzone: podrzucona `src/pages/raport.astro` wywraca test.

### F2 — Brak testu na zbyt dużą liczbę w `terms_version`

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: supabase/tests/terms_checks.sql:129-132, supabase/migrations/20261007130000_terms_acceptance.sql:184
- **Detail**: Wyzwalacz poprawnie odrzuca wartości dłuższe niż 4 cyfry (`^[0-9]{1,4}$`), więc rzutowanie na `smallint` się nie przepełnia. Plan mówi jednak `^[0-9]+$`, a TERMS 2 sprawdza tylko `{}`, `"abc"` i `"99"`. Powrót do brzmienia z planu dałby błąd 500 przy każdej rejestracji z wartością typu `"99999999999"`, a żadna bramka by tego nie złapała.
- **Fix**: Dopisać `{"terms_version":"99999999999"}` do TERMS 2 i poprawić wzorzec w planie (faza 1, wyzwalacz) na `^[0-9]{1,4}$` z powodem.
- **Decision**: FIXED — TERMS 2 w `supabase/tests/terms_checks.sql` dostał przypadek `{"terms_version":"99999999999"}` (konto `…a2d`); wzorzec w planie (faza 1, wyzwalacz) poprawiony na `^[0-9]{1,4}$` z powodem. `npm run db:check`: 11/11 pass.

### F3 — Napisy spoza załącznika A, których autorka nie zatwierdziła

- **Severity**: 💬 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Scope Discipline
- **Location**: src/lib/copy/auth.ts (sekcja `validation`, `pageTitle`, `emailPlaceholder`), src/components/auth/TermsCheckbox.tsx (`errorLabel = "Uwaga:"`)
- **Detail**: Załącznik A miał być jedynym źródłem napisów („Napisy są wyłącznie z załącznika A”). W kodzie są też teksty, których w nim nie ma: komunikaty walidacji po stronie klienta („Wpisz adres e-mail.”, „Hasło musi mieć co najmniej 6 znaków.”), tytuły stron („Odnośnik nie działa” i inne), podpowiedź „twoj@adres.pl”, etykieta „Prywatność”. Przechodzą filtr FR-012, ale autorka ich nie widziała. Dodatkowo `"Uwaga:"` w `TermsCheckbox` jest wpisane w komponencie, a nie w `AUTH_COPY`, więc test języka go nie widzi.
- **Fix**: Autorka czyta listę napisów spoza A i akceptuje albo poprawia. Akceptowane dopisać do załącznika A jako zmianę z datą, a `"Uwaga:"` przenieść do `AUTH_COPY`.
  - Strength: załącznik A znów jest kompletnym źródłem prawdy o napisach.
  - Tradeoff: kilka minut czytania przed merge'em.
  - Confidence: HIGH — lista pochodzi z porównania `auth.ts` z A.3–A.7.
  - Blind spot: napisy w `LegalDocument.astro` i `warunki.astro` poza treścią warunków nie były porównywane słowo w słowo.
- **Decision**: FIXED — autorka przeczytała 13 napisów spoza A i zaakceptowała bez zmian (2026-10-08). Dopisane do planu jako A.8; „Uwaga:” przeniesione do `AUTH_COPY.signUp.termsErrorLabel`, więc test FR-012 je widzi. Poza zakresem: ten sam napis na sztywno w `FormField.tsx:37` (od S-10).

### F4 — Wyjątek `/api/terms/` obejmuje każdą przyszłą trasę pod tym prefiksem

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Architecture
- **Location**: src/lib/auth/terms-gate.ts:12
- **Detail**: Dziś pod `/api/terms/` jest tylko `accept`. Przyszła trasa pod tym prefiksem, która zwraca albo zapisuje dane konta, ominęłaby kontrolę wersji. Plan wymieniał dokładną ścieżkę `/api/terms/accept`.
- **Fix**: Zamienić prefiks na dokładną ścieżkę `/api/terms/accept` w `EXEMPT_PATHS` i dopisać przypadek do `terms-gate.test.mjs`.
- **Decision**: FIXED — `/api/terms/accept` jako dokładna ścieżka w `EXEMPT_PATHS`, prefiks `/api/terms/` usunięty. Nowy test w `terms-gate.test.mjs` (`/api/terms/history` → forbid) pada na starym kodzie, przechodzi na nowym.

### F5 — Smoke sprawdza wersję 1 liczbą wpisaną na sztywno

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: scripts/smoke.mjs:1824
- **Detail**: Krok „konto z formularza ma akceptację” porównuje `data[0].version === 1`, a reszta pliku importuje `CURRENT_TERMS_VERSION`. Przy wersji 2 krok padnie z niewłaściwego powodu.
- **Fix**: Zamienić `1` na `CURRENT_TERMS_VERSION`.
- **Decision**: FIXED — `scripts/smoke.mjs`: porównanie i nazwa kroku używają `CURRENT_TERMS_VERSION`. Smoke nie był ponownie uruchomiony (wymaga lokalnego Supabase).

### F6 — Przy awarii bazy konto z akceptacją dostaje mylący ekran i kod 403

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/terms-acceptance.ts:16-19, src/middleware.ts:73-81
- **Detail**: Odrzucanie przy błędzie zapytania (fail closed) jest zgodne z planem. Skutek uboczny: przy niedostępnej bazie konto, które już zaakceptowało warunki, widzi ekran akceptacji, a API odpowiada `termsNotAccepted`. Ponowne „Akceptuję” daje 23505, przekierowanie na `/`, potem znów ekran akceptacji — pętla do powrotu bazy.
- **Fix**: Na teraz bez zmian, zgodnie z planem. Przy F-06 (Sentry) rozważyć osobny kod `termsCheckFailed` albo 503.
- **Decision**: ACCEPTED — bez zmian w kodzie, zgodnie z planem (fail closed). Notatka do F-06 w `follow-ups/review-fixes.md`.

### F7 — Akceptacja przy rejestracji pochodzi z metadanych, które wysyła klient

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20261007130000_terms_acceptance.sql:179-196
- **Detail**: Wiersz akceptacji powstaje z `raw_user_meta_data.terms_version`. Kto wywoła `/signup` Supabase bezpośrednio kluczem publicznym, zapisze akceptację bez zaznaczania pola w formularzu. Dane innych kont nie są zagrożone — zapisana zgoda jest własna. Wiersz dowodzi jednak mniej niż „zaznaczono pole w naszym formularzu”. To konsekwencja decyzji planu (na produkcji `signUp` nie daje sesji), a nie błąd implementacji.
- **Fix**: Dopisać jedno zdanie do planu (`## Key Discoveries` albo `## Migration Notes`) o tym, co wiersz akceptacji dowodzi, a czego nie.
- **Decision**: FIXED — zdanie w `## Migration Notes` planu: co wiersz akceptacji z rejestracji dowodzi, a czego nie.

### F8 — Wynik `signOut()` po potwierdzeniu adresu nie jest sprawdzany

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/auth/email-confirm.ts:40
- **Detail**: `@supabase/auth-js` usuwa lokalną sesję (ciasteczka) także przy błędzie, więc sesja `otp` nie zostaje w przeglądarce. Gdyby jednak została, reguła sesji resetu zatrzyma ją na ekranie nowego hasła (fail closed). Brakuje tylko śladu w logu.
- **Fix**: Logować `error.code` z wyniku `signOut()`, tak jak robi `email-resend.ts`.
- **Decision**: FIXED — `email-confirm.ts` loguje `code` i `status` błędu `signOut()`, jak `email-resend.ts`.

### F9 — Status S-01 w roadmapie nieaktualny

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: context/foundation/roadmap.md (`### S-01`)
- **Detail**: Gałąź zmienia status S-01 z `ready` na `planning`, a zmiana jest wdrożona w kodzie. Plan nie przewidywał zmiany statusu.
- **Fix**: Ustawić status zgodny z konwencją roadmapy (np. `in progress` / `done` po merge'u) albo zostawić do `/10x-archive`.
- **Decision**: FIXED — S-01 w `roadmap.md` (tabela i sekcja) ma status `in-progress`; `done` przy `/10x-archive` po merge’u.

## Triage summary (2026-10-08)

- Fixed: F1 (Fix A), F2, F3, F4, F5, F7, F8, F9
- Accepted: F6 (bez zmian, notatka do F-06 w `follow-ups/review-fixes.md`)
- Bramki po triage'u: `npm test` 364/364, `npm run typecheck` 0 błędów, `npm run lint` 0 błędów (43 ostrzeżenia, w tym `no-console` z F8), `npm run db:check` 11/11. `npm run smoke`: wszystkie kroki pass (tryb kont jednorazowych, lokalne Supabase; `.env` odsunięty na czas biegu i przywrócony, stary podgląd zatrzymany; lokalne `auth.users` 31 → 35 kont).
