# Current Status Snapshot

<!-- generated-by: repo-harness refresh-current-status v1 -->
<!-- updated_at: 2026-06-01T00:36:56+0800 -->
<!-- stale_after: 24h -->

> **Status**: Active
> **Updated At**: 2026-06-01T00:36:56+0800
> **Source Branch**: main
> **Source Commit**: 2fa36be
> **Target Branch**: main
> **Stale After**: 24h
> **Reason**: project-initializer-cleanup
> **Derived From**: active-plan, workstreams, handoff, checks, git status

This file is a tracked mainline snapshot derived from repo artifacts. It is not a live lock, not a kanban board, and not an implementation gate. If it is stale, read the source artifacts below.

## Current Focus

- Status: Active
- Active Plan: (none)
- Plan Status: (none)
- Next Task: inspect active worktree marker(s)
- Clear Note: (none)

## Mainline Snapshot Reading

- Current worktree: `tasks/current.md`
- Target branch snapshot: `git show main:tasks/current.md`
- Rule: non-target worktrees may read the target branch snapshot, but must verify against source artifacts before acting.

## Active Work

- /Users/ancienttwo/Projects/agentic-dev-wt-attachment-context-priority: plans/plan-20260531-0326-codex-attachment-context-priority.md
- /Users/ancienttwo/Projects/agentic-dev-wt-attachment-context-priority: active-worktree owner -> /Users/ancienttwo/Projects/agentic-dev-wt-attachment-context-priority
- /Users/ancienttwo/Projects/agentic-dev-wt-codex: plans/plan-20260531-0326-codex.md
- /Users/ancienttwo/Projects/agentic-dev-wt-codex: active-worktree owner -> /Users/ancienttwo/Projects/agentic-dev-wt-codex
- /Users/ancienttwo/Projects/agentic-dev-wt-prompt-guard-cli-rewrite-plan: plans/plan-20260531-1847-prompt-guard-cli-rewrite-plan.md
- /Users/ancienttwo/Projects/agentic-dev-wt-prompt-guard-cli-rewrite-plan: active-worktree owner -> /Users/ancienttwo/Projects/agentic-dev-wt-prompt-guard-cli-rewrite-plan
- /Users/ancienttwo/Projects/agentic-dev-wt-repo-harness-autoplan-repo-harness-ship-pr: plans/plan-20260601-0024-repo-harness-autoplan-repo-harness-ship-pr.md
- /Users/ancienttwo/Projects/agentic-dev-wt-repo-harness-autoplan-repo-harness-ship-pr: active-worktree owner -> /Users/ancienttwo/Projects/agentic-dev-wt-repo-harness-autoplan-repo-harness-ship-pr
## Workstreams

- `tasks/workstreams/workflow-engine/contract-assets/cleanup-script-policy.md`: status=completed, current_slice=todo-01, source_plan=(none)
## Handoff

- Exact Next Step: Clean up merged contract worktree codex/attachment-context-priority. Command: bash scripts/contract-worktree.sh cleanup --slug attachment-context-priority --target main

## Checks

- status=pass, source=verify-sprint, exit_code=0, file=.ai/harness/checks/latest.json

## Git Status

- Summary: 83 changed/untracked path(s)

```
 M .ai/harness/workflow-contract.json
 M .ai/hooks/run-hook.sh
 M .ai/hooks/session-start-context.sh
 M README.md
 M README.zh-CN.md
 M SKILL.md
 M assets/hooks/codex.hooks.template.json
 M assets/hooks/run-hook.sh
 M assets/hooks/session-start-context.sh
 M assets/hooks/settings.template.json
 M assets/initializer-question-pack.v4.json
 M assets/plan-map.json
 M assets/reference-configs/agentic-development-flow.md
 M assets/reference-configs/external-tooling.md
 M assets/reference-configs/harness-overview.md
 M assets/reference-configs/hook-operations.md
 M assets/skill-commands/manifest.json
 M assets/skill-commands/repo-harness-autoplan/SKILL.md
 M assets/templates/helpers/architecture-event.ts
 M assets/templates/helpers/capability-resolver.ts
 M assets/templates/helpers/check-task-workflow.sh
 M assets/templates/helpers/codex-handoff-resume.sh
 M assets/templates/helpers/context-contract-sync.sh
 M assets/templates/helpers/contract-worktree.sh
 M assets/templates/helpers/ensure-task-workflow.sh
 M assets/templates/helpers/migrate-project-template.sh
 M assets/templates/helpers/plan-to-todo.sh
 M assets/templates/helpers/select-agent-context-blocks.sh
 M assets/workflow-contract.v1.json
 M docs/CHANGELOG.md
 M docs/architecture/modules/public-surface/action-commands.md
 M docs/architecture/modules/runtime-harness/hook-adapters.md
 M docs/reference-configs/agentic-development-flow.md
 M docs/reference-configs/external-tooling.md
 M docs/reference-configs/harness-overview.md
 M docs/reference-configs/hook-operations.md
 M docs/spec.md
 M evals/evals.json
 M references/tech-stacks.md
 M scripts/architecture-event.ts
```

## Source Artifacts

- Plans: `plans/plan-*.md`
- Active marker: `.ai/harness/active-plan`
- Active worktree marker: `.ai/harness/active-worktree`
- Workstreams: `tasks/workstreams/**/*.md`
- Handoff: `.ai/harness/handoff/current.md`
- Checks: `.ai/harness/checks/latest.json`
