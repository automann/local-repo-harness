# Plan: Local Repo Hook Cleanup for User-Level Runtime

> **Status**: Executing
> **Created**: 20260612-2021
> **Slug**: local-repo-hook-user-level
> **Planning Source**: repo-harness-plan
> **Orchestration Kind**: repo-harness-plan
> **Source Ref**: 你要加一个功能，安装时清理 local repo的hook，只留user-level的，避免出现竞态
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Sprint Contract**: `tasks/contracts/20260612-2021-local-repo-hook-user-level.contract.md`
> **Sprint Review**: `tasks/reviews/20260612-2021-local-repo-hook-user-level.review.md`
> **Implementation Notes**: `tasks/notes/20260612-2021-local-repo-hook-user-level.notes.md`

## Agentic Routing
- Selected route: planning
- Routing reason: Captured from repo-harness-plan planning output.
- Source ref: 你要加一个功能，安装时清理 local repo的hook，只留user-level的，避免出现竞态
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20260612-2021-local-repo-hook-user-level.md`
- Sprint contract: `tasks/contracts/20260612-2021-local-repo-hook-user-level.contract.md`
- Sprint review: `tasks/reviews/20260612-2021-local-repo-hook-user-level.review.md`
- Implementation notes: `tasks/notes/20260612-2021-local-repo-hook-user-level.notes.md`
- Deferred-goal ledger: `tasks/todo.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260612-2021-local-repo-hook-user-level.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree; `.claude/.active-plan` is a legacy fallback during transition. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `scripts/plan-to-todo.sh --plan plans/plan-20260612-2021-local-repo-hook-user-level.md` and may start `scripts/contract-worktree.sh start --plan plans/plan-20260612-2021-local-repo-hook-user-level.md`.

## Approach
### Strategy
Use the captured planning output below as the execution source of truth.

### Trade-offs
| Option | Pros | Cons | Decision |
|--------|------|------|----------|
| Captured plan | Preserves the approved Codex Plan or Waza think decision | Requires the captured text to be concrete enough to execute | Use |

## Detailed Design
### File Changes
| File | Action | Description |
|------|--------|-------------|
| See captured planning output | Follow | Implement only the approved scope named below |

### Code Snippets
See captured planning output.

### Data Flow
See captured planning output.

## Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Captured plan lacks enough detail | Medium | Execution may need clarification | Stop before implementation if the captured output contradicts repo rules or lacks concrete file targets |

## Task Contracts
- Contract file: `tasks/contracts/20260612-2021-local-repo-hook-user-level.contract.md`
- Review file: `tasks/reviews/20260612-2021-local-repo-hook-user-level.review.md`
- Implementation notes file: `tasks/notes/20260612-2021-local-repo-hook-user-level.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `bash scripts/verify-contract.sh --contract tasks/contracts/20260612-2021-local-repo-hook-user-level.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan`, the owning worktree is written to `.ai/harness/active-worktree`, and the plan is mirrored to `.claude/.active-plan` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Evidence Contract

- **State/progress path**: `plans/plan-20260612-2021-local-repo-hook-user-level.md` task breakdown, `tasks/todo.md` deferred-goal ledger, `tasks/contracts/20260612-2021-local-repo-hook-user-level.contract.md`, `tasks/reviews/20260612-2021-local-repo-hook-user-level.review.md`, and `tasks/notes/20260612-2021-local-repo-hook-user-level.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260612-2021-local-repo-hook-user-level.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: before execution remove `plans/plan-20260612-2021-local-repo-hook-user-level.md`; after execution revert branch `codex/local-repo-hook-user-level` or the generated task artifacts

## Captured Planning Output

# Local Repo Hook Cleanup for User-Level Runtime

## Status
Approved for implementation from the user request: "安装时清理 local repo 的 hook，只留 user-level 的，避免出现竞态".

## P1 Architecture Map

repo-harness has three hook surfaces:

- Product source: `assets/hooks/`, shipped in the CLI/package and installed into central runtime copies.
- Self-host runtime: `.ai/hooks/`, live only in this repository because `.ai/harness/policy.json` pins `"hook_source": "repo"`.
- Downstream ordinary repos: user-level `~/.claude/settings.json` and `~/.codex/hooks.json` dispatch into `repo-harness-hook`, which resolves central-first to packaged or central hooks. Their repo-local `.ai/hooks/` should not contain runnable hook entry scripts unless they explicitly pin `"hook_source": "repo"`.

The install and migration entrypoints converge on `scripts/lib/project-init-lib.sh:pi_install_hook_assets` through `scripts/create-project-dirs.sh`, `scripts/init-project.sh`, and `scripts/migrate-project-template.sh`.

## P2 Concrete Trace

Input: `repo-harness update` / `scripts/migrate-project-template.sh --repo <repo> --apply` / `scripts/create-project-dirs.sh`.

Path:

1. The caller resolves the target repo and hook assets.
2. `pi_install_hook_assets <repo> assets/hooks apply` checks `.ai/harness/policy.json`.
3. If `hook_source` is `repo`, it copies the full hook runtime into `<repo>/.ai/hooks/` for explicit repo-local hook development.
4. Otherwise, it prunes stale top-level `<repo>/.ai/hooks/*.sh` entry scripts and generated hook metadata, then refreshes only `<repo>/.ai/hooks/lib/*.sh` helper libraries and writes a README tombstone.
5. User-level adapters remain the active runtime path and route through `repo-harness-hook`.

Failure pressure point: before this slice, a repo that previously had `.ai/hooks/run-hook.sh` or `.ai/hooks/prompt-guard.sh` kept those stale scripts forever even after central-first runtime became the default, creating a misleading local runtime and possible race with packaged behavior.

## P3 Design Decision

Preserve central-first as the default invariant and preserve repo-pinned hook development as the explicit escape hatch. Do not delete helper libraries because repo workflow helpers still source `.ai/hooks/lib/workflow-state.sh` and `.ai/hooks/lib/session-state.sh`. Do delete only top-level generated hook entry scripts and generated hook metadata in non-pinned repos.

## Task Breakdown

- Add a non-pinned cleanup step to `pi_install_hook_assets`.
- Keep full `.ai/hooks` runtime for `hook_source: repo` repos.
- Update create/init/migration tests to assert stale local hook entry scripts are pruned.
- Update hook operation docs so downstream users know `.ai/hooks/*.sh` is not active by default.
- Verify targeted tests plus required workflow checks.

## Evidence Contract

- `bun test tests/migration-script.test.ts -t "should keep full vendored hook runtime"`
- `bun test tests/migration-script.test.ts -t "should prune stale repo-local hook runtime"`
- `bun test tests/create-project-dirs.runtime.test.ts -t "should prune stale repo-local hook runtime"`
- `bun test tests/init-project.settings.runtime.test.ts`
- `bash scripts/check-task-workflow.sh --strict`
- `bash scripts/check-deploy-sql-order.sh`
- `bash scripts/check-architecture-sync.sh`
- `bash scripts/check-task-sync.sh`
- `bun scripts/inspect-project-state.ts --repo . --format text`
- `bash scripts/migrate-project-template.sh --repo . --dry-run`
- `git diff --check`

## Residual Risk

Full `bun test` in the current Codex runner has been externally SIGTERM-truncated during long combined runs. The failing assertion found in the first full run was fixed and its owning test now passes; runner-level stabilization remains a separate slice.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [x] Execute captured plan: Local Repo Hook Cleanup for User-Level Runtime
