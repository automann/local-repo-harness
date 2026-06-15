# Plan 001: Make project-scoped CodeGraph independent of target root package.json

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report; do not improvise. When done, update the status row for this plan in
> `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 96f5ab1..HEAD -- src/cli/tools/codegraph.ts scripts/check-agent-tooling.sh assets/templates/helpers/check-agent-tooling.sh scripts/lib/project-init-lib.sh tests/cli/tools.test.ts tests/cli/init.test.ts tests/cli/doctor.test.ts tests/check-agent-tooling.test.ts tests/migration-script.test.ts assets/reference-configs/project-scoped-install-zh-CN.md docs/reference-configs/project-scoped-install-zh-CN.md`
>
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding. On a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: MED
- **Depends on**: none
- **Category**: dx
- **Planned at**: commit `96f5ab1`, 2026-06-16

## Why this matters

Project-scoped CodeGraph currently means "install `@colbymchenry/codegraph`
as a target repo devDependency and point MCP at `./node_modules/.bin/codegraph`."
That implementation leaks a JavaScript package-manager assumption into every
downstream repo. If the target repo has no root `package.json`, `bun add` walks
up to the nearest ancestor package boundary and can modify an unrelated parent
workspace. The desired model is repo-local tool ownership: CodeGraph runtime,
MCP config, and index state belong to the adopted repo, without requiring the
business repo root to become a JS package.

This plan replaces the root `node_modules` coupling with a harness-managed tool
root under `.ai/harness/tools/codegraph/` plus a stable executable shim at
`.ai/harness/bin/codegraph`. It keeps CodeGraph project-scoped, keeps global
fallbacks explicit, and makes the install flow safe for non-JS downstream repos.

## Current state

- `src/cli/tools/codegraph.ts` owns CodeGraph detection, ensure, and MCP config
  rendering.
- `scripts/check-agent-tooling.sh` is the installed/runtime readiness probe and
  has a mirrored copy at `assets/templates/helpers/check-agent-tooling.sh`.
- `scripts/lib/project-init-lib.sh` writes downstream policy commands during
  migration/adoption.
- The Chinese project-scoped guide currently documents a root `package.json`
  boundary and root `bun add`.

Relevant excerpts:

```ts
// src/cli/tools/codegraph.ts:154-160
function hasCodegraphDependency(repoRoot: string) {
  const pkg = readJson(join(repoRoot, "package.json"));
  return Boolean(
    pkg?.devDependencies?.["@colbymchenry/codegraph"] ||
      pkg?.dependencies?.["@colbymchenry/codegraph"] ||
      pkg?.optionalDependencies?.["@colbymchenry/codegraph"]
  );
}
```

```ts
// src/cli/tools/codegraph.ts:239-242
let codegraph = readToolingReport(opts.repoRoot, opts.env, opts.host);
if (opts.installDeps !== false && hasCodegraphDependency(opts.repoRoot) && !codegraph.local_bin_path) {
  appendAction(actions, "install-deps", ["bun", "install"], run("bun", ["install"], opts.repoRoot, opts.env));
  codegraph = readToolingReport(opts.repoRoot, opts.env, opts.host);
}
```

```ts
// src/cli/tools/codegraph.ts:432-433
function localCodegraphCommand(_repoRoot: string): string {
  return "./node_modules/.bin/codegraph";
}
```

```ts
// src/cli/tools/codegraph.ts:814-821
if (!binPath) {
  actions.push({
    action: actionName,
    status: opts.location === "local" ? "skipped" : "failed",
    command,
    stderr: opts.location === "local"
      ? "CodeGraph CLI is missing; writing project MCP config only. Install the project dependency with: npm install --save-dev @colbymchenry/codegraph"
      : "CodeGraph CLI is missing; run local-repo-harness tools ensure codegraph first.",
  });
```

```js
// scripts/check-agent-tooling.sh:85-90
const CODEGRAPH_PACKAGE = "@colbymchenry/codegraph";
const CODEGRAPH_GLOBAL_INSTALL_COMMAND = `npm install -g ${CODEGRAPH_PACKAGE} && mkdir -p ~/.local/bin && ln -sfn "$(npm config get prefix)/bin/codegraph" ~/.local/bin/codegraph && PATH="$HOME/.local/bin:$PATH" local-repo-harness tools configure codegraph --target codex --location global`;
const CODEGRAPH_MCP_CONFIGURE_COMMAND = "local-repo-harness tools configure codegraph --target <codex|claude|both> --location global";
const CODEGRAPH_PROJECT_INSTALL_COMMAND = `npm install --save-dev ${CODEGRAPH_PACKAGE} && local-repo-harness tools configure codegraph --target both --location local`;
const CODEGRAPH_PROJECT_MCP_CONFIGURE_COMMAND = "local-repo-harness tools configure codegraph --target <codex|claude|both> --location local";
const CODEGRAPH_LOCAL_INSTALL_COMMAND = "bun install";
```

```js
// scripts/check-agent-tooling.sh:1169-1176
function codeGraphPackageDeclared() {
  const pkg = readJson(path.join(REPO_ROOT, "package.json"));
  if (!pkg || typeof pkg !== "object") return false;
  return Boolean(
    pkg.devDependencies?.[CODEGRAPH_PACKAGE] ||
      pkg.dependencies?.[CODEGRAPH_PACKAGE] ||
      pkg.optionalDependencies?.[CODEGRAPH_PACKAGE]
  );
}
```

```js
// scripts/check-agent-tooling.sh:1195-1197
if (localOverride) localCandidates.push(localOverride);
if (allowRepoLocal) localCandidates.push(path.join(REPO_ROOT, "node_modules", ".bin", "codegraph"));
```

```bash
# scripts/lib/project-init-lib.sh:2256-2259
const codegraphProjectInstallCommand =
  "npm install --save-dev @colbymchenry/codegraph && local-repo-harness tools configure codegraph --target both --location local";
const codegraphProjectConfigureCommand =
  "local-repo-harness tools configure codegraph --target both --location local";
```

```ts
// tests/cli/tools.test.ts:384
expect(projectMcpAfter?.mcpServers?.codegraph?.command).toBe("./node_modules/.bin/codegraph");
```

```ts
// tests/cli/init.test.ts:823-826
expect(codexConfig).toContain('command = "./node_modules/.bin/codegraph"');
const claudeMcp = JSON.parse(readFileSync(join(repo, ".mcp.json"), "utf-8")).mcpServers.codegraph;
expect(claudeMcp.command).toBe("./node_modules/.bin/codegraph");
```

From `assets/reference-configs/project-scoped-install-zh-CN.md:181-193`, the
current recipe tells users to:

- confirm or create a root `package.json`
- then run `bun add -d @colbymchenry/codegraph`

That excerpt is the behavior this plan removes for CodeGraph specifically.

Repo conventions to follow:

- TypeScript CLI code uses small pure helpers plus synchronous file/process
  operations; match `src/cli/tools/codegraph.ts`.
- Tests use `bun:test`, temp directories from `tmpdir()`, fake executable
  shims, and no real network or user-level writes; match `tests/cli/tools.test.ts`.
- Runtime helper scripts in `scripts/` often have mirrored template copies in
  `assets/templates/helpers/`; keep both in sync when the helper is installed
  into downstream repos.
- Substantive changes need task synchronization. If the implementation changes
  source or docs, add a concise note under `tasks/notes/` or another accepted
  task-sync surface.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Install/check deps | `bun install --frozen-lockfile` | exit 0, no dependency changes |
| Focused CodeGraph tests | `bun test tests/cli/tools.test.ts tests/cli/init.test.ts tests/cli/doctor.test.ts tests/check-agent-tooling.test.ts tests/migration-script.test.ts tests/tooling/codegraph-integration.test.ts --timeout 60000 --max-concurrency 4` | all selected tests pass |
| Version consistency | `bun scripts/check-skill-version.ts` | reports matching local-repo-harness and template versions |
| Task sync | `bash scripts/check-task-sync.sh` | reports repo changes include synchronized tasks updates, or no changes detected |
| Workflow gate | `bash scripts/check-task-workflow.sh --strict` | exits 0; warnings about unavailable external brain vault are acceptable |
| Full test suite | `bun test --timeout 60000 --max-concurrency 4` | exits 0, no failing tests |
| Release package dry run | `npm pack --dry-run --json` | exits 0 and reports `local-repo-harness@0.5.1` unless the version was intentionally bumped later |

## Scope

**In scope**:

- `src/cli/tools/codegraph.ts`
- `scripts/check-agent-tooling.sh`
- `assets/templates/helpers/check-agent-tooling.sh`
- `scripts/lib/project-init-lib.sh`
- `scripts/migrate-project-template.sh` only if policy migration wiring requires it
- `assets/reference-configs/project-scoped-install-zh-CN.md`
- `docs/reference-configs/project-scoped-install-zh-CN.md`
- CodeGraph-related tests:
  - `tests/cli/tools.test.ts`
  - `tests/cli/init.test.ts`
  - `tests/cli/doctor.test.ts`
  - `tests/check-agent-tooling.test.ts`
  - `tests/migration-script.test.ts`
  - `tests/tooling/codegraph-integration.test.ts`
- A concise task-sync note under `tasks/notes/`

**Out of scope**:

- Do not redesign how `local-repo-harness` itself is installed into a target
  project. This plan removes CodeGraph's extra root `package.json` dependency;
  it does not solve "zero package.json for the whole harness install flow."
- Do not remove support for existing repos that already declare
  `@colbymchenry/codegraph` in root `package.json`; keep this as a legacy
  detection path.
- Do not change user/global CodeGraph install behavior except for remediation
  wording that must remain accurate.
- Do not change CodeGraph index location `.codegraph/` or telemetry opt-out
  environment values.
- Do not introduce pnpm/npm as the new project-scoped install mechanism.

## Git workflow

- Branch: `codex/project-codegraph-managed-tool-root`
- Commit style: conventional commits, for example
  `fix: keep project CodeGraph install local`.
- Do not push or open a PR unless the operator explicitly asks.

## Target design

Introduce a harness-managed CodeGraph tool root:

```text
.ai/harness/tools/codegraph/
  package.json          # private package boundary owned by local-repo-harness
  bun.lock              # created by Bun inside the tool root
  node_modules/.bin/codegraph

.ai/harness/bin/codegraph # stable executable shim used by MCP configs
```

The shim should be executable and cwd-safe. Its job is to find the repo root
from its own location, set CodeGraph runtime env defaults, and exec the managed
package binary:

```bash
#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
BIN="$REPO_ROOT/.ai/harness/tools/codegraph/node_modules/.bin/codegraph"
if [[ ! -x "$BIN" ]]; then
  echo "CodeGraph project binary is missing; run: local-repo-harness tools ensure codegraph --repo \"$REPO_ROOT\"" >&2
  exit 127
fi
export CODEGRAPH_TELEMETRY="${CODEGRAPH_TELEMETRY:-0}"
export DO_NOT_TRACK="${DO_NOT_TRACK:-1}"
export CODEGRAPH_INSTALL_DIR="${CODEGRAPH_INSTALL_DIR:-$REPO_ROOT/.ai/harness/codegraph-runtime}"
exec "$BIN" "$@"
```

Project MCP config should point to this shim:

```toml
[mcp_servers.codegraph]
command = "./.ai/harness/bin/codegraph"
args = ["serve", "--mcp", "--path", "."]
env = { CODEGRAPH_TELEMETRY = "0", DO_NOT_TRACK = "1", CODEGRAPH_INSTALL_DIR = ".ai/harness/codegraph-runtime" }
```

Claude project `.mcp.json` should use the same command:

```json
{
  "mcpServers": {
    "codegraph": {
      "type": "stdio",
      "command": "./.ai/harness/bin/codegraph",
      "args": ["serve", "--mcp", "--path", "."],
      "env": {
        "CODEGRAPH_TELEMETRY": "0",
        "DO_NOT_TRACK": "1",
        "CODEGRAPH_INSTALL_DIR": ".ai/harness/codegraph-runtime"
      }
    }
  }
}
```

## Steps

### Step 1: Add red tests for package-boundary independence

Update the existing CodeGraph tests before changing production code.

Required test changes:

- In `tests/cli/tools.test.ts`, update the local-project MCP expectations at
  lines 353-461 so project configs expect `./.ai/harness/bin/codegraph`, not
  `./node_modules/.bin/codegraph`.
- Add a test case where the fake target repo has no root `package.json` and no
  root `node_modules/`, then `tools configure codegraph --location local`
  still writes project config pointing at the harness shim and does not create
  root `package.json`.
- In `tests/cli/init.test.ts`, update the project-stub expectations at
  lines 786-835 to expect `./.ai/harness/bin/codegraph`.
- In `tests/check-agent-tooling.test.ts`, add coverage that a fake executable
  at `.ai/harness/bin/codegraph` is detected as `source: "local"` and that
  project intent remediation does not mention root `npm install --save-dev`.
- In `tests/migration-script.test.ts`, update the project CodeGraph policy
  expectations at lines 719-825 to expect the new install command and new
  managed tool root metadata.
- In `tests/cli/doctor.test.ts`, update the project CodeGraph remediation
  assertion at lines 370-407 so it points to `local-repo-harness tools ensure
  codegraph --repo .` and no longer suggests root `npm install --save-dev`.

Expected failures before implementation:

- Tests expecting the new shim command fail because production code still
  emits `./node_modules/.bin/codegraph`.
- Tests expecting project remediation without root package mutation fail
  because current install commands still mention `npm install --save-dev`.

**Verify**:

```bash
bun test tests/cli/tools.test.ts tests/cli/init.test.ts tests/cli/doctor.test.ts tests/check-agent-tooling.test.ts tests/migration-script.test.ts --timeout 60000 --max-concurrency 4
```

Expected at this stage: fails only on the new/updated expectations described
above. If unrelated tests fail, STOP and report.

### Step 2: Add managed CodeGraph path helpers in `src/cli/tools/codegraph.ts`

Add constants near the existing CodeGraph constants:

```ts
const CODEGRAPH_TOOL_DIR_REL = ".ai/harness/tools/codegraph";
const CODEGRAPH_TOOL_PACKAGE_JSON_REL = `${CODEGRAPH_TOOL_DIR_REL}/package.json`;
const CODEGRAPH_TOOL_BIN_REL = `${CODEGRAPH_TOOL_DIR_REL}/node_modules/.bin/codegraph`;
const CODEGRAPH_SHIM_REL = ".ai/harness/bin/codegraph";
```

Add helpers:

- `managedCodegraphPackageDir(repoRoot: string): string`
- `managedCodegraphBinPath(repoRoot: string): string`
- `managedCodegraphShimPath(repoRoot: string): string`
- `writeManagedCodegraphShim(repoRoot: string): void`
- `ensureManagedCodegraphPackage(repoRoot: string, env?: NodeJS.ProcessEnv): CodegraphAction`

Implementation requirements:

- `writeManagedCodegraphShim` must create `.ai/harness/bin/`, write the bash
  shim shown in "Target design", and chmod it executable.
- `ensureManagedCodegraphPackage` must create `.ai/harness/tools/codegraph/`.
  It must not read or write target root `package.json`.
- If `.ai/harness/tools/codegraph/package.json` is absent, write a minimal
  private package file and install CodeGraph from inside that directory. Use
  Bun only. A safe shape is:

```json
{
  "private": true,
  "dependencies": {
    "@colbymchenry/codegraph": "1.0.1"
  }
}
```

- If the package file is present, run `bun install` from
  `.ai/harness/tools/codegraph/`.
- If the package file exists but is invalid JSON, return a failed action with
  a clear stderr message. Do not overwrite it silently.
- The action command recorded in JSON output should be explicit, for example:
  `["bun", "install", "--cwd", ".ai/harness/tools/codegraph"]` if using a Bun
  cwd flag, or `["bun", "install"]` with action metadata/stderr/stdout making
  the cwd clear.

Replace `localCodegraphCommand()` so local/project MCP config returns:

```ts
return "./.ai/harness/bin/codegraph";
```

Keep global MCP config using `"codegraph"`.

**Verify**:

```bash
bun test tests/cli/tools.test.ts --timeout 60000 --max-concurrency 4
```

Expected: tests that only check config rendering now pass; tests that require
detection/ensure may still fail until later steps.

### Step 3: Teach ensure to install the managed tool root for project intent

Change `ensureCodegraph()` in `src/cli/tools/codegraph.ts`.

Desired behavior:

- `checkOnly` remains read-only.
- If `opts.installDeps !== false`, project MCP intent is `project`, and no
  local binary is detected, run the managed tool root install helper from
  Step 2.
- After installing, re-read the tooling report.
- If the managed install fails, return a failed action and do not fall back to
  global CodeGraph silently.
- Preserve legacy behavior for repos that already declare
  `@colbymchenry/codegraph` in root `package.json`, but make project MCP intent
  prefer the managed `.ai/harness/bin/codegraph` path.

Because `ensureCodegraph()` currently reads project intent indirectly through
`readToolingReport()`, use `codegraph.raw.mcp_intent === "project"` from the
report instead of adding a new public flag unless the implementation becomes
messy. If that raw field is missing, STOP and update the plan before guessing.

**Verify**:

```bash
bun test tests/cli/tools.test.ts tests/cli/init.test.ts --timeout 60000 --max-concurrency 4
```

Expected: project CodeGraph adopt/configure tests pass without requiring a
target root `package.json`.

### Step 4: Update readiness detection and remediation commands

Update both helper copies:

- `scripts/check-agent-tooling.sh`
- `assets/templates/helpers/check-agent-tooling.sh`

Required behavior:

- `resolveCodeGraphBinary()` should check local candidates in this order:
  1. `AGENTIC_DEV_CODEGRAPH_LOCAL_BIN`
  2. `<repo>/.ai/harness/bin/codegraph`
  3. `<repo>/.ai/harness/tools/codegraph/node_modules/.bin/codegraph`
  4. legacy `<repo>/node_modules/.bin/codegraph`
- The managed shim and managed package binary should count as `source:
  "local"`.
- Root `node_modules/.bin/codegraph` should remain supported as a legacy local
  candidate, but should no longer be the only local project option.
- Split package detection into at least two concepts:
  - root package dependency declared
  - managed harness tool package present
- For `mcp_intent === "project"`, `install_command` should no longer contain
  `npm install --save-dev` or `npm install -g`. It should be something like:

```text
local-repo-harness tools ensure codegraph --repo . && local-repo-harness tools configure codegraph --target both --location local
```

- `ensure_command`, `init_command`, `sync_command`, and `upgrade_command`
  should prefer the managed `ensure-codegraph.sh` route when project intent is
  active, even if the target repo root has no `package.json`.
- `uninstall_command` for project intent should mention removing
  `.ai/harness/bin/codegraph`, `.ai/harness/tools/codegraph/`, project MCP
  entries, and `.codegraph/` if the user wants to remove the index.

Keep update checks read-only. Do not add network install attempts to
`check-agent-tooling.sh`.

**Verify**:

```bash
bun test tests/check-agent-tooling.test.ts tests/cli/doctor.test.ts tests/tooling/codegraph-integration.test.ts --timeout 60000 --max-concurrency 4
```

Expected: all selected tests pass; no remediation text suggests root
`package.json`, root `npm install --save-dev`, or global fallback for project
intent.

### Step 5: Update policy generation and migration text

Update `scripts/lib/project-init-lib.sh` so downstream policy for project
CodeGraph says:

- `tool_root`: `.ai/harness/tools/codegraph`
- `managed_bin`: `.ai/harness/bin/codegraph`
- `install_command`: `local-repo-harness tools ensure codegraph --repo . && local-repo-harness tools configure codegraph --target both --location local`
- `mcp_configure_command`: unchanged, still project-local configure
- `vendoring_policy`: rename or clarify to avoid implying target-root package
  dependency. A good value is
  `managed-harness-tool-root-no-target-root-package-dependency`.

Update tests in `tests/migration-script.test.ts` and
`tests/create-project-dirs.runtime.test.ts` accordingly.

If `scripts/migrate-project-template.sh` has hard-coded CodeGraph install text
outside the library-generated policy, update it too. Otherwise leave it alone.

**Verify**:

```bash
bun test tests/migration-script.test.ts tests/create-project-dirs.runtime.test.ts --timeout 60000 --max-concurrency 4
```

Expected: policy tests pass and no project CodeGraph policy contains
`npm install --save-dev @colbymchenry/codegraph`.

### Step 6: Update project-scoped install docs

Update both guide copies:

- `assets/reference-configs/project-scoped-install-zh-CN.md`
- `docs/reference-configs/project-scoped-install-zh-CN.md`

Required doc changes:

- Remove the root `package.json` prerequisite specifically for CodeGraph.
- Remove CodeGraph instructions that tell users to create root `package.json`.
- Remove `bun add -d @colbymchenry/codegraph` from recipe C.
- Explain that project-scoped CodeGraph is installed by
  `local-repo-harness tools ensure codegraph` into
  `.ai/harness/tools/codegraph/`, with the MCP command pointing at
  `.ai/harness/bin/codegraph`.
- Keep any root `package.json` guidance that is still truly required for
  installing `local-repo-harness` itself via `bun add -d local-repo-harness`.
  Do not overclaim that the whole adoption flow is package-manager-free.
- Update verification text so `.codex/config.toml` and `.mcp.json` should
  prefer `./.ai/harness/bin/codegraph`, not `./node_modules/.bin/codegraph`.

**Verify**:

```bash
rg -n 'bun add -d @colbymchenry/codegraph|node_modules/.bin/codegraph|npm install --save-dev @colbymchenry/codegraph' assets/reference-configs/project-scoped-install-zh-CN.md docs/reference-configs/project-scoped-install-zh-CN.md
```

Expected: no matches, except if a match is explicitly in a "legacy behavior"
warning. If a legacy warning remains, it must clearly say not to use that path
for the new project-scoped flow.

### Step 7: Add task-sync note and run full verification

Add a concise note under `tasks/notes/`, for example
`tasks/notes/20260616-codegraph-managed-tool-root.notes.md`, explaining:

- why root `package.json` is no longer the right CodeGraph boundary
- where the managed tool root lives
- what remains out of scope: the install mechanism for `local-repo-harness`
  itself

Then run the gates.

**Verify**:

```bash
bun scripts/check-skill-version.ts
bash scripts/check-task-sync.sh
bash scripts/check-task-workflow.sh --strict
bun test --timeout 60000 --max-concurrency 4
npm pack --dry-run --json
```

Expected:

- Version check passes.
- Task sync passes.
- Workflow check passes, allowing existing external brain vault warnings.
- Full test suite passes.
- Pack dry-run includes `assets/reference-configs/project-scoped-install-zh-CN.md`.

## Test plan

Add or update tests so the following behaviors are machine-checked:

- Project MCP config uses `./.ai/harness/bin/codegraph`.
- Project CodeGraph configure/ensure does not require target root
  `package.json`.
- Project intent remediation never suggests `npm install --save-dev` or
  `npm install -g`.
- Readiness detection treats `.ai/harness/bin/codegraph` as local.
- Legacy root `node_modules/.bin/codegraph` still works as a fallback local
  candidate.
- Generated policy records the managed tool root and no target-root package
  dependency.
- Chinese project-scoped guide no longer tells users to install CodeGraph into
  the target root package.

Use existing tests as patterns:

- `tests/cli/tools.test.ts` for fake CodeGraph CLI and MCP config assertions.
- `tests/cli/init.test.ts` for adopt flow assertions.
- `tests/check-agent-tooling.test.ts` for readiness/remediation assertions.
- `tests/migration-script.test.ts` for policy text assertions.

## Done criteria

All must hold:

- [ ] No project CodeGraph path in production code points at
  `./node_modules/.bin/codegraph` except as an explicitly named legacy fallback
  candidate.
- [ ] Project CodeGraph install/remediation text does not contain
  `npm install --save-dev @colbymchenry/codegraph`.
- [ ] Project CodeGraph install/remediation text does not contain
  `npm install -g @colbymchenry/codegraph`.
- [ ] `local-repo-harness adopt --codegraph-mcp-scope project --sync-codegraph`
  can be tested in a temp repo with no root `package.json`; it writes project
  MCP config and does not create root `package.json`.
- [ ] `.codex/config.toml` and `.mcp.json` generated for project CodeGraph use
  `./.ai/harness/bin/codegraph`.
- [ ] `.ai/harness/tools/codegraph/package.json` is the only package boundary
  created for CodeGraph itself.
- [ ] `bun test --timeout 60000 --max-concurrency 4` exits 0.
- [ ] `bash scripts/check-task-sync.sh` exits 0.
- [ ] `plans/README.md` status row updated.

## STOP conditions

Stop and report back instead of improvising if:

- CodeGraph itself cannot run correctly when installed outside the target root
  package, even when invoked through the shim from the repo root.
- Codex or Claude MCP config does not resolve relative command paths from the
  target repo root; this would require a different absolute-path or wrapper
  strategy.
- Bun cannot install into `.ai/harness/tools/codegraph/` without walking to an
  ancestor package after a local package file exists there.
- Implementing the change requires redesigning how `local-repo-harness` itself
  is installed into the target project.
- Existing tests reveal that downstream generated repos intentionally depend on
  root `package.json` for more than CodeGraph.

## Maintenance notes

- Future external tools should follow the same distinction: root project
  dependencies belong to the business app; harness-managed tools belong under
  `.ai/harness/tools/<tool>/` with stable shims in `.ai/harness/bin/`.
- Reviewers should look carefully for accidental global fallback, absolute user
  paths, and root package mutations.
- Keep `scripts/check-agent-tooling.sh` and
  `assets/templates/helpers/check-agent-tooling.sh` synchronized; they are easy
  to drift.
- This plan intentionally leaves a possible follow-up: making the entire
  local-repo-harness project-scoped adoption flow independent of root
  `package.json`. That is larger because the CLI package itself is currently
  installed via Bun/npm package mechanisms.
