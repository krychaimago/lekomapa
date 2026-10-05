---
change_id: dosage-period-history
title: Historia okresów dawkowania — zmiana dawki zamyka stary okres i otwiera nowy
status: impl_reviewed
created: 2026-10-04
updated: 2026-10-05
archived_at: null
---

## Notes

<!-- Free-form notes for this change: links, ad-hoc context, decisions that don't belong in research/frame/plan. -->

### Pomiar wariantów w rejestrze (faza 2, 2026-10-04, lokalna baza po `db reset`)

- Skład porównywany jak w `change_dosage`: zbiór kodów ATC + zbiór nazw substancji bez kodu (bez wielkości liter i spacji na brzegach).
- 3273 produkty, 1095 nazw.
- 686 nazw ma więcej niż jeden wariant.
- Tylko 1 nazwa ma warianty o różnym składzie: **Sartesta**.
  - 5 mg + 80 mg, 5 mg + 160 mg, 10 mg + 160 mg: amlodypina + walsartan (C08CA01, C09CA03).
  - 24 mg + 26 mg, 49 mg + 51 mg, 97 mg + 103 mg: walsartan (C09CA03) + sakubitryl bez kodu.
- Wniosek: reguła „inny skład → nowy lek” (`DP005`) zadziała w praktyce rzadko — przy przejściu między tymi dwiema grupami Sartesty. Wynik nie zmienia decyzji.
- Ten sam wynik przy porównaniu surowych nazw substancji (z wielkością liter).

### Kody błędów `change_dosage` przez PostgREST (faza 4, 2026-10-04, lokalna baza, `supabase-js`)

- `DP001`, `DP002`, `DP003`, `DP004`, `DP005`, `DP007`: HTTP 400, `error.code` = własny SQLSTATE, komunikat z funkcji. Mapowanie w trasie po `error.code` działa.
- `DP006` niezmierzony bezpośrednio (brak drogi do leku bez trwającego okresu przez API). Ta sama klasa kodu co pozostałe `DP00x`, więc oczekiwane HTTP 400 z `code = "DP006"`.
- Pusta dawka: HTTP 400, `code = "23514"` (`dosage_periods_dose_text_check`). Trasa odrzuca pustą dawkę wcześniej przez zod.
- Bez sesji (klient z kluczem publicznym): HTTP 401, `code = "42501"` (brak `execute` dla `anon`). Do `28000` w funkcji nie dochodzi. Trasa i tak odpowiada 401 przed RPC.
- **`P0002` nie dociera jako kod.** PostgREST zwraca dla `P0002` HTTP 500. Lokalny Kong podmienia treść odpowiedzi 500 z polskimi znakami na tekst `Something went wrong`, więc `supabase-js` dostaje `error.code = undefined`. Zmierzone sondą: `P0002` + komunikat ASCII → JSON z kodem; `P0002` + „liście” → `Something went wrong`; `DP003` z polskimi znakami → JSON z kodem (HTTP 400).
  - Skutek: cudzy lub nieistniejący lek kończy się w trasie kluczem `generic`, nie `medicationNotFound`. Zachowanie produkcji niezmierzone.
  - Ten sam mechanizm dotyczy `P0002` z `add_medication_from_registry` / `add_medication_from_leaflet` (S-02).
  - Na marginesie: lokalny Kong miał zepsuty resolver DNS (`could not reschedule DNS resolver timer`) — restart kontenerów `rest` i `kong` nie zmienił wyniku pomiaru.
