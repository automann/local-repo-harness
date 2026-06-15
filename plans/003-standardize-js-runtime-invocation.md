# Plan 003: Standardize shell JavaScript runtime invocation

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the next
> step. If anything in the "STOP conditions" section occurs, stop and report.
> When done, update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 8e944fd..HEAD -- scripts assets/templates/helpers tests`
>
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding. On a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: MED
- **Depends on**: `plans/002-remove-stale-repo-harness-wrapper-fallbacks.md`
- **Category**: correctness / tech-debt / dx
- **Planned at**: commit `8e944fd`, 2026-06-16

## Why this matters

The package is Bun-first and the project hook runtime is explicitly
`project-vendored-bun`, but many shell helpers still assume Node is present or
execute JavaScript through stdin forms that have already failed under Bun-only
real testing. Recent work fixed this for the brain helpers by writing temporary
`.js` files before execution. The same pattern needs to become a repo-wide
helper convention so project-scoped installs work without falling back to
user-level Node or global tooling.

## Current state

- Recent Bun-only regression tests cover only the brain helper path:

```ts
tests/helper-scripts.test.ts:670
test("brain helpers run with Bun as the only JavaScript runtime", () => {
  ...
  symlinkSync(process.execPath, join(fakeBin, "bun"));
  ...
  const manifestRes = run("bash", ["scripts/check-brain-manifest.sh"], cwd, env);
  const syncRes = run("bash", ["scripts/sync-brain-docs.sh", "--check"], cwd, env);
});
```

- `scripts/migrate-project-template.sh` still has Node-only stdin snippets:

```bash
scripts/migrate-project-template.sh:84
node - "$base_file" "$patch_file" "$output_file" <<'NODE_EOF'
```

```bash
scripts/migrate-project-template.sh:308
node - "$settings_file" <<'NODE_EOF'
```

- `scripts/lib/project-init-lib.sh` has Node-only snippets and several local
  runtime resolver implementations:

```bash
scripts/lib/project-init-lib.sh:502
node - "$file_path" <<'NODE_EOF'
```

```bash
scripts/lib/project-init-lib.sh:1602
node - "$registry_file" <<'JS_EOF'
```

```bash
scripts/lib/project-init-lib.sh:2609
pi_resolve_js_runtime() {
  if command -v node >/dev/null 2>&1; then
    printf 'node'
```

- Helper scripts copied into downstream repos also contain Node-only stdin
  snippets:

```bash
scripts/select-agent-context-blocks.sh:35
node - "$registry_file" <<'JS_EOF' | emit_existing_dirs
```

```bash
scripts/prepare-codex-handoff.sh:63
node - "$global_file" "$repo" "$repo_key" "$reason" "$repo_handoff" "$resume_file" <<'JS_EOF'
```

- Other helpers use ad hoc `node -e` / `bun -e` snippets with inconsistent
  argument handling:

```bash
scripts/check-task-workflow.sh:87
"$runtime" -e '
const fs = require("fs");
const [, filePath, selector] = process.argv;
```

```bash
scripts/sync-brain-docs.sh:87
"$runtime" -e '
const values = process.argv.slice(1);
```

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Targeted tests | `bun test tests/helper-scripts.test.ts tests/migration-script.test.ts tests/cli/init.test.ts` | exit 0 |
| Static search | `rg -n 'node - .*<<|bun - .*<<|node <<|bun <<' scripts assets/templates/helpers` | exit 1, no JS stdin snippets remain |
| Static search | `rg -n 'node -e|bun -e|process\\.argv\\.slice\\(1\\)|process\\.argv\\[1\\]|process\\.argv\\[2\\]' scripts assets/templates/helpers` | only allowlisted matches documented in the new runtime helper or tests |
| Required repo gate | `bun test` | exit 0 |
| Required repo gate | `bash scripts/check-deploy-sql-order.sh` | exit 0 |
| Required repo gate | `bash scripts/check-architecture-sync.sh` | exit 0 |
| Required repo gate | `bash scripts/check-task-sync.sh` | exit 0 |
| Required repo gate | `bash scripts/check-task-workflow.sh --strict` | exit 0 |
| Required repo gate | `bun scripts/inspect-project-state.ts --repo . --format text` | exit 0 |
| Required repo gate | `bash scripts/migrate-project-template.sh --repo . --dry-run` | exit 0 |

## Scope

**In scope**:

- Create a shared shell runtime helper, for example `scripts/lib/js-runtime.sh`.
- Update helper and migration scripts that currently run JavaScript through
  `node -`, `bun -`, ad hoc runtime stdin, or argument-sensitive `-e` snippets.
- Keep template helper copies in sync under `assets/templates/helpers/`.
- Add Bun-only regression coverage in `tests/helper-scripts.test.ts`,
  `tests/migration-script.test.ts`, and/or `tests/cli/init.test.ts`.

Expected high-priority files to inspect and update:

- `scripts/migrate-project-template.sh`
- `scripts/init-project.sh`
- `scripts/lib/project-init-lib.sh`
- `scripts/select-agent-context-blocks.sh`
- `scripts/prepare-codex-handoff.sh`
- `scripts/check-task-workflow.sh`
- `scripts/sync-brain-docs.sh`
- `scripts/check-brain-manifest.sh`
- `scripts/context-contract-sync.sh`
- `scripts/architecture-queue.sh`
- `scripts/workstream-sync.sh`
- `scripts/check-architecture-sync.sh`
- matching files under `assets/templates/helpers/`

**Out of scope**:

- `assets/hooks/*.sh` hook runtime snippets unless a test proves they fail under
  project-vendored Bun. Hooks are launched by
  `.ai/harness/bin/local-repo-harness-hook`, which requires Bun by design.
- Changing the public CLI shape.
- Rewriting helper logic into TypeScript modules; this plan is about standard
  shell invocation, not feature redesign.

## Git workflow

- Branch: `codex/runtime-compat-js-invocation`
- Commit message style: conventional commits, for example
  `fix: standardize helper JavaScript runtime invocation`
- Do not push unless the operator asks.

## Steps

### Step 1: Introduce a shared shell runtime library

Create `scripts/lib/js-runtime.sh` with small, sourceable functions. Use names
with a project prefix, for example:

- `rh_resolve_js_runtime`: resolve a JavaScript runtime. Prefer `bun`, then
  `node`, then `${HOME}/.bun/bin/bun` if executable. Return non-zero if none is
  available.
- `rh_make_js_temp`: create a temporary `.js` file and register cleanup without
  overwriting an existing caller trap.
- `rh_run_js_file`: run a `.js` file with positional args through the resolved
  runtime.
- `rh_run_js_source`: accept a heredoc body, write it to a temp file, and run the
  temp file with args. This is the replacement for `node - <<EOF`.

Use the same plain Bash style as the existing scripts: `set -euo pipefail`,
small functions, no external dependencies beyond POSIX-ish shell tools already
used in this repo.

**Verify**:
`bash -n scripts/lib/js-runtime.sh` exits 0.

### Step 2: Make the library reachable from package helpers and repo-pinned helpers

Helper scripts run from different locations:

- source repo scripts under `scripts/`;
- package-dispatched helpers under `assets/templates/helpers/`;
- repo-pinned helpers under `.ai/harness/scripts/` after adoption.

Implement a resolver pattern so each updated helper can source the runtime
library from the correct location. One acceptable pattern is:

1. compute `SCRIPT_DIR`;
2. try `"$SCRIPT_DIR/../lib/js-runtime.sh"` for source scripts;
3. try `"$SCRIPT_DIR/lib/js-runtime.sh"` for copied helper runtime;
4. try `"$SCRIPT_DIR/../../../scripts/lib/js-runtime.sh"` for packaged
   `assets/templates/helpers`.

If a helper cannot source the library, fail with a clear message naming
`js-runtime.sh`. Do not silently fall back to Node-only behavior.

If repo-pinned helper installation copies helper files into
`.ai/harness/scripts/`, update `scripts/lib/project-init-lib.sh` so the runtime
library is installed there too, or so installed helpers can resolve the package
copy reliably.

**Verify**:
`bun test tests/migration-script.test.ts tests/cli/init.test.ts`
exits 0 after tests are updated in later steps.

### Step 3: Replace Node-only stdin snippets

Replace every JavaScript stdin form in helper/migration scripts with the shared
runtime helper. Start with these confirmed sites:

- `scripts/migrate-project-template.sh:84`
- `scripts/migrate-project-template.sh:308`
- `scripts/lib/project-init-lib.sh:502`
- `scripts/lib/project-init-lib.sh:1602`
- `scripts/lib/project-init-lib.sh:1747`
- `scripts/select-agent-context-blocks.sh:35`
- `scripts/prepare-codex-handoff.sh:63`
- matching `assets/templates/helpers/select-agent-context-blocks.sh`
- matching `assets/templates/helpers/prepare-codex-handoff.sh`

The target shape should be temp-file execution, not `runtime -`. For example:

```bash
rh_run_js_source "$base_file" "$patch_file" "$output_file" <<'JS_EOF'
const fs = require("fs");
const [, , basePath, patchPath, outputPath] = process.argv;
...
JS_EOF
```

If your helper passes args differently, document that in the function and keep
the `process.argv` convention identical for Bun and Node.

**Verify**:
`rg -n 'node - .*<<|bun - .*<<|node <<|bun <<' scripts assets/templates/helpers`
exits 1.

### Step 4: Normalize argument-sensitive `-e` snippets

Find `node -e`, `bun -e`, and `"$runtime" -e` snippets that read
`process.argv`. Convert them to `rh_run_js_source` or `rh_run_js_file` so args
are always interpreted the same way under Bun and Node.

Confirmed sites to handle include:

- `scripts/migrate-project-template.sh:1100`
- `scripts/init-project.sh:434`
- `scripts/check-task-workflow.sh:87`
- `scripts/sync-brain-docs.sh:87`
- `scripts/lib/project-init-lib.sh:2229`
- `scripts/lib/project-init-lib.sh:2636`
- `scripts/lib/project-init-lib.sh:2781`
- `scripts/context-contract-sync.sh:67`
- `scripts/context-contract-sync.sh:81`
- `scripts/architecture-queue.sh:137`
- `scripts/architecture-queue.sh:303`
- `scripts/workstream-sync.sh:51`
- `scripts/check-architecture-sync.sh:74`
- `scripts/check-architecture-sync.sh:245`
- matching `assets/templates/helpers/*` copies.

Small `-e` snippets that read only environment variables may remain only if the
new static gate in plan 004 explicitly allowlists them. Prefer converting them
too when the change is straightforward.

**Verify**:
`rg -n 'node -e|bun -e|process\\.argv\\.slice\\(1\\)|process\\.argv\\[1\\]|process\\.argv\\[2\\]' scripts assets/templates/helpers`
returns only intentional, documented allowlisted matches.

### Step 5: Extend Bun-only tests beyond brain helpers

Model after `tests/helper-scripts.test.ts:670`.

Add Bun-only tests that create a fake `PATH` with:

- `bun` symlinked to `process.execPath`;
- no `node`;
- no globally visible `local-repo-harness` unless the test explicitly needs the
  CLI shim.

Cover at least:

- `scripts/select-agent-context-blocks.sh` reading `.ai/context/capabilities.json`;
- `scripts/prepare-codex-handoff.sh` with temp `CODEX_HOME`;
- `scripts/migrate-project-template.sh --repo <tmp-repo> --dry-run`;
- CLI `adopt --brain-mode manifest-only` still passes under Bun-only runtime.

**Verify**:
`bun test tests/helper-scripts.test.ts tests/migration-script.test.ts tests/cli/init.test.ts`
exits 0.

### Step 6: Run the required workflow checks

Run the full required local gates from `AGENTS.md`:

```bash
bun test
bash scripts/check-deploy-sql-order.sh
bash scripts/check-architecture-sync.sh
bash scripts/check-task-sync.sh
bash scripts/check-task-workflow.sh --strict
bun scripts/inspect-project-state.ts --repo . --format text
bash scripts/migrate-project-template.sh --repo . --dry-run
```

Expected result: all commands exit 0.

## Test plan

- Add targeted Bun-only tests for every script family changed in this plan.
- Existing tests to use as patterns:
  - `tests/helper-scripts.test.ts:670` for fake Bun-only `PATH`;
  - `tests/cli/init.test.ts:524` for CLI adopt under Bun-only runtime;
  - `tests/migration-script.test.ts` for migration script output and generated
    files.
- The tests should fail if a helper still executes `node -` while `node` is not
  on `PATH`.

## Done criteria

- [ ] All confirmed `node - <<EOF` / `bun - <<EOF` JavaScript snippets in
  `scripts/` and `assets/templates/helpers/` are gone.
- [ ] Argument-sensitive `node -e` / `bun -e` snippets are converted or
  explicitly allowlisted for the static gate in plan 004.
- [ ] Source helpers and packaged template helpers remain behaviorally in sync.
- [ ] Bun-only tests cover at least select-agent-context, codex handoff,
  migration dry-run, and adopt manifest-only brain mode.
- [ ] Required workflow checks all exit 0.
- [ ] `plans/README.md` marks this plan DONE with the commit hash/date.

## STOP conditions

Stop and report if:

- A helper cannot reliably locate a shared runtime library from both package and
  repo-pinned execution paths.
- The fix requires changing public CLI commands or generated package script
  names.
- A Bun-only test requires user-level `~/.repo-harness`, `~/.codex`, `~/.claude`,
  or ancestor `node_modules` state to pass.
- The live files differ materially from the excerpts above.

## Maintenance notes

Future shell helpers should not introduce their own Bun/Node resolver. Reviewers
should look for direct `node -`, `bun -`, and arg-reading `-e` snippets in every
helper PR. Keep `scripts/` and `assets/templates/helpers/` behavior aligned
because the latter is what downstream projects execute through
`local-repo-harness run`.
