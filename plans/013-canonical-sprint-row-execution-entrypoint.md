# Plan 013: Add a canonical approved Sprint row execution entrypoint

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report; do not improvise. When done, update the status row for this plan in
> `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 4ae90d9..HEAD -- src/cli/index.ts src/cli/commands/run.ts src/cli/runtime/helper-runner.ts scripts/capture-plan.sh scripts/contract-worktree.sh scripts/plan-to-todo.sh scripts/sprint-backlog.sh assets/templates/helpers/capture-plan.sh assets/templates/helpers/contract-worktree.sh assets/templates/helpers/plan-to-todo.sh assets/templates/helpers/sprint-backlog.sh assets/workflow-contract.v1.json assets/skill-commands/repo-harness-sprint/SKILL.md QUICK_START.md README.md tests/cli/run.test.ts tests/helper-scripts.test.ts tests/sprint-backlog.test.ts tests/action-command-skills.test.ts tests/readme-dx.test.ts tests/workflow-contract.test.ts tests/bootstrap-files.test.ts`
>
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding. On a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: HIGH
- **Depends on**: plans/006-canonicalize-project-helper-entrypoints.md, plans/007-clarify-helper-runtime-policy-semantics.md, plans/012-vcs-profile-three-layer-policy.md
- **Category**: dx | tech-debt | tests
- **Planned at**: commit `4ae90d9`, 2026-06-18

## Why this matters

The `repo-harness-sprint` workflow is conceptually correct, but the approved
row execution path is too implicit. A real Codex run on 2026-06-18 eventually
completed one Sprint row through `plan -> contract -> worktree -> verify`, but
the agent had to reverse-engineer helper scripts, inspect package internals,
manually work around project-scoped helper runtime state, and copy local-only
workflow artifacts back into the primary workspace after merge. That is a DX
failure: the workflow succeeded because the agent was careful, not because the
installed harness exposed a clear execution surface.

After this plan lands, an agent that has already produced an approved
just-in-time plan for the next Sprint backlog row should have one canonical
command to run. That command must capture the approved plan, project the task
contract, prepare the correct worktree/runtime boundary for project-scoped
installs, and make closeout state visible in the primary workspace even when
workflow files are local-only. Helper `--help` output must also become
discoverable so agents do not have to read package source to learn the workflow.

## Current state

Relevant files and roles:

- `assets/skill-commands/repo-harness-sprint/SKILL.md` - action-command skill
  contract for Sprint planning and row execution.
- `src/cli/commands/run.ts` - public `local-repo-harness run <helper>` command.
- `src/cli/runtime/helper-runner.ts` - resolves helper scripts from package
  assets or repo-pinned `.ai/harness/scripts`, then spawns them.
- `scripts/capture-plan.sh` and `assets/templates/helpers/capture-plan.sh` -
  capture approved planning output into `plans/plan-*.md`; `--execute`
  delegates to `plan-to-todo`.
- `scripts/plan-to-todo.sh` and `assets/templates/helpers/plan-to-todo.sh` -
  project an Approved plan into task contracts/reviews/notes and optionally
  start a contract worktree.
- `scripts/contract-worktree.sh` and
  `assets/templates/helpers/contract-worktree.sh` - create, verify, commit,
  merge, and clean contract worktrees.
- `scripts/sprint-backlog.sh` and
  `assets/templates/helpers/sprint-backlog.sh` - manage active Sprint backlog
  rows and complete rows by source ref.
- `QUICK_START.md` - user-facing workflow guide.
- `tests/cli/run.test.ts`, `tests/helper-scripts.test.ts`,
  `tests/sprint-backlog.test.ts`, `tests/readme-dx.test.ts`,
  `tests/action-command-skills.test.ts`, `tests/workflow-contract.test.ts`,
  and `tests/bootstrap-files.test.ts` - existing regression surfaces.

Current `repo-harness-sprint` skill route says the right thing at a high level:

```md
assets/skill-commands/repo-harness-sprint/SKILL.md:25-30
4. Route `run` (incremental, one backlog task per invocation):
   - Run `bash scripts/sprint-backlog.sh next` to resolve the next pending row...
   - Treat the row as a long-task waypoint...
   - Capture the approved `$think` output with `bash scripts/capture-plan.sh ... --status Approved --execute`...
   - Execute the slice as usual (implement, `/check`, external acceptance, `bash scripts/contract-worktree.sh finish`)...
```

The problem is that this leaves the most error-prone transition as prose. There
is no single "approved row plan -> contract worktree" command.

Current `run` command lets unknown options pass through, but Commander owns
`--help` before the helper can see it:

```ts
src/cli/commands/run.ts:4-20
export function buildRunCommand(): Command {
  const run = new Command('run')
    .description('Run a bundled repo-harness workflow helper')
    .allowUnknownOption(true);

  run
    .argument('<helper>', 'Helper id, for example check-task-workflow')
    .argument('[args...]', 'Arguments passed to the helper')
    .action((helper: string, args: string[]) => {
      const result = runHelper({ helper, args });
      ...
      process.exit(result.exitCode);
    });
```

In practice, `local-repo-harness run capture-plan --help` shows generic
`run` help rather than the helper's `scripts/capture-plan.sh` usage. This
forces agents to inspect helper implementation files.

Current helper runner resolves package helpers and sets the target cwd, but it
does not give shell helpers an explicit target repo root:

```ts
src/cli/runtime/helper-runner.ts:109-149
export function resolveHelper(helper: string, cwd = process.cwd(), env: NodeJS.ProcessEnv = process.env): ResolvedHelper | null {
  const repoRoot = resolveRepoRoot(cwd, env);
  ...
  return (
    resolveFromDir(helper, PACKAGE_HELPERS_ROOT, 'package', repoRoot) ??
    resolveFromDir(helper, repoHelpersRoot, 'repo-fallback', repoRoot)
  );
}

export function runHelper(opts: RunHelperOptions): RunHelperResult {
  ...
  const child = spawnSync(command, [resolved.path, ...args], {
    cwd: resolved.repoRoot,
    env: { ...env, REPO_HARNESS_HELPER_SOURCE_PATH: resolved.path },
```

Many shell helpers still resolve the repo by inspecting `SCRIPT_DIR`, for
example:

```sh
scripts/capture-plan.sh:4-11
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if REPO_ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel 2>/dev/null)"; then
  cd "$REPO_ROOT"
elif [[ "$SCRIPT_DIR" == */.ai/harness/scripts ]]; then
  cd "$SCRIPT_DIR/../../.."
else
  cd "$SCRIPT_DIR/.."
fi
```

When package-mode helpers are launched from a project-managed runtime, the
script directory is inside the package, not necessarily the target project.
The runner's `cwd` helps only if the helper respects it. This is exactly the
kind of hidden runtime contract that confused the real execution thread.

Current approved-plan capture exists, but it is not wrapped in a Sprint-row
orchestration command:

```sh
scripts/capture-plan.sh:151-167
--body-file)
  ...
--execute)
  execute=1
  shift
  ;;
--help|-h)
  usage
  exit 0
```

```sh
scripts/capture-plan.sh:190-193
if [[ "$execute" -eq 1 && "$status" != "Approved" ]]; then
  echo "--execute requires --status Approved" >&2
  exit 1
fi
```

Current worktree start assumes root `scripts/plan-to-todo.sh` exists in the
new linked worktree:

```sh
scripts/contract-worktree.sh:295-309
git worktree add "$worktree_path" -b "$branch_name" HEAD
...
(
  cd "$worktree_path"
  write_start_metadata "$slug" "$plan_file" "$branch_name" "$worktree_path" "$base_branch"
  if [[ "$run_plan_to_todo" -eq 1 && -f "scripts/plan-to-todo.sh" ]]; then
    REPO_HARNESS_CONTRACT_WORKTREE=1 bash "scripts/plan-to-todo.sh" --plan "$plan_file"
  fi
)
```

This works in self-host or tracked-governance repos where helper scripts are
tracked. It is fragile in project-scoped installs where helper runtime and
workflow files are intentionally local-only or ignored.

Current finish verifies, archives, backfills, commits, and merges tracked code:

```sh
scripts/contract-worktree.sh:512-542
check_architecture_freshness "$target_branch"
bash "scripts/verify-sprint.sh"
check_scope_against_contract "$contract_file"
archive_finished_workflow "$active_plan"
clean_local_runtime_markers
backfill_sprint_backlog "$active_plan" || true
...
git -C "$target_worktree" merge --ff-only "$current_branch"
```

Current Sprint backfill is warn-only and happens inside the linked worktree:

```sh
scripts/contract-worktree.sh:545-586
# Warn-only sprint backlog back-fill...
backfill_sprint_backlog() {
  ...
  if bash scripts/sprint-backlog.sh complete-task --sprint "$sprint_path" --task "$task_ref" --plan "$archived_plan"; then
    echo "[ContractWorktree] Sprint backlog updated: $sprint_path ($task_ref)"
  else
    echo "[ContractWorktree] Warning: sprint backlog back-fill failed..."
  fi
}
```

If `plans/` and `tasks/` are local-only ignored in the primary workspace, the
Git merge does not carry the updated Sprint row, archived plan, contract,
review, notes, checks, or handoff artifacts back. The agent in the real thread
had to manually copy these local-only workflow artifacts.

Current `QUICK_START.md` improves prompt-level guidance but still has no
canonical command:

```md
QUICK_START.md:236-248
### Step 2：按已批准计划执行当前 Row

Prompt template：

当前 Sprint backlog row 的详细计划已批准。
只执行这一条 row，并通过 repo-harness plan -> contract -> worktree -> verify 流程推进。
...
实现前先 capture/投射已批准计划，确保有对应 contract 和 worktree 边界。
```

Repo conventions to follow:

- Keep project-scoped installs local-first. Do not add user-level fallback
  writes under `~/.codex`, `~/.claude`, `~/.agents`, `~/.repo-harness`, or
  `~/.codegraph`.
- Keep `status`, `doctor`, `vcs audit`, and new "next action" discovery
  commands read-only.
- Shell helpers under `scripts/` and `assets/templates/helpers/` must stay in
  parity. Existing tests already check this parity.
- Prefer small TypeScript command modules under `src/cli/commands/` for CLI
  routing and shell helpers for repo workflow mutation, matching the current
  `vcs`, `docs`, `tools`, and `run` command pattern.
- Tests should use Bun's `bun:test`, temp repos under `tmpdir()`, `spawnSync`,
  local Git config, and cleanup with `rmSync(..., { recursive: true,
  force: true })`.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Focused run/helper dispatch tests | `bun test tests/cli/run.test.ts --timeout 60000 --max-concurrency 4` | all selected tests pass |
| Focused Sprint helper tests | `bun test tests/sprint-backlog.test.ts tests/helper-scripts.test.ts --timeout 60000 --max-concurrency 4` | all selected tests pass |
| Skill/docs contract tests | `bun test tests/action-command-skills.test.ts tests/readme-dx.test.ts --timeout 60000 --max-concurrency 4` | all selected tests pass |
| Contract/helper manifest tests | `bun test tests/workflow-contract.test.ts tests/bootstrap-files.test.ts --timeout 60000 --max-concurrency 4` | all selected tests pass |
| Runtime compatibility | `bash scripts/check-runtime-compat.sh` | exit 0 |
| Workflow gate | `bash scripts/check-task-workflow.sh --strict` | exit 0 |
| Full test suite | `bun test --timeout 60000 --max-concurrency 4` | all tests pass |
| Release gate | `bun run check:release` | exit 0 |

## Scope

**In scope**:

- `src/cli/index.ts`
- `src/cli/commands/run.ts`
- `src/cli/runtime/helper-runner.ts`
- New `src/cli/commands/sprint.ts` if a top-level `sprint` command is added.
- `scripts/capture-plan.sh` and `assets/templates/helpers/capture-plan.sh`
- `scripts/contract-worktree.sh` and
  `assets/templates/helpers/contract-worktree.sh`
- `scripts/plan-to-todo.sh` and `assets/templates/helpers/plan-to-todo.sh`
- `scripts/sprint-backlog.sh` and `assets/templates/helpers/sprint-backlog.sh`
- New helper files under both `scripts/` and `assets/templates/helpers/` if
  the implementation adds `sprint-row.sh`.
- `assets/workflow-contract.v1.json`
- `assets/skill-commands/repo-harness-sprint/SKILL.md`
- `QUICK_START.md` and, only if necessary, the command reference portions of
  `README.md`.
- Tests listed in "Commands you will need".

**Out of scope**:

- Reworking PRD generation or Sprint backlog schema beyond fields needed for
  row execution.
- Adding autonomous multi-row or goal mode. The skill explicitly says goal mode
  is future work.
- Changing CodeGraph install behavior, VCS profile semantics, or user/global
  install paths.
- Replacing Waza `/think`, `/hunt`, or `/check`. The new entrypoint consumes an
  already approved plan; it does not produce the detailed plan itself.
- Publishing to npm, bumping package version, pushing branches, or editing
  downstream test projects unless the operator asks.

## Git workflow

- Branch: `codex/canonical-sprint-row-entrypoint`
- Commit style: Conventional commits, matching recent history such as
  `docs: add workflow quick start` and `feat: add vcs profile policy`.
- Do not push or open a PR unless the operator explicitly asks.
- Preserve unrelated local changes. If any in-scope file is already dirty at
  start, inspect it and incorporate it only if it belongs to this plan.

## Target behavior

Add one canonical execution path for an approved Sprint row. The preferred
public surface is:

```bash
local-repo-harness sprint next --json
local-repo-harness sprint execute-approved \
  --body-file <approved-plan.md> \
  --slug <row-slug> \
  --title <title>
```

Acceptable implementation alternative:

```bash
local-repo-harness run sprint-row next --json
local-repo-harness run sprint-row execute-approved \
  --body-file <approved-plan.md> \
  --slug <row-slug> \
  --title <title>
```

Choose one primary public surface and document it consistently. If both are
implemented, the top-level `sprint` command must be the documented canonical
surface and the helper route must be a compatibility/delegation layer.

The command must:

- Resolve the active Sprint and next pending row.
- Fail if the Sprint is not Approved, no row is pending, or the selected row is
  already complete.
- Consume an approved detailed plan from `--body-file` or stdin.
- Call the existing capture path with equivalent semantics to:

  ```bash
  bash scripts/capture-plan.sh \
    --source waza-think \
    --source-ref "sprint:<sprint-file>#<task>" \
    --status Approved \
    --execute \
    --slug <slug> \
    --title <title> \
    --body-file <approved-plan.md>
  ```

- Project contract/review/notes and start the contract worktree for
  `contract` rows unless `--no-worktree` is explicit.
- For `inline` rows, capture/project the plan but do not create a linked
  worktree unless the user explicitly asks.
- Emit machine-readable JSON when `--json` is passed. Include at least:
  `sprintFile`, `rowIndex`, `task`, `mode`, `acceptance`, `planFile`,
  `contractFile`, `reviewFile`, `notesFile`, `worktreePath`, `branch`, and
  `nextAction`.
- Never mark the Sprint row complete during `execute-approved`. Completion is
  still gated by verification and closeout.

## Steps

### Step 1: Fix helper-level help passthrough

Update `src/cli/commands/run.ts` so these both work:

```bash
local-repo-harness run --help
local-repo-harness run capture-plan --help
```

Expected behavior:

- `run --help` prints generic run command help, including an example helper id.
- `run capture-plan --help` executes the helper and prints the
  `scripts/capture-plan.sh --slug <slug>` usage, not generic run help.
- Unknown helper behavior still lists known helpers.
- Unknown helper options still pass through to helpers.

Implementation guidance:

- Commander currently intercepts `--help` because `run` defines help for the
  command and `<helper>` as a required argument. Consider making helper optional
  at the Commander layer, disabling the automatic help option for `run`, and
  manually routing:
  - no helper plus `--help` or `-h` -> `run.outputHelp()` and exit 0.
  - helper present plus `--help` or `-h` -> pass through to `runHelper`.
  - no helper without help -> print usage and exit 2.
- Do not break `local-repo-harness --help` or other subcommand help.

Add tests in `tests/cli/run.test.ts`:

- A fixture helper with `--help` prints helper usage when invoked via `run`.
- `bun src/cli/index.ts run --help` still prints "Run a bundled
  repo-harness workflow helper".
- The existing "passes unknown options through" test remains green.

**Verify**:
`bun test tests/cli/run.test.ts --timeout 60000 --max-concurrency 4` -> all
tests pass.

### Step 2: Make package-launched helpers target the caller repo explicitly

Update `runHelper` in `src/cli/runtime/helper-runner.ts` to export an explicit
target repo root to child helpers, for example:

```ts
env: {
  ...env,
  REPO_HARNESS_HELPER_SOURCE_PATH: resolved.path,
  REPO_HARNESS_TARGET_REPO_ROOT: resolved.repoRoot,
}
```

Update the repo-root prologue for the Sprint execution helpers in both root
`scripts/` and `assets/templates/helpers/`:

- `capture-plan.sh`
- `plan-to-todo.sh`
- `contract-worktree.sh`
- `sprint-backlog.sh`
- `verify-sprint.sh`
- `check-task-workflow.sh`
- `prepare-handoff.sh`
- `codex-handoff-resume.sh`

Each should prefer `REPO_HARNESS_TARGET_REPO_ROOT` when set and valid:

```sh
if [[ -n "${REPO_HARNESS_TARGET_REPO_ROOT:-}" ]]; then
  cd "$REPO_HARNESS_TARGET_REPO_ROOT"
elif REPO_ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel 2>/dev/null)"; then
  cd "$REPO_ROOT"
...
fi
```

Keep the fallback branches for direct root script execution and
`.ai/harness/scripts` repo-pinned helper execution.

Add tests:

- In `tests/cli/run.test.ts`, create a temp Git repo and a temp helper outside
  that repo whose prologue mimics `SCRIPT_DIR`-based behavior but honors
  `REPO_HARNESS_TARGET_REPO_ROOT`. Run it through `local-repo-harness run` with
  `REPO_HARNESS_HELPER_SOURCE=<helper-dir>` and assert it writes the temp repo
  root, not the helper directory.
- In `tests/sprint-backlog.test.ts` or `tests/helper-scripts.test.ts`, add a
  parity assertion that the updated prologue exists in both root and asset
  copies for the helpers above.

**Verify**:
`bun test tests/cli/run.test.ts tests/sprint-backlog.test.ts tests/helper-scripts.test.ts --timeout 60000 --max-concurrency 4`
-> all tests pass.

### Step 3: Add the canonical approved-row execution command

Implement the chosen public surface from "Target behavior". Prefer a
TypeScript command module `src/cli/commands/sprint.ts` if adding
`local-repo-harness sprint ...`; otherwise add `scripts/sprint-row.sh` plus the
asset copy and expose it through `local-repo-harness run sprint-row ...`.

Minimum subcommands:

- `next [--json] [--sprint <file>]`
- `execute-approved --body-file <file> [--sprint <file>] [--task <index|task>] [--slug <slug>] [--title <title>] [--json] [--no-worktree]`

Behavior details:

- `next` is read-only. It should call or reuse `sprint-backlog.sh next` and
  return the row plus a concise recommended planning prompt. It must exit 3
  when no pending row remains, matching `sprint-backlog.sh`.
- `execute-approved` must resolve the exact row before capture. Default task is
  the next pending row. If `--task` is supplied, it must still be pending.
- The generated `source-ref` must be exactly
  `sprint:<sprint-file>#<task>` so the existing backfill parser can complete
  the row later.
- The command should print the exact low-level command it delegated to in
  non-JSON mode. This is not noise; it teaches agents the workflow boundary.
- If `capture-plan.sh --execute` already starts the correct worktree, reuse it.
  If the implementation needs finer control, call the lower-level helpers in
  this order: capture plan without executing, project plan, start worktree.
- Preserve the invariant that one Sprint row maps to one
  `plan -> contract -> worktree -> verify` cycle.

Add tests:

- A temp repo with an Approved Sprint and one pending `contract` row can run
  `execute-approved --body-file approved.md --json` and receives JSON with
  `planFile`, `contractFile`, `reviewFile`, `notesFile`, `worktreePath`, and
  `nextAction`.
- The plan file contains `> **Planning Source**: waza-think` or
  `repo-harness-sprint`, `> **Source Ref**: sprint:<file>#<task>`, and
  `> **Status**: Approved`.
- The command refuses to execute if the Sprint status is Draft.
- The command refuses to execute if no pending row exists.
- The command refuses a body file that does not exist.
- An `inline` row does not create a linked worktree unless explicitly requested.

**Verify**:
`bun test tests/sprint-backlog.test.ts tests/helper-scripts.test.ts --timeout 60000 --max-concurrency 4`
-> all tests pass.

### Step 4: Seed project-scoped runtime into contract worktrees without copying managed packages

Update `contract-worktree.sh start` so project-scoped installs do not require
tracked root helper scripts in the linked worktree.

Required behavior:

- After `git worktree add`, detect whether the primary repo has
  `.ai/harness/bin/local-repo-harness`.
- If present, create a minimal local-only runtime bridge inside the linked
  worktree:
  - `.ai/harness/bin/local-repo-harness` wrapper that delegates to the primary
    project-managed CLI while preserving the linked worktree as cwd.
  - `.ai/harness/policy.json`, `.ai/harness/workflow-contract.json`, and
    `.ai/harness/local-only-manifest.json` copied when they exist and are
    needed for helper resolution/auditing.
  - `.ai/harness/worktrees/<slug>.json` metadata recording
    `source_repo`, `source_runtime_bin`, `worktree`, `branch`, `base_branch`,
    `plan`, and a checksum snapshot for local workflow files that may need
    finish sync.
- Do not copy `.ai/harness/tools/local-repo-harness/node_modules`, CodeGraph
  indexes, `.agents/skills`, `.claude/skills`, or user-level configs.
- If root `scripts/plan-to-todo.sh` is absent in the linked worktree, run:

  ```bash
  ./.ai/harness/bin/local-repo-harness run plan-to-todo --plan "$plan_file"
  ```

  with `REPO_HARNESS_CONTRACT_WORKTREE=1`.

Important safety point: the bridge wrapper must not hard-code a developer
machine's global PATH or user-level binary. It should point to the primary
repo's project-managed CLI path recorded at worktree creation time. If that
path is missing, fail with a clear message telling the operator to rerun
bootstrap/adopt in the primary repo.

Add tests:

- A temp repo with `.ai/harness/bin/local-repo-harness` but without tracked
  root `scripts/plan-to-todo.sh` can start a contract worktree, project the
  contract through the bridge, and avoid copying `node_modules`.
- The generated worktree bridge file contains the primary project-managed CLI
  path and does not contain `~/.codex`, `~/.claude`, `~/.agents`,
  `~/.repo-harness`, or `~/.codegraph`.
- Existing self-host behavior with tracked `scripts/plan-to-todo.sh` still
  works.

**Verify**:
`bun test tests/helper-scripts.test.ts --timeout 60000 --max-concurrency 4`
-> all tests pass.

### Step 5: Sync local-only workflow artifacts back to the primary workspace on finish

Update `contract-worktree.sh finish` so closeout preserves workflow state for
project-scoped local-only profiles.

Required behavior:

- Before starting the worktree, record checksums for primary local workflow
  files that may be updated by this row:
  - the active Sprint file resolved from `source-ref`
  - the captured plan path
  - projected contract/review/notes paths
  - `.ai/harness/checks/latest.json`
  - `.ai/harness/handoff/current.md`
  - `.ai/harness/handoff/resume.md`
  - any `.ai/harness/runs/` snapshot generated during the row
- During `finish`, after `archive_finished_workflow` and
  `backfill_sprint_backlog`, copy only the row's local workflow artifacts from
  the linked worktree to the primary worktree when they are local-only ignored
  or absent from Git.
- Do not copy product source files, install-state files, managed package
  directories, CodeGraph indexes, skills, hooks, MCP config, or arbitrary
  `.ai/harness/tools`.
- If the primary copy of a local workflow file changed since the recorded
  start checksum, stop before overwriting and print a manual merge message.
  This protects user edits made in the primary workspace while the linked
  worktree was active.
- After sync, `git -C "$target_worktree" status --short --ignored
  --untracked-files=all` should not show local-repo-harness runtime or
  workflow artifacts as commit candidates under `project-local-install`.

Add tests:

- Temp repo with `plans/` and `tasks/` ignored/local-only:
  1. Create an Approved Sprint with one `contract` row.
  2. Run the approved-row execution command.
  3. In the linked worktree, add a tiny allowed product file, mark external
     acceptance pass, and run `contract-worktree.sh finish`.
  4. Assert primary workspace has the Sprint row marked complete and has the
     archived plan, contract, review, and notes files on disk even though those
     paths are ignored.
  5. Assert the product file merged through Git.
- A second test mutates the primary Sprint file after worktree start and before
  finish. Finish must refuse to overwrite the primary local-only Sprint file
  and print a clear conflict message.

**Verify**:
`bun test tests/helper-scripts.test.ts tests/sprint-backlog.test.ts --timeout 60000 --max-concurrency 4`
-> all tests pass.

### Step 6: Update skill/docs to point agents at the canonical route

Update `assets/skill-commands/repo-harness-sprint/SKILL.md`:

- In Route `run`, keep the just-in-time planning rule.
- Replace the prose-only approved-plan capture instruction with the canonical
  command from this plan.
- Explicitly say that detailed plans are generated one row at a time, not all
  up front.
- Explicitly say that `execute-approved` does not mark the row complete;
  completion remains gated by verification and finish.
- Keep the existing "goal mode is future work" boundary.

Update `QUICK_START.md`:

- Under "执行 Sprint Backlog Row", keep the prompt templates but add the
  canonical command immediately after Step 2.
- Explain that `local-repo-harness sprint next --json` is the fastest way for
  an agent to rediscover the active row after compaction.
- Mention helper-level `--help`:

  ```bash
  ./.ai/harness/bin/local-repo-harness sprint execute-approved --help
  ./.ai/harness/bin/local-repo-harness run capture-plan --help
  ```

Update `README.md` only if the public command list needs the new `sprint`
subcommand.

Add tests in `tests/action-command-skills.test.ts` and
`tests/readme-dx.test.ts`:

- `repo-harness-sprint` skill mentions the canonical approved-row command.
- `QUICK_START.md` includes the canonical command and still states one row maps
  to one `plan -> contract -> worktree -> verify` cycle.
- Docs do not claim autonomous goal mode exists.

**Verify**:
`bun test tests/action-command-skills.test.ts tests/readme-dx.test.ts --timeout 60000 --max-concurrency 4`
-> all tests pass.

### Step 7: Update manifests and parity gates

If a new helper script is added, update:

- `assets/workflow-contract.v1.json`
- Any helper installation/parity expectations in
  `tests/workflow-contract.test.ts`, `tests/bootstrap-files.test.ts`,
  `tests/create-project-dirs.runtime.test.ts`, or
  `tests/migration-script.test.ts` that enumerate helper names.

Ensure root helper and asset helper copies stay identical for shell helpers.
There is already test coverage in `tests/sprint-backlog.test.ts` for helper
parity; extend it if the new helper is not covered.

**Verify**:
`bun test tests/workflow-contract.test.ts tests/bootstrap-files.test.ts tests/create-project-dirs.runtime.test.ts tests/migration-script.test.ts --timeout 60000 --max-concurrency 4`
-> all tests pass.

### Step 8: Run full gates and update this plan status

Run:

```bash
bash scripts/check-runtime-compat.sh
bash scripts/check-task-workflow.sh --strict
bun test --timeout 60000 --max-concurrency 4
bun run check:release
```

Expected result: all commands exit 0.

If the implementation changed the public CLI surface, also run:

```bash
./src/cli/index.ts sprint --help
./src/cli/index.ts run capture-plan --help
```

Expected result: the first command documents the new Sprint execution surface;
the second prints helper-specific `capture-plan` usage.

Finally, update `plans/README.md` row 013 from `TODO` to `DONE` with the
verification date and commit hash.

## Test plan

New or changed tests must cover:

- Helper `--help` passthrough from `local-repo-harness run <helper> --help`.
- Explicit target repo root propagation for package-launched helpers.
- The canonical approved-row execution command against a temp Approved Sprint.
- Refusal cases: Draft Sprint, no pending row, missing body file, non-pending
  task.
- Inline row behavior does not create a worktree by default.
- Contract worktree start in a project-scoped repo with local-only helper
  runtime and no tracked root helper scripts.
- Finish sync of local-only workflow artifacts back to primary.
- Conflict protection when primary local-only workflow files changed during
  linked worktree execution.
- Skill/docs mention the canonical route and do not advertise goal mode.
- Helper manifest/parity includes any new helper.

Use existing test style from:

- `tests/cli/run.test.ts` for CLI spawn assertions.
- `tests/sprint-backlog.test.ts` for active Sprint fixtures.
- `tests/helper-scripts.test.ts` for temp Git repos and contract worktree
  lifecycle tests.
- `tests/readme-dx.test.ts` for documentation contract assertions.

## Done criteria

All must hold:

- [ ] `local-repo-harness run capture-plan --help` prints helper-specific
  `capture-plan` usage.
- [ ] A documented canonical command exists for executing an approved Sprint
  backlog row.
- [ ] The canonical command captures the approved plan with a Sprint source ref
  and projects contract/review/notes.
- [ ] Contract rows create or reuse exactly one contract worktree.
- [ ] Project-scoped local-only installs do not require tracked root
  `scripts/*.sh` in the linked worktree.
- [ ] Finish syncs the row's local-only workflow artifacts back to the primary
  workspace without copying install-state or product source files.
- [ ] Primary-workspace local workflow edits made after worktree start are not
  overwritten silently.
- [ ] `repo-harness-sprint` skill and `QUICK_START.md` point agents at the
  canonical command.
- [ ] Focused and full verification commands from "Commands you will need" pass.
- [ ] No user-level config paths are introduced in generated wrappers or tests.
- [ ] `plans/README.md` row 013 status is updated by the executor.

## STOP conditions

Stop and report back without improvising if:

- The code at the locations in "Current state" no longer matches the excerpts
  after the drift check.
- Implementing the canonical command requires changing Sprint backlog table
  schema in a way that would break existing Sprint files.
- Worktree runtime seeding appears to require copying managed package
  `node_modules` into the linked worktree.
- Finish sync cannot protect primary local-only workflow files from overwrite
  conflicts.
- The change requires writing to user-level config or global package paths.
- Any focused verification command fails twice after a reasonable fix attempt.
- The implementation would need to start autonomous multi-row execution or goal
  mode to make the feature work.

## Maintenance notes

This plan tightens the execution surface that future agents will use most:
approved Sprint row implementation. Reviewers should scrutinize hidden state
transitions carefully, especially the boundary between package helper runtime,
target repo root, linked worktree cwd, and local-only workflow artifacts.

Future VCS profile changes must keep this flow in mind. If a profile makes
`plans/` or `tasks/` tracked, Git merge may already carry workflow state; if it
makes them local-only, `contract-worktree.sh finish` must explicitly sync only
the row-owned workflow artifacts. Do not let that sync path expand into a broad
"copy ignored directories" helper.
