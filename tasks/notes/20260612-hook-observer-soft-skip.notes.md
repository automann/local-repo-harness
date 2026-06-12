# Hook Observer Soft Skip

## Decision

Carry forward only the `PostToolUse.always` missing-script behavior from the
stale `codex/hook-observer-soft-skip` worktree.

## Rationale

The branch is far behind current `main` and includes historical workflow
artifacts that should not be merged wholesale. The durable behavior is smaller:
if a pinned repo is missing `post-tool-observer.sh`, the observer route should
emit the existing sync hint and exit 0, matching the advisory behavior of
`SessionStart.default` and `Stop.default`.

This is included in the 0.4.1 release surface because stale copied hook assets
should not block normal tool execution during the central-first hook migration.

## Verification

- `bun test tests/cli/hook.test.ts`
- `bun test tests/cli/hook.test.ts tests/cli/route-registry.test.ts tests/cli/status.test.ts tests/hook-contracts.test.ts`
- `bun test`
- `bash scripts/check-deploy-sql-order.sh`
- `bash scripts/check-architecture-sync.sh`
- `bash scripts/check-task-sync.sh`
- `bash scripts/check-task-workflow.sh --strict`
- `bun scripts/inspect-project-state.ts --repo . --format text`
- `bash scripts/migrate-project-template.sh --repo . --dry-run`
- `bash scripts/check-npm-release.sh` for the final 0.4.1 publish gate:
  681 pass, 0 fail, plus deploy SQL, architecture sync, task sync, brain sync,
  strict workflow, inspect, migration dry-run, and npm pack.
