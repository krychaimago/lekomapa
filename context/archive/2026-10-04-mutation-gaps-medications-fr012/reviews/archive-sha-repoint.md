# Archive SHA repoint

## 2026-10-04

- **Target**: `origin/main`, snapshot `46c8b245e73ca64c9f736df01941cfc7f2988b69` (fetched before archive)
- **Integration commit**: `46c8b24` — chore: luki w testach wskazane przez Strykera — leki i filtr FR-012 (#62)
- **PR**: https://github.com/krychaimago/lekomapa/pull/62 (merged, squash, base `main`)
- **Evidence**: PR #62 commit list contains b72090b, 67d070e, 0fdb5cd, 47f464b, 28b1197; none is an ancestor of the target snapshot. `git diff 28b1197 46c8b24` is empty — the squash integrates the whole branch.
- **Decision**: author chose "Zaktualizuj i archiwizuj" (2026-10-04).
- **Not repointed**: rows 3.1–3.4 end with `— 0fdb5cd, 47f464b` (two SHAs, non-standard suffix); left unchanged.

| Row | Old suffix (resolved OID)                          | New SHA |
| --- | -------------------------------------------------- | ------- |
| 1.1 | b72090b (b72090bdffd2e67aa351c8a61db58b8c87124ad9) | 46c8b24 |
| 1.2 | b72090b (b72090bdffd2e67aa351c8a61db58b8c87124ad9) | 46c8b24 |
| 1.3 | b72090b (b72090bdffd2e67aa351c8a61db58b8c87124ad9) | 46c8b24 |
| 1.4 | b72090b (b72090bdffd2e67aa351c8a61db58b8c87124ad9) | 46c8b24 |
| 1.5 | b72090b (b72090bdffd2e67aa351c8a61db58b8c87124ad9) | 46c8b24 |
| 2.1 | 67d070e (67d070ee5bbfd656de60547bded57f75f78ee1a0) | 46c8b24 |
| 2.2 | 67d070e (67d070ee5bbfd656de60547bded57f75f78ee1a0) | 46c8b24 |
| 2.3 | 67d070e (67d070ee5bbfd656de60547bded57f75f78ee1a0) | 46c8b24 |
| 2.4 | 67d070e (67d070ee5bbfd656de60547bded57f75f78ee1a0) | 46c8b24 |
| 2.5 | 67d070e (67d070ee5bbfd656de60547bded57f75f78ee1a0) | 46c8b24 |

Total: 10 rows.
