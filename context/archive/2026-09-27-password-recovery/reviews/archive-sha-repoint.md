# Archive SHA repoint: password-recovery

- **Date**: 2026-10-12
- **Target**: `origin/main` (base branch of PR #45), snapshot `9f234ba52fef49ce6a72ddf4432b0725103e5a88`
- **Integration commit**: `b0b52db` — "S-10: Odzyskiwanie dostępu przez ustawienie nowego hasła (password-recovery) (#45)"
- **PR**: https://github.com/krychaimago/lekomapa/pull/45 (merged by squash into `main`)
- **Evidence**: the PR #45 commit list contains `f97d255`, `54b175f`, `8d76504`. None of them is an ancestor of the target snapshot; `b0b52db` is. Every file touched by the three phase commits is in `b0b52db`, and `git diff 5f46c59 b0b52db -- src scripts supabase .github` (PR head vs squash) is empty.
- **Decision**: the author chose "Zaktualizuj i archiwizuj" on 2026-10-12.
- **Left unchanged**: 3.7 and 3.8 (`96b18ea`, already in `main` via PR #92).

| Row      | Old suffix (resolved OID)                              | New SHA   |
| -------- | ------------------------------------------------------ | --------- |
| 1.1–1.8  | `f97d255` (`f97d2554c0d660725be120c4aa72ce36f8aa9d75`) | `b0b52db` |
| 2.1–2.10 | `54b175f` (`54b175f5ed710aa57b6078f2aaff3877dc6281ef`) | `b0b52db` |
| 3.1–3.6  | `8d76504` (`8d76504321d74b3295a2c2e49507d1fb00e4a240`) | `b0b52db` |

Rows repointed: 24.
