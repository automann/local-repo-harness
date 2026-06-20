# Sprint Contract: {{TASK_SLUG}}

> **Status**: Active
> **Plan**: {{PLAN_FILE}}
> **Owner**: {{OWNER}}
> **Capability ID**: {{CAPABILITY_ID}}
> **Last Updated**: {{TIMESTAMP}}
> **Review File**: `{{REVIEW_FILE}}`
> **Notes File**: `{{NOTES_FILE}}`

## Goal

Describe the exact outcome this task must deliver.

## Scope

- In scope:
- Out of scope:

## Workflow Inventory

- Source plan: `{{PLAN_FILE}}`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `{{REVIEW_FILE}}`
- Notes file: `{{NOTES_FILE}}`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: `scripts/verify-sprint.sh` must see this contract pass, the review status be terminal, the review recommendation be pass, and `## External Acceptance Advice` pass or record a constrained manual override.
- Contract command boundary: `commands_succeed` and `commands_fail` are task-local machine checks only. Do not place `verify-sprint`, `check-task-workflow`, `contract-worktree finish`, `sprint execute-approved`, or other workflow/closeout commands inside `exit_criteria`.

## Allowed Paths

```yaml
allowed_paths:
  - docs/spec.md
  - plans/
  - tasks/todos.md
  - {{CONTRACT_FILE}}
  - {{REVIEW_FILE}}
  - {{NOTES_FILE}}
  - .ai/context/capabilities.json
  - src/
  - tests/
```

## Delegation Contract

```yaml
delegation:
  budget:
    tokens: null
    tool_calls: null
    wall_time_minutes: null
  permission_scope:
    mode: inherit_allowed_paths
    writable_paths: []
    network: inherited
  roles:
    parent: narrate_and_gatekeep
    worker: implement_contract
    verifier: review_exit_criteria
```

## Exit Criteria (Machine Verifiable)

`commands_succeed` and `commands_fail` should contain row acceptance commands
and task-local edge cases. Run outer workflow gates after contract verification
and record those results in the review, notes, or checks snapshot.
`manual_checks` is a verifier-owned enum; keep only
`"Evaluator review file is terminal pass"` unless verifier code adds another
supported value. Put custom human assertions in Acceptance Notes or the review
file, not `exit_criteria.manual_checks`.

```yaml
exit_criteria:
  files_exist:
    - docs/spec.md
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - {{NOTES_FILE}}
  tests_pass:
    - path: tests/unit/{{TASK_SLUG}}.test.ts
  commands_succeed:
    - bun run typecheck
  commands_fail: []
  qa_scores:
    - dimension: functionality
      min: 7
  manual_checks:
    - "Evaluator review file is terminal pass"
```

## Acceptance Notes (Human Review)

- Functional behavior:
- Edge cases covered by task-local `commands_succeed` or `commands_fail`:
- Regression risks and residual ungated risk:

## Rollback Point

- Commit / checkpoint:
- Revert strategy:
