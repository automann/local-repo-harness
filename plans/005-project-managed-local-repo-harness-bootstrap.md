# Plan 005: Add package-boundary-free project bootstrap for local-repo-harness

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report; do not improvise. When done, update the status row for this plan in
> `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 07ce495..HEAD -- src/cli/index.ts src/cli/commands/init.ts src/cli/tools/codegraph.ts tests/cli/init.test.ts tests/cli/tools.test.ts tests/bootstrap-files.test.ts tests/runtime-compat.test.ts docs/reference-configs/project-scoped-install-zh-CN.md assets/reference-configs/project-scoped-install-zh-CN.md README.md README.zh-CN.md package.json`
>
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding. On a
> mismatch, treat it as a STOP condition.

## Status

- **State**: DONE (verified 2026-06-16)
- **Priority**: P1
- **Effort**: L
- **Risk**: MED
- **Depends on**: plans/001-project-scoped-codegraph-managed-tool-runtime.md
- **Category**: dx
- **Planned at**: commit `07ce495`, 2026-06-16

## Why this matters

`local-repo-harness` now supports project-scoped hooks, skills, external tools,
and CodeGraph, but the first documented command still tells users to run
`bun add -d local-repo-harness@latest` in the target repo. In a non-JS repo with
no root `package.json`, Bun walks upward to the nearest ancestor package
boundary and can modify an unrelated parent directory. A real install attempt in
`/Users/syfq/dev/harness/swarm-discussion-codex` polluted
`/Users/syfq/dev/package.json`, `/Users/syfq/dev/bun.lock`, and
`/Users/syfq/dev/node_modules/local-repo-harness`. The desired user experience is
the same boundary model already used for project CodeGraph: all tool package
state lives under `.ai/harness/tools/`, and the business project root does not
need to become a JavaScript package.

## Current state

Relevant files and roles:

- `src/cli/index.ts` wires public CLI subcommands with Commander.
- `src/cli/commands/init.ts` implements the existing `adopt` flow that applies
  repo-local hooks, skills, external tools, CodeGraph, and brain manifest state.
- `src/cli/tools/codegraph.ts` is the existing managed-tool-root precedent.
- `tests/cli/init.test.ts` covers `adopt` CLI behavior and project-scoped
  CodeGraph MCP behavior.
- `tests/cli/tools.test.ts` covers managed CodeGraph install under
  `.ai/harness/tools/codegraph/`.
- `docs/reference-configs/project-scoped-install-zh-CN.md` and
  `assets/reference-configs/project-scoped-install-zh-CN.md` are the human guide
  and packaged guide copy. Keep them synchronized.

Current CLI command registration in `src/cli/index.ts:31-49`:

```ts
export const SUBCOMMANDS = [
  'init',
  'init-hook',
  'install',
  'uninstall',
  'hook',
  'status',
  'doctor',
  'migrate',
  'security',
  'update',
  'adopt',
  'run',
  'setup',
  'tools',
  'brain',
  'capability-context',
  'docs',
] as const;
```

Current `adopt` command in `src/cli/index.ts:199-225`:

```ts
program
  .command('adopt')
  .description('Install or refresh the repo-local harness workflow in an existing repo')
  .argument('[action]', 'Optional action: rollback')
  .option('--repo <path>', 'Target repository path (defaults to cwd)')
  .option('--archive <path>', 'Runtime reclaim archive to restore when action is rollback')
  .option('--dry-run', 'Plan repo harness changes without applying them')
  .option('--target <target>', `Host target for readiness checks and optional global bootstrap: ${VALID_TARGETS.join('|')}`, 'both')
  .option('--no-sync-skill', 'Skip repo-harness skill alias installation')
  .option('--skill-scope <scope>', `repo-harness-owned skill scope: ${VALID_SCOPES.join('|')} (default: none)`, 'none')
  .option('--no-host-adapters', 'Skip writing Codex/Claude hook adapters')
  .option('--host-adapter-scope <scope>', `Hook adapter scope: ${VALID_SCOPES.join('|')} (default: none)`, 'none')
  .option('--runtime <runtime>', `Hook runtime mode: ${VALID_RUNTIMES.join('|')} (default: auto)`, 'auto')
  .option('--no-external-skills', 'Skip Waza and Mermaid third-party skill bootstrap')
  .option('--external-tool-scope <scope>', `Third-party tooling scope: ${VALID_SCOPES.join('|')} (default: none)`, 'none')
  .option('--no-verify', 'Skip repo workflow verification after apply')
  .option('--no-codegraph', 'Skip building the CodeGraph index and MCP readiness check')
  .option('--reclaim-runtime', 'Reclaim generated repo-local hook/helper runtime copies after replacement paths verify')
  .option('--compact', 'Compact repo surface; includes --reclaim-runtime plus package script rewrite')
  .option('--mode <mode>', 'Adoption mode: minimal|standard|self-host', 'standard')
  .option('--configure-codegraph', 'Deprecated: user-level MCP config belongs to local-repo-harness update/setup')
  .option('--codegraph-mcp-scope <scope>', `CodeGraph MCP scope: ${VALID_SCOPES.join('|')} (default: none)`, 'none')
  .option('--sync-codegraph', 'Sync the CodeGraph index after ensure')
  .option('--brain-root <path>', 'Deprecated: user-level brain config belongs to local-repo-harness update/setup')
  .option('--brain-mode <mode>', 'Repo-local brain mode: skip|manifest-only', 'skip')
  .option('--interactive', 'Run the numbered interactive install planner')
  .option('--json', 'Output JSON instead of human-readable text')
```

Current `runInit` flow in `src/cli/commands/init.ts:421-457`:

```ts
export function runInit(opts: InitCommandOptions = {}): InitCommandResult {
  const sourceRoot = resolve(opts.sourceRoot ?? REPO_ROOT);
  const repoRoot = resolve(opts.repo ?? process.cwd());
  let commandEnv = initCommandEnv(sourceRoot, opts.env);
  const apply = opts.apply !== false;
  const verify = opts.verify !== false;
  const syncSkill = opts.syncSkill !== false;
  const skillScope = opts.skillScope ?? "none";
  const hostAdapters = opts.hostAdapters !== false;
  const hostAdapterScope = opts.hostAdapterScope ?? "none";
  const runtimeSelection = opts.runtime ?? "auto";
  const externalToolScope = opts.externalToolScope ?? "none";
  const codegraph = opts.codegraph !== false;
  const configureCgMcp = opts.configureCodegraphMcp === true;
  const codegraphMcpScope = opts.codegraphMcpScope ?? (configureCgMcp ? "user" : "none");
  const syncCodegraph = opts.syncCodegraph === true;
  const brainMode = opts.brainMode ?? "skip";
  const target = opts.target ?? "both";
  const steps: InitStep[] = [];

  if (opts.brainRoot) {
    commandEnv = { ...(commandEnv ?? {}), REPO_HARNESS_BRAIN_ROOT: opts.brainRoot };
  }
  commandEnv = {
    ...(commandEnv ?? {}),
    REPO_HARNESS_HOST_ADAPTER_SCOPE: hostAdapters ? hostAdapterScope : "none",
    REPO_HARNESS_RUNTIME_SELECTION: hostAdapters && hostAdapterScope !== "none"
      ? runtimeSelection
      : "none",
    REPO_HARNESS_HOOK_RUNTIME_MODE: hostAdapters && hostAdapterScope !== "none"
      ? resolveRuntimeMode(scopeToLocation(hostAdapterScope), runtimeSelection)
      : "none",
    REPO_HARNESS_SKILL_SCOPE: syncSkill ? skillScope : "none",
    REPO_HARNESS_EXTERNAL_TOOL_SCOPE: externalToolScope,
    REPO_HARNESS_CODEGRAPH_MCP_SCOPE: codegraph ? codegraphMcpScope : "none",
    REPO_HARNESS_BRAIN_MODE: brainMode,
  };
```

Managed CodeGraph package precedent in `src/cli/tools/codegraph.ts:201-241`:

```ts
function ensureManagedCodegraphPackage(repoRoot: string, env?: NodeJS.ProcessEnv): CodegraphAction {
  const toolDir = managedCodegraphPackageDir(repoRoot);
  const packagePath = join(toolDir, "package.json");
  const command = ["bun", "install"];

  mkdirSync(toolDir, { recursive: true });
  writeManagedCodegraphShim(repoRoot);

  if (existsSync(packagePath) && !readJson(packagePath)) {
    return {
      action: "install-managed-deps",
      status: "failed",
      command,
      stderr: `${packagePath} is not valid JSON; refusing to overwrite the managed CodeGraph package boundary.`,
    };
  }

  if (!existsSync(packagePath)) {
    writeFileSync(
      packagePath,
      `${JSON.stringify(
        {
          private: true,
          dependencies: {
            [CODEGRAPH_PACKAGE]: CODEGRAPH_PACKAGE_VERSION,
          },
        },
        null,
        2,
      )}\n`,
    );
  }

  const result = run("bun", ["install"], toolDir, env);
  return {
    action: "install-managed-deps",
    status: result.ok ? "changed" : "failed",
    command,
    stdout: trimOutput(result.stdout),
    stderr: trimOutput(result.stderr || result.error),
  };
}
```

Current Chinese guide still has a copyable `bun add` command in
`docs/reference-configs/project-scoped-install-zh-CN.md:84-91`:

````md
## 第一步：把 local-repo-harness 放进目标项目

如果 `local-repo-harness` 已经发布到你要使用的 registry：

```bash
cd /path/to/target-project
bun add -d local-repo-harness@latest
```
````

Repo conventions to follow:

- TypeScript CLI code uses small synchronous file/process helpers and returns
  structured step/action objects. Match `src/cli/commands/init.ts` and
  `src/cli/tools/codegraph.ts`.
- Tests use `bun:test`, temp directories under `tmpdir()`, fake executables in a
  temp `bin`, and assertions against generated files. Match
  `tests/cli/init.test.ts` and `tests/cli/tools.test.ts`.
- Documentation that ships downstream exists in both `docs/reference-configs/`
  and `assets/reference-configs/`. Keep the copies byte-for-byte identical.
- Substantive source or docs changes need task synchronization. Add a concise
  note under `tasks/notes/` or another accepted task-sync surface if
  `check-task-sync` requires it.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Focused bootstrap/adopt tests | `bun test tests/cli/init.test.ts tests/cli/tools.test.ts tests/bootstrap-files.test.ts tests/runtime-compat.test.ts --timeout 60000 --max-concurrency 4` | all selected tests pass |
| Runtime compatibility gate | `bash scripts/check-runtime-compat.sh` | exits 0 and prints `[runtime-compat] OK` |
| Task sync | `bash scripts/check-task-sync.sh` | exits 0; either no sync needed or repo changes include synchronized `tasks/` updates |
| Workflow gate | `bash scripts/check-task-workflow.sh --strict` | exits 0; warnings about unavailable external brain vault are acceptable |
| Full test suite | `bun test --timeout 60000 --max-concurrency 4` | exits 0, no failing tests |
| Release package dry run | `npm pack --dry-run --json` | exits 0 and reports the current package without adding tracked files |

## Scope

**In scope**:

- `src/cli/index.ts`
- New CLI implementation module, recommended: `src/cli/commands/bootstrap.ts`
- `src/cli/commands/init.ts` only if a small shared type/helper is needed for
  option forwarding into `runInit`
- `src/cli/tools/codegraph.ts` only if extracting a generic managed-tool helper
  is simpler than duplicating the package-boundary pattern; otherwise leave it
  unchanged
- `tests/cli/init.test.ts`
- `tests/cli/tools.test.ts` or a new focused test file under `tests/cli/`
- `tests/bootstrap-files.test.ts`
- `tests/runtime-compat.test.ts` if the new shim needs static compatibility
  coverage
- `docs/reference-configs/project-scoped-install-zh-CN.md`
- `assets/reference-configs/project-scoped-install-zh-CN.md`
- `README.md` and `README.zh-CN.md` only for high-level command examples
- `tasks/notes/<date>-project-managed-local-repo-harness-bootstrap.notes.md`
  if task sync requires a note

**Out of scope**:

- Do not revive a `repo-harness` binary alias. The fork standardizes on
  `local-repo-harness`.
- Do not make `local-repo-harness init` or `update` project-scoped. Those remain
  user-level machine bootstrap/update paths.
- Do not require root `package.json` for the zero-package bootstrap path.
- Do not remove the existing `adopt` command. `bootstrap` should install a
  project-managed CLI and then delegate to the existing `adopt` semantics.
- Do not change CodeGraph index location `.codegraph/` or its MCP env semantics.
- Do not write user-level Codex/Claude hooks, user-level skills, or user-level
  MCP config in the new bootstrap path unless the caller explicitly chooses a
  user scope, which the zero-package guide must not recommend.

## Git workflow

- Branch: `codex/project-managed-local-repo-harness-bootstrap`
- Commit style: conventional commits, for example
  `feat: add project-managed local-repo-harness bootstrap`
- Do not push or open a PR unless the operator explicitly asks.

## Target design

Add a new public command:

```bash
bunx --bun local-repo-harness@latest bootstrap \
  --repo "$PWD" \
  --host-adapter-scope project \
  --runtime project-vendored-bun \
  --skill-scope project \
  --external-tool-scope project \
  --codegraph-mcp-scope project \
  --sync-codegraph \
  --brain-mode manifest-only
```

The command must be safe when `$PWD` is a Git repo with no root `package.json`.
It should create this managed runtime:

```text
.ai/harness/tools/local-repo-harness/
  package.json
  bun.lock
  node_modules/.bin/local-repo-harness

.ai/harness/bin/local-repo-harness
```

The shim `.ai/harness/bin/local-repo-harness` should:

- Resolve `REPO_ROOT` from its own location (`../../..`).
- Resolve the managed binary at
  `$REPO_ROOT/.ai/harness/tools/local-repo-harness/node_modules/.bin/local-repo-harness`.
- Export telemetry-neutral, project-local defaults only if useful. Do not invent
  user-level config.
- Exec the managed binary with all passed arguments.
- Print a clear remediation if the managed binary is missing:
  `local-repo-harness project runtime is missing; run: bunx --bun local-repo-harness@latest bootstrap --repo "$REPO_ROOT"`.

`bootstrap` should then delegate to the project-managed binary, not continue the
rest of adoption through the transient `bunx` copy. The internal shape can be:

1. Validate `repoRoot`.
2. Ensure `.ai/harness/tools/local-repo-harness/package.json`.
3. Run `bun install` with cwd set to the managed tool dir.
4. Write `.ai/harness/bin/local-repo-harness`.
5. Spawn `.ai/harness/bin/local-repo-harness adopt ...` with the caller's
   selected project scopes.

This makes the transient `bunx` invocation only a bootstrap seed. All durable
runtime and later commands become project-owned.

## Steps

### Step 1: Add failing tests for zero-package bootstrap

Add tests before implementation. Prefer `tests/cli/init.test.ts` if the command
shares adoption behavior; otherwise create `tests/cli/bootstrap.test.ts`.

Required cases:

1. **No root package boundary**:
   - Create a temp parent directory with `package.json`.
   - Create child repo `parent/harness/swarm-discussion-codex` with `git init`
     but no `package.json`.
   - Run the CLI command with `bootstrap --repo <child> --host-adapter-scope none --skill-scope none --external-tool-scope none --codegraph-mcp-scope none --brain-mode skip --no-codegraph --json`.
   - Use a fake `bun` executable that logs cwd and, for `install`, creates
     `node_modules/.bin/local-repo-harness` under the current cwd.
   - Assert parent `package.json` content is unchanged and no parent `bun.lock`
     is created.
   - Assert child root still has no `package.json`.
   - Assert `.ai/harness/tools/local-repo-harness/package.json` exists.
   - Assert `.ai/harness/bin/local-repo-harness` exists and is executable.

2. **Delegation uses project-managed shim**:
   - The fake managed binary should log its arguments.
   - Assert it receives `adopt` plus the selected scopes, not `init` or
     `update`.

3. **Existing JS project remains supported**:
   - A target repo with root `package.json` can still use the documented JS
     `bun add -d local-repo-harness@latest` path. This can be documentation-only
     if the existing test suite already covers `adopt` from a package install.

**Verify**:
`bun test tests/cli/init.test.ts --timeout 60000 --max-concurrency 4` should
fail only because `bootstrap` is not implemented yet. If it fails for unrelated
reasons, stop and report.

### Step 2: Implement a managed local-repo-harness package helper

Create a small helper in `src/cli/commands/bootstrap.ts` or another clearly
named module. Match the CodeGraph helper style but do not couple this helper to
CodeGraph.

Recommended constants:

```ts
const HARNESS_PACKAGE = "local-repo-harness";
const HARNESS_TOOL_DIR_REL = ".ai/harness/tools/local-repo-harness";
const HARNESS_TOOL_BIN_REL = `${HARNESS_TOOL_DIR_REL}/node_modules/.bin/local-repo-harness`;
const HARNESS_SHIM_REL = ".ai/harness/bin/local-repo-harness";
```

The managed package file should be minimal:

```json
{
  "private": true,
  "dependencies": {
    "local-repo-harness": "<requested spec>"
  }
}
```

Use the requested spec directly when the user passes a package spec. Defaults:

- `local-repo-harness@latest`
- support `--version <version>` as `local-repo-harness@<version>`
- support `--channel <channel>` for `latest|next`
- support `--package <spec>` for tarball or registry testing only if this can be
  done without ambiguity; otherwise leave tarball support for a later plan.

Important safety behavior:

- Run `bun install` with cwd equal to `.ai/harness/tools/local-repo-harness`.
- If the managed `package.json` exists but is invalid JSON, fail without
  overwriting it.
- Do not create or edit target root `package.json`.
- Do not run `bun add` in the target root.
- Return structured actions/steps with command, stdout/stderr, and status.

**Verify**:
`bun test tests/cli/init.test.ts --timeout 60000 --max-concurrency 4` should now
pass the managed-package creation assertions, even if delegation is not finished.

### Step 3: Register the `bootstrap` command and forward adopt options

In `src/cli/index.ts`:

- Add `'bootstrap'` to `SUBCOMMANDS`.
- Register `program.command('bootstrap')`.
- Reuse the same validation enums already used by `adopt`:
  `VALID_TARGETS`, `VALID_SCOPES`, `VALID_RUNTIMES`.
- Expose project-scope options with the same names as `adopt` where possible:
  `--repo`, `--target`, `--host-adapter-scope`, `--runtime`, `--skill-scope`,
  `--external-tool-scope`, `--codegraph-mcp-scope`, `--sync-codegraph`,
  `--brain-mode`, `--no-codegraph`, `--no-verify`, `--json`.

Default `bootstrap` for zero-package project-scoped use should be conservative:

- `--host-adapter-scope project`
- `--runtime project-vendored-bun`
- `--skill-scope project`
- `--external-tool-scope project`
- `--codegraph-mcp-scope project`
- `--brain-mode manifest-only`
- CodeGraph enabled, but `--sync-codegraph` only when explicitly supplied unless
  the user passes it. Do not surprise users with a sync if they did not request
  it.

The command should:

1. Ensure the managed local-repo-harness package.
2. Spawn `.ai/harness/bin/local-repo-harness adopt ...` with the final options.
3. For `--json`, print a JSON object with:
   - `exitCode`
   - `repoRoot`
   - `packageSpec`
   - `toolRoot`
   - `shim`
   - `steps`
   - `delegated`
4. For text output, use existing `[init]`-style or `[bootstrap]`-style lines.

**Verify**:
`bun --bun src/cli/index.ts bootstrap --help` exits 0 and lists the project-scope
options. `bun test tests/bootstrap-files.test.ts --timeout 60000` passes after
updating command-surface expectations if that test checks subcommands.

### Step 4: Ensure the project shim is runtime-compatible

The new `.ai/harness/bin/local-repo-harness` shim is part of the runtime surface.
It must be compatible with Bun and Node invocation changes introduced in 0.5.3.

Add static coverage in `tests/runtime-compat.test.ts` if it scans generated shim
patterns, or add a focused test that writes the shim and executes:

```bash
./.ai/harness/bin/local-repo-harness --version
```

using a fake managed binary. The test should prove:

- The shim works when the repo path contains spaces.
- The shim does not rely on root `node_modules`.
- The shim does not call `repo-harness`.
- The shim prints a clear missing-runtime message and exits 127 when the managed
  binary is absent.

**Verify**:
`bash scripts/check-runtime-compat.sh` exits 0 and prints `[runtime-compat] OK`.

### Step 5: Update project-scoped installation docs

Update both:

- `docs/reference-configs/project-scoped-install-zh-CN.md`
- `assets/reference-configs/project-scoped-install-zh-CN.md`

Required doc changes:

- Make the zero-package path the recommended path:

```bash
cd /path/to/target-project
bunx --bun local-repo-harness@latest bootstrap \
  --repo "$PWD" \
  --host-adapter-scope project \
  --runtime project-vendored-bun \
  --skill-scope project \
  --external-tool-scope project \
  --codegraph-mcp-scope project \
  --sync-codegraph \
  --brain-mode manifest-only
```

- Move `bun add -d local-repo-harness@latest` to a clearly labeled section for
  JS projects that already have root `package.json`.
- Add a fail-fast guard to the JS-project `bun add` block:

```bash
cd /path/to/target-project
test -f package.json || {
  echo "ERROR: package.json missing; use the bootstrap recipe instead." >&2
  exit 1
}
bun add -d local-repo-harness@latest
```

- Explain that `bootstrap` uses transient `bunx` only as the seed and installs
  durable local-repo-harness runtime into
  `.ai/harness/tools/local-repo-harness/`.
- Keep the existing Bun `minimumReleaseAgeExcludes = ["local-repo-harness"]`
  note. It still matters because `bunx` also fetches the package.
- Update the directory map to include
  `.ai/harness/tools/local-repo-harness/` and
  `.ai/harness/bin/local-repo-harness`.

Also update `README.md` and `README.zh-CN.md` high-level examples if they still
lead users toward `npx`/`bun add` as the primary project-scoped path.

**Verify**:

```bash
cmp -s docs/reference-configs/project-scoped-install-zh-CN.md assets/reference-configs/project-scoped-install-zh-CN.md
rg -n 'bun add -d local-repo-harness@latest' docs/reference-configs/project-scoped-install-zh-CN.md assets/reference-configs/project-scoped-install-zh-CN.md
```

Expected: the `cmp` command exits 0; every remaining `bun add` mention is inside
the JS-project-only guarded section or refresh guidance, not the zero-package
default.

### Step 6: Add task-sync note and run gates

If `bash scripts/check-task-sync.sh` requires a synchronized task artifact, add
a concise note under `tasks/notes/` describing:

- the real parent-boundary leakage that motivated the change,
- the new `.ai/harness/tools/local-repo-harness/` managed tool root,
- the decision to keep root `package.json` optional for zero-package projects.

Run the focused and full gates.

**Verify**:

```bash
bun test tests/cli/init.test.ts tests/cli/tools.test.ts tests/bootstrap-files.test.ts tests/runtime-compat.test.ts --timeout 60000 --max-concurrency 4
bash scripts/check-runtime-compat.sh
bash scripts/check-task-sync.sh
bash scripts/check-task-workflow.sh --strict
bun test --timeout 60000 --max-concurrency 4
npm pack --dry-run --json
```

Expected: all commands exit 0. `check-task-workflow.sh --strict` may print
warnings about unavailable external brain vault paths, but it must exit 0.

## Test plan

New or updated tests must cover:

- `bootstrap` can run in a Git repo with no root `package.json` while a parent
  directory has its own `package.json`; parent files remain unchanged.
- `bootstrap` creates `.ai/harness/tools/local-repo-harness/package.json`,
  `.ai/harness/tools/local-repo-harness/bun.lock` or equivalent install output
  from fake Bun, and `.ai/harness/bin/local-repo-harness`.
- `bootstrap` delegates to project-managed `local-repo-harness adopt`, preserving
  project-scope options.
- `bootstrap --json` is parseable and includes managed runtime paths and
  delegated adopt result.
- The shim works for repo paths containing spaces and fails closed with exit 127
  when the managed binary is absent.
- Existing `adopt` behavior remains unchanged when invoked directly.
- Project CodeGraph still installs under `.ai/harness/tools/codegraph/` without
  root `package.json`; keep the existing test at
  `tests/cli/tools.test.ts:492-538` passing.

Use existing tests as structural patterns:

- `tests/cli/init.test.ts:524-570` for Bun-only runtime and fake PATH setup.
- `tests/cli/init.test.ts:779-839` for project-scoped CodeGraph MCP assertions.
- `tests/cli/tools.test.ts:492-538` for managed tool-root install without root
  `package.json`.

## Done criteria

All must hold:

- [x] `local-repo-harness bootstrap --help` lists project-scope options.
- [x] `bootstrap` in a repo with no root `package.json` does not create or edit
      target root `package.json`.
- [x] `bootstrap` does not edit an ancestor `package.json` or create ancestor
      `bun.lock`.
- [x] `bootstrap` creates `.ai/harness/tools/local-repo-harness/package.json`
      and `.ai/harness/bin/local-repo-harness`.
- [x] `bootstrap` delegates the actual adoption to the project-managed shim.
- [x] Project-scoped CodeGraph still uses `.ai/harness/tools/codegraph/` and
      `.ai/harness/bin/codegraph`.
- [x] Chinese project-scoped install guide documents `bootstrap` as the
      zero-package default and guards the `bun add` JS-project path.
- [x] `docs/reference-configs/project-scoped-install-zh-CN.md` and
      `assets/reference-configs/project-scoped-install-zh-CN.md` are identical.
- [x] Focused tests, runtime compatibility gate, task sync, workflow gate, full
      tests, and package dry run all pass.
- [x] `plans/README.md` status row for this plan is updated.

## STOP conditions

Stop and report back instead of improvising if:

- Bun cannot install from `.ai/harness/tools/local-repo-harness/package.json`
  without walking to an ancestor package after a valid package file exists in
  that managed tool dir.
- The `bunx --bun local-repo-harness@latest bootstrap` seed path cannot run the
  package binary because of Bun package execution limitations.
- The implementation would require registering user-level hooks, user-level
  skills, or user-level MCP config for the zero-package project path.
- The new command cannot delegate to project-managed `adopt` without duplicating
  large parts of `runInit`.
- Tests reveal that `adopt` relies on root `package.json` for behavior other
  than package-manager installation of the local-repo-harness CLI.
- Any in-scope current-state excerpt no longer matches live code after the drift
  check.

## Maintenance notes

- This plan intentionally creates a second managed tool root:
  `.ai/harness/tools/local-repo-harness/`. Reviewers should compare it with
  `.ai/harness/tools/codegraph/` and push shared helper extraction only when it
  simplifies both paths without obscuring their different package specs and
  shims.
- After this lands, documentation should treat `bun add -d local-repo-harness`
  as an optional JS-project path, not the default project-scoped path.
- Future release tests should include a zero-root-package target repo with a
  parent `package.json`; this is the exact failure shape that caused the leak.
- If a later plan adds uninstall/cleanup, it should remove
  `.ai/harness/tools/local-repo-harness/` and `.ai/harness/bin/local-repo-harness`
  as project-managed runtime state, but should not touch parent package files.
