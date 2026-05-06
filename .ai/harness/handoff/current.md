# Harness Handoff

> **Generated**: 2026-05-06 18:56:23
> **Reason**: acceptance-complete

## Goal

No active plan. Continue from the latest user request and filesystem state.

## Decisions

- Use filesystem artifacts as source of truth; treat SQLite/thread state as a rebuildable read model only.

## Files Touched

```
.ai/harness/handoff/current.md
.ai/harness/policy.json
.ai/harness/workflow-contract.json
.ai/hooks/context-pressure-hook.sh
.ai/hooks/hook-input.sh
.ai/hooks/lib/workflow-state.sh
.ai/hooks/session-start-context.sh
.claude/settings.json
.gitignore
AGENTS.md
CLAUDE.md
_ref/nlah-2603.25723.pdf
_ref/nlah-paper-summary.md
assets/hooks/context-pressure-hook.sh
assets/hooks/hook-input.sh
assets/hooks/lib/workflow-state.sh
assets/hooks/session-start-context.sh
assets/hooks/settings.template.json
assets/partials-agents/03-orchestration.partial.md
assets/reference-configs/handoff-protocol.md
assets/reference-configs/workflow-orchestration.md
assets/templates/helpers/codex-handoff-resume.sh
assets/templates/helpers/context-budget.ts
assets/templates/helpers/ensure-task-workflow.sh
assets/templates/helpers/prepare-codex-handoff.sh
assets/workflow-contract.v1.json
docs/reference-configs/handoff-protocol.md
docs/reference-configs/workflow-orchestration.md
scripts/codex-handoff-resume.sh
scripts/context-budget.ts
scripts/create-project-dirs.sh
scripts/ensure-task-workflow.sh
scripts/init-project.sh
scripts/lib/project-init-lib.sh
scripts/migrate-project-template.sh
scripts/prepare-codex-handoff.sh
tasks/research.md
tests/bootstrap-files.test.ts
tests/context-budget.test.ts
tests/create-project-dirs.runtime.test.ts
tests/helper-scripts.test.ts
tests/hook-contracts.test.ts
tests/hook-recursive-copy.test.ts
tests/hook-runtime.test.ts
tests/init-project.settings.runtime.test.ts
tests/migration-script.test.ts
tests/scaffold-parity.test.ts
tests/workflow-contract.test.ts
```

## Commands Run

- (none captured)

## Checks

- Checks file: .ai/harness/checks/latest.json
- Context budget: .ai/harness/context-budget/latest.json

## Blockers

- (none recorded)

## Exact Next Step

- No active execution checklist

## Resume Prompt

- Resume packet: .ai/harness/handoff/resume.md
- Start a fresh Codex session and read this handoff before continuing; do not rely on auto-compact.

## Source Artifacts

- Spec: docs/spec.md
- Plan: (none)
- Todo Source Plan: (none)
- Contract: (none)
- Review: (none)
- Checks: .ai/harness/checks/latest.json
- Context Budget: .ai/harness/context-budget/latest.json
- Resume Packet: .ai/harness/handoff/resume.md
- Policy: .ai/harness/policy.json
- Context Map: .ai/context/context-map.json

## Current Status

- Next recommended action: No active execution checklist
- Working tree:  37 files changed, 1087 insertions(+), 63 deletions(-); 11 untracked files
- Parent Run ID: run-20260506T185623-2112
- Supersedes: (none)

## Changed Files

```
.ai/harness/handoff/current.md
.ai/harness/policy.json
.ai/harness/workflow-contract.json
.ai/hooks/context-pressure-hook.sh
.ai/hooks/hook-input.sh
.ai/hooks/lib/workflow-state.sh
.ai/hooks/session-start-context.sh
.claude/settings.json
.gitignore
AGENTS.md
CLAUDE.md
_ref/nlah-2603.25723.pdf
_ref/nlah-paper-summary.md
assets/hooks/context-pressure-hook.sh
assets/hooks/hook-input.sh
assets/hooks/lib/workflow-state.sh
assets/hooks/session-start-context.sh
assets/hooks/settings.template.json
assets/partials-agents/03-orchestration.partial.md
assets/reference-configs/handoff-protocol.md
assets/reference-configs/workflow-orchestration.md
assets/templates/helpers/codex-handoff-resume.sh
assets/templates/helpers/context-budget.ts
assets/templates/helpers/ensure-task-workflow.sh
assets/templates/helpers/prepare-codex-handoff.sh
assets/workflow-contract.v1.json
docs/reference-configs/handoff-protocol.md
docs/reference-configs/workflow-orchestration.md
scripts/codex-handoff-resume.sh
scripts/context-budget.ts
scripts/create-project-dirs.sh
scripts/ensure-task-workflow.sh
scripts/init-project.sh
scripts/lib/project-init-lib.sh
scripts/migrate-project-template.sh
scripts/prepare-codex-handoff.sh
tasks/research.md
tests/bootstrap-files.test.ts
tests/context-budget.test.ts
tests/create-project-dirs.runtime.test.ts
tests/helper-scripts.test.ts
tests/hook-contracts.test.ts
tests/hook-recursive-copy.test.ts
tests/hook-runtime.test.ts
tests/init-project.settings.runtime.test.ts
tests/migration-script.test.ts
tests/scaffold-parity.test.ts
tests/workflow-contract.test.ts
```
