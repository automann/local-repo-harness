# Implementation Notes: 014 Tighten Review And Edge Case Gates

> **Date**: 2026-06-19
> **Plan**: `plans/014-tighten-review-and-edge-case-gates.md`
> **Status**: Implemented

## Summary

- Tightened Sprint closeout so a review must be terminal pass: `Status: Reviewed`
  or an accepted terminal synonym plus `Recommendation: pass`.
- Added structured review metadata to `verify-sprint` checks output:
  `metadata_status`, `recommendation`, and the terminal gate message.
- Made `verify-sprint` require external acceptance `pass` or constrained
  `manual_override`.
- Constrained manual override to explicit `External Acceptance: manual_override`,
  `External Source: manual-override`, `P1 blockers: none`, and a concrete
  non-placeholder `Manual Override:` reason.
- Added `commands_fail` as a first-class `verify-contract` exit criterion.
- Updated review/contract templates, embedded template copies, sprint workflow
  docs, and reference docs to teach terminal review status and edge-case gates.
- Bumped the package release line to `local-repo-harness@0.5.15`.

## Verification

- `bash -n` across modified shell helpers and hook libraries passed.
- Focused tests passed:
  `bun test tests/workflow-state-lib.test.ts tests/helper-scripts.test.ts tests/contract-run.test.ts tests/cli/sprint.test.ts`.
- Template/docs tests passed:
  `bun test tests/bootstrap-files.test.ts tests/workflow-contract.test.ts tests/readme-dx.test.ts tests/scaffold-parity.test.ts tests/cli/bootstrap.test.ts`.
- `bun run check:task-workflow` passed with existing brain-vault unavailable warnings.
- `bun run check:runtime-compat` passed.
- First `bun run check:release` ran 829 tests with 0 failures, then failed only
  at `check-task-sync` because this notes file did not exist yet.
- After adding this notes file, `bash scripts/check-task-sync.sh` passed.
- Final `bun run check:release` passed: 829 tests, 0 failures, plus deploy SQL,
  architecture sync, task sync, runtime compatibility, brain/workflow checks,
  and npm package gate.
