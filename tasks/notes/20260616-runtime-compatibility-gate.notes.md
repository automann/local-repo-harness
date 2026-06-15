# Runtime compatibility gate notes

Date: 2026-06-16

Scope:

- Added improve-plan coverage for stale `repo-harness` wrapper fallbacks,
  shell JavaScript runtime invocation, and a static runtime compatibility gate.
- Replaced helper script JavaScript stdin and argument-sensitive `-e` callsites
  with a shared `scripts/lib/js-runtime.sh` temp-file runner.
- Kept project-scoped Bun as the primary runtime while preserving Node fallback
  for plain JavaScript helpers where available.
- Synced updated helper behavior into `assets/templates/helpers/` so downstream
  projects receive the same Bun/Node compatible execution path.
- Removed stale generated wrapper fallbacks to the retired `repo-harness` CLI
  name; generated wrappers now fall back to `local-repo-harness run`.
- Added `scripts/check-runtime-compat.sh` and wired it into the package release
  gate through `check:runtime-compat`.
- Copied the shared runtime library into repo-pinned helper installs and
  Factor Factory helper installs so `.ai/harness/scripts/*` helpers can run
  without requiring source-repo layout.

Verification:

- `bun test` passed: 786 tests, 0 failures.
- `bash scripts/check-runtime-compat.sh` passed.
- `bun run check:runtime-compat` passed.
- `bash scripts/check-deploy-sql-order.sh` passed.
- `bash scripts/check-architecture-sync.sh` passed in advisory mode with
  blocking=0.
- `bash scripts/check-task-workflow.sh --strict` passed with only unavailable
  local brain vault warnings.
- `bun scripts/inspect-project-state.ts --repo . --format text` reported no
  upgrade plan.
- `bash scripts/migrate-project-template.sh --repo . --dry-run` passed.
- `bun test tests/runtime-compat.test.ts` passed.
- Shell syntax checks passed for the touched runtime/helper/hook shell scripts.

Follow-up:

- Run `bash scripts/check-npm-release.sh` after local gates. If npm package
  version uniqueness blocks the full release script, report that separately and
  use the local gates plus `npm pack --dry-run --json` as release-adjacent
  evidence.
