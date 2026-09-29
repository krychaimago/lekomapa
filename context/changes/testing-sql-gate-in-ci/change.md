---
change_id: testing-sql-gate-in-ci
title: Bramka SQL w CI — sprawdzenia RLS i niezmienników historii przed merge'em
status: implementing
created: 2026-09-28
updated: 2026-09-29
archived_at: null
---

## Notes

Open a change folder for rollout Phase 1 of context/foundation/test-plan.md: "Bramka SQL w CI". Risks covered: #4 (regresja RLS/niezmiennika trafia na produkcję, bo sprawdzenia SQL nie biegną przed merge'em), #1 (wyciek między kontami), #3 (migracja łamie nienaruszalność historii). Test types planned: CI gate + SQL. Risk response intent: - #4: PR łamiący RLS albo niezmiennik nie przechodzi CI, a błąd wskazuje złamane sprawdzenie; bramka nie może kończyć się zawsze kodem 0 ani iść do bazy produkcyjnej. - #1: konto B nie czyta, nie zmienia i nie usuwa wierszy konta A w każdej tabeli z danymi użytkownika, per operacja; "brak błędu" nie jest dowodem blokady. - #3: po odtworzeniu migracji zmiana dawki zamyka okres, a rdzeń po oknie korekty jest nie do zmiany; blokada rozpoznawana po nazwanym błędzie, nie `when others`. After creating the folder, follow the downstream continuation rule.
