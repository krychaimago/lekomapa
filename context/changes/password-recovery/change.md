---
change_id: password-recovery
title: Odzyskiwanie dostępu przez ustawienie nowego hasła
status: impl_reviewed
created: 2026-09-27
updated: 2026-10-12
archived_at: null
---

## Notes

<!-- Free-form notes for this change: links, ad-hoc context, decisions that don't belong in research/frame/plan. -->

### Pomiar przed bramką (faza 1, 2026-09-27, lokalny Supabase CLI v2.117.0)

`amr` z `getClaims()` dla trzech rodzajów sesji:

| Sesja                                         | `amr`                      |
| --------------------------------------------- | -------------------------- |
| rejestracja (potwierdzenia wyłączone)         | `[{ method: "password" }]` |
| logowanie hasłem                              | `[{ method: "password" }]` |
| `verifyOtp({ type: "recovery", token_hash })` | `[{ method: "otp" }]`      |

- Sesja z odnośnika jest rozróżnialna. Zbiór metod zwykłych sesji: `{ password }`. Reguła w `src/lib/auth/recovery-session.ts`: sesją z odnośnika jest każda sesja z metodą spoza tego zbioru — serwer nazywa ją `otp`, nie `recovery`, więc dokładne dopasowanie do `recovery` przepuściłoby ją do wnętrza.
- Token sesji z odnośnika wystawiony przez `admin.generateLink({ type: "recovery" })` — ta sama ścieżka `verifyOtp` co odnośnik z maila.

Algorytm podpisu tokenu:

- Lokalnie: `ES256` (nagłówek tokenu i `/auth/v1/.well-known/jwks.json`) — nie HS256, jak zakładał plan (`Performance Considerations`). `getClaims()` weryfikuje lokalnie po pobraniu JWKS, bez drugiego wywołania `getUser()`.
- Produkcja: `ES256` (publiczny JWKS projektu, jeden klucz EC P-256).

Limit maili (`[auth.rate_limit] email_sent = 2`):

- Lokalnie nie działa: 6 próśb o odnośnik w ciągu godziny, wszystkie maile doszły do mailpitu. `email_sent` bez zmian w `config.toml`.
- Działa za to `max_frequency = "1s"` per adres: druga prośba dla tego samego adresu w tej samej sekundzie → `429 over_email_send_rate_limit`. Trasa połyka ten błąd (zdradzałby istnienie konta); smoke musi odczekać ponad sekundę między prośbami dla jednego adresu.

Odświeżenie sesji z odnośnika (`refreshSession()` po `verifyOtp` typu recovery): `amr` nadal `[{ method: "otp" }]`. Blokada wnętrza nie otwiera się po odświeżeniu tokenu.

### Bez merge'a do `main` przed fazą 2 (impl-review F3, 2026-09-28)

Faza 1 przekierowuje na `/auth/reset-password`, `/auth/reset-password/confirm` i `/auth/forgot-password[/sent]`, które powstają dopiero w fazie 2. Merge do `main` wdraża na produkcję bez innej bramki, więc gałąź nie trafia do `main`, dopóki faza 2 nie jest wdrożona na tej gałęzi.

### Do opisu PR: ekrany startera (impl-review fazy 2, F4)

Wspólne komponenty z fazy 2 (`FormField`, `ServerError`, `PasswordToggle`) zmieniają też logowanie i rejestrację ze startera: błędy zaczynają się od polskiego „Uwaga:” przy angielskiej treści („Uwaga: Email is required”), przełącznik hasła ma polską etykietę obok angielskich pól, a pola mają jasne tło `bg-background` w ciemnej karcie `bg-cosmic`. Kontrast sprawdzony w kryterium 2.8. Tłumaczenie i wygląd tych ekranów należą do S-01.

### Szablon produkcji wymaga własnego SMTP (faza 3, 3.7, 2026-09-28)

Panel produkcji: „Set up custom SMTP to edit templates. Emails will be sent using the default templates.” Na domyślnym nadawcy szablonu „Reset password” nie da się edytować, więc 3.7 (szablon) i 3.8 (reset na produkcji) czekają na F-05. Decyzja autorki: merge bez nich.

Pomiar domyślnego odnośnika (lokalnie, własny szablon wyłączony na czas pomiaru):

- Mail „Reset your password” z odnośnikiem `…/auth/v1/verify?token=…&type=recovery&redirect_to=…/auth/reset-password/confirm`.
- Otwarcie odnośnika zużywa token po stronie Supabase i przekierowuje na `/auth/reset-password/confirm?code=…`.
- Ta strona pokazuje „Odnośnik nie działa” — w tej samej przeglądarce (z ciasteczkami weryfikatora PKCE) i w innej. Żadna sesja nie powstaje, `/dashboard` → `/auth/signin`.
- Wniosek: do czasu F-05 odzyskiwanie na produkcji kończy się komunikatem o wygasłym odnośniku; nic się nie otwiera.

### Smoke musi wysyłać `Origin` tak jak przeglądarka (faza 3, 2026-09-28)

`Referrer-Policy: no-referrer` z poprawki po przeglądzie fazy 2 sprawiał, że przeglądarka wysyłała formularze odzyskiwania z `Origin: null`, a `checkOrigin` Astro odpowiadał 403. Smoke przechodził, bo sam dopisywał poprawny `Origin`. Naprawa: `same-origin` na obu stronach; smoke wyprowadza `Origin` z polityki strony z formularzem (`formOrigin`).
