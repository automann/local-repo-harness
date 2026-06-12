# Current Status Snapshot

<!-- generated-by: repo-harness refresh-current-status v1 -->
<!-- updated_at: 2026-06-12T20:57:08+0800 -->
<!-- stale_after: 24h -->

> **Status**: Active
> **Updated At**: 2026-06-12T20:57:08+0800
> **Source Branch**: main
> **Source Commit**: bef7cdc
> **Target Branch**: main
> **Stale After**: 24h
> **Reason**: plans-prds-canonicalization
> **Derived From**: active-plan, active-sprint, workstreams, handoff, checks, git status

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

- /Users/chris/Projects/agentic-dev-wt-local-repo-hook-user-level: plans/plan-20260612-2021-local-repo-hook-user-level.md
- /Users/chris/Projects/agentic-dev-wt-local-repo-hook-user-level: active-worktree owner -> /Users/chris/Projects/agentic-dev-wt-local-repo-hook-user-level
## Active Sprint

- Sprint: `plans/prds/20260612-0236-loop-engine.prd.md`
- Sprint Status: Done
- Backlog: 8/8
- Next Sprint Task: (none)
## Workstreams

- `tasks/workstreams/workflow-engine/contract-assets/cleanup-script-policy.md`: status=completed, current_slice=todo-01, source_plan=(none)
## Handoff

- Exact Next Step: Clean up merged contract worktree codex/local-repo-hook-user-level. Command: bash scripts/contract-worktree.sh cleanup --slug local-repo-hook-user-level --target main

## Checks

- status=pass, source=post-bash, exit_code=0, file=.ai/harness/checks/latest.json

## Git Status

- Summary: 137 changed/untracked path(s)

```
M  .ai/context/context-map.json
D  .ai/harness/context-budget/.gitkeep
MM .ai/harness/policy.json
MM .ai/harness/workflow-contract.json
M  .ai/hooks/hook-input.sh
M  .ai/hooks/lib/session-state.sh
M  .ai/hooks/lib/workflow-state.sh
M  .ai/hooks/post-edit-guard.sh
M  .ai/hooks/post-tool-observer.sh
M  .ai/hooks/prompt-guard.sh
M  .ai/hooks/session-start-context.sh
M  .claude/templates/contract.template.md
M  .claude/templates/plan.template.md
M  .claude/templates/sprint.template.md
M  .gitignore
MM AGENTS.md
MM CLAUDE.md
MM README.es.md
MM README.fr.md
MM README.ja.md
MM README.md
MM README.zh-CN.md
M  SKILL.md
M  assets/AGENTS.md
M  assets/CLAUDE.md
M  assets/hooks/hook-input.sh
M  assets/hooks/lib/session-state.sh
M  assets/hooks/lib/workflow-state.sh
M  assets/hooks/post-edit-guard.sh
M  assets/hooks/post-tool-observer.sh
M  assets/hooks/prompt-guard.sh
M  assets/hooks/session-start-context.sh
M  assets/partials-agents/02-operating-mode.partial.md
M  assets/partials-agents/03-orchestration.partial.md
M  assets/partials-agents/04-task-protocol.partial.md
M  assets/partials-agents/08-deep-docs.partial.md
M  assets/partials/05-workflow.partial.md
M  assets/partials/07-footer.partial.md
MM assets/reference-configs/agentic-development-flow.md
M  assets/reference-configs/development-protocol.md
```

## Source Artifacts

- Plans: `plans/plan-*.md`
- Active marker: `.ai/harness/active-plan`
- Active worktree marker: `.ai/harness/active-worktree`
- Sprints: `plans/prds/*.prd.md`
- Active sprint marker: `.ai/harness/sprint/active-sprint`
- Workstreams: `tasks/workstreams/**/*.md`
- Handoff: `.ai/harness/handoff/current.md`
- Checks: `.ai/harness/checks/latest.json`
