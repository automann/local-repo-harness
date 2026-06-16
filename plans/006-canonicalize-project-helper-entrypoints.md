# Plan 006: Canonicalize project helper entrypoints

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report; do not improvise. When done, update the status row for this plan in
> `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 06b655f..HEAD -- AGENTS.md CLAUDE.md assets/partials-agents assets/reference-configs assets/templates docs/reference-configs docs/architecture/modules/runtime-harness tests/agents-assembly.test.ts tests/output-parity.test.ts tests/bootstrap-files.test.ts tests/scaffold-parity.test.ts tests/create-project-dirs.runtime.test.ts`
>
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding. On a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: dx
- **Planned at**: commit `06b655f`, 2026-06-16

## Why this matters

A real project-scoped install with `local-repo-harness@0.5.5` passed the core
isolation checks, but the acceptance handoff still asked the agent to run
`.ai/harness/scripts/check-agent-tooling.sh` and
`.ai/harness/scripts/check-task-workflow.sh`. Those files are intentionally
absent after compact package-mode adoption, so the false checks exited 127 even
though the root wrappers under `scripts/` passed. Agent-facing docs and
generated instructions must stop presenting `.ai/harness/scripts/*` as the
normal execution surface for `helper_source=package`.

## Current state

Relevant files and roles:

- `scripts/check-task-workflow.sh` - already accepts package-mode installs where
  `.ai/harness/scripts/` is not populated and root `scripts/*.sh` wrappers
  exist.
- `src/cli/repo-adoption/reclaim-runtime.ts` - writes root wrappers that call
  `PROJECT_CLI="$REPO_ROOT/.ai/harness/bin/local-repo-harness"` and then
  `exec "$PROJECT_CLI" run <helper>`.
- `docs/reference-configs/project-scoped-install-zh-CN.md` and
  `assets/reference-configs/project-scoped-install-zh-CN.md` - already use root
  wrappers in the final acceptance commands, but still list
  `.ai/harness/scripts/` as a common write path.
- `assets/partials-agents/02-operating-mode.partial.md`,
  `assets/partials-agents/04-task-protocol.partial.md`, and
  `assets/partials-agents/06-quality-safety.partial.md` - generated agent
  instructions still tell agents to run `bash .ai/harness/scripts/...`.
- `tests/agents-assembly.test.ts` - currently asserts generated AGENTS output
  contains `bash .ai/harness/scripts/check-task-sync.sh`,
  `bash .ai/harness/scripts/check-task-workflow.sh --strict`, and
  `bash .ai/harness/scripts/verify-contract.sh --contract <active-plan-contract> --strict`.

Real acceptance evidence from
`/tmp/local-repo-harness-acceptance-20260616-190400/final-evidence-summary.json`:

```json
{
  "versions": { "lhr": "0.5.5", "codegraph": "1.0.1", "rootPackage": "NO_ROOT_PACKAGE_JSON" },
  "exits": {
    "specifiedAgentTooling": "127",
    "rootAgentTooling": "0",
    "specifiedWorkflow": "127",
    "rootWorkflow": "0",
    "userDiff": "0"
  }
}
```

The 127 stderr was:

```text
bash: .ai/harness/scripts/check-agent-tooling.sh: No such file or directory
bash: .ai/harness/scripts/check-task-workflow.sh: No such file or directory
```

Current root-wrapper contract from `src/cli/repo-adoption/reclaim-runtime.ts`:

```ts
PROJECT_CLI="$REPO_ROOT/.ai/harness/bin/local-repo-harness"

if [[ -x "$PROJECT_CLI" ]]; then
  exec "$PROJECT_CLI" run ${id} "$@"
fi
```

Current generated-agent partial excerpts:

```md
- Environment check: `bash .ai/harness/scripts/check-agent-tooling.sh --host both --check-updates`.
- After substantive repo changes, run `bash .ai/harness/scripts/check-task-sync.sh` and `bash .ai/harness/scripts/check-task-workflow.sh --strict`.
- Run `bash .ai/harness/scripts/check-task-workflow.sh --strict` before claiming the workflow is clean.
```

Repo conventions to follow:

- Human shell commands for downstream package-mode installs should use root
  wrapper scripts, for example `bash scripts/check-task-workflow.sh --strict`.
- Machine policy/readiness commands may use
  `local-repo-harness run <helper>`, because the project-vendored CLI dispatches
  into package assets.
- `.ai/harness/scripts/*` may still appear when a paragraph explicitly discusses
  legacy/self-host/repo-pinned helper runtime, historical changelog entries, or
  archived plans. It must not be the default copyable command in current
  project-scoped package-mode docs.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Find active stale command examples | `rg -n "bash \\.ai/harness/scripts/" AGENTS.md CLAUDE.md assets/partials-agents docs/reference-configs assets/reference-configs` | no matches, except lines that explicitly say legacy/self-host/repo-pinned |
| Generated AGENTS/CLAUDE tests | `bun test tests/agents-assembly.test.ts tests/output-parity.test.ts tests/bootstrap-files.test.ts --timeout 60000 --max-concurrency 4` | all selected tests pass |
| Scaffold/runtime tests | `bun test tests/scaffold-parity.test.ts tests/create-project-dirs.runtime.test.ts tests/reclaim-runtime.test.ts --timeout 60000 --max-concurrency 4` | all selected tests pass |
| Runtime compatibility gate | `bash scripts/check-runtime-compat.sh` | exits 0 and prints `[runtime-compat] OK` |
| Release gate | `bun run check:release` | exits 0 |

## Scope

**In scope**:

- `AGENTS.md`
- `CLAUDE.md`
- `assets/partials-agents/*.partial.md`
- `assets/reference-configs/*.md`
- `docs/reference-configs/*.md`
- `docs/architecture/modules/runtime-harness/hook-adapters.md`
- `tests/agents-assembly.test.ts`
- `tests/output-parity.test.ts`
- `tests/bootstrap-files.test.ts`
- `tests/scaffold-parity.test.ts`
- `tests/create-project-dirs.runtime.test.ts`
- Add one focused scan test if no existing test can express the new invariant.

**Out of scope**:

- Do not resurrect generated `.ai/harness/scripts/check-*.sh` files for
  package-mode installs.
- Do not edit historical artifacts under `plans/archive/`, `docs/CHANGELOG.md`,
  `deploy/release-checklists/`, or old task contracts unless a current generated
  file consumes them.
- Do not change `helper_source=repo` behavior.
- Do not change CodeGraph package/root bootstrap behavior; that was completed
  by plans 001 and 005.

## Git workflow

- Branch: `codex/project-helper-entrypoints`
- Commit message style: conventional commits, for example
  `docs: canonicalize project helper entrypoints`
- Do not push unless the operator asks.

## Steps

### Step 1: Define the current command contract in the Chinese guide

Update both:

- `docs/reference-configs/project-scoped-install-zh-CN.md`
- `assets/reference-configs/project-scoped-install-zh-CN.md`

Add a short note near the acceptance section:

- In the default project-scoped package mode, `.ai/harness/scripts/` is a state
  directory and may contain only `.gitkeep`.
- Use `bash scripts/<helper>.sh ...` for shell checks.
- Use `./.ai/harness/bin/local-repo-harness run <helper> ...` when calling the
  project-vendored CLI directly.

Also change the "common writes" list so `.ai/harness/scripts/` is either removed
or qualified as "directory marker only; helper files are not expected in package
mode".

**Verify**:
`diff -u docs/reference-configs/project-scoped-install-zh-CN.md assets/reference-configs/project-scoped-install-zh-CN.md`
-> exits 0.

### Step 2: Update generated agent instructions

Replace active generated-agent commands:

- `bash .ai/harness/scripts/check-agent-tooling.sh --host both --check-updates`
  -> `bash scripts/check-agent-tooling.sh --host both --check-updates`
- `bash .ai/harness/scripts/check-task-sync.sh`
  -> `bash scripts/check-task-sync.sh`
- `bash .ai/harness/scripts/check-task-workflow.sh --strict`
  -> `bash scripts/check-task-workflow.sh --strict`
- `bash .ai/harness/scripts/verify-contract.sh --contract <active-plan-contract> --strict`
  -> `bash scripts/verify-contract.sh --contract <active-plan-contract> --strict`
- `.ai/harness/scripts/plan-to-todo.sh --plan <approved-plan>`
  -> `bash scripts/plan-to-todo.sh --plan <approved-plan>`
- `.ai/harness/scripts/contract-worktree.sh finish`
  -> `bash scripts/contract-worktree.sh finish`
- `.ai/harness/scripts/capture-plan.sh ...`
  -> `bash scripts/capture-plan.sh ...`

Apply this to `assets/partials-agents/` first, then regenerate or manually
update `AGENTS.md` and `CLAUDE.md` according to the repo's existing assembly
pattern.

**Verify**:
`rg -n "bash \\.ai/harness/scripts/" AGENTS.md CLAUDE.md assets/partials-agents`
-> no output.

### Step 3: Update active reference configs

Update current, non-historical docs under `docs/reference-configs/` and mirrored
copies under `assets/reference-configs/` so copyable current commands use root
wrappers or `local-repo-harness run`.

High-signal files from recon:

- `docs/reference-configs/heartbeat-triage.md`
- `assets/reference-configs/heartbeat-triage.md`
- `docs/reference-configs/agentic-development-flow.md`
- `assets/reference-configs/agentic-development-flow.md`
- `docs/reference-configs/external-tooling.md`
- `assets/reference-configs/external-tooling.md`
- `docs/reference-configs/hook-operations.md`
- `assets/reference-configs/hook-operations.md`
- `docs/reference-configs/harness-overview.md`
- `assets/reference-configs/harness-overview.md`
- `docs/reference-configs/sprint-contracts.md`
- `assets/reference-configs/sprint-contracts.md`

If a paragraph genuinely describes legacy/repo-pinned helper runtime, keep the
`.ai/harness/scripts/*` path but add the qualifier "legacy/self-host/repo-pinned
helper runtime".

**Verify**:
`rg -n "bash \\.ai/harness/scripts/" docs/reference-configs assets/reference-configs`
-> no output unless every remaining match contains the same line or adjacent
sentence qualifier `legacy`, `self-host`, or `repo-pinned`.

### Step 4: Update tests to lock the contract

Update `tests/agents-assembly.test.ts` and any affected output/parity tests to
expect root wrappers. Add a focused regression test if the existing tests do not
cover the stale path:

- Test name: `project-scoped docs do not advertise reclaimed helper paths`.
- It should scan current generated surfaces, not historical plans:
  `AGENTS.md`, `CLAUDE.md`, `assets/partials-agents/`, `docs/reference-configs/`,
  and `assets/reference-configs/`.
- It should fail if a current copyable command starts with
  `bash .ai/harness/scripts/`.

**Verify**:
`bun test tests/agents-assembly.test.ts tests/output-parity.test.ts tests/bootstrap-files.test.ts --timeout 60000 --max-concurrency 4`
-> all pass.

### Step 5: Run the focused release checks

Run the remaining focused checks:

```bash
bun test tests/scaffold-parity.test.ts tests/create-project-dirs.runtime.test.ts tests/reclaim-runtime.test.ts --timeout 60000 --max-concurrency 4
bash scripts/check-runtime-compat.sh
bun run check:release
```

Expected result: all commands exit 0.

## Test plan

- Update generated instruction tests to assert root-wrapper commands.
- Add or update a scan test to reject `bash .ai/harness/scripts/` in current
  agent-facing docs.
- Preserve existing tests that prove package-mode installs do not require
  `.ai/harness/scripts/*` helper files.

## Done criteria

- [ ] Current project-scoped docs explain that `.ai/harness/scripts/` is not the
  package-mode helper execution surface.
- [ ] Generated AGENTS/CLAUDE instructions use `scripts/*.sh` or
  `local-repo-harness run <helper>`.
- [ ] `rg -n "bash \\.ai/harness/scripts/" AGENTS.md CLAUDE.md assets/partials-agents docs/reference-configs assets/reference-configs`
  has no unqualified current-command matches.
- [ ] Focused tests and `bun run check:release` exit 0.
- [ ] `plans/README.md` status row updated.

## STOP conditions

Stop and report back if:

- A current runtime test depends on `.ai/harness/scripts/check-agent-tooling.sh`
  or `.ai/harness/scripts/check-task-workflow.sh` existing under
  `helper_source=package`.
- The fix appears to require changing `helper_source=repo` behavior.
- Mirrored docs under `docs/reference-configs/` and `assets/reference-configs/`
  cannot be kept synchronized.
- A verification command fails twice after a reasonable fix attempt.

## Maintenance notes

Reviewers should scrutinize whether every changed command remains valid in a
zero-root-`package.json` downstream repo. The key invariant is that package mode
uses root wrappers or the project-vendored CLI; `.ai/harness/scripts/*` is only
for legacy/self-host/repo-pinned helper runtime.
