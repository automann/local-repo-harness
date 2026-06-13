# Project Scoped Install PRD Local Housekeeping Notes

> **Status**: Complete
> **Plan**: (none)
> **Contract**: (none)
> **Review**: (none)
> **Last Updated**: 2026-06-13 19:50
> **Lifecycle**: notes

## Design Decisions

- Keep `repo-harness-project-scoped-install-prd.md` inside the fork checkout for
  local implementation planning, but ignore it so the fork does not accidentally
  publish a working PRD artifact.
- Keep generated advisor handoff plans under `plans/` as local scratch output in
  this fork checkout; do not publish them unless a product plan explicitly
  promotes them to tracked repo-harness workflow artifacts.
- Limit this slice to local repository housekeeping and architecture analysis;
  no product code path changed.

## Deviations From Plan Or Spec

- No active product plan was opened for this local housekeeping request.

## Evidence Links

- Remote check: `git remote -v`
- Ignore check: `git check-ignore -v repo-harness-project-scoped-install-prd.md`
- Focused tests after dependency install:
  `bun test tests/cli/install.test.ts tests/cli/hook.test.ts tests/cli/security.test.ts tests/cli/prompt-guard-decision.test.ts tests/cli/codegraph.test.ts tests/cli/tools.test.ts tests/cli/doctor.test.ts`
- Hook/runtime focused tests:
  `bun test tests/hook-runtime.test.ts tests/tooling/codegraph-integration.test.ts`

## Promotion Candidates

- Promote project-scoped install decisions to a tracked PRD only if the fork
  chooses to implement the feature in mainline.
