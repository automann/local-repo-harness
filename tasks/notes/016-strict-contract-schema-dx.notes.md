# Notes: Strict Contract Schema DX

> **Date**: 2026-06-20
> **Plan**: `plans/016-strict-contract-schema-dx.md`
> **Status**: Implemented

## Context

Real Sprint row execution on downstream `local-repo-harness@0.5.16` exposed two
contract protocol problems:

- A task contract could place `verify-sprint` inside `commands_succeed`, causing
  `verify-sprint -> verify-contract -> verify-sprint` recursion.
- Strict enum-like fields such as `manual_checks`, `External Source`, and
  `P1 blockers` were enforced by scripts but not made obvious in templates,
  docs, or failure messages.

## Implementation Notes

- Added a verifier-side guard that rejects repo workflow/meta commands inside
  `commands_succeed` and `commands_fail` before shell execution.
- Kept `manual_checks` as a narrow verifier-owned enum and made unsupported
  values point agents to Acceptance Notes or review files for custom evidence.
- Normalized no-blocker spelling for external acceptance so `None.` is accepted
  as `none`, while preserving strict `External Source: manual-override`.
- Updated contract/review templates, generated helper surfaces, the Sprint
  action command, and QUICK_START so task-local checks are distinct from outer
  workflow/closeout gates.
- Bumped release metadata to `local-repo-harness@0.5.17`.

## Verification

- `bash -n scripts/verify-contract.sh assets/templates/helpers/verify-contract.sh assets/hooks/lib/workflow-state.sh .ai/hooks/lib/workflow-state.sh`
- `bun test tests/helper-scripts.test.ts --test-name-pattern "meta workflow command|manual_checks"`
- `bun test tests/helper-scripts.test.ts --test-name-pattern "verify-contract"`
- `bun test tests/workflow-state-lib.test.ts`
- `bun test tests/bootstrap-files.test.ts tests/readme-dx.test.ts tests/workflow-contract.test.ts`
- `bun test tests/skill-version.test.ts tests/bootstrap-files.test.ts tests/cli/bootstrap.test.ts`
- `bun test`
- `bun run check:release`

The first `bun run check:release` after the 0.5.17 bump proved package
availability and passed the full `bun test` stage, then stopped at
`check-task-sync` because this task note had not yet been added. After adding
the task note, the release gate was rerun and passed through `npm pack
--dry-run`.
