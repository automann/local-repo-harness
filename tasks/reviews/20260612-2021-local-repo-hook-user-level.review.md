# Sprint Review: local-repo-hook-user-level

> **Status**: Reviewed
> **Plan**: plans/plan-20260612-2021-local-repo-hook-user-level.md
> **Contract**: tasks/contracts/20260612-2021-local-repo-hook-user-level.contract.md
> **Notes File**: tasks/notes/20260612-2021-local-repo-hook-user-level.notes.md
> **Checks File**: .ai/harness/checks/latest.json
> **Last Updated**: 2026-06-12 21:20
> **Recommendation**: pass

## Mode Evidence

- Selected route: implementation after approved plan.
- P1/P2/P3 evidence: plan records hook surfaces, create/init/migration trace, and central-first policy rationale.
- Root cause or plan evidence: non-pinned downstream repos retained stale `.ai/hooks/*.sh` copies after user-level hooks became the active runtime.

## Verification Evidence

- Waza `/check` run: not run; local deterministic checks used for this bounded harness change.
- Commands run:
  - `bash -n scripts/lib/project-init-lib.sh scripts/create-project-dirs.sh scripts/init-project.sh scripts/migrate-project-template.sh`
  - `bun test tests/create-project-dirs.runtime.test.ts tests/scaffold-parity.test.ts tests/bootstrap-files.test.ts tests/init-project.settings.runtime.test.ts tests/migration-script.test.ts`
  - `bash scripts/verify-sprint.sh --contract tasks/contracts/20260612-2021-local-repo-hook-user-level.contract.md --strict`
  - `bash scripts/check-task-workflow.sh --strict`
  - `bash scripts/check-deploy-sql-order.sh`
  - `bash scripts/check-architecture-sync.sh`
  - `bash scripts/check-task-sync.sh`
  - `bun scripts/inspect-project-state.ts --repo . --format text`
  - `bash scripts/migrate-project-template.sh --repo . --dry-run`
  - `bash scripts/migrate-project-template.sh --repo /Users/chris/Projects/97app --dry-run`
  - `git diff --check`
- Manual checks: 97app hook surface contains only `.ai/hooks/README.md` plus `lib/session-state.sh` and `lib/workflow-state.sh`.
- Supporting artifacts: `tasks/notes/20260612-2021-local-repo-hook-user-level.notes.md`.
- Implementation notes reviewed: yes.
- Run snapshot: command outputs in current Codex thread.

## External Acceptance Advice

> **External Acceptance**: pass
> **External Reviewer**: Codex
> **External Source**: local deterministic verification
> **External Started**: 2026-06-12 21:00
> **External Completed**: 2026-06-12 21:20

- P1 blockers: none
- P2 advisories: full repo-local hook runtime remains available only through explicit `"hook_source": "repo"` pin.
- Acceptance checklist: targeted tests pass; dry-run proves self-host full runtime and 97app lib-only fallback.

## Behavior Diff Notes

- Non-pinned repos no longer receive or keep runnable root `.ai/hooks/*.sh` scripts by default.
- Pinned repos and `REPO_HARNESS_HOOK_SOURCE=repo` keep the full vendored runtime.
- Documentation now tells downstream users not to edit `.ai/hooks/*.sh`.

## Residual Risks / Follow-ups

- A repo with genuine custom root hook scripts must pin `"hook_source": "repo"` before migration, or those root scripts are treated as stale generated hook entrypoints.
- The contract verifier runs `tests/migration-script.test.ts` as targeted cases because the full single-file integration suite can exceed its per-test command window and receive SIGTERM 15.

## Scorecard

| Dimension | Score | Notes |
|-----------|-------|-------|
| Functionality | 9/10 | Targeted create/init/migration paths covered. |
| Product depth | 8/10 | Policy aligns downstream user-level runtime with self-host escape hatch. |
| Design quality | 8/10 | Single helper owns pruning/copy behavior. |
| Code quality | 8/10 | Shell path remains simple; tests cover default and pinned behavior. |

## Failing Items

- None.

## Retest Steps

- Re-run targeted test suite and workflow guards listed above.
- Re-check downstream dry-run before applying to additional repos with custom hook scripts.

## Summary

- Pass. The branch now carries the upstream repo-harness fix for user-level default hook runtime and preserves self-host hook development behavior.
