# Archive SHA repoint

## 2026-09-27

- **Target**: `origin` / `main`, snapshot `d3e564f325bee1ea21016cd80184e9e2c3eb0992` (fetched 2026-09-27)
- **Integration commit**: `d3e564f325bee1ea21016cd80184e9e2c3eb0992` — F-04: Wspólna warstwa wizualna i szkielet wnętrza (app-shell-visual-foundation) (#41)
- **PR**: https://github.com/krychaimago/lekomapa/pull/41 (MERGED, base `main`, squash merge — single parent `1a9d105`)
- **Evidence**: PR commit list contains all four old SHAs (p1–p4) plus epilogue, triage fix and merge-from-main. Tree of `d3e564f` is identical to feature tip `5aee2d0` (`git diff 5aee2d0 d3e564f` empty); 29 files changed vs. parent, matching the PR's 29 files. Old SHAs are not ancestors of the target (`merge-base --is-ancestor` exit 1, full non-shallow repo); `d3e564f` is the target tip.
- **Decision**: user chose "Zaktualizuj i archiwizuj" on 2026-09-27.

| Row ID   | Old suffix (resolved OID)                              | New SHA   |
| -------- | ------------------------------------------------------ | --------- |
| 1.1–1.7  | `e6af4e8` (`e6af4e8f1b484de7e67e8d2f56c5c4938a5c75d6`) | `d3e564f` |
| 2.1–2.7  | `5c65404` (`5c65404df17aa2a80ed2a18b6ae00f13e4b93a98`) | `d3e564f` |
| 3.1–3.12 | `aad73e8` (`aad73e8a625483db955184006d050b70688ddf4e`) | `d3e564f` |
| 4.1–4.7  | `c4baa89` (`c4baa89335dddadb7646d419230be1fc5b5d0af5`) | `d3e564f` |

Total rows repointed: 33.
