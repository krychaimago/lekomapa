# Archive SHA repoint

## 2026-09-29

- **Target**: `origin/main` @ `cf920a9546bd617a6a426b6cb15ea6018fd6a52e` (freshly fetched)
- **Integration commit**: `cf920a9` feat(testing-schema-invariants): schema invariants for every table (#51)
- **PR**: https://github.com/krychaimago/lekomapa/pull/51 (merged, base `main`, squash)
- **Evidence**: the PR commit list contains `4a0f7c3`, `880e870`, `6eb3b5f` (plus `c465434`, `69895fe`); the tree of `cf920a9` is identical to the PR head `69895fe` (`git diff 69895fe cf920a9` empty); `cf920a9` is the only commit on `main` since the PR base `823b3d0`. The original commits are not ancestors of `main` (`git merge-base --is-ancestor` exit 1, repository not shallow).
- **Decision**: the author chose "Zaktualizuj i archiwizuj" in `/10x-archive`.

| Row ID                                 | Old suffix (resolved OID)                            | New SHA   |
| -------------------------------------- | ---------------------------------------------------- | --------- |
| 1.1, 1.2, 1.3, 1.4, 1.5, 1.7, 1.8      | `4a0f7c3` (4a0f7c3f9a4c069ab266be937bba67049e2db975) | `cf920a9` |
| 2.1, 2.2, 2.3, 2.4, 2.5, 2.7, 2.8, 2.9 | `880e870` (880e87047f054db00b0dc5f46d38b3e8bdc9e518) | `cf920a9` |
| 3.1, 3.2, 3.3, 3.4                     | `6eb3b5f` (6eb3b5f238eef4d4dbfa6ba66f5ac20f153809c3) | `cf920a9` |

Rows repointed: 19. Rows 1.6, 1.9, 1.10 and 2.6 have no SHA (CI and production checks) and were left unchanged.
