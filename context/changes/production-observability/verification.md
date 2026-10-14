# Weryfikacja wdrożenia F-06

## 5.6 Prywatność prawdziwego zgłoszenia (13.10.2026)

Warunki biegu:

- lokalny `npm run preview` z `SENTRY_DSN` w `.dev.vars`, `SENTRY_ENVIRONMENT=local`,
- `.env` odsunięty; konto testowe założone w lokalnym `auth.users`, nie na produkcji,
- lokalnie `revoke insert on public.medications from authenticated`,
- dodanie leku „Ibuprofen 400 mg” przez formularz.

Wynik — zgłoszenie `LEKOMAPA-3`, JSON zdarzenia z panelu Sentry:

- brak nazwy leku i dawki w całym JSON,
- brak adresu strony: jest tylko wzorzec trasy `route: /api/medications`,
- brak nagłówków, ciasteczek, treści żądania i adresu IP,
- obecne wyłącznie: `where: medications.create-registry`, `code: 42501`, typ `NonError`, wartość `redacted`, `environment: local`,
- mail przyszedł przy nowym zgłoszeniu i przy regresji (5.9).

Poprawki po pierwszym biegu (ten sam commit fazy 5):

- `platform: "node"` zamiast `"javascript"` — zgłoszenie z serwera, nie z przeglądarki,
- pusty ślad nie jest wysyłany — Sentry odrzucał pustą listę `frames` jako błąd formatu.

### `user.geo` usunięte regułą w panelu Sentry

Sentry wylicza `user.geo` (kraj, region, miasto) przy przyjmowaniu zgłoszenia z adresu IP połączenia i zapisuje je mimo włączonego „Prevent Storing of IP Addresses”. Nasz kod tego pola nie wysyła.

Sprawdzone i nieskuteczne (pomiar na kolejnych zdarzeniach `LEKOMAPA-3`):

1. `platform: "node"` — pole zostaje.
2. `sdk.settings.infer_ip: "never"` w zgłoszeniu — Sentry przyjął ustawienie, pole zostaje. Wycofane z kodu.
3. Reguła Advanced Data Scrubbing ze źródłem `$user.geo` — pole zostaje.

Skuteczne: reguła **Settings → Projects → lekomapa → Security & Privacy → Advanced Data Scrubbing**, metoda **Remove**, typ **Anything**, źródło **`user.geo.**`** (bez `$`). W zdarzeniu z 13.10.2026 21:36 wszystkie pola `user.geo` mają wartość `null`, a `_meta` wskazuje regułę projektu (`project:0`). Trafną zmianę źródła zaproponowała autorka.

Przesądza na później: ochrona żyje w panelu Sentry, nie w repozytorium, i test w `scripts/observability/error-report.test.mjs` jej nie widzi. Nowy projekt Sentry wymaga odtworzenia reguły ręcznie (zapis w `context/foundation/infrastructure.md`). Bez niej na produkcji pole wskazywałoby lokalizację centrum danych Cloudflare, a lokalnie — lokalizację autorki.

## 5.7 Check-in z produkcji (14.10.2026)

- Monitor Crons `exceeded-cpu-check` założony ręcznie przed sekretami: `*/15 * * * *` UTC, grace period 5 min, max runtime 5 min, failure tolerance 1.
- Bieg 15:45 UTC (`wrangler tail`): `cron.exceeded-cpu-check-failed` z kodem `missing-token` oraz trzy razy „Sentry report not accepted” ze statusem 403. Przyczyny: `CLOUDFLARE_ANALYTICS_TOKEN` zapisany przez `wrangler secret put` bez terminala (pusta wartość, wrangler zgłosił „Success”), DSN o jeden znak krótszy niż poprawny.
- Poprawka: obie wartości zmierzone lokalnie przed wysłaniem (próbne zgłoszenie do Sentry HTTP 200, `/user/tokens/verify` w Cloudflare HTTP 200), potem przekazane do `wrangler secret put` przez stdin.
- Bieg 16:00 UTC: log `cron.exceeded-cpu-check` z wynikiem `none`, bez odrzuceń Sentry; w Sentry Crons check-in `ok` ze środowiska `production`.

## 5.8 Monitor dostępności (14.10.2026)

- Sentry Uptime: `GET https://lekomapa.pl/api/health`, środowisko `production`, co 5 minut, timeout 5 s, porażka po 2 kolejnych nieudanych sprawdzeniach (10 minut), asercje statusu `> 199` i `< 300`, zamknięcie po 1 udanym.
- Wymuszona porażka: URL tymczasowo zmieniony na `/api/health-test` (404) około 16:16 UTC; mail o awarii dotarł. URL przywrócony.
- Sentry ostrzega, że wyniki sprawdzeń dostępności mogą być przechowywane poza regionem UE. Przyjęte: `/api/health` nie zwraca żadnych danych, wynik to wyłącznie status i czas odpowiedzi.

## 5.10 Narzut CPU (14.10.2026)

Panel Cloudflare: Workers & Pages → lekomapa → Metrics → CPU Time, „All deployed versions”. Okna liczone od wdrożenia PR #101 (CI zakończone 13.10.2026 20:36:54 CEST).

| CPU Time | Przed (12.10.2026 20:30 – 13.10.2026 20:30) | Po (13.10.2026 20:38 – 14.10.2026 20:38) |
| -------- | ------------------------------------------- | ---------------------------------------- |
| P50      | 11,93 ms                                    | 3,34 ms                                  |
| P99      | 23,17 ms                                    | 8,39 ms                                  |

- Wynik: brak wzrostu. Próg z planu (wzrost P99 powyżej 10 ms) nieprzekroczony, decyzja niepotrzebna.
- Spadek nie oznacza przyspieszenia: okna różnią się składem ruchu. W oknie „po” jest ok. 96 uruchomień zadania 1102 (co 15 minut), krótkich i zaniżających percentyle; ruch jest mały (kilkaset wywołań na dobę). Wniosek ogranicza się do „narzutu nie widać”.
- W oknie „przed”: 4 wdrożenia z 12.10.2026 wieczorem (PR #98–#100).
- W oknie „po”: wdrożenie PR #102 (13.10.2026 21:54), 7 nowych wersji z `wrangler secret put` 14.10.2026 ok. 18:00 (bez zmiany kodu) i 6 wczytań Lighthouse z fazy 6.
