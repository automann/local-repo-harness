# Plan 004: Add a runtime compatibility gate

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the next
> step. If anything in the "STOP conditions" section occurs, stop and report.
> When done, update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 8e944fd..HEAD -- scripts/check-npm-release.sh package.json tests scripts assets/templates assets/hooks .ai/hooks`
>
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding. On a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**:
  `plans/002-remove-stale-repo-harness-wrapper-fallbacks.md`,
  `plans/003-standardize-js-runtime-invocation.md`
- **Category**: tests / dx
- **Planned at**: commit `8e944fd`, 2026-06-16

## Why this matters

The repo already regressed once into a Bun-only `runtime -` failure and still
contains multiple older Node-only patterns. Without a static gate, future
helpers can reintroduce the same class of bugs even after the runtime invocation
cleanup lands. This plan adds an explicit release check so `npm publish` cannot
ship stale `repo-harness` fallbacks, JavaScript stdin snippets, or unreviewed
argument-sensitive `-e` snippets.

## Current state

- `package.json` has no runtime-compatibility script:

```json
package.json:31
"scripts": {
  "benchmark:skills": "bun scripts/run-skill-evals.ts",
  "test": "bun test",
  "test:coverage": "bun test --coverage",
  "check:release": "bash scripts/check-npm-release.sh",
```

- The release gate runs tests and workflow checks but does not scan scripts for
  known incompatible patterns:

```bash
scripts/check-npm-release.sh:27
bun install --frozen-lockfile
...
bash scripts/check-task-workflow.sh --strict
bun scripts/inspect-project-state.ts --repo . --format text >/dev/null
bash scripts/migrate-project-template.sh --repo . --dry-run >/dev/null
npm pack --dry-run --json >/dev/null
```

- Known current patterns that should be blocked after plans 002 and 003:

```bash
scripts/migrate-project-template.sh:84
node - "$base_file" "$patch_file" "$output_file" <<'NODE_EOF'
```

```ts
src/cli/repo-adoption/reclaim-runtime.ts:425
: ["repo-harness", "run", "${id}"];
```

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| New static gate | `bash scripts/check-runtime-compat.sh` | exit 0, prints OK summary |
| Gate tests | `bun test tests/runtime-compat.test.ts` | exit 0 |
| Release gate | `bash scripts/check-npm-release.sh` | exit 0 unless current package version already exists on npm; if version exists, run all checks in the script except the npm uniqueness check and report that explicitly |
| Required repo gate | `bun test` | exit 0 |

## Scope

**In scope**:

- Create `scripts/check-runtime-compat.sh`.
- Add `check:runtime-compat` to `package.json`.
- Call the new check from `scripts/check-npm-release.sh`.
- Add tests, preferably `tests/runtime-compat.test.ts`.
- Optionally add a short note to `AGENTS.md` only if the repo conventions require
  new gates to be listed there.

**Out of scope**:

- Fixing the runtime issues themselves. Plans 002 and 003 must land first.
- Scanning all documentation for the word `repo-harness`; many docs and skill
  names use it intentionally.
- Blocking hook scripts merely because they use `bun -e` with environment-only
  input. Hook snippets are allowed if the gate explicitly documents why.

## Git workflow

- Branch: `codex/runtime-compat-gate`
- Commit message style: conventional commits, for example
  `test: add runtime compatibility gate`
- Do not push unless the operator asks.

## Steps

### Step 1: Add `scripts/check-runtime-compat.sh`

Create a Bash script with `set -euo pipefail`. It should scan only executable
runtime surfaces, not broad prose docs:

- `scripts/`
- `assets/templates/helpers/`
- `assets/hooks/`
- `.ai/hooks/`
- `src/cli/repo-adoption/reclaim-runtime.ts`
- `scripts/lib/project-init-lib.sh`

The script should fail on:

- JavaScript stdin snippets such as `node - ... <<`, `bun - ... <<`,
  `node <<`, `bun <<`, or bare `"$runtime" <<'JS_EOF'`;
- stale generated command fallbacks such as `["repo-harness", "run"]`,
  `exec repo-harness run`, or `command -v repo-harness`;
- argument-sensitive `node -e` / `bun -e` snippets outside an explicit
  allowlist.

The script should print each finding as:

```text
[runtime-compat] <file>:<line>: <rule-id>: <short reason>
```

and exit 1 if any finding exists. On success, print:

```text
[runtime-compat] OK
```

**Verify**:
`bash -n scripts/check-runtime-compat.sh` exits 0.

### Step 2: Add a narrow allowlist with comments

Some snippets are intentionally Bun-only because hooks execute inside the
project-vendored Bun runtime. If any remain after plan 003, keep the allowlist
inside `scripts/check-runtime-compat.sh` as data, with one-line comments naming
the reason.

Do not use a broad directory allowlist for `assets/hooks/`. Allowlist specific
files/patterns only.

**Verify**:
`bash scripts/check-runtime-compat.sh` exits 0 after plans 002 and 003 have
landed.

### Step 3: Add tests for the gate

Create `tests/runtime-compat.test.ts`.

Cover:

- a temporary file containing `node - "$file" <<'JS_EOF'` fails with the
  expected rule id;
- a temporary file containing `["repo-harness", "run", "x"]` fails with the
  stale-fallback rule id;
- a temporary file containing an allowlisted hook-style environment-only
  `bun -e` snippet passes only when the allowlist entry is present;
- the live repository passes the gate.

Use existing test style from `tests/helper-scripts.test.ts`: temp directories,
`spawnSync`, explicit status assertions, and cleanup with `rmSync`.

**Verify**:
`bun test tests/runtime-compat.test.ts` exits 0.

### Step 4: Wire the gate into package scripts and release

Add to `package.json`:

```json
"check:runtime-compat": "bash scripts/check-runtime-compat.sh"
```

Call `bash scripts/check-runtime-compat.sh` from
`scripts/check-npm-release.sh` before `npm pack --dry-run --json`.

**Verify**:
`bun run check:runtime-compat` exits 0.

### Step 5: Run release-adjacent verification

Run:

```bash
bun test
bash scripts/check-runtime-compat.sh
bash scripts/check-deploy-sql-order.sh
bash scripts/check-architecture-sync.sh
bash scripts/check-task-sync.sh
bash scripts/check-task-workflow.sh --strict
bun scripts/inspect-project-state.ts --repo . --format text
bash scripts/migrate-project-template.sh --repo . --dry-run
```

Then run `bash scripts/check-npm-release.sh` if the package version has not
already been published. If the version has already been published, do not bypass
the gate silently; report that the npm uniqueness check blocked the full release
script and list the commands above as the substitute verification.

## Test plan

- New test file: `tests/runtime-compat.test.ts`.
- Test the scanner on temporary fixtures and on the live repo.
- Include failure-message assertions so the next executor can identify which
  pattern regressed.

## Done criteria

- [ ] `scripts/check-runtime-compat.sh` exists, is executable, and prints
  `[runtime-compat] OK` on the current tree.
- [ ] `package.json` exposes `check:runtime-compat`.
- [ ] `scripts/check-npm-release.sh` runs the new gate.
- [ ] `bun test tests/runtime-compat.test.ts` passes.
- [ ] Full required workflow checks pass, or the only skipped command is the npm
  uniqueness portion of `check-npm-release.sh` with a clear explanation.
- [ ] `plans/README.md` marks this plan DONE with the commit hash/date.

## STOP conditions

Stop and report if:

- The scanner needs broad allowlists that would hide the exact patterns it is
  supposed to prevent.
- The live repo cannot pass the scanner after plans 002 and 003 are complete.
- `check-npm-release.sh` currently performs side effects that the operator does
  not want on every local release check; ask whether to split uniqueness and
  local gates before changing release flow.

## Maintenance notes

This gate should stay intentionally boring. Prefer simple pattern checks with
small allowlists over a complex parser. When future helpers need a new runtime
invocation shape, reviewers should require either reuse of `scripts/lib/js-runtime.sh`
or an explicit allowlist entry with a test explaining why the general rule does
not apply.
