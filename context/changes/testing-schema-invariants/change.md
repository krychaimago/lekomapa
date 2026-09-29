---
change_id: testing-schema-invariants
title: Niezmienniki schematu dla każdej tabeli (rollout testów, faza 2)
status: impl_reviewed
created: 2026-09-29
updated: 2026-09-29
archived_at: null
---

## Notes

Open a change folder for rollout Phase 2 of context/foundation/test-plan.md: "Niezmienniki schematu dla każdej tabeli".
Risks covered: #1 (izolacja per konto), #3 (nienaruszalność historii), #6 (dane zostają po usunięciu konta). Test types planned: integration (SQL na katalogu bazy).
Risk response intent:

- #1: konto B nie czyta, nie zmienia i nie usuwa wierszy konta A w każdej tabeli z danymi użytkownika, dla każdej operacji osobno; nie przyjmuj „jest RLS, więc izolacja działa”; unikaj testu z jednym kontem i „brak błędu” jako dowodu blokady.
- #3: po każdej migracji zmiana dawki zamyka okres i otwiera nowy, rdzeń wpisu po oknie korekty nie do zmiany ani usunięcia, także przez rodzica; unikaj `exception when others`.
- #6: każda tabela z danymi użytkownika jest usuwana razem z kontem; lista tabel wyprowadzona z katalogu bazy, nie wpisana ręcznie.
  Cel fazy: nowa tabela bez RLS per operacja lub bez usuwania razem z kontem wywraca bramkę, zanim S-02 i S-05 dodadzą tabele.
