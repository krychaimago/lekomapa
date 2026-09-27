# Archive SHA repoint — symptom-catalog-seed

## 2026-09-27

- **Target**: `origin/main` (https://github.com/krychaimago/lekomapa.git), snapshot `62ecf7b4736c19e2c28b1848badf52bb728dcb63`
- **Integration commit**: `62ecf7b` — F-03: zamknięta lista objawów (symptom-catalog-seed) (#40)
- **PR**: https://github.com/krychaimago/lekomapa/pull/40 (merged, squash, base `main`)
- **Evidence**: PR commit list contains 83b5036, a05555e, 39a247d, 02833d7, eabb17b. Neither 83b5036 nor 39a247d is an ancestor of the target (`merge-base --is-ancestor` exit 1, repository not shallow). `git diff eabb17b 62ecf7b` is empty — the squash commit's tree is identical to the PR head, and its diff against its parent covers the schema and seed migrations, `supabase/tests/rls_checks.sql`, `scripts/smoke.mjs`, `src/types.ts` and the change folder.
- **Decision**: user chose "Zaktualizuj i archiwizuj" in /10x-archive.

| Row ID | Old suffix (resolved OID)                          | New SHA |
| ------ | -------------------------------------------------- | ------- |
| 1.1    | 83b5036 (83b5036e5ddd749836d01e1a2e2fcbde129f88e3) | 62ecf7b |
| 1.2    | 83b5036 (83b5036e5ddd749836d01e1a2e2fcbde129f88e3) | 62ecf7b |
| 1.3    | 83b5036 (83b5036e5ddd749836d01e1a2e2fcbde129f88e3) | 62ecf7b |
| 1.4    | 83b5036 (83b5036e5ddd749836d01e1a2e2fcbde129f88e3) | 62ecf7b |
| 1.5    | 83b5036 (83b5036e5ddd749836d01e1a2e2fcbde129f88e3) | 62ecf7b |
| 2.1    | 39a247d (39a247da136897dfd29d6dc248a69c6e1e2699ce) | 62ecf7b |
| 2.2    | 39a247d (39a247da136897dfd29d6dc248a69c6e1e2699ce) | 62ecf7b |
| 2.3    | 39a247d (39a247da136897dfd29d6dc248a69c6e1e2699ce) | 62ecf7b |
| 2.4    | 39a247d (39a247da136897dfd29d6dc248a69c6e1e2699ce) | 62ecf7b |
| 2.5    | 39a247d (39a247da136897dfd29d6dc248a69c6e1e2699ce) | 62ecf7b |
| 2.6    | 39a247d (39a247da136897dfd29d6dc248a69c6e1e2699ce) | 62ecf7b |
| 2.7    | 39a247d (39a247da136897dfd29d6dc248a69c6e1e2699ce) | 62ecf7b |

Total rows repointed: 12.
