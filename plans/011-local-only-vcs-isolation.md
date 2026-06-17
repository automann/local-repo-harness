# Plan 011: Keep project-scoped installs out of downstream Git history

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the next
> step. If anything in the "STOP conditions" section occurs, stop and report;
> do not improvise. When done, update the status row for this plan in
> `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat b9a195f..HEAD -- src/cli/index.ts src/cli/commands/bootstrap.ts src/cli/commands/init.ts src/cli/commands/status.ts src/cli/commands/doctor.ts src/cli/commands/security.ts src/cli/skills/project-skills.ts src/cli/installer/project-runtime.ts src/cli/tools/codegraph.ts scripts/lib/project-init-lib.sh scripts/migrate-project-template.sh assets/workflow-contract.v1.json README.md QUICK_START.md tests/cli/bootstrap.test.ts tests/cli/init.test.ts tests/cli/doctor.test.ts tests/migration-script.test.ts tests/create-project-dirs.runtime.test.ts tests/scaffold-parity.test.ts tests/readme-dx.test.ts`
>
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding. On a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: HIGH
- **Depends on**: plans/005-project-managed-local-repo-harness-bootstrap.md, plans/009-scope-aware-security-scan-and-doctor.md, plans/010-scope-aware-doctor-readiness-summary.md
- **Category**: dx | security | migration
- **Planned at**: commit `b9a195f`, 2026-06-17
- **Completed**: 2026-06-17; release gate passed for `local-repo-harness@0.5.9`

## Why this matters

Project-scoped install has solved the first isolation problem: do not write
`local-repo-harness`, CodeGraph, skills, or hook adapters into user-level paths.
It has not solved the second isolation problem: once the same artifacts are
inside the target project, Git can still treat them as product deliverables.
That makes `local-repo-harness` appear as part of downstream repositories such
as `swarm-discussion-codex`, confuses agents about upstream versus downstream
source ownership, and risks committing local development state into the product
repo.

The fix is not "ignore more paths in `.gitignore`". `.gitignore` is usually a
tracked product file, and existing ignore negations such as `!.codex/hooks.json`
can defeat a local exclude. The project-scoped installer needs an explicit VCS
boundary: path scope says "write inside this project"; VCS scope says "keep the
managed install and workflow state local unless the operator opts into tracking".

## Current state

Relevant files and roles:

- `src/cli/commands/bootstrap.ts` - installs `local-repo-harness` into
  `.ai/harness/tools/local-repo-harness`, writes `.ai/harness/bin/local-repo-harness`,
  and delegates to `adopt`.
- `src/cli/commands/init.ts` - owns `adopt`/repo initialization, passes scope
  intent to shell migration through `REPO_HARNESS_*` environment variables, and
  installs project skills, project adapters, external skills, CodeGraph, and
  brain manifest state.
- `src/cli/index.ts` - exposes `bootstrap`, `adopt`, `doctor`, `security`,
  `status`, and future CLI subcommands.
- `src/cli/commands/status.ts` - builds the scope report used by doctor; it has
  no VCS or Git-tracking dimension today.
- `src/cli/commands/doctor.ts` - read-only readiness diagnostics; it can report
  project adapters, project skills, and CodeGraph, but not whether local-only
  managed artifacts are tracked.
- `scripts/lib/project-init-lib.sh` and `scripts/migrate-project-template.sh` -
  generate workflow contract, policy, helper wrappers, `.gitignore`, and
  migration reports for adopted repos.
- `assets/workflow-contract.v1.json` - canonical workflow contract distributed
  downstream.
- `tests/cli/bootstrap.test.ts`, `tests/cli/init.test.ts`,
  `tests/cli/doctor.test.ts`, `tests/migration-script.test.ts`,
  `tests/create-project-dirs.runtime.test.ts`, and `tests/scaffold-parity.test.ts`
  - main acceptance surfaces to extend.

Observed downstream problem in
`/Users/syfq/dev/harness/swarm-discussion-codex` after a recipe C install:

```text
.ai/harness/tools/local-repo-harness/package.json              tracked
.ai/harness/bin/local-repo-harness                             tracked
.ai/harness/bin/local-repo-harness-hook                        tracked
.ai/harness/runtime/local-repo-harness/.version                tracked
.agents/skills/repo-harness/SKILL.md                           tracked
.agents/skills/think/SKILL.md                                  tracked
.agents/skills/check/SKILL.md                                  tracked
.agents/skills/mermaid/SKILL.md                                tracked
.claude/skills/repo-harness/SKILL.md                           tracked
.claude/skills/codex-review/SKILL.md                           tracked
.codex/hooks.json                                              tracked
.codex/config.toml                                             ignored
.claude/settings.json                                          tracked
.mcp.json                                                      tracked
plans                                                          untracked
tasks                                                          tracked
docs/reference-configs                                         tracked
docs/spec.md                                                   tracked
scripts/check-task-workflow.sh                                 tracked
```

The same repo's `.gitignore` only blocks a subset of runtime state:

```text
.ai/harness/tools/*/node_modules/
.codegraph/
_ops/
.ai/harness/checks/latest.json
.ai/harness/events.jsonl
.ai/harness/codegraph-runtime/
.codex/*
!.codex/hooks.json
.claude/.plan-state/
```

That means project runtime roots, project skills, hook config, MCP config, and
generated workflow artifacts can still enter Git history.

Current `src/cli/commands/bootstrap.ts` excerpts:

```ts
export const HARNESS_TOOL_DIR_REL = ".ai/harness/tools/local-repo-harness";
export const HARNESS_TOOL_BIN_REL = `${HARNESS_TOOL_DIR_REL}/node_modules/.bin/local-repo-harness`;
export const HARNESS_SHIM_REL = ".ai/harness/bin/local-repo-harness";
```

```ts
function ensureManagedHarnessPackage(repoRoot: string, packageSpec: string, env?: NodeJS.ProcessEnv): BootstrapStep {
  const toolRoot = managedHarnessToolRoot(repoRoot);
  const packagePath = join(toolRoot, "package.json");
  mkdirSync(toolRoot, { recursive: true });
  writeManagedHarnessShim(repoRoot);
  // writes package.json, runs "bun install" inside the managed tool root
}
```

```ts
function buildAdoptArgs(opts: ...): string[] {
  const args = ["adopt", "--repo", opts.repoRoot, "--target", opts.target];
  args.push("--skill-scope", opts.skillScope);
  args.push("--host-adapter-scope", opts.hostAdapterScope);
  args.push("--runtime", opts.runtime);
  args.push("--external-tool-scope", opts.externalToolScope);
  args.push("--codegraph-mcp-scope", opts.codegraphMcpScope);
  args.push("--brain-mode", opts.brainMode);
  return args;
}
```

There is no VCS-scope flag in the delegated install path.

Current `src/cli/commands/init.ts` excerpts:

```ts
export interface InitCommandOptions {
  skillScope?: ToolingScope;
  hostAdapterScope?: InstallScope;
  runtime?: RuntimeSelection;
  externalToolScope?: ToolingScope;
  codegraphMcpScope?: ToolingScope;
  brainMode?: InitBrainMode;
}
```

```ts
commandEnv = {
  REPO_HARNESS_HOST_ADAPTER_SCOPE: hostAdapters ? hostAdapterScope : "none",
  REPO_HARNESS_SKILL_SCOPE: syncSkill ? skillScope : "none",
  REPO_HARNESS_EXTERNAL_TOOL_SCOPE: externalToolScope,
  REPO_HARNESS_CODEGRAPH_MCP_SCOPE: codegraph ? codegraphMcpScope : "none",
  REPO_HARNESS_BRAIN_MODE: brainMode,
};
```

The environment contract has no `REPO_HARNESS_VCS_*` values today.

Current `src/cli/skills/project-skills.ts` excerpt:

```ts
export function writeRepoHarnessInstalledCopyBoundary(dest: string, scope: ToolingScope, host: SkillHost): void {
  writeFileSync(join(dest, INSTALLED_COPY_MARKER), [
    "kind=repo-harness-installed-copy",
    `scope=${scope}`,
    `host=${host}`,
    "generated_by=repo-harness",
    "edit_policy=generated-install-state-do-not-edit-for-product-development",
    "",
  ].join("\n"));
}
```

The installed skill copy is labeled as generated, but nothing prevents Git from
tracking it.

Current `scripts/lib/project-init-lib.sh` excerpt:

```sh
PI_DEFAULT_RUNTIME_ENTRIES=$(cat <<'EOF_RUNTIME'
.ai/harness/checks/latest.json
.ai/harness/events.jsonl
.ai/harness/handoff/current.md
.ai/harness/handoff/resume.md
.ai/harness/codegraph-runtime/
.codex/*
!.codex/hooks.json
.claude/.active-plan
.claude/.plan-state/
EOF_RUNTIME
)
```

The runtime ignore block intentionally re-includes `.codex/hooks.json`, and it
does not include project skill roots, `.mcp.json`, project runtime bins, or the
managed tool roots.

Git behavior confirmed during recon:

```sh
printf '.codex/*\n!.codex/hooks.json\n' > .gitignore
printf '.codex/hooks.json\n' >> .git/info/exclude
touch .codex/hooks.json
git status --short --ignored --untracked-files=all
```

Expected and observed output:

```text
?? .codex/hooks.json
?? .gitignore
```

So `.git/info/exclude` alone cannot override a tracked `.gitignore` negation.
A local per-directory overlay does work:

```sh
printf 'hooks.json\n' > .codex/.gitignore
```

Then `git status --ignored` reports `.codex/hooks.json` as ignored.

Repo conventions to follow:

- Keep `doctor`, `status`, and `security scan` read-only.
- Do not delete local files during cleanup. At most remove local-only paths from
  the Git index with `git rm --cached`.
- Use project-scoped install paths from existing policy and workflow contract;
  do not introduce user-level fallback writes.
- Preserve the self-host source repo model. The `local-repo-harness` source
  checkout may still track plans/tasks/docs that are part of developing the
  tool. The new local-only default is for downstream project-scoped installs.
- Do not use broad ignores for user-owned product directories such as `scripts/`
  or `docs/` unless the path is known-generated by `local-repo-harness`.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Focused bootstrap tests | `bun test tests/cli/bootstrap.test.ts --timeout 60000 --max-concurrency 4` | all selected tests pass |
| Focused adopt/init tests | `bun test tests/cli/init.test.ts --timeout 60000 --max-concurrency 4` | all selected tests pass |
| Focused doctor tests | `bun test tests/cli/doctor.test.ts --timeout 60000 --max-concurrency 4` | all selected tests pass |
| Migration/scaffold checks | `bun test tests/migration-script.test.ts tests/create-project-dirs.runtime.test.ts tests/scaffold-parity.test.ts --timeout 60000 --max-concurrency 4` | all selected tests pass |
| Docs/DX tests | `bun test tests/readme-dx.test.ts tests/install-scripts.test.ts --timeout 60000 --max-concurrency 4` | all selected tests pass |
| Project state inspection | `bun scripts/inspect-project-state.ts --repo . --format text` | exits 0 |
| Migration dry run | `bash scripts/migrate-project-template.sh --repo . --dry-run` | exits 0 |
| Task sync gate | `bash scripts/check-task-sync.sh` | exits 0 |
| Workflow gate | `bash scripts/check-task-workflow.sh --strict` | exits 0 |
| Release gate | `bun run check:release` | exits 0 |
| Package contents | `npm pack --dry-run --json` | exits 0 and includes docs/CLI changes expected for release |

Run full `bun test` before release if focused tests pass and the change touches
shared status, doctor, or migration helpers.

## Suggested executor toolkit

- Use Waza `/think` if available before implementing the VCS policy data model.
  The tricky part is separating path scope, VCS scope, workflow artifact scope,
  and self-host mode without adding vague flags.
- Use Waza `/check` or cross-review skills after Step 5. Ask specifically
  whether the proposed local-only boundary can be bypassed by `.gitignore`
  negations, tracked files, or generated helper wrappers.
- Use CodeGraph only for call tracing if imports become hard to follow; this is
  mostly a CLI/migration/test change.

## Scope

**In scope**:

- `src/cli/index.ts`
- `src/cli/commands/bootstrap.ts`
- `src/cli/commands/init.ts`
- `src/cli/commands/status.ts`
- `src/cli/commands/doctor.ts`
- `src/cli/commands/security.ts` only if the security report needs to surface
  tracked local-only config as a finding; otherwise leave it alone.
- New `src/cli/vcs/*` or `src/cli/commands/vcs.ts` modules for local-only audit,
  exclude sync, and cleanup.
- `src/cli/skills/project-skills.ts`
- `src/cli/installer/project-runtime.ts`
- `src/cli/tools/codegraph.ts`
- `scripts/lib/project-init-lib.sh`
- `scripts/migrate-project-template.sh`
- `assets/workflow-contract.v1.json`
- `README.md`
- `QUICK_START.md`
- Tests under `tests/cli/`, `tests/migration-script.test.ts`,
  `tests/create-project-dirs.runtime.test.ts`, `tests/scaffold-parity.test.ts`,
  `tests/readme-dx.test.ts`, and `tests/install-scripts.test.ts`

**Out of scope**:

- Do not remove project-scoped install or project-managed tool roots.
- Do not write anything under `~/.codex`, `~/.claude`, `~/.agents`, or
  `~/.codegraph` as part of this plan.
- Do not make `.gitignore` the only local-only mechanism. It is often tracked
  product state.
- Do not ignore entire broad product directories such as `scripts/`, `docs/`, or
  repository root files. Only ignore exact known-generated files, or directories
  whose ownership is clearly installed local development state.
- Do not delete downstream files during cleanup. Use `git rm --cached` for
  tracked local-only paths and leave the working tree file in place.
- Do not silently untrack files that lack a managed ownership signal. Report
  them and ask for operator confirmation.
- Do not change the self-host source repo so that its own active `plans/`,
  `tasks/`, or source-controlled docs become ignored by default.

## Git workflow

- Branch: `codex/local-only-vcs-isolation`
- Commit message style: conventional commits, for example
  `feat: keep project-scoped installs local-only in git`
- Do not push unless the operator asks.

## Design target

Add an explicit VCS boundary with three related but separate concepts:

1. **Install state VCS scope** - runtime/tool/skill/adapter/MCP files generated
   by installing `local-repo-harness` into a target project. Default: `local`.
2. **Workflow state VCS scope** - plans, tasks, reference config stubs,
   context maps, policy, workflow contract, handoff/check/run state, and helper
   wrappers generated by adoption. Default for downstream project-scoped
   installs: `local`. Default for `--mode self-host`: `tracked`.
3. **Product intent VCS scope** - files a user may want to treat as product
   truth, such as `docs/spec.md` or architecture docs. Default for bootstrap
   recipe C should be `local` until the operator explicitly opts into tracking;
   self-host remains `tracked`.

The implementation can expose these as one flag at first if necessary:

```text
--vcs-scope local|tracked
```

But the internal policy should preserve the three dimensions so future releases
can offer finer control without a migration:

```json
{
  "vcs": {
    "install_state_scope": "local",
    "workflow_state_scope": "local",
    "product_intent_scope": "local",
    "exclude_strategy": "git-info-exclude-plus-local-overlays",
    "local_only_manifest": ".ai/harness/local-only-manifest.json"
  }
}
```

For `--vcs-scope tracked`, keep current behavior except for diagnostics. Doctor
and `vcs audit` should still report tracked local-only paths when policy says
`local`.

## Local-only path groups

Start with these path groups. Store them in a typed source module and project
manifest so doctor and cleanup use the same truth.

### Install State Paths

These should be local-only whenever their corresponding project scope is active:

```text
.ai/harness/tools/local-repo-harness/
.ai/harness/tools/codegraph/
.ai/harness/bin/local-repo-harness
.ai/harness/bin/local-repo-harness-hook
.ai/harness/bin/codegraph
.ai/harness/runtime/local-repo-harness/
.ai/harness/codegraph-runtime/
.agents/skills/repo-harness/
.agents/skills/think/
.agents/skills/hunt/
.agents/skills/check/
.agents/skills/health/
.agents/skills/mermaid/
.agents/skills/claude-review/
.claude/skills/repo-harness/
.claude/skills/codex-review/
.codex/hooks.json
.codex/config.toml
.claude/settings.json
.mcp.json
.codegraph/
_ops/
```

Do not ignore `.agents/skills/` wholesale unless the manifest says the whole
directory is managed. Users may have project-authored skills outside
`local-repo-harness`.

### Workflow State Paths

When `workflow_state_scope=local`, include generated workflow state and exact
known helper wrappers:

```text
plans/
tasks/
.ai/context/
.ai/harness/
docs/reference-configs/
CLAUDE.md
AGENTS.md
```

For root `scripts/*`, do not ignore `scripts/` wholesale. Generate exact helper
paths from `assets/workflow-contract.v1.json.helpers.scripts` and only untrack
files that contain the known package-dispatch wrapper marker such as
`local-repo-harness run <helper>`. If a helper path exists without a known
generated marker, report it as `requires_user_review`.

### Product Intent Paths

When `product_intent_scope=local`, include:

```text
docs/spec.md
docs/architecture/
docs/researches/
```

When `product_intent_scope=tracked`, do not ignore or untrack these paths. This
lets a team commit product truth while keeping runtime/tooling state local.

## Steps

### Step 1: Add a local VCS boundary module

Create a typed module, for example `src/cli/vcs/local-only.ts`, with no CLI
side effects. It should provide:

- `type VcsScope = "local" | "tracked"`
- `type VcsArtifactGroup = "install-state" | "workflow-state" | "product-intent"`
- `resolveLocalVcsPolicy(repoRoot, mode, opts)` - reads
  `.ai/harness/policy.json`, CLI options, and defaults.
- `computeLocalOnlyEntries(repoRoot, policy)` - returns exact relative paths and
  ownership group for local-only artifacts.
- `ensureGitInfoExclude(repoRoot, entries, apply)` - writes a managed block to
  `.git/info/exclude` when `apply=true`; in dry-run, returns planned entries.
- `ensureLocalIgnoreOverlays(repoRoot, entries, apply)` - writes local
  per-directory `.gitignore` overlays only where needed, especially `.codex/`,
  `.claude/`, `.agents/`, and `.ai/harness/`.
- `auditTrackedLocalOnly(repoRoot, entries)` - uses `git ls-files` to find
  tracked local-only paths.
- `auditUnignoredLocalOnly(repoRoot, entries)` - uses `git check-ignore` or
  `git status --short --ignored --untracked-files=all` to find local-only paths
  that would still show as untracked because of ignore negations.
- `cleanupTrackedLocalOnly(repoRoot, entries, apply)` - runs
  `git rm --cached -- <paths>` only for paths that are both tracked and
  recognized as managed or explicitly in the local-only manifest.

The managed block in `.git/info/exclude` should have stable markers:

```text
# BEGIN: local-repo-harness local-only (managed)
...
# END: local-repo-harness local-only
```

Overlay `.gitignore` files should have the same marker and must themselves be
excluded by `.git/info/exclude`.

**Verify**:

Add focused unit tests or a new `tests/cli/vcs-local-only.test.ts` that creates
a temp git repo and confirms:

- With root `.gitignore` containing `.codex/*` and `!.codex/hooks.json`, writing
  only `.git/info/exclude` is insufficient in the fixture.
- After `ensureLocalIgnoreOverlays()`, `.codex/hooks.json` is ignored.
- A tracked local-only path is reported by `auditTrackedLocalOnly()`.
- `cleanupTrackedLocalOnly(..., apply=false)` reports commands but does not
  mutate the index.
- `cleanupTrackedLocalOnly(..., apply=true)` removes the path from the index and
  leaves the file on disk.

Run:

```sh
bun test tests/cli/vcs-local-only.test.ts --timeout 60000 --max-concurrency 4
```

Expected: all new tests pass.

### Step 2: Wire VCS policy through bootstrap and adopt

Update `src/cli/index.ts`, `src/cli/commands/bootstrap.ts`, and
`src/cli/commands/init.ts`.

Add CLI options:

```text
bootstrap --vcs-scope <local|tracked>
adopt --vcs-scope <local|tracked>
```

If the implementation keeps separate flags, use:

```text
--install-vcs-scope <local|tracked>
--workflow-vcs-scope <local|tracked>
--product-intent-vcs-scope <local|tracked>
```

Default behavior:

- `bootstrap`: `local` for all three dimensions.
- `adopt --mode standard`: `local` when project scopes are requested for hooks,
  skills, external tools, or CodeGraph MCP.
- `adopt --mode self-host`: `tracked` unless the operator explicitly passes
  local scope.
- `init` global/user-level runtime path: leave unchanged; this plan is for
  project-scoped downstream adoption.

Pass the resolved values to migration through environment variables:

```text
REPO_HARNESS_VCS_SCOPE
REPO_HARNESS_INSTALL_STATE_VCS_SCOPE
REPO_HARNESS_WORKFLOW_STATE_VCS_SCOPE
REPO_HARNESS_PRODUCT_INTENT_VCS_SCOPE
```

In `bootstrap`, pass the same flags through `buildAdoptArgs()` so recipe C uses
the project-managed CLI and does not lose VCS intent during delegation.

After each apply-mode install/adopt completes successfully, call the VCS boundary
sync. It must:

- Write `.git/info/exclude`.
- Write local ignore overlays when needed.
- Write `.ai/harness/local-only-manifest.json`.
- Return a step in JSON/human output such as `sync local-only vcs boundary`.

Dry-run must report the planned paths without writing.

**Verify**:

Extend `tests/cli/bootstrap.test.ts`:

- Assert delegated args include `--vcs-scope local` by default.
- Assert the bootstrap JSON includes a successful `sync local-only vcs boundary`
  or equivalent step.
- Assert no parent package boundary behavior regresses.

Extend `tests/cli/init.test.ts`:

- Project hook/skill/external scope install creates `.git/info/exclude`.
- A fixture with `.codex/*` and `!.codex/hooks.json` ends with
  `.codex/hooks.json` ignored due to local overlay.
- `--mode self-host` defaults to tracked and does not install local-only ignores
  unless `--vcs-scope local` is explicit.

Run:

```sh
bun test tests/cli/bootstrap.test.ts tests/cli/init.test.ts --timeout 60000 --max-concurrency 4
```

Expected: all selected tests pass.

### Step 3: Write VCS policy and manifest into adopted repos

Update `scripts/lib/project-init-lib.sh` and
`scripts/migrate-project-template.sh` so the policy written to
`.ai/harness/policy.json` records the VCS boundary.

Add or update policy fields:

```json
{
  "vcs": {
    "install_state_scope": "local",
    "workflow_state_scope": "local",
    "product_intent_scope": "local",
    "exclude_strategy": "git-info-exclude-plus-local-overlays",
    "local_only_manifest": ".ai/harness/local-only-manifest.json"
  }
}
```

Add `.ai/harness/local-only-manifest.json` in apply mode. Suggested shape:

```json
{
  "version": 1,
  "generated_by": "local-repo-harness",
  "vcs_scope": {
    "install_state": "local",
    "workflow_state": "local",
    "product_intent": "local"
  },
  "local_only": [
    { "path": ".codex/hooks.json", "group": "install-state", "owner": "local-repo-harness" }
  ],
  "requires_user_review": []
}
```

Update the migration report line currently saying:

```text
Runtime temporary ignore block synced to .gitignore
```

It should distinguish:

- `.gitignore` runtime/cache defaults that remain product-level ignore hygiene.
- `.git/info/exclude` plus overlays for local-only project install state.
- Any tracked local-only paths that require `local-repo-harness vcs cleanup`.

Do not remove the existing runtime `.gitignore` block in one sweep. First make
it conditional:

- In tracked/self-host mode, preserve current behavior.
- In local-only downstream mode, stop writing `!.codex/hooks.json` as the
  project-level default. Use the local overlay instead.

**Verify**:

Update `tests/migration-script.test.ts`,
`tests/create-project-dirs.runtime.test.ts`, and `tests/scaffold-parity.test.ts`
expectations:

- Policy contains `vcs`.
- Workflow contract contains VCS/default-local semantics.
- Local-only mode does not require `.codex/hooks.json` to be unignored in root
  `.gitignore`.
- Self-host/tracked mode preserves current tracked workflow assumptions.

Run:

```sh
bun test tests/migration-script.test.ts tests/create-project-dirs.runtime.test.ts tests/scaffold-parity.test.ts --timeout 60000 --max-concurrency 4
```

Expected: all selected tests pass.

### Step 4: Add `vcs audit` and `vcs cleanup`

Add a new CLI command group in `src/cli/index.ts` and implementation module such
as `src/cli/commands/vcs.ts`:

```text
local-repo-harness vcs audit --repo . --json
local-repo-harness vcs cleanup --repo . --dry-run --json
local-repo-harness vcs cleanup --repo . --apply
```

`vcs audit` must be read-only. It should report:

- Resolved VCS policy.
- Local-only manifest path.
- `.git/info/exclude` status.
- Local overlay status.
- `tracked_local_only` paths.
- `unignored_local_only` paths.
- `requires_user_review` paths.
- `safe_to_commit` boolean.

`vcs cleanup --dry-run` should be the default. It should print exact
`git rm --cached -- <path>` operations that would run.

`vcs cleanup --apply` may run `git rm --cached`, but only for recognized
managed/local-only paths. It must never run `rm`, `rm -rf`, or delete working
tree files.

Exit codes:

- `vcs audit`: exit 0 when no tracked/unignored local-only paths; exit 1 when
  policy says local and any local-only path is tracked or unignored.
- `vcs cleanup --dry-run`: exit 1 if cleanup is needed, 0 if clean.
- `vcs cleanup --apply`: exit 0 after all safe cleanup succeeds; exit 1 if any
  path requires user review.

**Verify**:

Extend `tests/cli/vcs-local-only.test.ts`:

- `vcs audit --json` fails on a tracked `.ai/harness/bin/local-repo-harness`
  fixture.
- `vcs cleanup --dry-run --json` reports commands and leaves Git index
  unchanged.
- `vcs cleanup --apply --json` removes tracked local-only files from the index,
  leaves files on disk, and then `vcs audit --json` passes.
- A user-authored `scripts/check-task-workflow.sh` without generated marker is
  reported as `requires_user_review`, not automatically untracked.

Run:

```sh
bun test tests/cli/vcs-local-only.test.ts --timeout 60000 --max-concurrency 4
```

Expected: all selected tests pass.

### Step 5: Make status, doctor, and security report the VCS boundary

Update `src/cli/commands/status.ts`:

- Add `scopes.vcs` or `repo.vcs` with:
  - resolved install/workflow/product intent scopes,
  - manifest path,
  - counts for tracked/unignored local-only paths,
  - `safeToCommit`.

Update `src/cli/commands/doctor.ts`:

- Add a check ID such as `local-only-vcs-boundary`.
- For repos without local-only policy, return `na`.
- For local-only policy with no tracked/unignored paths, return `ok`.
- For tracked local-only paths, return `fail` with the first few paths and
  remediation:

```text
local-repo-harness vcs cleanup --repo <repo> --dry-run
```

- For unignored local-only paths due to ignore negation, return `fail` and point
  at VCS boundary sync or `vcs cleanup`.

Update `src/cli/commands/security.ts` only if you decide tracked project hook or
MCP configs should be a security finding. If touched, keep it scope-aware:
project-level tracked local-only config is a project hygiene failure, not
evidence of user-level leakage.

**Verify**:

Extend `tests/cli/doctor.test.ts`:

- Built-in IDs include `local-only-vcs-boundary`.
- Project-intent clean fixture reports `ok`.
- Tracked `.codex/hooks.json`, `.mcp.json`, and
  `.agents/skills/repo-harness/SKILL.md` report `fail`.
- Doctor detail does not recommend `npm install -g`, `--location global`, or
  user-level cleanup for this condition.

Run:

```sh
bun test tests/cli/doctor.test.ts --timeout 60000 --max-concurrency 4
```

Expected: all selected tests pass.

### Step 6: Update docs and public guidance

Update `README.md` and `QUICK_START.md` so users understand the new model:

- Project-scoped path isolation means files live under the target project.
- Local-only VCS isolation means those files are excluded from product Git
  history by default.
- Recipe C should mention that `bootstrap` defaults to `--vcs-scope local`.
- Add a "before commit" check:

```sh
./.ai/harness/bin/local-repo-harness vcs audit --repo . --json
./.ai/harness/bin/local-repo-harness doctor --json
git status --short --ignored
```

- Add recovery guidance:

```sh
./.ai/harness/bin/local-repo-harness vcs cleanup --repo . --dry-run
./.ai/harness/bin/local-repo-harness vcs cleanup --repo . --apply
```

- Explain that `--vcs-scope tracked` exists for self-host/source repos or teams
  that intentionally commit harness workflow artifacts.
- Explain that product intent docs can be explicitly tracked later, but the
  installed runtime/skills/hooks/MCP configs are local development state by
  default.

**Verify**:

Update docs tests as needed:

```sh
bun test tests/readme-dx.test.ts tests/install-scripts.test.ts --timeout 60000 --max-concurrency 4
```

Expected: all selected tests pass and docs mention `vcs audit`, `vcs cleanup`,
and local-only Git behavior.

### Step 7: Run release gates and a real local fixture proof

Create a temp fixture under `/tmp`, not inside this repo, to prove the final
behavior:

```sh
tmp=$(mktemp -d)
repo="$tmp/downstream"
mkdir -p "$repo"
git -C "$repo" init -q
printf '.codex/*\n!.codex/hooks.json\n' > "$repo/.gitignore"

bun --bun src/cli/index.ts bootstrap \
  --repo "$repo" \
  --host-adapter-scope project \
  --runtime project-vendored-bun \
  --skill-scope project \
  --external-tool-scope project \
  --codegraph-mcp-scope project \
  --brain-mode manifest-only \
  --no-codegraph \
  --no-verify \
  --json

git -C "$repo" status --short --ignored --untracked-files=all
bun --bun src/cli/index.ts vcs audit --repo "$repo" --json
bun --bun src/cli/index.ts doctor --json
```

Expected:

- `git status --short --ignored --untracked-files=all` shows
  local-repo-harness install state as ignored, not untracked.
- `vcs audit --json` exits 0 and has no `tracked_local_only`.
- `doctor --json` has `local-only-vcs-boundary` as `ok`.
- User-level paths are not written by this test.

Then run:

```sh
bun test
bash scripts/check-task-sync.sh
bash scripts/check-task-workflow.sh --strict
bun scripts/inspect-project-state.ts --repo . --format text
bash scripts/migrate-project-template.sh --repo . --dry-run
bun run check:release
npm pack --dry-run --json
```

Expected: all commands exit 0.

## Test plan

Add or update tests for these cases:

- Bootstrap delegates VCS scope and installs local-only boundary by default.
- Adopt project-scope install writes `.git/info/exclude` and required local
  ignore overlays.
- Root `.gitignore` containing `!.codex/hooks.json` does not leak
  `.codex/hooks.json` as untracked after local overlay sync.
- Self-host mode defaults to tracked VCS behavior.
- `vcs audit` detects tracked install-state paths, workflow-state paths, and
  product-intent paths only according to policy.
- `vcs cleanup --apply` untracks safe managed paths but does not delete files.
- User-authored files without managed markers require review and are not
  auto-untracked.
- `doctor --json` reports local-only VCS problems as `fail` with local
  remediation, not global install remediation.
- Docs mention local-only Git behavior and cleanup commands.

Use existing temp repo patterns from:

- `tests/cli/bootstrap.test.ts`
- `tests/cli/init.test.ts`
- `tests/cli/doctor.test.ts`
- `tests/migration-script.test.ts`
- `tests/create-project-dirs.runtime.test.ts`

## Done criteria

All must hold:

- [x] `bootstrap --help` and `adopt --help` expose the new VCS scope option(s).
- [x] Project-scoped `bootstrap` defaults to local-only VCS behavior.
- [x] `adopt --mode self-host` keeps tracked behavior unless explicitly
  overridden.
- [x] `.ai/harness/policy.json` records VCS scope.
- [x] `.ai/harness/local-only-manifest.json` is written for local-only installs.
- [x] `.git/info/exclude` has a managed local-repo-harness block.
- [x] Local ignore overlays handle `.gitignore` negation leaks such as
  `!.codex/hooks.json`.
- [x] `local-repo-harness vcs audit --json` exits non-zero when local-only
  managed artifacts are tracked or unignored.
- [x] `local-repo-harness vcs cleanup --apply` removes safe managed artifacts
  from the index and leaves files on disk.
- [x] `local-repo-harness doctor --json` includes a `local-only-vcs-boundary`
  check.
- [x] No implementation writes user-level config in project-scoped local-only
  mode.
- [x] Focused tests and release gates in "Commands you will need" pass.
- [x] `plans/README.md` status row is updated when implementation completes.

## STOP conditions

Stop and report back if:

- `.git/info/exclude` plus local overlays cannot reliably hide
  `.codex/hooks.json` when root `.gitignore` has `!.codex/hooks.json`.
- The cleanup logic would need to delete working tree files rather than only
  untrack them.
- The implementation cannot tell managed/generated helper wrappers apart from
  user-authored scripts.
- A test requires making all `scripts/` or all `docs/` ignored to pass.
- Self-host mode would stop tracking this source repo's own governance files by
  default.
- Any step reintroduces user-level writes for project-scoped recipe C.
- A verification command fails twice after a reasonable fix attempt.

## Maintenance notes

- Future installer work must treat path scope and VCS scope as separate axes.
  A path under the project can still be local-only.
- Any new project-scoped tool should register its local-only paths in the same
  manifest source used by doctor and cleanup.
- Avoid adding new `.gitignore` negations for generated host config unless the
  plan also updates local overlay handling.
- Reviewers should inspect cleanup safety carefully. The command must never
  delete files and must not untrack user-authored files without an explicit
  ownership signal.
