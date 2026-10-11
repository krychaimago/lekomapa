---
change_id: account-deletion-cascade
title: Account deletion cascade
status: implementing
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
