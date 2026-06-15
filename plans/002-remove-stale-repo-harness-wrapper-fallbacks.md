# Plan 002: Remove stale `repo-harness` fallbacks from generated wrappers

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the next
> step. If anything in the "STOP conditions" section occurs, stop and report.
> When done, update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 8e944fd..HEAD -- scripts/lib/project-init-lib.sh src/cli/repo-adoption/reclaim-runtime.ts tests/migration-script.test.ts tests/reclaim-runtime.test.ts tests/bootstrap-files.test.ts`
>
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding. On a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: correctness / dx
- **Planned at**: commit `8e944fd`, 2026-06-16

## Why this matters

This fork intentionally exposes `local-repo-harness` as the package and CLI
name. It does not keep `repo-harness` as a compatibility bin. Two generated
TypeScript wrapper paths still fall back to `repo-harness run`, so downstream
repos can pass adoption but later fail when a migrated `.ts` helper wrapper is
executed. Fixing this first keeps later Bun/Node runtime work from testing the
wrong command boundary.

## Current state

- `package.json` declares only `local-repo-harness` and
  `local-repo-harness-hook` bins:

```json
package.json:24
"bin": {
  "local-repo-harness": "src/cli/index.ts",
  "local-repo-harness-hook": "src/cli/hook-entry.ts"
}
```

- `scripts/lib/project-init-lib.sh` writes a TypeScript helper wrapper with an
  old command fallback:

```ts
scripts/lib/project-init-lib.sh:1157
const command = sourceRoot && existsSync(join(sourceRoot, "src", "cli", "index.ts"))
  ? ["bun", join(sourceRoot, "src", "cli", "index.ts"), "run", "$(basename "$helper_name" .ts)"]
  : ["repo-harness", "run", "$(basename "$helper_name" .ts)"];
```

- `src/cli/repo-adoption/reclaim-runtime.ts` has the same stale fallback:

```ts
src/cli/repo-adoption/reclaim-runtime.ts:425
const command = sourceRoot && existsSync(join(sourceRoot, "src", "cli", "index.ts"))
  ? ["bun", join(sourceRoot, "src", "cli", "index.ts"), "run", "${id}"]
  : ["repo-harness", "run", "${id}"];
```

- Existing recent commit style is conventional, e.g.
  `8e944fd fix: support Bun-only brain helper runtime`.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Targeted tests | `bun test tests/migration-script.test.ts tests/reclaim-runtime.test.ts tests/bootstrap-files.test.ts` | exit 0, all tests pass |
| Static check | `rg -n '\["repo-harness",\s*"run"|exec repo-harness run|command -v repo-harness >/dev/null' scripts/lib/project-init-lib.sh src/cli/repo-adoption/reclaim-runtime.ts tests/migration-script.test.ts tests/reclaim-runtime.test.ts tests/bootstrap-files.test.ts` | exit 1, no matches |
| Required repo gate | `bun test` | exit 0 |
| Required repo gate | `bash scripts/check-task-workflow.sh --strict` | exit 0 |

## Scope

**In scope**:

- `scripts/lib/project-init-lib.sh`
- `src/cli/repo-adoption/reclaim-runtime.ts`
- `tests/migration-script.test.ts`
- `tests/reclaim-runtime.test.ts`
- `tests/bootstrap-files.test.ts`

**Out of scope**:

- Public skill names and installed skill directories named `repo-harness`; those
  are a separate product compatibility surface and appear intentionally in docs
  and tests.
- Hook route labels, prompt intents, and architecture docs that use
  `repo-harness` as domain language.
- Any package alias or new `repo-harness` bin. The fix should remove fallback
  use, not add compatibility.

## Git workflow

- Branch: `codex/runtime-compat-wrapper-fallbacks`
- Commit message style: conventional commits, for example
  `fix: remove stale repo-harness wrapper fallback`
- Do not push unless the operator asks.

## Steps

### Step 1: Fix generated TypeScript wrapper commands

In both wrapper generators, replace the fallback command array with
`["local-repo-harness", "run", <helper-id>]`.

Keep the existing source-root fast path intact. Do not change the shell wrapper
path unless the drift check shows it has regressed; the shell wrapper already
uses `local-repo-harness run`.

**Verify**:
`rg -n '\["repo-harness",\s*"run"' scripts/lib/project-init-lib.sh src/cli/repo-adoption/reclaim-runtime.ts`
exits 1.

### Step 2: Add regression coverage for both wrapper generators

Add or update tests so both generated TypeScript wrappers assert:

- they contain `local-repo-harness`;
- they do not contain `["repo-harness", "run"` or equivalent old fallback;
- shell wrappers still dispatch through `local-repo-harness run`.

Use existing wrapper-generation tests as the structural pattern:

- `tests/migration-script.test.ts` for `scripts/lib/project-init-lib.sh`
  generated artifacts;
- `tests/reclaim-runtime.test.ts` for runtime reclaim wrappers.

**Verify**:
`bun test tests/migration-script.test.ts tests/reclaim-runtime.test.ts tests/bootstrap-files.test.ts`
exits 0.

### Step 3: Run the focused static check

Run:

```bash
rg -n '\["repo-harness",\s*"run"|exec repo-harness run|command -v repo-harness >/dev/null' \
  scripts/lib/project-init-lib.sh \
  src/cli/repo-adoption/reclaim-runtime.ts \
  tests/migration-script.test.ts \
  tests/reclaim-runtime.test.ts \
  tests/bootstrap-files.test.ts
```

Expected result: `rg` exits 1 with no output.

## Test plan

- Add regression tests in the existing wrapper tests rather than creating a new
  test file for this small fix.
- Cover both generator paths because downstream repos can receive wrappers from
  either migration/adoption flow.
- Verification:
  `bun test tests/migration-script.test.ts tests/reclaim-runtime.test.ts tests/bootstrap-files.test.ts`
  exits 0.

## Done criteria

- [ ] No generated wrapper command array falls back to `repo-harness run`.
- [ ] New or updated tests fail before the fix and pass after it.
- [ ] Targeted tests pass.
- [ ] `bun test` passes.
- [ ] `bash scripts/check-task-workflow.sh --strict` passes.
- [ ] `plans/README.md` marks this plan DONE with the commit hash/date.

## STOP conditions

Stop and report if:

- The old fallback is intentionally required by a test or contract that the
  operator says must remain.
- Fixing this appears to require adding a `repo-harness` alias bin.
- The wrapper code has moved and the excerpts above no longer match.

## Maintenance notes

Reviewers should treat any future `repo-harness run` in generated executable
wrappers as suspicious. Domain docs, skill directory names, and prompt command
names may still legitimately contain `repo-harness`; this plan only concerns
runtime command execution.
