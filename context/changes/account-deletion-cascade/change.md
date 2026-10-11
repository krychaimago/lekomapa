---
change_id: account-deletion-cascade
title: Account deletion cascade
status: impl_reviewed
created: 2026-10-10
updated: 2026-10-11
archived_at: null
---

## Notes

<!-- Free-form notes for this change: links, ad-hoc context, decisions that don't belong in research/frame/plan. -->

### Pomiar `amr` (faza 1, 11.10.2026, lokalne Supabase)

- Konto jednorazowe przez lokalne API admina, usunięte po pomiarze. Zapisany tylko kształt, bez wartości tokenów.
- Logowanie hasłem (`grant_type=password`): `amr = [{"method":"password","timestamp":<liczba>}]`, `aal1`.
  - `timestamp` to liczba całkowita w sekundach uniksowych (różnica do bieżącego czasu: 0 s).
- Odświeżenie tokenu (`grant_type=refresh_token`): ten sam kształt, nadal `password`.
  - Nie zmierzone: czy `timestamp` po odświeżeniu zostaje czasem logowania. Odświeżenie poszło w tej samej sekundzie.
- Sesja z odnośnika resetu hasła (`generate_link` typu `recovery` + `/auth/v1/verify`): `amr = [{"method":"otp","timestamp":<liczba>}]`.
  - Brak metody `password`, więc funkcja ją odrzuca (`AD001`).
- Wniosek: kształt zgodny z założeniem planu. Warunek funkcji: wpis z `method = 'password'` i liczbowym `timestamp` (sekundy) nie starszym niż 5 minut.

### Pomiar `signOut` i ciasteczek po usunięciu konta (faza 2, 11.10.2026, lokalne Supabase)

- Przebieg w przeglądarce (autorka) i drugi, jednorazowy przez `curl` na podglądzie z `.dev.vars`; `.env` odsunięty.
- `signOut()` po `delete_own_account` nie zwraca błędu: w logach podglądu brak wpisów „sign-out after deletion failed/threw”.
  - Jedyny wpis trasy to złe hasło z testu 2.6: `{ code: 'invalid_credentials', status: 400 }`. Bez hasła i adresu.
- Odpowiedź na POST `/api/account/delete`: `303`, `Location: /auth/konto-usuniete`, `Cache-Control: private, no-store`.
  - Jeden nagłówek `Set-Cookie: sb-127-auth-token=…; Path=/; Expires=Thu, 01 Jan 1970` — ciasteczko sesji wygaszone.
  - Słoik ciasteczek klienta po odpowiedzi: brak `sb-*`.
- Stare ciasteczko: GET `/leki` → 302 na `/auth/signin`. Ponowne logowanie → `/auth/signin?error=credentials`.
- Baza po obu przebiegach: 0 wierszy w `auth.users`, `auth.sessions`, `auth.refresh_tokens` i we wszystkich 6 tabelach konta.
