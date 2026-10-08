# Follow-ups z impl-review (2026-10-08)

Źródło: `context/changes/terms-acceptance-on-signup/reviews/impl-review.md`.

## F6 — awaria bazy przy kontroli wersji warunków (do F-06)

- Dziś: błąd zapytania o `terms_acceptances` = brak akceptacji (fail closed, zgodnie z planem). Konto z akceptacją widzi przy awarii bazy ekran akceptacji, a API odpowiada 403 `termsNotAccepted`; ponowne „Akceptuję” daje 23505 i wraca na ten sam ekran.
- Przy F-06 (Sentry): rozważyć osobny kod `termsCheckFailed` albo odpowiedź 503 i zgłoszenie błędu do trackera, zamiast udawać brak akceptacji.
- Miejsca: `src/lib/services/terms-acceptance.ts:16-19`, `src/middleware.ts:73-81`.
