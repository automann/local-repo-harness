# Plan 015: Hydrate contract worktrees with profile-aware local workflow context

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report - do not improvise. When done, update the status row for this plan
> in `plans/README.md` unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat f706fa6..HEAD -- scripts/contract-worktree.sh src/cli/runtime/helper-runner.ts src/cli/vcs/local-only.ts tests/helper-scripts.test.ts tests/cli/run.test.ts README.md QUICK_START.md plans/README.md`
>
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding. If the
> live behavior already implements worktree hydration, stop and report instead
> of duplicating it.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: MED
- **Depends on**: `plans/013-canonical-sprint-row-execution-entrypoint.md`, `plans/014-tighten-review-and-edge-case-gates.md`
- **Category**: bug, dx
- **Planned at**: commit `f706fa6`, 2026-06-19

## Why this matters

Downstream projects can choose the `ephemeral-agent-workspace` VCS profile,
which intentionally keeps install state, workflow state, and product-intent
documents local-only. That is correct for public or temporary target projects,
but `git worktree add` only materializes tracked files. A contract worktree
created from such a target repo can therefore miss `docs/spec.md`,
`plans/prds/`, `.ai/context/*`, `.claude/templates/*`, `tasks/current.md`, and
workflow helper wrappers even though those files exist in the primary worktree.

The current `contract-worktree` bridge seeds a minimal runtime shim and a few
row-owned workflow artifacts, but strict repo workflow gates expect a complete
repo-harness workflow surface. The result is a bad user experience: the row
implementation can pass its contract, yet closeout blocks on missing local-only
governance context. This plan makes contract worktree creation profile-aware:
hydrate the local governance context needed to execute checks, without copying
the whole repository or leaking install/runtime/cache/secrets into the worktree.

## Current state

Relevant files and roles:

- `scripts/contract-worktree.sh` - creates, seeds, finishes, syncs, and cleans
  contract linked worktrees.
- `src/cli/runtime/helper-runner.ts` - resolves package or repo helper scripts
  for `local-repo-harness run <helper>`.
- `src/cli/vcs/local-only.ts` - defines VCS profiles, local-only groups, and
  manifest entries.
- `tests/helper-scripts.test.ts` - broad shell helper tests, including current
  contract worktree bridge and finish behavior.
- `tests/cli/run.test.ts` - CLI helper-runner tests.
- `README.md` and `QUICK_START.md` - project-scoped install and workflow docs.

Current VCS profile semantics in `src/cli/vcs/local-only.ts`:

```ts
// src/cli/vcs/local-only.ts:101-133
export const VCS_PROFILES: Record<VcsProfileName, LocalVcsProfile> = {
  "project-local-install": {
    scopes: {
      install_state_scope: "local",
      workflow_state_scope: "local",
      product_intent_scope: "tracked",
    },
  },
  "ephemeral-agent-workspace": {
    scopes: {
      install_state_scope: "local",
      workflow_state_scope: "local",
      product_intent_scope: "local",
    },
  },
  ...
};
```

Current local-only group definitions include the governance/product-intent files
that contract worktrees now miss:

```ts
// src/cli/vcs/local-only.ts:162-185
const WORKFLOW_STATE_PATHS: readonly string[] = [
  "plans/",
  "tasks/",
  ".ai/context/",
  ".ai/harness/",
  ".ai/hooks/",
  ".claude/.skill-version",
  ".claude/templates/",
  "docs/reference-configs/",
  ...
];

const PRODUCT_INTENT_PATHS: readonly string[] = [
  "docs/spec.md",
  "docs/architecture/",
  "docs/researches/",
];

const EPHEMERAL_WORKSPACE_PATHS: readonly string[] = [
  ".agents/",
  ".claude/",
  "docs/",
  "skills-lock.json",
];
```

Current contract worktree sync is intentionally narrow. It only lists the sprint
file, row plan, row contract/review/notes, `tasks/todos.md`, checks, and
handoff files:

```bash
# scripts/contract-worktree.sh:69-84
workflow_sync_paths_for_plan() {
  local plan_file="$1"
  local artifact_stem sprint_path
  artifact_stem="$(derive_artifact_stem_from_plan "$plan_file")"
  sprint_path="$(plan_sprint_path "$plan_file" || true)"

  [[ -z "$sprint_path" ]] || printf '%s\n' "$sprint_path"
  printf '%s\n' "$plan_file"
  printf '%s\n' "tasks/contracts/${artifact_stem}.contract.md"
  printf '%s\n' "tasks/reviews/${artifact_stem}.review.md"
  printf '%s\n' "tasks/notes/${artifact_stem}.notes.md"
  printf '%s\n' "tasks/todos.md"
  printf '%s\n' ".ai/harness/checks/latest.json"
  printf '%s\n' ".ai/harness/handoff/current.md"
  printf '%s\n' ".ai/harness/handoff/resume.md"
}
```

Current safe sync filter excludes install/runtime state, but also excludes the
local governance context needed for strict checks:

```bash
# scripts/contract-worktree.sh:86-96
is_safe_workflow_sync_path() {
  case "$1" in
    /*|*..*|.ai/harness/tools/*|.ai/harness/bin/*|.ai/harness/runtime/*|.ai/harness/codegraph-runtime/*|.agents/skills/*|.claude/skills/*|.codegraph/*|node_modules/*|*/node_modules/*|.codex/hooks.json|.codex/config.toml|.claude/settings.json|.mcp.json)
      return 1
      ;;
    plans/*|tasks/*|.ai/harness/checks/*|.ai/harness/handoff/*|.ai/harness/runs/*|.ai/harness/worktrees/*)
      return 0
      ;;
  esac
  return 1
}
```

Current runtime bridge seeds only the project CLI shim plus three policy files:

```bash
# scripts/contract-worktree.sh:315-346
seed_project_runtime_bridge() {
  local worktree_path="$1"
  local source_bin="${REPO_ROOT}/.ai/harness/bin/local-repo-harness"
  ...
  cat > "$worktree_path/.ai/harness/bin/local-repo-harness" <<EOF_BRIDGE
#!/bin/bash
set -euo pipefail
primary_bin="$(json_escape "$source_bin")"
...
exec "$primary_bin" "$@"
EOF_BRIDGE
  ...
  for rel in \
    ".ai/harness/policy.json" \
    ".ai/harness/workflow-contract.json" \
    ".ai/harness/local-only-manifest.json"; do
    ...
  done
}
```

Current helper-runner executes helpers against the repo root resolved from the
current working directory. In a linked contract worktree that means helpers run
against the linked worktree, not the primary worktree:

```ts
// src/cli/runtime/helper-runner.ts:129-150
export function runHelper(opts: RunHelperOptions): RunHelperResult {
  const cwd = opts.cwd ?? process.cwd();
  const env = { ...process.env, ...(opts.env ?? {}) };
  const resolved = resolveHelper(opts.helper, cwd, env);
  ...
  const child = spawnSync(command, [resolved.path, ...args], {
    cwd: resolved.repoRoot,
    env: {
      ...env,
      REPO_HARNESS_HELPER_SOURCE_PATH: resolved.path,
      REPO_HARNESS_TARGET_REPO_ROOT: resolved.repoRoot,
    },
```

Current strict workflow check expects a full workflow surface:

```bash
# scripts/check-task-workflow.sh:586-614
check_required_dir "plans"
check_required_dir "plans/archive"
check_required_dir "plans/prds"
check_required_dir "$sprints_dir"
check_required_dir "tasks"
check_required_dir "tasks/archive"
check_required_dir "$contracts_dir"
check_required_dir "$reviews_dir"
check_required_dir "$notes_dir"
check_required_dir "$workstreams_dir"
check_required_dir ".claude/templates"
check_required_dir ".ai/context"
check_required_dir ".ai/harness"
...
check_required_file "docs/spec.md"
check_required_file ".claude/templates/spec.template.md"
check_required_file ".claude/templates/plan.template.md"
check_required_file ".claude/templates/research.template.md"
check_required_file ".claude/templates/contract.template.md"
check_required_file ".claude/templates/review.template.md"
check_required_file ".claude/templates/implementation-notes.template.md"
```

Existing tests cover the runtime bridge but assert the linked worktree should
not get helper scripts in that narrow case:

```ts
// tests/helper-scripts.test.ts:1178-1189
expect(res.stdout).toContain("Seeded project runtime bridge");
expect(existsSync(join(worktreePath, ".ai/harness/bin/local-repo-harness"))).toBe(true);
expect(existsSync(join(worktreePath, ".ai/harness/tools/local-repo-harness/node_modules"))).toBe(false);
expect(existsSync(join(worktreePath, "scripts/plan-to-todo.sh"))).toBe(false);
expect(existsSync(join(worktreePath, "tasks/contracts/20260304-1440-demo.contract.md"))).toBe(true);
```

The test suite has happy-path worktree tests that copy helpers and commit
`docs/spec.md` into the fixture before `git worktree add`, so they do not model
`ephemeral-agent-workspace` where those files are intentionally local-only:

```ts
// tests/helper-scripts.test.ts:1530-1542
writeFileSync(join(cwd, "docs/spec.md"), "# Spec\n");
initGitRepo(cwd);
commitAll(cwd, "init workflow");
```

Observed downstream failure that this plan must reproduce:

- Primary repo: `/Users/syfq/dev/harness/swarm-discussion-codex`
- Contract worktree:
  `/Users/syfq/dev/harness/swarm-discussion-codex-wt-coordinator-and-expert-agent-contracts`
- Profile: `ephemeral-agent-workspace`
- Row implementation passed contract-level verification, but:
  - `local-repo-harness run check-task-workflow --strict` failed because the
    linked worktree lacked `docs/spec.md`, `tasks/current.md`,
    `.ai/context/context-map.json`, `plans/prds/`, `docs/researches/`, and
    related workflow scaffolding.
  - `local-repo-harness run verify-sprint` failed because
    `scripts/verify-contract.sh` was missing.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Focused helper tests | `bun test tests/helper-scripts.test.ts` | exit 0; all tests pass |
| Helper runner tests | `bun test tests/cli/run.test.ts` | exit 0; all tests pass |
| Full tests | `bun test` | exit 0; all tests pass |
| Task workflow gate | `bash scripts/check-task-workflow.sh --strict` | exit 0; `[workflow] OK` |
| Task sync gate | `bash scripts/check-task-sync.sh` | exit 0; no blocking sync issue |
| Architecture sync gate | `bash scripts/check-architecture-sync.sh` | exit 0; no blocking architecture issue |
| Release gate | `bun run check:release` | exit 0 |

## Scope

**In scope** (the only source/test/doc files to modify):

- `scripts/contract-worktree.sh`
- `tests/helper-scripts.test.ts`
- `src/cli/runtime/helper-runner.ts` only if a small metadata/env handoff is
  required after hydration. Prefer not to change it if filesystem hydration
  alone solves the issue.
- `src/cli/vcs/local-only.ts` only if shared constants/helpers are needed for
  the allowlist. Do not create a circular dependency from shell into TypeScript.
- `README.md` and `QUICK_START.md` only for short operator-facing notes about
  contract worktree hydration.
- `plans/README.md` status row for this plan.

**Out of scope** (do not touch):

- Do not copy or vendor `.ai/harness/tools/local-repo-harness/`,
  `.ai/harness/tools/codegraph/`, `node_modules/`, `.codegraph/`,
  `.ai/harness/runtime/`, `.ai/harness/codegraph-runtime/`, `.agents/skills/`,
  `.claude/skills/`, `.codex/hooks.json`, `.codex/config.toml`,
  `.claude/settings.json`, `.mcp.json`, `_ops/`, `.env*`, or any user/home
  path.
- Do not make `ephemeral-agent-workspace` tracked. The profile must remain
  local-only.
- Do not solve this by running workflow checks against the primary worktree by
  default. Contract verification must inspect the linked worktree where the row
  changes live.
- Do not change CodeGraph install, MCP, daemon, or telemetry behavior.
- Do not change Sprint row semantics or review/manual-override gates except for
  tests that prove hydration lets the existing gates run.

## Git workflow

- Branch: `codex/contract-worktree-local-context-hydration`
- Commit message style: use concise conventional or existing repo style, e.g.
  `fix: hydrate contract worktree workflow context`.
- Do not push or open a PR unless the operator instructs you.

## Implementation direction

Use a **profile-aware hydration bundle**, not a full repository copy.

The target model:

1. `git worktree add` still creates a clean linked worktree for product code.
2. `contract-worktree start` reads the primary worktree's policy/local-only
   manifest and copies only safe governance/product-intent context required by
   workflow checks.
3. Install-state remains a bridge, not a copy. The linked worktree gets
   `.ai/harness/bin/local-repo-harness`, but never managed package
   `node_modules`, skills, host adapters, CodeGraph index, or caches.
4. Worktree-specific state is generated or overwritten per worktree:
   `.ai/harness/active-plan`, `.ai/harness/active-worktree`, metadata, checks,
   run snapshots.
5. Finish-time sync remains narrow and row-owned. Hydration files exist to run
   checks in the linked worktree; they must not all be copied back to primary
   worktree during finish.

## Steps

### Step 1: Add a failing regression fixture for local-only workflow context

Add a test to `tests/helper-scripts.test.ts` that reproduces the downstream
shape without using the real downstream repo.

Fixture requirements:

- Create a temp git repo with a product-only tracked commit, such as
  `README.md` and maybe one product source file.
- Create a project managed CLI shim at `.ai/harness/bin/local-repo-harness`
  that delegates to this repo's `src/cli/index.ts`, following the existing
  bridge test pattern.
- Create `.ai/harness/policy.json` with:
  - `worktree_strategy.auto_for_contract_tasks: true`
  - `worktree_strategy.branch_prefix: "codex/"`
  - `worktree_strategy.base_branch: "main"`
  - `vcs.profile: "ephemeral-agent-workspace"`
  - `harness.helper_dispatch.strategy: "package-runner"`
  - `harness.helper_dispatch.project_cli: ".ai/harness/bin/local-repo-harness"`
  - `harness.helper_dispatch.repo_runtime_required: false`
- Create local-only workflow/product-intent files after the tracked product
  commit. They should exist in the primary worktree but not be tracked by Git:
  - `docs/spec.md`
  - `docs/researches/README.md`
  - `plans/prds/<fixture>.prd.md`
  - `plans/sprints/<fixture>.sprint.md`
  - `tasks/current.md`
  - `tasks/lessons.md`
  - `tasks/workstreams/.gitkeep`
  - `.ai/context/context-map.json`
  - `.ai/context/capabilities.json`
  - `.claude/templates/*.md`
  - root helper wrappers needed by `check-task-workflow` and `verify-sprint`
    if the implementation chooses wrapper hydration
- Add ignore rules that mimic `ephemeral-agent-workspace`, but keep the fixture
  intentionally small. It is enough that `git ls-files` proves the governance
  files are not tracked.
- Write an Approved plan that references the sprint row and run
  `bash scripts/contract-worktree.sh start --plan <plan>`.

Before implementing hydration, this test should fail because the linked
worktree lacks the local-only governance files. After implementation, assert:

- `docs/spec.md` exists in the linked worktree.
- `plans/prds/` exists in the linked worktree.
- `.ai/context/context-map.json` exists in the linked worktree.
- `tasks/current.md` exists in the linked worktree.
- `.claude/templates/contract.template.md` exists in the linked worktree.
- `scripts/verify-contract.sh` and `scripts/check-task-workflow.sh` are usable
  in the linked worktree, or the package helper path is explicitly usable and
  `verify-sprint` can find the verification helper.
- `.ai/harness/bin/local-repo-harness` still exists in the linked worktree.
- `.ai/harness/tools/local-repo-harness/node_modules` does not exist.
- `.agents/skills/`, `.claude/skills/`, `.codex/hooks.json`,
  `.codex/config.toml`, `.mcp.json`, `.codegraph/`, `_ops/`, and `node_modules/`
  do not exist in the linked worktree unless they were tracked product files in
  the fixture.

Use existing helpers such as `copyHelpers`, `TEMPLATE_DIR`, `evidenceContract`,
`externalAcceptanceAdvice`, `initGitRepo`, and `commitAll` where they fit.

**Verify**:
`bun test tests/helper-scripts.test.ts --test-name-pattern "local-only workflow context"` should fail before implementation and pass after implementation. If Bun's test-name filter differs, use the smallest supported focused command and record it in the final notes.

### Step 2: Separate hydration paths from finish-sync paths

In `scripts/contract-worktree.sh`, keep `workflow_sync_paths_for_plan` focused
on row-owned artifacts that can safely sync back to primary during finish.

Add a separate function, for example:

```bash
worktree_hydration_paths_for_plan() {
  local plan_file="$1"
  workflow_sync_paths_for_plan "$plan_file"
  printf '%s\n' "docs/spec.md"
  printf '%s\n' "plans/prds/"
  printf '%s\n' ".ai/context/"
  printf '%s\n' ".claude/templates/"
  printf '%s\n' "tasks/current.md"
  printf '%s\n' "tasks/lessons.md"
  printf '%s\n' "tasks/workstreams/"
  printf '%s\n' "docs/researches/"
  printf '%s\n' "scripts/verify-contract.sh"
  printf '%s\n' "scripts/verify-sprint.sh"
  printf '%s\n' "scripts/check-task-workflow.sh"
  ...
}
```

The exact helper list should be the smallest set needed by strict workflow
checks and Sprint closeout. Prefer using the existing generated helper inventory
from `src/cli/vcs/local-only.ts` as a source of truth only if it can be shared
without making shell scripts depend on TypeScript at runtime. Otherwise keep the
shell allowlist explicit and cover it with tests.

Add a separate safety predicate, for example
`is_safe_worktree_hydration_path`, instead of broadening
`is_safe_workflow_sync_path`. It should allow:

- `plans/*`
- `tasks/*`
- `docs/spec.md`
- `docs/architecture/*`
- `docs/researches/*`
- `.ai/context/*`
- `.ai/harness/policy.json`
- `.ai/harness/workflow-contract.json`
- `.ai/harness/local-only-manifest.json`
- `.ai/hooks/*` only if needed by workflow-state helpers and safe in the
  fixture
- `.claude/templates/*`
- selected root `scripts/*` helper wrappers
- `AGENTS.md` and `CLAUDE.md` if the profile or strict check requires them

It must deny:

- absolute paths, `..`, empty paths, `.git/*`
- `_ops/*`, `.env*`, secrets, caches
- `node_modules/*` and `*/node_modules/*`
- `.ai/harness/tools/*`, `.ai/harness/bin/codegraph`,
  `.ai/harness/runtime/*`, `.ai/harness/codegraph-runtime/*`
- `.agents/skills/*`, `.claude/skills/*`
- `.codex/hooks.json`, `.codex/config.toml`, `.claude/settings.json`,
  `.mcp.json`
- `.codegraph/*`

**Verify**:
`bun test tests/helper-scripts.test.ts --test-name-pattern "contract worktree"` exits 0 for the existing bridge tests and the new failing fixture.

### Step 3: Implement recursive, symlink-safe hydration

Replace or extend `seed_local_workflow_context` so it can copy both files and
directories from the primary worktree into the linked worktree.

Rules:

- Copy from primary worktree to linked worktree only.
- Preserve relative paths.
- Create parent directories as needed.
- Do not overwrite an existing linked-worktree file unless it is an expected
  worktree-owned marker (`.ai/harness/active-plan`,
  `.ai/harness/active-worktree`, `.claude/.active-plan`) or unless the file
  matches the source checksum.
- Do not follow symlinks that resolve outside the primary repo root. If a
  hydrated path is a symlink, either copy the symlink as a symlink only when it
  points inside the repo, or skip it with a warning. Prefer skipping with a
  warning for this plan.
- For directories, copy only regular files and safe subdirectories. Re-apply
  the same deny rules to every nested relative path.
- Avoid `rsync --delete` for hydration; deletion can remove valid worktree-local
  artifacts. Use additive copy.

Write a hydration manifest beside the existing worktree metadata, for example:
`.ai/harness/worktrees/<slug>.hydration`.

The manifest can be TSV like the existing sync manifest and should record:

```text
<sha256-or-__missing__>    <group-or-role>    <relative-path>
```

This manifest is evidence/debugging only for this plan. Do not use it to copy
all hydrated paths back to primary on finish.

**Verify**:

- `bun test tests/helper-scripts.test.ts --test-name-pattern "local-only workflow context"` exits 0.
- Inspect the generated fixture assertions to confirm denied paths are absent.

### Step 4: Keep helper execution targeted at the linked worktree

Do not change helper-runner to run `check-task-workflow` or `verify-sprint`
against the primary worktree by default. That would validate the wrong tree and
could hide row changes.

If helper-runner needs a small improvement, limit it to metadata or environment
visibility, for example:

- `REPO_HARNESS_SOURCE_REPO_ROOT=<primary-worktree>` for diagnostics only.
- `REPO_HARNESS_CONTRACT_WORKTREE=1` when the bridge knows it is being invoked
  from a linked worktree.

Any such change must preserve the current guarantee shown in
`tests/cli/run.test.ts`: package-launched helpers receive the resolved target
repo root as `REPO_HARNESS_TARGET_REPO_ROOT`.

**Verify**:
`bun test tests/cli/run.test.ts` exits 0.

### Step 5: Prove Sprint and strict workflow gates run in the hydrated worktree

Extend the new fixture or add a second focused fixture so the linked worktree
can run:

```bash
./.ai/harness/bin/local-repo-harness run check-task-workflow --strict
./.ai/harness/bin/local-repo-harness run verify-sprint
```

The fixture may use minimal valid contents, but it must be honest enough to
exercise the same class of failure:

- active plan marker points to the linked worktree plan
- active worktree marker points to the linked worktree path
- active sprint marker or sprint source ref lets `verify-sprint` find the row
- review is terminal pass and contains valid External Acceptance Advice
- `scripts/verify-contract.sh` is available in the linked worktree or
  `verify-sprint` reliably delegates to a package helper without requiring the
  root wrapper

Expected results:

- `check-task-workflow --strict` prints `[workflow] OK` and exits 0.
- `verify-sprint` exits 0 and writes a pass snapshot under
  `.ai/harness/checks/latest.json` in the linked worktree.

**Verify**:
`bun test tests/helper-scripts.test.ts` exits 0.

### Step 6: Ensure finish sync still stays narrow

Add or update assertions around `contract-worktree finish`:

- Row-owned artifacts still sync back to primary when local-only and safe:
  sprint file, plan/archive, contract, review, notes, checks, handoff.
- Hydrated context files that were not row-owned do not overwrite primary
  unless they were already part of the existing `workflow_sync_paths_for_plan`.
- Install-state and denied paths are never synced back.

This is important because hydration copies more files into the linked worktree
than finish should ever propagate back.

**Verify**:
`bun test tests/helper-scripts.test.ts` exits 0.

### Step 7: Update operator-facing docs

Add a short note to `README.md` or `QUICK_START.md` where contract worktrees or
VCS profiles are discussed:

- `ephemeral-agent-workspace` still keeps governance/product-intent local-only
  from Git's perspective.
- Contract worktrees hydrate a safe local workflow context from the primary
  worktree so repo workflow gates can run.
- Hydration is not a full repo copy and does not copy managed tools, skills,
  CodeGraph indexes, `_ops`, caches, or secrets.

Keep this doc patch small. Do not rewrite install instructions.

**Verify**:
`bun test tests/readme-dx.test.ts` exits 0.

### Step 8: Run full verification

Run the focused tests first, then the standard repo gates:

```bash
bun test tests/helper-scripts.test.ts
bun test tests/cli/run.test.ts
bun test tests/readme-dx.test.ts
bun test
bash scripts/check-architecture-sync.sh
bash scripts/check-task-sync.sh
bash scripts/check-task-workflow.sh --strict
bun run check:release
```

Expected:

- All commands exit 0.
- No new untracked fixture files remain in the repo.
- `git diff --check` exits 0.

### Step 9: Optional real downstream acceptance

If the operator explicitly allows testing against
`/Users/syfq/dev/harness/swarm-discussion-codex`, run this as an extra proof
after local tests pass:

1. Install the locally built package into the downstream managed tool root or
   use a local package tarball. Do not use npm `latest` unless the change has
   already been published.
2. In the existing row 2 linked worktree, rerun:

```bash
./.ai/harness/bin/local-repo-harness run check-task-workflow --strict
./.ai/harness/bin/local-repo-harness run verify-sprint
```

Expected:

- The same row 2 worktree no longer fails due to missing `docs/spec.md`,
  `scripts/verify-contract.sh`, `.ai/context/context-map.json`,
  `tasks/current.md`, or `plans/prds/`.

Do not close, merge, or clean the downstream row unless the operator explicitly
asks.

## Test plan

New/updated tests:

- `tests/helper-scripts.test.ts`
  - Add a fixture where governance/product-intent files are local-only under an
    `ephemeral-agent-workspace`-style profile.
  - Assert `contract-worktree start` hydrates required local context into the
    linked worktree.
  - Assert denied install/cache/secret/tool paths are not copied.
  - Assert `check-task-workflow --strict` and `verify-sprint` can run in the
    linked worktree.
  - Assert finish sync remains limited to row-owned workflow artifacts.
- `tests/cli/run.test.ts`
  - Only update if helper-runner gets a metadata/env change. Preserve the
    existing `REPO_HARNESS_TARGET_REPO_ROOT` behavior.
- `tests/readme-dx.test.ts`
  - Update only if the doc note changes pinned README/QUICK_START expectations.

Existing tests to model:

- `tests/helper-scripts.test.ts` "seeds a project runtime bridge into contract
  worktrees without copying managed package dependencies" for bridge safety.
- `tests/helper-scripts.test.ts` "contract-worktree finish syncs local-only
  sprint workflow artifacts back to the primary worktree" for finish sync.
- `tests/cli/run.test.ts` "passes the resolved target repo root to
  package-launched helpers" for helper-runner target-root behavior.

## Done criteria

All must hold:

- [ ] A contract worktree created from an `ephemeral-agent-workspace`-style
      fixture contains the local workflow/product-intent context needed by
      strict gates.
- [ ] The linked worktree does not contain managed package `node_modules`,
      CodeGraph indexes, skills, host adapter config, `_ops`, caches, or
      secret-like files copied by hydration.
- [ ] `local-repo-harness run check-task-workflow --strict` passes inside the
      hydrated linked worktree fixture.
- [ ] `local-repo-harness run verify-sprint` passes inside the hydrated linked
      worktree fixture.
- [ ] Finish sync still copies back only row-owned safe workflow artifacts, not
      every hydrated context file.
- [ ] `bun test tests/helper-scripts.test.ts` exits 0.
- [ ] `bun test tests/cli/run.test.ts` exits 0, unless untouched and full
      `bun test` provides equivalent coverage.
- [ ] `bun test tests/readme-dx.test.ts` exits 0 if docs changed.
- [ ] `bun test` exits 0.
- [ ] `bash scripts/check-architecture-sync.sh` exits 0.
- [ ] `bash scripts/check-task-sync.sh` exits 0.
- [ ] `bash scripts/check-task-workflow.sh --strict` exits 0.
- [ ] `bun run check:release` exits 0.
- [ ] `git diff --check` exits 0.
- [ ] `plans/README.md` marks plan 015 DONE with verification notes.

## STOP conditions

Stop and report back if:

- The live code already implements a worktree hydration bundle with tests.
- Making strict gates pass requires copying install-state paths such as
  `.ai/harness/tools/*`, `node_modules`, `.agents/skills/*`, `.claude/skills/*`,
  `.codegraph/*`, `.mcp.json`, or host adapter config.
- The implementation would make helpers validate the primary worktree instead
  of the linked worktree by default.
- The implementation needs to make `ephemeral-agent-workspace` files tracked.
- A symlink-safe recursive copy cannot be implemented in shell without a broad
  command that follows links outside the repo root.
- The new fixture cannot pass without weakening `check-task-workflow --strict`
  or `verify-sprint` semantics.
- A step's verification fails twice after a reasonable fix attempt.

## Maintenance notes

- The hydration allowlist and `src/cli/vcs/local-only.ts` local-only groups must
  stay conceptually aligned, but do not blindly copy every local-only entry into
  linked worktrees. Some local-only entries are install/runtime/cache state and
  must stay out.
- Reviewers should scrutinize path safety: no absolute paths, no `..`, no
  symlink traversal outside the primary repo, and no broad directory copy of the
  full repository.
- If future VCS profiles add new groups, update the hydration fixture to cover
  only workflow/product-intent context required by gates, not all local-only
  artifacts.
- If `check-task-workflow.sh --strict` gains new required files, add those files
  to the hydration allowlist and fixture in the same change.
- This plan intentionally defers any redesign of CodeGraph, MCP, or external
  skill installation. Those are install-state concerns, not contract worktree
  governance context.
