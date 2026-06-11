# Current Status Snapshot

<!-- generated-by: repo-harness refresh-current-status v1 -->
<!-- updated_at: 2026-06-12T06:25:42+0800 -->
<!-- stale_after: 24h -->

> **Status**: ManualClearedWithActiveWork
> **Updated At**: 2026-06-12T06:25:42+0800
> **Source Branch**: codex/arch-doc-loop-01-queue-engine-triage
> **Source Commit**: 23ef073
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
- /Users/chris/Projects/agentic-dev-wt-loop-engine-02-routing-ab-eval: plans/plan-20260612-0539-loop-engine-07-cutover-delete-classifier.md
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

- Summary: 66 changed/untracked path(s)

```
 M .ai/harness/policy.json
 M .ai/harness/workflow-contract.json
 M .ai/hooks/lib/workflow-state.sh
 M .ai/hooks/prompt-guard.sh
 M .claude/templates/implementation-notes.template.md
 M .claude/templates/plan.template.md
 M AGENTS.md
 M CLAUDE.md
 M assets/hooks/lib/workflow-state.sh
 M assets/hooks/prompt-guard.sh
 M assets/partials-agents/02-operating-mode.partial.md
 M assets/partials-agents/03-orchestration.partial.md
 M assets/partials-agents/04-task-protocol.partial.md
 M assets/partials-agents/08-deep-docs.partial.md
 M assets/partials/04-project-structure.partial.md
 M assets/partials/05-workflow.partial.md
 M assets/partials/07-footer.partial.md
 M assets/partials/08-orchestration.partial.md
 M assets/reference-configs/agentic-development-flow.md
 M assets/reference-configs/harness-overview.md
 M assets/templates/helpers/capture-plan.sh
 M assets/templates/helpers/check-task-sync.sh
 M assets/templates/helpers/check-task-workflow.sh
 M assets/templates/helpers/codex-handoff-resume.sh
 M assets/templates/helpers/ensure-task-workflow.sh
 M assets/templates/helpers/inspect-project-state.ts
 M assets/templates/helpers/migrate-workflow-docs.ts
 M assets/templates/helpers/new-plan.sh
 M assets/templates/helpers/plan-to-todo.sh
 M assets/templates/helpers/workflow-contract.ts
 M assets/templates/implementation-notes.template.md
 M assets/templates/plan.template.md
 M assets/workflow-contract.v1.json
 M docs/reference-configs/agentic-development-flow.md
 M docs/reference-configs/harness-overview.md
 M scripts/capture-plan.sh
 M scripts/check-task-sync.sh
 M scripts/check-task-workflow.sh
 M scripts/codex-handoff-resume.sh
 M scripts/create-project-dirs.sh
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
