---
change_id: medication-names-out-of-urls
title: Nazwy leków i substancji poza adresami URL (dług po S-02)
status: impl_reviewed
created: 2026-10-12
updated: 2026-10-12
archived_at: null
---

## Notes

Źródło: GitHub issue #57 (labels: `bug`, `stream:A-leki`), finding F6 w `context/archive/2026-09-29-add-medication-with-interaction-flag/reviews/impl-review.md`.

Reguła: `context/foundation/lessons.md` → „Żadna nazwa leku ani dawka w adresie URL”.

Miejsca wskazane w issue (stan z S-02 — zweryfikować w kodzie przed planem):

1. Wyszukiwarka `/leki/nowy`: formularz GET, `?q=` (`src/components/medications/RegistrySearch.tsx`)
2. Linki do wariantów, `?nazwa=` (`src/pages/leki/nowy.astro`, `RegistrySearch.tsx`)
3. Przekierowanie po błędzie przy zapisie z rejestru, `?nazwa=` (`src/pages/api/medications/index.ts`)
4. Przekierowania z formularza z ulotki: `?nazwa=`, `?substancja=`, `?niedopasowana=` (`src/pages/api/medications/index.ts`)
5. Linki „podobne substancje” (`src/pages/leki/nowy/z-ulotki.astro`)
6. Podpowiedzi: `fetch` do `/api/registry/search?q=` (`src/components/hooks/useRegistrySuggestions.ts`)

Kierunek z issue:

- wyszukiwanie i podpowiedzi przez POST (nazwa w treści żądania),
- wybór wariantu po identyfikatorze produktu (`?wariant=<uuid>`), nie po nazwie,
- stan formularza po błędzie w krótkotrwałym ciasteczku HttpOnly,
- test albo krok smoke odrzucający każdy URL z nazwą leku,
- poprawić fałszywy komentarz w `src/pages/api/medications/index.ts` („health data does not travel in URLs”).
