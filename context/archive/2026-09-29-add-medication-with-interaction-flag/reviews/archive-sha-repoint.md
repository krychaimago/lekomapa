# Archive SHA repoint

## 2026-10-01

- **Target**: `origin/main` (remote default branch, PR base) — snapshot `d1c4ad0bafb8743d3766982864abb0e3169820c1`
- **Integration commit**: `d1c4ad0` — feat(add-medication-with-interaction-flag): S-02 dodanie leku ze znacznikiem możliwej kolizji (#56)
- **PR**: https://github.com/krychaimago/lekomapa/pull/56 (MERGED, squash, base `main`)
- **Evidence**: all six Progress SHAs appear in the PR #56 commit list; none is an ancestor of the target snapshot (`merge-base --is-ancestor` exit 1, full non-shallow history). `d1c4ad0` is the single-parent squash of PR #56 and is in target history (exit 0). PR scope covers phases 1–6 plus post-review fixes.
- **Decision**: author chose "Zaktualizuj i archiwizuj" in /10x-archive.
- **Rows repointed**: 37

| Row IDs | Old suffix (resolved OID)                            | New SHA   |
| ------- | ---------------------------------------------------- | --------- |
| 1.1–1.5 | `da38bed` (da38bed7219f76749dd6e55bf04812efc99ecd6e) | `d1c4ad0` |
| 2.1–2.5 | `4b37d99` (4b37d997ae4d99cd8c7ed5cd8393954c9c29a2f5) | `d1c4ad0` |
| 3.1–3.9 | `d251cc4` (d251cc4f5006de6673d9fcde7df69fec7f586ab5) | `d1c4ad0` |
| 4.1–4.9 | `106eb84` (106eb84560441f66faa9b0c123d89f3a8a7a19e3) | `d1c4ad0` |
| 5.1–5.4 | `0cbf35d` (0cbf35df8326f9108101422946ea04da60c5506d) | `d1c4ad0` |
| 6.1–6.5 | `78a61e0` (78a61e01922dfc679f65bb0cb4d7317468bf6a39) | `d1c4ad0` |
