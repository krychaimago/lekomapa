# Archive SHA repoint

## 2026-09-29

- **Target**: `origin/main` (github.com/krychaimago/lekomapa), snapshot `e09263786619e54cf6154696eabe194a1d12b7f3`
- **Integration commit**: `e092637` Bramka SQL w CI — faza 1 (testing-sql-gate-in-ci) (#47)
- **PR**: https://github.com/krychaimago/lekomapa/pull/47 (merged as squash, base `main`)
- **Evidence**: the PR commit list contains `6d10a56`, `17fbd98`, `30d38d0`; none is an ancestor of the target snapshot (`git merge-base --is-ancestor` exit 1). The squash diff integrates the whole implementation: `scripts/db-checks.mjs`, its tests and probes, `supabase/tests/rls_checks.sql`, `supabase/tests/account_isolation_checks.sql`, `.github/workflows/ci.yml`, `README.md`, `package.json`.
- **Decision**: the author chose "Zaktualizuj i archiwizuj" in /10x-archive.

| Row ID | Old suffix (resolved OID)                              | New SHA   |
| ------ | ------------------------------------------------------ | --------- |
| 1.1    | `6d10a56` (`6d10a56932a08da22d0016ccde8fd648b4f90906`) | `e092637` |
| 1.2    | `6d10a56` (`6d10a56932a08da22d0016ccde8fd648b4f90906`) | `e092637` |
| 1.3    | `6d10a56` (`6d10a56932a08da22d0016ccde8fd648b4f90906`) | `e092637` |
| 1.4    | `6d10a56` (`6d10a56932a08da22d0016ccde8fd648b4f90906`) | `e092637` |
| 1.5    | `6d10a56` (`6d10a56932a08da22d0016ccde8fd648b4f90906`) | `e092637` |
| 1.6    | `6d10a56` (`6d10a56932a08da22d0016ccde8fd648b4f90906`) | `e092637` |
| 1.7    | `6d10a56` (`6d10a56932a08da22d0016ccde8fd648b4f90906`) | `e092637` |
| 1.8    | `6d10a56` (`6d10a56932a08da22d0016ccde8fd648b4f90906`) | `e092637` |
| 2.1    | `17fbd98` (`17fbd98bd26511e9b240aee4db7daad33072694b`) | `e092637` |
| 2.2    | `17fbd98` (`17fbd98bd26511e9b240aee4db7daad33072694b`) | `e092637` |
| 2.3    | `17fbd98` (`17fbd98bd26511e9b240aee4db7daad33072694b`) | `e092637` |
| 2.4    | `17fbd98` (`17fbd98bd26511e9b240aee4db7daad33072694b`) | `e092637` |
| 2.5    | `17fbd98` (`17fbd98bd26511e9b240aee4db7daad33072694b`) | `e092637` |
| 3.1    | `30d38d0` (`30d38d06e4244cf7fd4b47fdede8ee21698e3a31`) | `e092637` |
| 3.2    | `30d38d0` (`30d38d06e4244cf7fd4b47fdede8ee21698e3a31`) | `e092637` |
| 3.3    | `30d38d0` (`30d38d06e4244cf7fd4b47fdede8ee21698e3a31`) | `e092637` |
| 3.4    | `30d38d0` (`30d38d06e4244cf7fd4b47fdede8ee21698e3a31`) | `e092637` |
| 3.5    | `30d38d0` (`30d38d06e4244cf7fd4b47fdede8ee21698e3a31`) | `e092637` |

Total: 18 rows repointed.
