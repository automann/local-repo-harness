# Implementation Notes: Upstream v0.5 Project-Scope Sync

## Scope

Merged upstream `Ancienttwo/repo-harness@6e1b7d1` into the project-scoped
install fork while preserving the isolation guarantee: project or none scope
must not silently fall back to user-level writes.

## Decisions

| Decision | Rationale | Consequence |
| --- | --- | --- |
| Accept upstream `update` / `adopt` split | Upstream v0.5 made command ownership clearer: `update` is global/user runtime refresh, `adopt` is repo-local workflow adoption. | High-level project-scoped flags moved onto `adopt`; `update --repo`, `--dry-run`, and `--interactive` now reject with an adopt hint. |
| Make `runInit` default to no user-scope side effects | CLI `adopt` passed safe defaults, but direct callers and interactive mode could still default to user skills/adapters/tools. | Direct repo adoption defaults now use `none`; tests that intentionally exercise user-level bootstrap pass explicit user scope. |
| Keep `adopt --interactive` repo-local | The upstream interactive path asked for brain roots and configured global CodeGraph MCP, which bypassed `adopt` user-level rejections. | Interactive adoption no longer writes global working rules, does not ask for a brain root, and does not configure user-level CodeGraph MCP. |
| Preserve active project adapters during runtime reclaim | Upstream reclaim treats repo-local hook config as legacy cleanup, but project scope makes `.codex/hooks.json` and `.claude/settings.json` active adapters. | Reclaim preserves managed repo-local adapters when policy says `host_adapters.scope=project`, while still stripping legacy managed hooks in non-project scope. |
| Keep workflow state repo-local while using package-dispatched helpers | Upstream package helper runtime is useful, but `repoLocalFirst=false` misstates the workflow authority model. | Workflow contract keeps `repoLocalFirst=true` and adds precise helper/hook source fields. |
| Align public docs around safe adoption first | Installer docs from upstream led with `init`, which can write user-level hooks/skills/MCP/brain state. | English and localized READMEs now present safe `adopt --dry-run` first, project-scope adoption second, and `init` as optional machine bootstrap. |
| Keep version line at `0.5.0` for sync | This branch is absorbing upstream v0.5 identity, not preparing an independent npm publish. | `check-npm-release.sh` fails at the npm availability gate because `repo-harness@0.5.0` already exists; this is recorded as an expected non-publish result. |

## Verification

- `bun test tests/cli/init.test.ts tests/cli/install.test.ts tests/cli/run.test.ts`
  passed: 45 tests.
- `bun test tests/reclaim-runtime.test.ts tests/install-scripts.test.ts tests/migration-script.test.ts tests/workflow-contract.test.ts tests/scaffold-parity.test.ts tests/readme-dx.test.ts tests/create-project-dirs.runtime.test.ts`
  passed: 68 tests.
- `bun test tests/check-agent-tooling.test.ts tests/cli/tools.test.ts tests/cli/init-hook.test.ts tests/hook-runtime.test.ts tests/hook-contracts.test.ts tests/cli/status.test.ts tests/cli/doctor.test.ts tests/cli/security.test.ts tests/cli/migrate.test.ts`
  passed: 193 tests.
- Full `bun test` passed: 768 tests, 0 failures.
- `bash scripts/check-deploy-sql-order.sh` passed.
- `bash scripts/check-architecture-sync.sh` passed in advisory mode with
  `changed_capabilities=7` and `blocking=0`.
- `bash scripts/check-task-sync.sh` passed.
- `bash scripts/check-task-workflow.sh --strict` passed; brain vault warnings
  were limited to unavailable external vault paths.
- `bun scripts/inspect-project-state.ts --repo . --format text` reported no
  drift signals or required decisions.
- `bash scripts/migrate-project-template.sh --repo . --dry-run` completed and
  rendered the migration report.
- `git diff --check` passed.
- `rg -n "^(<<<<<<<|=======|>>>>>>>)" . -g '!node_modules' -g '!dev-tests'`
  produced no merge-conflict markers.
- `bash scripts/check-npm-release.sh` stopped at the expected release gate:
  `repo-harness@0.5.0 already exists on npm`. No publish is intended by this
  sync branch.
