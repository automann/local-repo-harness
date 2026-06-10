# Deferred Goal Ledger

> **Status**: Backlog
> **Updated**: 2026-06-10 19:45 +0800
> **Scope**: Medium/long-term goals deferred from active plan execution

Current plan tasks live in the active plan's `## Task Breakdown`.
Do not duplicate that execution checklist here. Record only work intentionally deferred beyond this slice, with the tradeoff and revisit trigger.

## Deferred Goals

| Goal | Why Deferred | Tradeoff | Revisit Trigger |
|------|--------------|----------|-----------------|
| Stop vendoring `.ai/hooks` into downstream repos at init/migrate (central runtime made vendored copies inert defaults) | Central-first resolution just landed; let it soak before removing the fallback surface | Vendored copies keep working offline/pre-bundle but can confuse "I edited .ai/hooks and nothing changed" | After central runtime has run incident-free across the fleet for a few weeks, or when the next scaffold-surface change touches init/migrate |
| Sprint Slice 2: wiring + facade — `sprint-backlog.sh start-task` (capture-plan `--source repo-harness-sprint` + downstream policy template), warn-only finish back-fill in `contract-worktree.sh`, complete-task serialization (codex P2), `assets/skill-commands/repo-harness-sprint` SKILL (plan/run/status) + manifest/docs/evals/tests registration | Slice 1 is intentionally additive-only per cross-model review; wiring lands after schema is proven | Sprint backlog cannot drive plan capture until this lands | Slice 1 merged to main |
| Sprint Slice 3: goal continuation — `run --goal` protocol (CHECKPOINT rules) + `stop-orchestrator.sh` goal-state branch (max-iterations 25, cancel, corrupt self-clear) + hook-runtime tests; falsifier: unreliable Stop injection downgrades goal to protocol-only | Stop route touches every session exit path; ships only after Slice 2 wiring exists | One-shot sprint runs stay manual until then | Slice 2 merged (central hook runtime already landed, so the goal branch ships through the central path) |
