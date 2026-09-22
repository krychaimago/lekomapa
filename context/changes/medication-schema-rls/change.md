---
change_id: medication-schema-rls
title: Schemat leków i okresów dawkowania z RLS
status: impl_reviewed
created: 2026-09-22
updated: 2026-09-22
archived_at: null
---

## Notes

F-01 z `context/foundation/roadmap.md` (issue #9). Pierwsza migracja z tabelami leku i okresu dawkowania, RLS włączone w tej samej migracji z politykami per-operacja i per-rola, typy encji w `src/types.ts`, plus sprawdzona ścieżka weryfikacji izolacji — drugie konto nie widzi cudzych wierszy. Odblokowuje S-02 (gwiazda przewodnia) i S-05; ustala konwencję migracji i RLS dla całego produktu. PRD refs: FR-003, FR-004, izolacja danych per-konto.
