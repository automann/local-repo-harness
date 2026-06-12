# Implementation Notes: local-repo-hook-user-level

> **Status**: Active
> **Plan**: plans/plan-20260612-2021-local-repo-hook-user-level.md
> **Contract**: tasks/contracts/20260612-2021-local-repo-hook-user-level.contract.md
> **Review**: tasks/reviews/20260612-2021-local-repo-hook-user-level.review.md
> **Last Updated**: 2026-06-12 20:21
> **Lifecycle**: notes

## Design Decisions

- Downstream repos now default to user-level hook execution. `pi_install_hook_assets` keeps only `.ai/hooks/lib/*.sh` plus `.ai/hooks/README.md` unless `.ai/harness/policy.json` pins `"hook_source": "repo"` or `REPO_HARNESS_HOOK_SOURCE=repo` is set.
- Repo-local hook entry scripts are pruned only at `.ai/hooks/*` top level for non-pinned repos. Shared libs remain because workflow helper scripts can still source them.
- Self-hosted repo-harness development keeps the full vendored runtime through the explicit `hook_source=repo` escape hatch.

## Deviations From Plan Or Spec

- None recorded.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Delete all `.ai/hooks` files | Rejected | Helper libraries are still a shared shell utility surface and deleting them would break repo workflow scripts. |
| Keep full fallback runtime everywhere | Rejected | Stale root hook scripts make downstream repos look repo-local even when user-level hooks are the active runtime. |
| Lib-only fallback by default | Accepted | It preserves helper compatibility while removing the misleading runnable hook surface. |

## Open Questions

- None.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Targeted tests:
  - `bun test tests/create-project-dirs.runtime.test.ts tests/scaffold-parity.test.ts tests/bootstrap-files.test.ts tests/init-project.settings.runtime.test.ts tests/migration-script.test.ts`

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.
