# Sprint Contract: think-users-ancienttwo-agents-skillsthink-skill-md

> **Status**: Active
> **Plan**: plans/plan-20260530-0142-think-users-ancienttwo-agents-skillsthink-skill-md.md
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-05-30 01:42
> **Review File**: `tasks/reviews/think-users-ancienttwo-agents-skillsthink-skill-md.review.md`
> **Notes File**: `tasks/notes/think-users-ancienttwo-agents-skillsthink-skill-md.notes.md`

## Goal

Describe the exact outcome this task must deliver.

## Scope

- In scope:
- Out of scope:

## Workflow Inventory

- Source plan: `plans/plan-20260530-0142-think-users-ancienttwo-agents-skillsthink-skill-md.md`
- Deferred-goal ledger: `tasks/todo.md`
- Review file: `tasks/reviews/think-users-ancienttwo-agents-skillsthink-skill-md.review.md`
- Notes file: `tasks/notes/think-users-ancienttwo-agents-skillsthink-skill-md.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: `scripts/verify-sprint.sh` must see this contract pass and the review recommend pass.

## Allowed Paths

```yaml
allowed_paths:
  - docs/spec.md
  - plans/
  - tasks/todo.md
  - tasks/contracts/think-users-ancienttwo-agents-skillsthink-skill-md.contract.md
  - tasks/reviews/think-users-ancienttwo-agents-skillsthink-skill-md.review.md
  - tasks/notes/think-users-ancienttwo-agents-skillsthink-skill-md.notes.md
  - .ai/context/capabilities.json
  - src/
  - tests/
```

## Exit Criteria (Machine Verifiable)

```yaml
exit_criteria:
  files_exist:
    - docs/spec.md
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/think-users-ancienttwo-agents-skillsthink-skill-md.notes.md
  tests_pass:
    - path: tests/unit/think-users-ancienttwo-agents-skillsthink-skill-md.test.ts
  commands_succeed:
    - bun run typecheck
  qa_scores:
    - dimension: functionality
      min: 7
  manual_checks:
    - "Evaluator review file recommends pass"
```

## Acceptance Notes (Human Review)

- Functional behavior:
- Edge cases:
- Regression risks:

## Rollback Point

- Commit / checkpoint:
- Revert strategy:
