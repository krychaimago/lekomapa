---
change_id: symptom-journal-entry
title: Symptom journal entry
status: new
created: 2026-10-05
updated: 2026-10-05
archived_at: null
---

## Notes

<!-- Free-form notes for this change: links, ad-hoc context, decisions that don't belong in research/frame/plan. -->

### Okno korekty (Q-3, rozstrzygnięte 2026-10-05, issue #4)

- 24 h od chwili zapisu, zegarem serwera, nie od daty i godziny objawu.
- Usunięcie wpisu tylko w oknie korekty.
- Po zapisie i na liście: konkretna data i godzina końca okna („do jutra, 21:14”), wyliczona przez serwer.
- To samo okno dla leków i okresów dawkowania; warunek zdarzeniowy odpada. Ten plasterek podmienia zaślepkę `medication_correction_window_open()` i zamyka F6a z S-03.
- Do planu: od zapisu czego liczy się okno leku (lek, każdy okres osobno, data odstawienia z S-04); limit 14 dni wstecz przy zmianie dawki to osobna sprawa.
