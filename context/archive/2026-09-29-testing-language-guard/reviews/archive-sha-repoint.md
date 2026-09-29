# Archive SHA repoint

## 2026-09-29

- **Target**: `origin/main` (base branch of PR #53), snapshot `23fbddb5919ac265c8ec75c54b188edf1e4d303e`
- **Integration commit**: `23fbddb` — feat(testing-language-guard): FR-012 language guard (test-plan phase 3) (#53)
- **PR**: https://github.com/krychaimago/lekomapa/pull/53 (merged as squash)
- **Evidence**: the PR commit list contains `b3eb0e0`, `6d8768c`, `341298b` and `a3e6ea2`; none of them is an ancestor of the target snapshot. The tree of `23fbddb` is identical to the PR head `a3e6ea2` (empty `git diff`), so the squash integrates the whole implementation covered by the rows below. `23fbddb` is an ancestor of the target snapshot.
- **Decision**: author approved "Zaktualizuj i archiwizuj" during `/10x-archive`.
- **Not repointed**: row 2.3 — its suffix is a CI run reference (`run 36608545879 (341298b)`), not a SHA suffix.

| Row ID | Old suffix | New SHA |
| ------ | ---------- | ------- |
| 1.1    | b3eb0e0    | 23fbddb |
| 1.2    | b3eb0e0    | 23fbddb |
| 1.3    | b3eb0e0    | 23fbddb |
| 1.4    | b3eb0e0    | 23fbddb |
| 1.5    | b3eb0e0    | 23fbddb |
| 1.6    | b3eb0e0    | 23fbddb |
| 2.1    | 6d8768c    | 23fbddb |
| 2.2    | 6d8768c    | 23fbddb |
| 2.4    | 6d8768c    | 23fbddb |
| 3.1    | 341298b    | 23fbddb |
| 3.2    | 341298b    | 23fbddb |
| 3.3    | 341298b    | 23fbddb |
| 3.4    | 341298b    | 23fbddb |

Total: 13 rows.
