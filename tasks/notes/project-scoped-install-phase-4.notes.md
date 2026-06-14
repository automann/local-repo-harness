# Project-scoped install phase 4 notes

Date: 2026-06-14

Scope:

- Added `repo-harness status` scope summaries for hook adapters, runtime,
  repo-harness skills, external tools, CodeGraph index/MCP, and brain mode.
- Added `repo-harness doctor` checks for hook scope intent, project adapters,
  mixed user/project adapters, project hook runtime, project skills, and
  third-party tooling scope.
- Added `repo-harness uninstall --target <codex|claude|both> --scope
  <user|project|none>` so migration cleanup can remove only managed adapter
  entries while preserving sibling hooks.
- Updated `repo-harness security scan` to treat current managed project
  adapters as first-class, classify retired `run-hook.sh` project adapters as
  migration warnings, and report host/scope on findings.
- Kept `repo-harness migrate` focused on retired `run-hook.sh` project adapter
  removal while preserving current managed project adapters.
- Wrote install-scope intent into `.ai/harness/policy.json` during
  `repo-harness update` so diagnostics can distinguish project-only intent from
  accidental mixed state.
- Reworked README safe adoption to front-load no-host-write preview/apply
  commands, then project hooks/runtime, with global `init` clearly labeled as a
  broad-impact optional bootstrap.
- Updated runtime-harness architecture docs, hook operations docs, migration
  report output, changelog, and release-gate tests for user/project scope.

Verification in progress:

- Focused diagnostics/release tests passed:
  `bun test tests/readme-dx.test.ts tests/workflow-contract.test.ts
  tests/migration-script.test.ts tests/cli/status.test.ts
  tests/cli/doctor.test.ts tests/cli/security.test.ts tests/cli/migrate.test.ts
  tests/cli/install.test.ts`.
- `bash scripts/check-deploy-sql-order.sh` passed.
- `bash scripts/check-architecture-sync.sh` exited 0 in advisory mode with no
  blocking findings.
- `bash scripts/check-task-workflow.sh --strict` exited 0 with only unavailable
  brain vault warnings.
