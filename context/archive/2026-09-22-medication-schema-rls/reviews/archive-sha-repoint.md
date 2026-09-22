# SHA repoint before archive

- **Date**: 2026-09-22
- **Target**: `origin/main` (remote `origin`, branch `main`), snapshot OID `40bc4eda6425a2fa3d5e76c3215d1be6cfd9b336`
- **Integration commit**: `f25081ca36fc0309705bb2582605b6ec81021f9c` — "F-01: schemat leków i okresów dawkowania z RLS (#26)"
- **Association**: PR https://github.com/krychaimago/lekomapa/pull/26 (MERGED, base `main`, squash). The PR commit list contains exactly the three original SHAs; the squash commit is a verified ancestor of the refreshed target snapshot.
- **Evidence / scope**: the squash integrates all three implementation phases — migration + RLS (phase 1), entity types (phase 2), smoke isolation path (phase 3).
- **User decision**: "Zaktualizuj i archiwizuj" (update and archive), confirmed explicitly before any edit.
- **Affected rows**: 15

| Row | Old suffix (resolved OID)                            | New SHA   |
| --- | ---------------------------------------------------- | --------- |
| 1.1 | `2e7b2bc` (2e7b2bc18e4793ad2fe268f5ab55ebad3df53d94) | `f25081c` |
| 1.2 | `2e7b2bc` (2e7b2bc18e4793ad2fe268f5ab55ebad3df53d94) | `f25081c` |
| 1.3 | `2e7b2bc` (2e7b2bc18e4793ad2fe268f5ab55ebad3df53d94) | `f25081c` |
| 1.4 | `2e7b2bc` (2e7b2bc18e4793ad2fe268f5ab55ebad3df53d94) | `f25081c` |
| 1.5 | `2e7b2bc` (2e7b2bc18e4793ad2fe268f5ab55ebad3df53d94) | `f25081c` |
| 1.6 | `2e7b2bc` (2e7b2bc18e4793ad2fe268f5ab55ebad3df53d94) | `f25081c` |
| 1.7 | `2e7b2bc` (2e7b2bc18e4793ad2fe268f5ab55ebad3df53d94) | `f25081c` |
| 1.8 | `2e7b2bc` (2e7b2bc18e4793ad2fe268f5ab55ebad3df53d94) | `f25081c` |
| 2.1 | `0dfd7fc` (0dfd7fcc14ca83f5dec7829ff1d9f628d1040822) | `f25081c` |
| 2.2 | `0dfd7fc` (0dfd7fcc14ca83f5dec7829ff1d9f628d1040822) | `f25081c` |
| 2.3 | `0dfd7fc` (0dfd7fcc14ca83f5dec7829ff1d9f628d1040822) | `f25081c` |
| 3.1 | `a518c06` (a518c067cde011d28837745cf5373a780e6f85ac) | `f25081c` |
| 3.2 | `a518c06` (a518c067cde011d28837745cf5373a780e6f85ac) | `f25081c` |
| 3.3 | `a518c06` (a518c067cde011d28837745cf5373a780e6f85ac) | `f25081c` |
| 3.4 | `a518c06` (a518c067cde011d28837745cf5373a780e6f85ac) | `f25081c` |

This note is provenance for the archive move. It is not an implementation review and does not count as review coverage.
