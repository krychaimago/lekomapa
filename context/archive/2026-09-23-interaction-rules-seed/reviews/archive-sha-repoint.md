# Archive SHA repoint

## 2026-09-26

- **Target**: `origin/main` (base branch of PR #30, `git ls-remote --symref origin HEAD` → `refs/heads/main`), snapshot `d193d0755b5526f3dd7ed8727defb2821aa9c2c6`
- **Integration commit**: `d193d07` — F-02: pary kolizji na grupach ATC i rejestr leków (interaction-rules-seed) (#30)
- **PR**: https://github.com/krychaimago/lekomapa/pull/30 (MERGED, squash)
- **Evidence**: the PR commit list contains all four phase SHAs (`9861dfa`, `60af365`, `8a52fd4`, `7876683`) plus `2010deb` and `fad5390`. None of the four is an ancestor of the target (`merge-base --is-ancestor` exit 1, repository not shallow). `d193d07` is in the target history (exit 0), and `git diff d193d07 fad5390` is empty, so the squash tree equals the PR head that includes every phase commit.
- **Decision**: the author chose "Zaktualizuj i archiwizuj" on 2026-09-26.
- **Not repointed**: row 4.7. Its SHA `7876683` is followed by a note added during impl-review triage, so the row does not end in a SHA suffix.

| Row | Old suffix (resolved OID)                          | New SHA |
| --- | -------------------------------------------------- | ------- |
| 1.1 | 9861dfa (9861dfa2ef44ae926f9bcbfaf00309e5e3b39d2b) | d193d07 |
| 1.2 | 9861dfa (9861dfa2ef44ae926f9bcbfaf00309e5e3b39d2b) | d193d07 |
| 1.3 | 9861dfa (9861dfa2ef44ae926f9bcbfaf00309e5e3b39d2b) | d193d07 |
| 1.4 | 9861dfa (9861dfa2ef44ae926f9bcbfaf00309e5e3b39d2b) | d193d07 |
| 1.7 | 9861dfa (9861dfa2ef44ae926f9bcbfaf00309e5e3b39d2b) | d193d07 |
| 1.8 | 9861dfa (9861dfa2ef44ae926f9bcbfaf00309e5e3b39d2b) | d193d07 |
| 1.9 | 9861dfa (9861dfa2ef44ae926f9bcbfaf00309e5e3b39d2b) | d193d07 |
| 2.1 | 60af365 (60af365204bc49e3af9f48f8bd4035d85fc0579f) | d193d07 |
| 2.2 | 60af365 (60af365204bc49e3af9f48f8bd4035d85fc0579f) | d193d07 |
| 2.3 | 60af365 (60af365204bc49e3af9f48f8bd4035d85fc0579f) | d193d07 |
| 2.4 | 60af365 (60af365204bc49e3af9f48f8bd4035d85fc0579f) | d193d07 |
| 2.5 | 60af365 (60af365204bc49e3af9f48f8bd4035d85fc0579f) | d193d07 |
| 3.1 | 8a52fd4 (8a52fd4a6d0317552e5b0f89a2c4f3f29f728c43) | d193d07 |
| 3.2 | 8a52fd4 (8a52fd4a6d0317552e5b0f89a2c4f3f29f728c43) | d193d07 |
| 3.3 | 8a52fd4 (8a52fd4a6d0317552e5b0f89a2c4f3f29f728c43) | d193d07 |
| 3.4 | 8a52fd4 (8a52fd4a6d0317552e5b0f89a2c4f3f29f728c43) | d193d07 |
| 3.5 | 8a52fd4 (8a52fd4a6d0317552e5b0f89a2c4f3f29f728c43) | d193d07 |
| 3.6 | 8a52fd4 (8a52fd4a6d0317552e5b0f89a2c4f3f29f728c43) | d193d07 |
| 4.1 | 7876683 (78766838c97f26f3ce98f1d924faba277cf55118) | d193d07 |
| 4.2 | 7876683 (78766838c97f26f3ce98f1d924faba277cf55118) | d193d07 |
| 4.3 | 7876683 (78766838c97f26f3ce98f1d924faba277cf55118) | d193d07 |
| 4.4 | 7876683 (78766838c97f26f3ce98f1d924faba277cf55118) | d193d07 |
| 4.5 | 7876683 (78766838c97f26f3ce98f1d924faba277cf55118) | d193d07 |
| 4.6 | 7876683 (78766838c97f26f3ce98f1d924faba277cf55118) | d193d07 |
| 4.8 | 7876683 (78766838c97f26f3ce98f1d924faba277cf55118) | d193d07 |
| 4.9 | 7876683 (78766838c97f26f3ce98f1d924faba277cf55118) | d193d07 |

Rows repointed: 26.
