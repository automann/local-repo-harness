# Local-only VCS isolation implementation notes

## Scope

- Added a local-only VCS boundary for project-scoped installs so downstream
  repos can keep local-repo-harness runtime, skills, hook adapters, MCP config,
  and generated workflow state out of product Git history by default.
- Added `bootstrap/adopt --vcs-scope <local|tracked>` with project-scoped
  installs defaulting to `local` and self-host/source mode defaulting to
  `tracked`.
- Added `local-repo-harness vcs audit` and `local-repo-harness vcs cleanup`
  for read-only proof and safe index cleanup. Cleanup only runs
  `git rm --cached` for recognized managed paths and leaves files on disk.
- Added policy, manifest, status, doctor, workflow-contract, README, and
  QUICK_START coverage for the path-scope versus VCS-scope distinction.

## Verification Log

- `bun test tests/cli/vcs-local-only.test.ts --timeout 60000 --max-concurrency 4`
  passed.
- `bun test tests/cli/bootstrap.test.ts tests/cli/init.test.ts tests/cli/doctor.test.ts tests/cli/vcs-local-only.test.ts --timeout 60000 --max-concurrency 4`
  passed.
- `bun test tests/migration-script.test.ts tests/create-project-dirs.runtime.test.ts tests/scaffold-parity.test.ts --timeout 60000 --max-concurrency 4`
  passed.
- `bun test tests/readme-dx.test.ts tests/install-scripts.test.ts --timeout 60000 --max-concurrency 4`
  passed.
- Real temp downstream bootstrap fixture passed with `vcs audit` reporting
  `safeToCommit: true`, `tracked=0`, `unignored=0`, `review=0`.
- Full `bun test` initially found one self-host contract drift; after syncing
  `.ai/harness/workflow-contract.json`, `bun test tests/workflow-contract.test.ts --timeout 60000 --max-concurrency 4`
  passed.

## Final Closeout

- `bash scripts/check-task-sync.sh` passed after this task note was recorded.
- `git diff --check` passed.
- `bun run check:release` passed for `local-repo-harness@0.5.9`: npm
  unpublished proof, `bun install --frozen-lockfile`, `bun test` with
  `801 pass / 0 fail`, deploy SQL check, architecture sync, task sync,
  runtime compatibility, handoff refresh, strict workflow check, project-state
  inspection, migration dry-run, and `npm pack --dry-run --json`.
