# Ikona lekomapy — Plan Brief

> Full plan: `context/changes/app-icon/plan.md`

## What & Why

S-04 z roadmapy (issue #107, MS-09): lekomapa dostaje rozpoznawalny znak. Dziś karta przeglądarki ma favicon ze startera, nazwa w aplikacji to sam tekst, a skrót na ekranie telefonu nie ma własnej ikony.

## Starting Point

- `public/favicon.png` (32×32) ze startera, podpięty w `src/layouts/Layout.astro:32`.
- Nazwa „lekomapa” jako tekst: `AppLayout.astro:27` (pasek boczny), `:60` (nagłówek na telefonie), `AuthSpreadLayout.astro:20` (6 ekranów wejściowych).
- Brak `apple-touch-icon` i `manifest`.

## Desired End State

- Karta przeglądarki: jasny znak na ciemnozielonym kwadracie, stały przy każdym motywie przeglądarki.
- Znak obok nazwy na pasku bocznym, w nagłówku na telefonie i na ekranach logowania, w kolorach z tokenów (zmienia się z trybem).
- Skrót na ekranie iPhone'a i Androida z ikoną i podpisem „lekomapa”, otwiera kartę przeglądarki.

## Key Decisions Made

| Decision                             | Choice                                                                                         | Why (1 sentence)                                                          |
| ------------------------------------ | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Źródło znaku                         | 2–3 propozycje agenta, wybór autorki                                                           | Decyzja należy do autorki, a koszt i termin 04.11.2026 zostają bezpieczne |
| Kolory ikony w karcie i na telefonie | Zielone tło marki (`--primary`), jasny znak (`--primary-foreground`), wartości z trybu jasnego | Jasny znak odcina się od tła na jasnym i ciemnym pasku kart               |
| Miejsca znaku z nazwą                | Pasek boczny, nagłówek na telefonie, ekrany logowania; jeden komponent                         | Ten sam znak od pierwszego ekranu; zmiana to jedna edycja                 |
| Zachowanie skrótu na telefonie       | Otwiera kartę przeglądarki (`display: browser`)                                                | Bez zmian w logowaniu, odnośnikach z maili i przycisku wstecz             |
| Źródło kształtu                      | Jeden moduł `src/lib/brand-mark.ts` bez kolorów                                                | Pliki w `public/` i komponent nie mogą się rozjechać                      |
| Generowanie PNG                      | Skrypt `npm run icons` na `sharp`, pliki w repozytorium                                        | Powtarzalnie, bez ręcznej grafiki; test pilnuje aktualności               |

## Scope

**In scope:**

- Strona porównawcza 2–3 propozycji i zapis wyboru
- `favicon.svg`, `favicon.png`, `apple-touch-icon.png`, `icon-192/512.png`, `manifest.webmanifest`
- Linki w `Layout.astro`, nazwa pod ikoną na iPhonie
- Komponent `BrandName.astro` w trzech miejscach
- Test plików ikon i manifestu

**Out of scope:**

- Tryb „jak osobna aplikacja”, praca offline
- Ikona w karcie zmieniająca się z trybem
- `theme-color`, projekt zewnętrzny, sprzątanie `template.png`

## Architecture / Approach

`brand-mark.ts` (sam kształt) → skrypt `scripts/icons/generate-icons.mjs` dokłada stałe kolory z jasnych tokenów w `global.css` i zapisuje pliki do `public/`. Ten sam kształt rysuje `BrandName.astro` klasami tokenów. Test porównuje `public/favicon.svg` z tym, co skrypt wygenerowałby teraz.

## Phases at a Glance

| Phase                            | What it delivers                                | Key risk                                                               |
| -------------------------------- | ----------------------------------------------- | ---------------------------------------------------------------------- |
| 1. Propozycje znaku              | Strona porównawcza, wybór autorki w `change.md` | Znak nieczytelny przy 16 px albo kojarzący się z ostrzeżeniem (FR-012) |
| 2. Ikona w karcie i na telefonie | Pliki ikon, manifest, linki, test               | Sprawdzenie na telefonie może wymagać wdrożenia                        |
| 3. Znak obok nazwy               | `BrandName.astro` w 3 miejscach                 | Nagłówek na telefonie za ciasny na znak + nazwę + przełącznik          |

**Prerequisites:** brak.
**Estimated effort:** ~2 sesje w 3 fazach, plus czas autorki na wybór znaku.

## Open Risks & Assumptions

- `sharp` jest zależnością pośrednią (przez Astro). Gdyby zniknął, skrypt przestanie działać, ale wygenerowane pliki zostają w repozytorium.
- Sprawdzenie na telefonie może przejść do weryfikacji po merge'u (zaznaczone w PR).
- Przeglądarki trzymają stary favicon w pamięci — po wdrożeniu twarde odświeżenie.

## Success Criteria (Summary)

- Autorka rozpoznaje lekomapę po znaku w karcie, w aplikacji i na ekranie telefonu.
- Znak w aplikacji zgadza się z trybem jasnym i ciemnym, a ikona w karcie jest wyraźna przy obu motywach przeglądarki.
- `npm test` pada, gdy pliki ikon rozjadą się z kształtem albo tokenami.
