# Sprint Contract: local-repo-hook-user-level

> **Status**: Fulfilled
> **Plan**: plans/plan-20260612-2021-local-repo-hook-user-level.md
> **Owner**: chris
> **Capability ID**: root
> **Last Updated**: 2026-06-12 21:20
> **Review File**: `tasks/reviews/20260612-2021-local-repo-hook-user-level.review.md`
> **Notes File**: `tasks/notes/20260612-2021-local-repo-hook-user-level.notes.md`

## Goal

Default downstream repos to user-level hook execution by pruning repo-local hook entry scripts during scaffold/init/migration, while preserving the explicit `"hook_source": "repo"` escape hatch for repo-harness self-host hook development.

## Scope

- In scope: `pi_install_hook_assets`, create/init/migration entrypoints, hook operation docs, and targeted runtime/migration tests.
- Out of scope: removing context-budget, renaming `tasks/todo.md`, changing hook route behavior, or editing npm cache copies.

## Workflow Inventory

- Source plan: `plans/plan-20260612-2021-local-repo-hook-user-level.md`
- Deferred-goal ledger: `tasks/todo.md`
- Review file: `tasks/reviews/20260612-2021-local-repo-hook-user-level.review.md`
- Notes file: `tasks/notes/20260612-2021-local-repo-hook-user-level.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: `scripts/verify-sprint.sh` must see this contract pass, the review recommend pass, and `## External Acceptance Advice` pass or record a manual override.

## Allowed Paths

```yaml
allowed_paths:
  - docs/spec.md
  - plans/
  - tasks/todo.md
  - tasks/contracts/20260612-2021-local-repo-hook-user-level.contract.md
  - tasks/reviews/20260612-2021-local-repo-hook-user-level.review.md
  - tasks/notes/20260612-2021-local-repo-hook-user-level.notes.md
  - .ai/context/capabilities.json
  - scripts/create-project-dirs.sh
  - scripts/init-project.sh
  - scripts/migrate-project-template.sh
  - scripts/lib/project-init-lib.sh
  - docs/reference-configs/hook-operations.md
  - assets/reference-configs/hook-operations.md
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

```yaml
exit_criteria:
  files_exist:
    - docs/spec.md
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/20260612-2021-local-repo-hook-user-level.notes.md
  tests_pass:
    - path: tests/create-project-dirs.runtime.test.ts
    - path: tests/scaffold-parity.test.ts
    - path: tests/bootstrap-files.test.ts
    - path: tests/init-project.settings.runtime.test.ts
  commands_succeed:
    - bash -n scripts/lib/project-init-lib.sh scripts/create-project-dirs.sh scripts/init-project.sh scripts/migrate-project-template.sh
    - bun test tests/migration-script.test.ts -t "should apply migration and create workflow artifacts"
    - bun test tests/migration-script.test.ts -t "should prune stale repo-local hook runtime"
    - bun test tests/migration-script.test.ts -t "should keep full vendored hook runtime"
    - bash scripts/check-task-workflow.sh --strict
    - bash scripts/check-deploy-sql-order.sh
    - bash scripts/check-architecture-sync.sh
    - bash scripts/check-task-sync.sh
    - bun scripts/inspect-project-state.ts --repo . --format text
    - bash scripts/migrate-project-template.sh --repo . --dry-run
    - bash scripts/migrate-project-template.sh --repo /Users/chris/Projects/97app --dry-run
    - git diff --check
  qa_scores:
    - dimension: functionality
      min: 7
  manual_checks:
    - "Evaluator review file recommends pass"
```

## Acceptance Notes (Human Review)

- Functional behavior: non-pinned repos keep `.ai/hooks/lib/*.sh` and README only; pinned repos keep full hook runtime.
- Edge cases: stale root hook scripts are removed, while helper libs are refreshed instead of deleted.
- Regression risks: downstream custom root hook scripts are intentionally not preserved unless the repo pins `"hook_source": "repo"`.

## Rollback Point

- Commit / checkpoint: working tree before final commit.
- Revert strategy: revert this branch's changes to `scripts/*hook*`, hook docs, and the touched tests.
