# Release Filing: repo-harness 0.4.1

Date: 2026-06-12
Status: Draft release prep, not published

## Scope

- Package target: `repo-harness@0.4.1`
- Current npm latest: `repo-harness@0.4.0`
- Base npm tag: `v0.4.0`
- Target branch: `main`
- Source commit: pending; current working tree is dirty and not staged for
  release.
- Version surfaces still to bump before publish:
  - `package.json`
  - `assets/skill-version.json`
  - `src/cli/commands/status.ts`
  - README version/stamp references
  - version expectation tests

## Version Decision

Use `0.4.1`, not another `0.4.0` filing. The npm registry already reports
`repo-harness@0.4.0` as published, and this slice is a compatibility/safety
patch on top of the `0.4.0` loop-engine release line.

This is a patch release because it does not add a new public CLI command. It
fixes hook session-state correctness, prevents stale repo-local hook copies from
competing with user-level adapters, and finishes the active workflow-document
surface migration to `tasks/todos.md` plus `docs/researches/`.

## Release Notes

- CodeGraph route hints are now session-scoped. Hook stdin `session_id` is
  parsed once by `hook-input.sh`, exported as `HOOK_SESSION_ID`, and preferred
  by `session-state.sh` before environment fallbacks or `.claude/.session-id`.
- Non-pinned repos no longer vendor top-level `.ai/hooks/*.sh` runtime scripts
  during init, create, or migration. They retain `.ai/hooks/lib/` helper
  fallbacks plus a README explaining that active hook execution is user-level
  and central-first.
- Repos that explicitly set `"hook_source": "repo"` still receive the full
  vendored hook runtime for self-hosted hook development.
- Active workflow docs now use `tasks/todos.md` for deferred goals and
  `docs/researches/*.md` for topic-scoped durable research. Legacy
  `tasks/todo.md` and `tasks/research.md` are migration inputs only.
- The managed runtime ignore block now covers `tasks/.current.md.tmp.*` and
  `.claude/.plan-state/`.
- Plain `bun test` now uses a 60s per-test timeout through `bunfig.toml`, which
  matches the release gate's long-running migration/hook test budget.

## Downstream Smoke

- `repo-harness update --repo /Users/chris/Projects/enterprise-brain` refreshed
  the downstream workflow assets and kept `.ai/hooks` lib-only with a README
  tombstone.
- Cleared stale downstream CodeGraph/session state:
  `.claude/.session-id` and `.claude/.codegraph-state/*.used`.
- Verified downstream session-scoped CodeGraph routing:
  - first prompt for session `codex-smoke-20260612-downstream` emitted
    `[CodegraphRoute]`
  - the second prompt with the same session did not emit `[CodegraphRoute]`
  - a prompt with session `codex-smoke-20260612-downstream-2` emitted
    `[CodegraphRoute]` again

## Verification So Far

- `bun test`: 678 pass, 0 fail, 6514 expectations across 66 files.
- Focused affected suites passed:
  - `bun test tests/workflow-contract.test.ts`
  - `bun test tests/create-project-dirs.runtime.test.ts
    tests/init-project.settings.runtime.test.ts`
  - targeted `tests/migration-script.test.ts` gitignore/hook migration cases
  - targeted `tests/hook-runtime.test.ts` CodeGraph session-scope and
    research-gate cases
- Required checks passed after refreshing the ignored resume packet:
  - `bash scripts/check-task-workflow.sh --strict`
  - `bash scripts/check-deploy-sql-order.sh`
  - `bash scripts/check-architecture-sync.sh`
  - `bash scripts/check-task-sync.sh`
  - `bun scripts/inspect-project-state.ts --repo . --format text`
  - `bash scripts/migrate-project-template.sh --repo . --dry-run`
  - `git diff --check`
- Registry preflight:
  - `npm view repo-harness version --registry https://registry.npmjs.org/`
    returned `0.4.0`.

## Publish Hold Points

- Version bump has not been applied.
- Final `bash scripts/check-npm-release.sh` has not been rerun after the release
  documentation edits and future version bump.
- `npm pack --dry-run --json` has not been rerun for `repo-harness@0.4.1`.
- npm publish has not been attempted.
- GitHub tag/release for `v0.4.1` has not been created.
- `enterprise-brain` downstream refresh produced a dirty migration diff that
  should be reviewed separately from the `agentic-dev` release commit.

## Publish Status

- npm: not published.
- GitHub release: not created.
- Hold reason: release documentation is prepared first; version bump, final
  release gate, publish, and registry readback remain separate actions.
