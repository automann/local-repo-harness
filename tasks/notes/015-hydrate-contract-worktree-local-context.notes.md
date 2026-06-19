# Notes: Hydrate Contract Worktree Local Context

> **Date**: 2026-06-19
> **Plan**: `plans/015-hydrate-contract-worktree-local-context.md`
> **Status**: Implemented

## Context

`ephemeral-agent-workspace` keeps workflow state and product-intent files local-only.
Linked contract worktrees created by Git therefore lacked files such as `docs/spec.md`,
`plans/prds/`, `.ai/context/`, `.claude/templates/`, and workflow helper wrappers.
That let row-level implementation pass in some cases while closeout gates failed because
`check-task-workflow --strict` and `verify-sprint` could not run in the linked worktree.

## Implementation Notes

- Added a separate contract worktree hydration allowlist instead of broadening finish-time
  workflow sync.
- Hydration copies only safe workflow/product-intent context and generated helper wrappers
  from the primary worktree into the linked worktree.
- Hydration records `.ai/harness/worktrees/<slug>.hydration` for debugging, while
  `.sync` remains limited to row-owned artifacts that can sync back on finish.
- Denied install-state and private/runtime paths remain excluded, including managed tools,
  skills, CodeGraph state, MCP/host adapter config, `_ops/`, `node_modules/`, caches, and
  `.env` files.
- Added a regression fixture that creates a product-only Git commit, leaves governance files
  local-only, starts a contract worktree, then runs both strict workflow and sprint verification
  through the project CLI bridge.

## Verification

- `bun test tests/helper-scripts.test.ts --test-name-pattern "local-only workflow context"`
- `bun test tests/helper-scripts.test.ts --test-name-pattern "contract-worktree"`
- `bun test tests/helper-scripts.test.ts`
- `bun test tests/cli/run.test.ts`
- `bun test tests/readme-dx.test.ts`
- `bun test tests/cli/bootstrap.test.ts tests/bootstrap-files.test.ts`
- `bash scripts/check-architecture-sync.sh`
- `bash scripts/check-task-workflow.sh --strict`

`bun test` was run once after the implementation; all non-version tests passed, and the only
failures were expected version-manifest drift after bumping `package.json` to `0.5.16`.
