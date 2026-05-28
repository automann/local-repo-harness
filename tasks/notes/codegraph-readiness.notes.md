# Implementation Notes: codegraph-readiness

> **Status**: Active
> **Plan**: plans/plan-20260528-1652-codegraph-readiness.md
> **Contract**: tasks/contracts/codegraph-readiness.contract.md
> **Review**: tasks/reviews/codegraph-readiness.review.md
> **Last Updated**: 2026-05-28
> **Lifecycle**: planning notes

## Review Corrections Applied

The initial captured plan picked the right product shape, but it missed three execution gates:

1. The plan referenced `tasks/contracts/codegraph-readiness.contract.md`, `tasks/notes/codegraph-readiness.notes.md`, and `tasks/reviews/codegraph-readiness.review.md` before those files existed.
2. Existing generated policy surfaces still say CodeGraph should not be a package dependency.
3. Existing `scripts/check-agent-tooling.sh` already has CodeGraph readiness logic, so the CLI implementation must migrate or wrap that behavior instead of inventing a second detector.

## Decisions

- Keep Option D: unified `agentic-dev` CLI surface, separate `tools` registry.
- Keep `agentic-dev install --target codex|claude|both` host-adapter only.
- Make `agentic-dev doctor` read-only. It may report and print commands, but it must not run `bun install`, `codegraph init`, `codegraph sync`, or MCP install.
- Put mutations under `agentic-dev tools ensure codegraph`.
- Keep MCP writes opt-in and out of this slice.
- Treat `--strict-readiness` as existing; it is already implemented by `scripts/check-agent-tooling.sh`.
- Use local-first resolution: repo `node_modules/.bin/codegraph`, then optional global fallback.

## Existing Surfaces To Reuse

- `scripts/check-agent-tooling.sh` already detects CodeGraph CLI, Codex MCP config, project index state, update state, and strict readiness failures.
- `tests/check-agent-tooling.test.ts` already protects read-only update checks and strict CodeGraph readiness behavior.
- `.ai/harness/policy.json`, `scripts/ensure-task-workflow.sh`, and `scripts/lib/project-init-lib.sh` currently encode CodeGraph as global MCP tooling with `vendoring_policy: do-not-add-package-dependency`.

## Implementation Constraints

- Do not let CodeGraph vendoring silently change downstream generated repo policy unless tests explicitly accept that new default.
- If vendoring is intended only for this self-host repo, make that exception explicit in docs and policy.
- Keep failure output bounded. Tool stdout/stderr captured by the new CLI should cap inline text and point to log files for overflow.
- Do not use `codegraph affected` as the verification selector for this repo; many tests execute scripts through subprocesses.

## Open Follow-ups For Implementation

- Decide whether the generated policy default becomes `vendored-dev-dependency` or remains `do-not-add-package-dependency` with a self-host exception.
- Decide whether shared `ToolFailure` / `ToolAction` types wait for a second tool or land now in `src/cli/tools/types.ts`.
- Add a regression proving `agentic-dev doctor --json` does not mutate local dependency, index, daemon, or MCP state.
