# Plan 010: Make doctor readiness fully project-scope aware

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report; do not improvise. When done, update the status row for this plan in
> `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 5c060a2..HEAD -- src/cli/commands/doctor.ts tests/cli/doctor.test.ts tests/cli/init-hook.test.ts docs/reference-configs/project-scoped-install-zh-CN.md assets/reference-configs/project-scoped-install-zh-CN.md`
>
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding. On a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: MED
- **Depends on**: plans/009-scope-aware-security-scan-and-doctor.md
- **Category**: dx
- **Planned at**: commit `5c060a2`, 2026-06-16

## Why this matters

`local-repo-harness@0.5.6` fixed the project-scope security scan, but a real
project-scoped install still reports `doctor --json` as `warn=3` because the
doctor command unconditionally checks global PATH and user-level host adapters.
That leaves project-only users with a false PARTIAL result and remediation text
telling them to run `--location global`, which directly conflicts with the
project-scoped install goal. Doctor should keep global information available
when it is relevant, but project-intent readiness must not require global CLI or
global adapters.

## Current state

Relevant files and roles:

- `src/cli/commands/doctor.ts` - owns the read-only doctor checks and summary.
- `tests/cli/doctor.test.ts` - covers built-in doctor checks, project-scope
  adapter behavior, security scope, and CodeGraph diagnostics.
- `tests/cli/init-hook.test.ts` - consumes doctor statuses as an init hook check
  source; keep compatibility with its expectations.
- `docs/reference-configs/project-scoped-install-zh-CN.md` and
  `assets/reference-configs/project-scoped-install-zh-CN.md` - user-facing
  project-scoped acceptance guide.

Real 0.5.6 acceptance evidence from
`/tmp/local-repo-harness-056-regression-20260616-221523/doctor.json`:

```json
{
  "summary": { "ok": 15, "warn": 3, "fail": 0, "na": 1 },
  "checks": [
    {
      "id": "cli-on-path",
      "status": "warn",
      "detail": "local-repo-harness not on PATH (host adapter shim exits 0 silently when CLI is missing)"
    },
    {
      "id": "codex-adapter",
      "status": "warn",
      "detail": "host detected but local-repo-harness not installed (run: local-repo-harness install --target codex --location global)"
    },
    {
      "id": "claude-adapter",
      "status": "warn",
      "detail": "host detected but local-repo-harness not installed (run: local-repo-harness install --target claude --location global)"
    },
    {
      "id": "security-config",
      "status": "ok",
      "detail": "scope=project; scanned 3 files; no findings"
    }
  ]
}
```

The project-specific checks in the same run were already green:

```json
{
  "project-codex-adapter": "8/8 managed entries at .codex/hooks.json",
  "project-claude-adapter": "8/8 managed entries at .claude/settings.json",
  "project-hook-runtime": "project-vendored-bun at .ai/harness/bin/local-repo-harness-hook",
  "mixed-scope-adapters": "project=2; user=0"
}
```

Current `src/cli/commands/doctor.ts` excerpts:

```ts
function checkPath(): DoctorCheckResult {
  const id = 'cli-on-path';
  const describe = 'local-repo-harness resolvable via PATH';
  const result = spawnSync('which', ['local-repo-harness'], { encoding: 'utf-8' });
  if (result.status === 0 && (result.stdout ?? '').trim()) {
    return { id, describe, status: 'ok', detail: (result.stdout as string).trim() };
  }
  return {
    id,
    describe,
    status: 'warn',
    detail: 'local-repo-harness not on PATH (host adapter shim exits 0 silently when CLI is missing)',
  };
}
```

```ts
function checkTargetInstall(target: (typeof ALL_TARGETS)[number]): DoctorCheckResult {
  const det = target.detect('global');
  const id = `${target.id}-adapter`;
  const describe = `${target.displayName} global adapter`;
  if (!det.installed) {
    return {
      id,
      describe,
      status: 'warn',
      detail: `${target.displayName} host not detected; install when host is set up`,
    };
  }
  if (!det.alreadyConfigured) {
    return {
      id,
      describe,
      status: 'warn',
      detail: `host detected but local-repo-harness not installed (run: local-repo-harness install --target ${target.id} --location global)`,
    };
  }
  return { id, describe, status: 'ok', detail: `installed at ${det.configPath}` };
}
```

```ts
export function runDoctor(cwd: string = process.cwd()): DoctorReport {
  const checks: DoctorCheckResult[] = [];
  const statusReport = runStatus(cwd);
  const codegraphProbe = probeCodegraph(cwd);
  const securityReport = runSecurityScan({ cwd, scope: securityScopeForStatus(statusReport) });
  checks.push(checkPath());
  checks.push(checkVersion());
  checks.push(checkCliUpdate());
  for (const target of ALL_TARGETS) {
    if (target.supportsLocation('global')) {
      checks.push(checkTargetInstall(target));
    }
  }
  // project-specific checks follow...
}
```

Repo conventions to follow:

- Keep doctor read-only. Do not install, initialize, update, or mutate host
  config.
- Preserve the existing check IDs unless there is a strong reason to add a new
  check. Downstream consumers already look for `cli-on-path`,
  `codex-adapter`, and `claude-adapter`.
- Use `StatusReport` as the source of truth for project intent. The existing
  helper `securityScopeForStatus(statusReport)` is the precedent for deriving
  behavior from `statusReport.repo.optIn` and
  `statusReport.scopes.intent.hooks`.
- Do not hide real mixed-scope risk. `checkMixedScopeAdapters()` must still warn
  when project-only intent coexists with configured user adapters.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Focused doctor tests | `bun test tests/cli/doctor.test.ts --timeout 60000 --max-concurrency 4` | all selected tests pass |
| Init hook integration tests | `bun test tests/cli/init-hook.test.ts --timeout 60000 --max-concurrency 4` | all selected tests pass |
| Project-scope guide parity | `diff -u docs/reference-configs/project-scoped-install-zh-CN.md assets/reference-configs/project-scoped-install-zh-CN.md` | exits 0 |
| Release gate | `bun run check:release` | exits 0 |

## Scope

**In scope**:

- `src/cli/commands/doctor.ts`
- `tests/cli/doctor.test.ts`
- `tests/cli/init-hook.test.ts` only if doctor status expectations require
  updating
- `docs/reference-configs/project-scoped-install-zh-CN.md`
- `assets/reference-configs/project-scoped-install-zh-CN.md`

**Out of scope**:

- Do not change installer behavior or install any global adapters.
- Do not remove `cli-on-path`, `codex-adapter`, or `claude-adapter` from doctor
  output entirely unless tests prove no existing consumer needs them.
- Do not suppress `mixed-scope-adapters` warnings.
- Do not downgrade project-level failures such as missing project adapters,
  missing project hook runtime, invalid project hook JSON, or broken CodeGraph
  project MCP.
- Do not change the default all-scope behavior of `security scan`.

## Git workflow

- Branch: `codex/project-scope-doctor-readiness`
- Commit message style: conventional commits, for example
  `fix: make doctor project-scope readiness clean`
- Do not push unless the operator asks.

## Steps

### Step 1: Add a single project-intent predicate

In `src/cli/commands/doctor.ts`, add a helper near
`securityScopeForStatus(statusReport)`:

```ts
function hasProjectHookIntent(statusReport: StatusReport): boolean {
  return statusReport.repo.inGitRepo && statusReport.repo.optIn && statusReport.scopes.intent.hooks === 'project';
}
```

Use this helper in both `securityScopeForStatus()` and the new doctor check
logic so the project-intent definition stays consistent.

**Verify**:
`bun test tests/cli/doctor.test.ts --timeout 60000 --max-concurrency 4`
-> may still fail until later steps update callers/tests, but TypeScript syntax
errors must not appear.

### Step 2: Make PATH readiness not required for project-intent repos

Change `checkPath()` to accept `statusReport: StatusReport`, or add a wrapper
that can inspect project intent before producing the `cli-on-path` check.

For project-intent repos:

- Return `status: 'na'` for `cli-on-path`.
- Detail must say the global PATH CLI is not required for project-scoped
  readiness.
- If useful, mention the expected project CLI path:
  `.ai/harness/bin/local-repo-harness`.
- Do not include global install remediation.

Suggested shape:

```ts
if (hasProjectHookIntent(statusReport)) {
  const projectCli = statusReport.repo.repoRoot
    ? path.join(statusReport.repo.repoRoot, '.ai/harness/bin/local-repo-harness')
    : '.ai/harness/bin/local-repo-harness';
  return {
    id,
    describe,
    status: 'na',
    detail: `project hook scope is intended; global PATH CLI is not required; project_cli=${projectCli}`,
  };
}
```

For non-project-intent repos, keep the current behavior.

**Verify**:
Add/update a test in `tests/cli/doctor.test.ts` where a project-intent repo has
project adapters but no `local-repo-harness` on `PATH`; assert
`cli-on-path.status === 'na'` and its detail does not contain
`npm install -g`, `--location global`, or `local-repo-harness init`.

### Step 3: Make global adapter checks reference-only for project-intent repos

Change `checkTargetInstall()` to accept `statusReport: StatusReport`.

For project-intent repos:

- Return `status: 'na'` for `codex-adapter` and `claude-adapter` when the global
  adapter is missing or merely not configured.
- Detail must say the global adapter is not required because project adapters
  own readiness.
- Detail must point to the project adapter check ID, for example
  `see project-codex-adapter`.
- Detail must not recommend `--location global`.

If a user adapter is actually configured while project-only intent is active,
do not make this check responsible for warning. Let `checkMixedScopeAdapters()`
continue to produce the warning with the concrete user config path.

Suggested shape:

```ts
if (hasProjectHookIntent(statusReport)) {
  return {
    id,
    describe,
    status: 'na',
    detail: `project hook scope is intended; global ${target.id} adapter is not required; see project-${target.id}-adapter`,
  };
}
```

For non-project-intent repos, keep the current global adapter behavior.

**Verify**:
Add/update a doctor test asserting a clean project-only repo has:

- `codex-adapter.status === 'na'`
- `claude-adapter.status === 'na'`
- neither detail contains `--location global`
- `project-codex-adapter.status === 'ok'`
- `project-claude-adapter.status === 'ok'`

### Step 4: Preserve warnings for actual mixed-scope contamination

Add a regression test in `tests/cli/doctor.test.ts` based on the existing
`project intent plus stale user adapter produces mixed-scope warning` test.

Assert all of the following in a project-intent repo that also has a stale user
adapter:

- `codex-adapter` and `claude-adapter` remain `na` or reference-only if the
  project intent makes global adapters not required.
- `mixed-scope-adapters.status === 'warn'`.
- `mixed-scope-adapters.detail` contains the user adapter path.

This prevents the fix from hiding real user/project overlap while removing
false global-readiness warnings.

**Verify**:
`bun test tests/cli/doctor.test.ts --timeout 60000 --max-concurrency 4`
-> all tests pass.

### Step 5: Assert project-intent doctor summary can be clean

Add a focused test that simulates the real acceptance posture:

- temp repo is opted in;
- policy has `host_adapters.scope = "project"`,
  `hook_runtime_mode = "project-vendored-bun"`,
  `skills.repo_harness_scope = "project"`,
  `external_tooling.scope = "none"` or a fake project-ready tooling state;
- project adapters are installed with `runInstall({ target: 'both', scope: 'project', cwd: repoRoot })`;
- project repo-harness skill files exist for both hosts;
- project hook runtime executable exists if the helper test fixture does not
  already create it;
- `PATH` intentionally does not expose `local-repo-harness`.

Assert:

- `cli-on-path`, `codex-adapter`, and `claude-adapter` do not contribute WARN.
- no check detail contains `local-repo-harness install --target codex --location global`
  or `local-repo-harness install --target claude --location global`.
- `summary.warn` does not include these three global/PATH checks. If unrelated
  CodeGraph checks remain hard to fake in this unit test, assert on the three
  check IDs directly instead of forcing total `summary.warn === 0`.

**Verify**:
`bun test tests/cli/doctor.test.ts tests/cli/init-hook.test.ts --timeout 60000 --max-concurrency 4`
-> all selected tests pass.

### Step 6: Update the project-scoped install guide

Update both:

- `docs/reference-configs/project-scoped-install-zh-CN.md`
- `assets/reference-configs/project-scoped-install-zh-CN.md`

Near the install acceptance section, clarify:

- In project-scoped installs, `doctor --json` evaluates project adapters,
  project hook runtime, project skills, project CodeGraph, and project security.
- Global PATH CLI and global host adapters are not required for project-scoped
  readiness.
- Actual mixed-scope contamination is still reported by
  `mixed-scope-adapters`.

Do not tell users to install global adapters as part of recipe C.

**Verify**:
`diff -u docs/reference-configs/project-scoped-install-zh-CN.md assets/reference-configs/project-scoped-install-zh-CN.md`
-> exits 0.

### Step 7: Run final focused and release gates

Run:

```bash
bun test tests/cli/doctor.test.ts tests/cli/init-hook.test.ts --timeout 60000 --max-concurrency 4
diff -u docs/reference-configs/project-scoped-install-zh-CN.md assets/reference-configs/project-scoped-install-zh-CN.md
bun run check:release
```

Expected result: all commands exit 0. `bun run check:release` should end with
the normal release gate success message and no test failures.

## Test plan

- Update `tests/cli/doctor.test.ts` so project-intent repos prove global PATH
  CLI and global adapters are not required.
- Keep existing tests proving non-project/global install workflows still receive
  global adapter warnings.
- Keep or extend the stale user adapter test so real mixed-scope overlap still
  produces a warning.
- If `tests/cli/init-hook.test.ts` consumes the exact `warn` count or exact
  `codex-adapter`/`claude-adapter` statuses, update it to match the new
  project-intent semantics.

## Done criteria

- [x] In a project-intent repo, `cli-on-path` no longer returns WARN merely
  because `local-repo-harness` is absent from global PATH.
- [x] In a project-intent repo, `codex-adapter` and `claude-adapter` no longer
  return WARN merely because user-level adapters are not configured.
- [x] Project-intent doctor output contains no remediation telling the user to
  run `--location global`.
- [x] `mixed-scope-adapters` still warns when user-level adapters are actually
  configured alongside project-only intent.
- [x] `security-config` remains project-scope aware from plan 009.
- [x] Focused doctor/init-hook tests pass.
- [x] `bun run check:release` exits 0.
- [x] `plans/README.md` status row updated.

## Completion evidence

- `bun test tests/cli/doctor.test.ts tests/cli/init-hook.test.ts tests/cli/bootstrap.test.ts tests/bootstrap-files.test.ts --timeout 60000 --max-concurrency 4`:
  44 pass, 0 fail.
- `diff -u docs/reference-configs/project-scoped-install-zh-CN.md assets/reference-configs/project-scoped-install-zh-CN.md`:
  exits 0.
- `bun run check:release`: 793 pass, 0 fail, `[release] OK: npm package gate passed.`
- Real tarball-backed recipe C install:
  `/tmp/local-repo-harness-057-real-20260616-225154/summary.json`.
  Project CLI version `0.5.7`; `doctor.summary={ok:14,warn:0,fail:0,na:5}`;
  `cli-on-path`, `codex-adapter`, and `claude-adapter` are `na`; project
  adapters, project runtime, project skills, project CodeGraph, and
  `security-config` are `ok`; user-level snapshot diff is empty.

## STOP conditions

Stop and report back if:

- A downstream test or CLI consumer requires `codex-adapter` or
  `claude-adapter` to warn even when `host_adapters.scope = "project"`.
- The fix requires mutating user-level configs or installing global adapters.
- The fix suppresses `mixed-scope-adapters` warnings.
- Project-level failures become `na` or `ok`.
- A verification command fails twice after a reasonable fix attempt.

## Maintenance notes

This plan separates project readiness from ambient host/global readiness. If a
future release wants both in one report, add a separate `ambient-*` or
`global-*` section that is explicitly excluded from project-scoped readiness
summary rather than reusing WARN statuses that make strict project-only
acceptance look broken.
