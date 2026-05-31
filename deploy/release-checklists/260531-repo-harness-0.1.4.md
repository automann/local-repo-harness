# Release Filing: repo-harness 0.1.4

Date: 2026-05-31
Filing ID: 260531-repo-harness-0.1.4
Prepared source commit: pending
Status: Prepared

## Naming

Release filing documents use a `YYMMDD-<package>-<version>.md` filename. This
file intentionally uses `260531` so the release artifact sorts by filing date
without relying only on GitHub or npm metadata.

## Scope

- Package: `repo-harness@0.1.4`
- Generated workflow compatibility: `5.2.3`
- Public CLI commands: unchanged
- Host adapter contract: unchanged, still `repo-harness-hook <event> --route <route>`
- Main fix: generated plan task artifacts now keep the active plan stem
  (`YYYYMMDD-HHMM-<slug>`) for `tasks/contracts/`, `tasks/reviews/`, and
  `tasks/notes/`.

## Included Changes

- `capture-plan.sh`, `new-plan.sh`, and `plan-to-todo.sh` now project task
  artifacts from the active plan stem instead of the slug alone.
- `workflow-state.sh`, `codex-handoff-resume.sh`, `archive-workflow.sh`, and
  `contract-worktree.sh` prefer plan-stem artifacts while retaining legacy
  slug-only fallback for existing projects.
- Generated templates and reference docs now describe
  `YYYYMMDD-HHMM-<slug>` task artifact names.
- Helper tests cover the new date-prefixed artifact paths and the existing
  contract worktree closeout path.

## Verification

- `bun test` passed before the release prep.
- `bash scripts/check-task-workflow.sh --strict` passed before the release prep.
- `bash scripts/check-task-sync.sh` passed before the release prep.
- `bash scripts/migrate-project-template.sh --repo . --dry-run` passed before the release prep.
- `npm view repo-harness@0.1.4 version --json --registry https://registry.npmjs.org/` returned unpublished before release prep.

## Publish Plan

Rerun `bash scripts/check-npm-release.sh` from the final release commit, publish
to npm, create tag `v0.1.4`, create the GitHub release, and update this filing
with published artifact URLs.
