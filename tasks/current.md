# Current Status Snapshot

<!-- generated-by: repo-harness refresh-current-status v1 -->
<!-- updated_at: 2026-06-12T04:51:42+0800 -->
<!-- stale_after: 24h -->

> **Status**: ManualClearedWithActiveWork
> **Updated At**: 2026-06-12T04:51:42+0800
> **Source Branch**: codex/arch-doc-loop-01-queue-engine-triage
> **Source Commit**: 34a2abb
> **Target Branch**: main
> **Stale After**: 24h
> **Reason**: archive-workflow
> **Derived From**: active-plan, active-sprint, workstreams, handoff, checks, git status

This file is a tracked mainline snapshot derived from repo artifacts. It is not a live lock, not a kanban board, and not an implementation gate. If it is stale, read the source artifacts below.

## Current Focus

- Status: ManualClearedWithActiveWork
- Active Plan: (none)
- Plan Status: (none)
- Next Task: inspect active worktree marker(s)
- Clear Note: Manual clear requested, but active work markers still exist. Idle was not written.

## Mainline Snapshot Reading

- Current worktree: `tasks/current.md`
- Target branch snapshot: `git show main:tasks/current.md`
- Rule: non-target worktrees may read the target branch snapshot, but must verify against source artifacts before acting.

## Active Work

- /Users/chris/Projects/agentic-dev-wt-hook-runtime-drift-policy: plans/plan-20260610-1113-hook-runtime-drift-policy.md
- /Users/chris/Projects/agentic-dev-wt-hook-runtime-drift-policy: active-worktree owner -> /Users/chris/Projects/agentic-dev-wt-hook-runtime-drift-policy
- /Users/chris/Projects/agentic-dev-wt-loop-engine-02-routing-ab-eval: plans/plan-20260612-0435-loop-engine-03-shadow-injection.md
- /Users/chris/Projects/agentic-dev-wt-loop-engine-02-routing-ab-eval: active-worktree owner -> /Users/chris/Projects/agentic-dev-wt-loop-engine-02-routing-ab-eval
- /Users/chris/Projects/agentic-dev-wt-wt-continuation-for-architecture-doc-loop: plans/plan-20260612-0314-wt-continuation-for-architecture-doc-loop.md
- /Users/chris/Projects/agentic-dev-wt-wt-continuation-for-architecture-doc-loop: active-worktree owner -> /Users/chris/Projects/agentic-dev-wt-wt-continuation-for-architecture-doc-loop
## Active Sprint

- Sprint: (none)
## Workstreams

- `tasks/workstreams/workflow-engine/contract-assets/cleanup-script-policy.md`: status=completed, current_slice=todo-01, source_plan=(none)
## Handoff

- Exact Next Step: (none)

## Checks

- status=pass, source=verify-sprint, exit_code=0, file=.ai/harness/checks/latest.json

## Git Status

- Summary: 32 changed/untracked path(s)

```
 M .ai/harness/workflow-contract.json
 M .ai/hooks/session-start-context.sh
 M AGENTS.md
 M CLAUDE.md
 M assets/hooks/session-start-context.sh
 M assets/reference-configs/harness-overview.md
 M assets/skill-commands/repo-harness-architecture/SKILL.md
 M assets/templates/helpers/capability-resolver.ts
 M assets/templates/helpers/check-task-workflow.sh
 M assets/templates/helpers/contract-worktree.sh
 M assets/workflow-contract.v1.json
 M docs/reference-configs/harness-overview.md
 M package.json
 M scripts/capability-resolver.ts
 M scripts/check-task-workflow.sh
 M scripts/contract-worktree.sh
 M scripts/lib/project-init-lib.sh
 M tests/bootstrap-files.test.ts
 M tests/create-project-dirs.runtime.test.ts
 M tests/helper-scripts.test.ts
 M tests/hook-runtime.test.ts
 M tests/migration-script.test.ts
 M tests/scaffold-parity.test.ts
 M tests/workflow-contract.test.ts
?? assets/templates/helpers/check-architecture-sync.sh
?? plans/archive/plan-20260612-0410-arch-doc-loop-02-freshness-gate-surfaces.md
?? scripts/check-architecture-sync.sh
?? tasks/archive/notes-20260612-0451-arch-doc-loop-02-freshness-gate-surfaces.md
?? tasks/archive/todo-20260612-0451-arch-doc-loop-02-freshness-gate-surfaces.md
?? tasks/contracts/20260612-0410-arch-doc-loop-02-freshness-gate-surfaces.contract.md
?? tasks/reviews/20260612-0410-arch-doc-loop-02-freshness-gate-surfaces.review.md
?? tests/architecture-sync.test.ts
```

## Source Artifacts

- Plans: `plans/plan-*.md`
- Active marker: `.ai/harness/active-plan`
- Active worktree marker: `.ai/harness/active-worktree`
- Sprints: `tasks/sprints/*.sprint.md`
- Active sprint marker: `.ai/harness/sprint/active-sprint`
- Workstreams: `tasks/workstreams/**/*.md`
- Handoff: `.ai/harness/handoff/current.md`
- Checks: `.ai/harness/checks/latest.json`
