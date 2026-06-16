# Plan 007: Clarify helper runtime policy semantics

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report; do not improvise. When done, update the status row for this plan in
> `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 06b655f..HEAD -- scripts/create-project-dirs.sh assets/templates/helpers/ensure-task-workflow.sh scripts/check-task-workflow.sh assets/templates/helpers/check-task-workflow.sh src/cli/repo-adoption/reclaim-runtime.ts tests/create-project-dirs.runtime.test.ts tests/migration-script.test.ts tests/reclaim-runtime.test.ts docs/reference-configs/project-scoped-install-zh-CN.md assets/reference-configs/project-scoped-install-zh-CN.md`
>
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding. On a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: plans/006-canonicalize-project-helper-entrypoints.md
- **Category**: tech-debt
- **Planned at**: commit `06b655f`, 2026-06-16

## Why this matters

The runtime behavior is mostly correct: compact package-mode installs keep root
wrappers under `scripts/` and do not require helper files under
`.ai/harness/scripts/`. The policy remains misleading because it still records
`harness.helper_runtime_dir = ".ai/harness/scripts"` next to
`harness.helper_source = "package"`. Agents can read that literally and conclude
that missing `.ai/harness/scripts/check-*.sh` files are an install failure. The
policy needs explicit fields that distinguish "package dispatch" from "repo
runtime copy" while preserving backward compatibility.

## Current state

Relevant files and roles:

- `scripts/create-project-dirs.sh` and
  `assets/templates/helpers/ensure-task-workflow.sh` generate
  `.ai/harness/policy.json`.
- `scripts/check-task-workflow.sh` and
  `assets/templates/helpers/check-task-workflow.sh` read policy fields and
  already exempt `.ai/harness/scripts` when `helper_source=package`.
- `src/cli/repo-adoption/reclaim-runtime.ts` removes known-generated
  `.ai/harness/scripts/*` helper copies after wrapper replacement.
- `tests/create-project-dirs.runtime.test.ts` currently pins the ambiguous
  policy fields.
- `tests/migration-script.test.ts` also pins helper policy fields.

Current test expectations in `tests/create-project-dirs.runtime.test.ts`:

```ts
expect(policy.harness.helper_source).toBe("package");
expect(policy.harness.helper_runtime_dir).toBe(".ai/harness/scripts");
expect(policy.harness.helper_compat_dir).toBe("scripts");
```

Current workflow check logic in `scripts/check-task-workflow.sh`:

```bash
if [[ "$path" == ".ai/harness/scripts" && "${helper_source:-package}" == "package" && -d "scripts" ]]; then
  return
fi

check_required_dir "$helper_compat_dir"
if [[ "${helper_source:-package}" != "package" ]]; then
  check_required_dir "$helper_runtime_dir"
fi
```

Current reclaim result records only the high-level pin:

```ts
policy_pins: {
  hook_source: hookSourceRepo ? 'repo' : 'central',
  helper_source: helperSourceRepo ? 'repo' : 'package',
}
```

Repo conventions to follow:

- Additive policy fields are safer than removing existing fields because old
  downstream repos may already rely on `helper_runtime_dir` and
  `helper_compat_dir`.
- The generated policy should be easy for an agent to interpret without reading
  shell implementation details.
- Tests should assert both backward-compatible fields and the new explicit
  dispatch semantics.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Policy generation tests | `bun test tests/create-project-dirs.runtime.test.ts tests/migration-script.test.ts --timeout 60000 --max-concurrency 4` | all selected tests pass |
| Runtime reclaim tests | `bun test tests/reclaim-runtime.test.ts tests/cli/run.test.ts --timeout 60000 --max-concurrency 4` | all selected tests pass |
| Workflow helper gate | `bash scripts/check-task-workflow.sh --strict` | exits 0 |
| Release gate | `bun run check:release` | exits 0 |

## Scope

**In scope**:

- `scripts/create-project-dirs.sh`
- `assets/templates/helpers/ensure-task-workflow.sh`
- `scripts/check-task-workflow.sh`
- `assets/templates/helpers/check-task-workflow.sh`
- `src/cli/repo-adoption/reclaim-runtime.ts`
- `tests/create-project-dirs.runtime.test.ts`
- `tests/migration-script.test.ts`
- `tests/reclaim-runtime.test.ts`
- `tests/cli/run.test.ts`
- `docs/reference-configs/project-scoped-install-zh-CN.md`
- `assets/reference-configs/project-scoped-install-zh-CN.md`

**Out of scope**:

- Do not remove `helper_runtime_dir` or `helper_compat_dir` in this plan.
- Do not change `helper_source=repo` resolution order.
- Do not change hook runtime semantics or project-vendored Bun bootstrap.
- Do not make `.ai/harness/scripts/*` required in package mode.

## Git workflow

- Branch: `codex/helper-runtime-policy-semantics`
- Commit message style: conventional commits, for example
  `fix: clarify helper runtime policy semantics`
- Do not push unless the operator asks.

## Steps

### Step 1: Add explicit dispatch metadata to generated policy

In both policy generators, add a nested field under `harness` similar to:

```json
{
  "helper_source": "package",
  "helper_runtime_dir": ".ai/harness/scripts",
  "helper_compat_dir": "scripts",
  "helper_dispatch": {
    "strategy": "package-runner",
    "command_template": "local-repo-harness run <helper>",
    "project_cli": ".ai/harness/bin/local-repo-harness",
    "wrapper_dir": "scripts",
    "repo_runtime_dir": ".ai/harness/scripts",
    "repo_runtime_required": false
  }
}
```

For `helper_source=repo`, the same field should become:

```json
{
  "helper_dispatch": {
    "strategy": "repo-runtime",
    "command_template": "bash .ai/harness/scripts/<helper>.sh",
    "wrapper_dir": "scripts",
    "repo_runtime_dir": ".ai/harness/scripts",
    "repo_runtime_required": true
  }
}
```

If implementation finds a better field name, keep the invariant: package mode
must include a machine-readable boolean that says `.ai/harness/scripts` is not
required.

**Verify**:
`bun test tests/create-project-dirs.runtime.test.ts --timeout 60000 --max-concurrency 4`
-> pass, with updated assertions for `helper_dispatch`.

### Step 2: Teach workflow checks to use the explicit field

Update `scripts/check-task-workflow.sh` and the packaged template copy so they:

- Prefer `harness.helper_dispatch.repo_runtime_required` when present.
- Fall back to the old `helper_source != package` rule for older repos.
- Report a clearer issue when policy says repo runtime is required but
  `.ai/harness/scripts` is missing.

Expected diagnostic wording for package mode should mention root wrappers:

```text
[workflow] helper runtime files are package-dispatched; expected wrappers under scripts/
```

Do not make this an issue line unless something is actually missing.

**Verify**:
`bash scripts/check-task-workflow.sh --strict`
-> exits 0.

### Step 3: Include dispatch semantics in reclaim diagnostics

Update `src/cli/repo-adoption/reclaim-runtime.ts` result payload so a compact
reclaim plan records:

- `helper_source: "package"`
- `helper_dispatch.strategy: "package-runner"`
- `helper_dispatch.wrapper_dir: "scripts"`
- `helper_dispatch.repo_runtime_required: false`

This helps future acceptance threads explain why `.ai/harness/scripts/check-*.sh`
is absent after reclaim.

**Verify**:
`bun test tests/reclaim-runtime.test.ts --timeout 60000 --max-concurrency 4`
-> pass, including an assertion for the new result payload.

### Step 4: Update docs to describe the policy fields

In the Chinese project-scoped guide and its asset copy, add a compact section
near the troubleshooting/acceptance area:

- `helper_source=package` means package assets are dispatched through the
  project CLI.
- `helper_dispatch.repo_runtime_required=false` means missing helper files under
  `.ai/harness/scripts/` are not a failure.
- `scripts/*.sh` wrappers are the stable human command surface.
- `helper_source=repo` is the mode where `.ai/harness/scripts/*` is expected.

**Verify**:
`diff -u docs/reference-configs/project-scoped-install-zh-CN.md assets/reference-configs/project-scoped-install-zh-CN.md`
-> exits 0.

### Step 5: Run focused gates

Run:

```bash
bun test tests/create-project-dirs.runtime.test.ts tests/migration-script.test.ts tests/reclaim-runtime.test.ts tests/cli/run.test.ts --timeout 60000 --max-concurrency 4
bash scripts/check-task-workflow.sh --strict
bun run check:release
```

Expected result: all commands exit 0.

## Test plan

- Policy generation test for package mode includes `helper_dispatch` with
  `repo_runtime_required=false`.
- Policy generation or resolver test for repo mode includes
  `repo_runtime_required=true`.
- Workflow check test proves package mode passes with only `scripts/*.sh` and
  `.ai/harness/scripts/.gitkeep`.
- Reclaim test proves the diagnostic payload explains package dispatch.

## Done criteria

- [ ] Generated policy is self-describing for package vs repo helper runtime.
- [ ] Package-mode checks pass without helper files under `.ai/harness/scripts`.
- [ ] Repo-mode checks still require repo helper runtime files.
- [ ] Docs explain how agents should interpret `helper_dispatch`.
- [ ] Focused tests and `bun run check:release` exit 0.
- [ ] `plans/README.md` status row updated.

## STOP conditions

Stop and report back if:

- Existing downstream compatibility requires deleting or renaming
  `helper_runtime_dir`.
- The new policy fields cannot be generated in both source and packaged template
  copies.
- Workflow checks start passing when both root wrappers and repo runtime are
  missing.
- A verification command fails twice after a reasonable fix attempt.

## Maintenance notes

Keep this policy schema additive until a later major cleanup. Reviewers should
check that the schema helps agents reason about the install state without
creating a second source of truth that can drift from actual resolver behavior.
