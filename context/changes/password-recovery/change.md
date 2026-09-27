---
change_id: password-recovery
title: Odzyskiwanie dostępu przez ustawienie nowego hasła
status: implementing
created: 2026-09-27
updated: 2026-09-27
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
