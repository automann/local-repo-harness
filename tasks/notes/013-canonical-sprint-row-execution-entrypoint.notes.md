# Canonical Sprint Row Entrypoint Notes

> **Date**: 2026-06-18
> **Plan**: `plans/013-canonical-sprint-row-execution-entrypoint.md`
> **Status**: Verified

## Summary

Added a canonical Sprint row execution surface so agents can resolve the next
approved backlog row and project an approved just-in-time plan without reading
helper internals.

## Implementation Notes

- Added `local-repo-harness sprint next --json`.
- Added `local-repo-harness sprint execute-approved --body-file <file>`.
- Made `local-repo-harness run <helper> --help` pass through to helper help.
- Passed the target repo root into package-launched helpers through
  `REPO_HARNESS_TARGET_REPO_ROOT`.
- Seeded project-scoped runtime bridges into contract worktrees when tracked
  helper scripts are absent.
- Synced local-only workflow artifacts back to the primary workspace only when
  the target path is ignored by Git.

## Verification

- `bash -n scripts/sprint-backlog.sh scripts/contract-worktree.sh scripts/capture-plan.sh scripts/plan-to-todo.sh scripts/verify-sprint.sh scripts/check-task-workflow.sh scripts/prepare-handoff.sh scripts/codex-handoff-resume.sh`
- `bash scripts/check-runtime-compat.sh`
- `bash scripts/check-task-workflow.sh --strict`
- `bun test --timeout 60000 --max-concurrency 4`
- `bun run check:release`

The first `bun run check:release` attempt passed the full Bun test suite and
then stopped at `check-task-sync` because this notes file did not exist yet.
After adding this task-sync note, the release gate passed for
`local-repo-harness@0.5.14`.
