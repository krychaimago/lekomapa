---
change_id: symptom-journal-entry
title: Symptom journal entry
status: archived
created: 2026-10-05
updated: 2026-10-05
archived_at: 2026-10-05T13:29:02Z
---

## Notes

<!-- Free-form notes for this change: links, ad-hoc context, decisions that don't belong in research/frame/plan. -->

### Okno korekty (Q-3, rozstrzygnięte 2026-10-05, issue #4)

- 24 h od chwili zapisu, zegarem serwera, nie od daty i godziny objawu.
- Usunięcie wpisu tylko w oknie korekty.
- Po zapisie i na liście: konkretna data i godzina końca okna („do jutra, 21:14”), wyliczona przez serwer.
  - Korekta 2026-10-05 (ręczna weryfikacja fazy 4): format „do jutra (06.10), godz. 21:14” / „do dziś (05.10), godz. 21:14”, inny dzień „23.10, godz. 21:14”. Samo „jutra” było niejednoznaczne przy północy. Na liście leków komunikat po dodaniu podaje nazwę leku, a każdy lek z otwartym oknem okresu ma własną linijkę „Dawkowanie możesz poprawić do …”.
- To samo okno dla leków i okresów dawkowania; warunek zdarzeniowy odpada. Ten plasterek podmienia zaślepkę `medication_correction_window_open()` i zamyka F6a z S-03.
- Do planu: od zapisu czego liczy się okno leku (lek, każdy okres osobno, data odstawienia z S-04); limit 14 dni wstecz przy zmianie dawki to osobna sprawa.
