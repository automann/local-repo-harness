# Plan 009: Make security scan and doctor scope-aware

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report; do not improvise. When done, update the status row for this plan in
> `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 06b655f..HEAD -- src/cli/commands/security.ts src/cli/commands/doctor.ts src/cli/index.ts tests/cli/security.test.ts tests/cli/doctor.test.ts tests/cli/init-hook.test.ts docs/reference-configs/project-scoped-install-zh-CN.md assets/reference-configs/project-scoped-install-zh-CN.md`
>
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding. On a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: plans/006-canonicalize-project-helper-entrypoints.md
- **Category**: dx
- **Planned at**: commit `06b655f`, 2026-06-16

## Why this matters

Project-scoped acceptance needs to answer a narrow question: did this install
write unsafe or unexpected project hooks/tasks? The current `security scan`
always scans user-level Claude/Codex configs too, so pre-existing user tools
such as Vibe Island or GitNexus produce high/warn findings even when the
project install itself is clean. Those findings are useful ambient security
information, but they should not make a project-level install look like it
failed or leaked into user scope.

## Current state

Relevant files and roles:

- `src/cli/commands/security.ts` implements read-only security scanning.
- `src/cli/commands/doctor.ts` calls `runSecurityScan()` and reports a single
  `security-config` check.
- `src/cli/index.ts` wires `local-repo-harness security scan`.
- `tests/cli/security.test.ts` covers managed hooks, unmanaged user hooks,
  project hooks, VS Code folder-open tasks, invalid JSON, and `--strict`.
- `tests/cli/doctor.test.ts` covers `security-config` and invalid JSON
  propagation.

Current security scan always includes both user and project files:

```ts
const scannedFiles: SecurityScannedFile[] = [
  { filePath: path.join(home, '.claude', 'settings.json'), kind: 'claude-hooks', exists: false },
  { filePath: path.join(home, '.codex', 'hooks.json'), kind: 'codex-hooks', exists: false },
  { filePath: path.join(repoRoot, '.vscode', 'tasks.json'), kind: 'vscode-tasks', exists: false },
  { filePath: path.join(repoRoot, '.claude', 'settings.json'), kind: 'claude-hooks', exists: false },
  { filePath: path.join(repoRoot, '.codex', 'hooks.json'), kind: 'codex-hooks', exists: false },
].map((entry) => ({ ...entry, exists: fs.existsSync(entry.filePath) }));
```

Current doctor flattens all findings into the project readiness result:

```ts
function checkSecurityConfig(report: SecurityScanReport): DoctorCheckResult {
  if (report.status === 'ok') {
    return { status: 'ok', detail: `scanned ${report.scannedFiles.length} files; no findings` };
  }
  const first = report.findings[0];
  return {
    status: report.status === 'fail' ? 'fail' : 'warn',
    detail: `${report.findings.length} finding(s): ...; first=${first.ruleId} at ${first.filePath}`,
  };
}
```

Real acceptance evidence from
`/tmp/local-repo-harness-acceptance-20260616-190400/security.json`:

```json
{
  "status": "warn",
  "findings": [
    {
      "filePath": "/Users/syfq/.claude/settings.json",
      "host": "claude",
      "scope": "user",
      "ruleId": "inline-shell-exec",
      "severity": "high"
    },
    {
      "filePath": "/Users/syfq/.codex/hooks.json",
      "host": "codex",
      "scope": "user",
      "ruleId": "unmanaged-hook-command",
      "severity": "warn"
    }
  ],
  "scannedFiles": [
    { "filePath": "/Users/syfq/dev/harness/swarm-discussion-codex/.claude/settings.json", "exists": true },
    { "filePath": "/Users/syfq/dev/harness/swarm-discussion-codex/.codex/hooks.json", "exists": true }
  ]
}
```

There were no project-level findings in that run. The warnings came from
pre-existing user-level files.

Repo conventions to follow:

- `security scan` must remain read-only.
- Default behavior may remain broad for general security review, but the CLI
  needs an explicit project-scope mode for project-scoped acceptance.
- `doctor` should evaluate project security separately when policy intent is
  project-scoped.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Security tests | `bun test tests/cli/security.test.ts --timeout 60000 --max-concurrency 4` | all tests pass |
| Doctor tests | `bun test tests/cli/doctor.test.ts tests/cli/init-hook.test.ts --timeout 60000 --max-concurrency 4` | all selected tests pass |
| CLI smoke | `bun src/cli/index.ts security scan --scope project --json` | exits 0 and emits JSON |
| Release gate | `bun run check:release` | exits 0 |

## Scope

**In scope**:

- `src/cli/commands/security.ts`
- `src/cli/commands/doctor.ts`
- `src/cli/index.ts`
- `tests/cli/security.test.ts`
- `tests/cli/doctor.test.ts`
- `tests/cli/init-hook.test.ts`
- `docs/reference-configs/project-scoped-install-zh-CN.md`
- `assets/reference-configs/project-scoped-install-zh-CN.md`

**Out of scope**:

- Do not whitelist or suppress suspicious user-level hooks globally.
- Do not mutate user-level configs.
- Do not downgrade invalid project JSON from fail to warn.
- Do not remove the existing all-scope security review mode.

## Git workflow

- Branch: `codex/scope-aware-security-diagnostics`
- Commit message style: conventional commits, for example
  `fix: separate project security diagnostics`
- Do not push unless the operator asks.

## Steps

### Step 1: Add a scan scope option to the security command

Extend types:

```ts
export type SecurityScanScope = 'all' | 'project' | 'user';

export interface SecurityScanOptions {
  cwd?: string;
  home?: string;
  scope?: SecurityScanScope;
}

export interface SecurityScanReport {
  status: SecurityStatus;
  scope: SecurityScanScope;
  findings: SecurityFinding[];
  scannedFiles: SecurityScannedFile[];
  summary: {
    project: { findings: number; high: number; warn: number; fail: number };
    user: { findings: number; high: number; warn: number; fail: number };
  };
}
```

`runSecurityScan({ scope: 'project' })` should scan:

- repo `.vscode/tasks.json`
- repo `.claude/settings.json`
- repo `.codex/hooks.json`

`runSecurityScan({ scope: 'user' })` should scan:

- home `.claude/settings.json`
- home `.codex/hooks.json`

`runSecurityScan({ scope: 'all' })` keeps current behavior.

**Verify**:
`bun test tests/cli/security.test.ts --timeout 60000 --max-concurrency 4`
-> pass after updating assertions.

### Step 2: Wire the CLI flag

In `src/cli/index.ts`, add:

```ts
.option('--scope <scope>', 'Scan scope: all|project|user', 'all')
```

Validate the value before calling `runSecurityScan`. Invalid values should exit
1 with a clear error.

Update `--strict` semantics:

- `--scope project --strict` exits non-zero only on high/fail project findings.
- `--scope user --strict` exits non-zero only on high/fail user findings.
- `--scope all --strict` preserves current all-findings behavior.

**Verify**:
Add or update CLI tests:

```bash
bun src/cli/index.ts security scan --scope project --json
bun src/cli/index.ts security scan --scope user --json
bun src/cli/index.ts security scan --scope bogus --json
```

Expected: first two parse as JSON and exit 0 unless strict findings apply;
bogus exits 1 and prints `invalid --scope`.

### Step 3: Make doctor evaluate project security for project intent

In `runDoctor(cwd)`, compute status first as it already does, then choose the
security scope:

- If repo is opted in and `statusReport.scopes.intent.hooks === 'project'`, call
  `runSecurityScan({ cwd, scope: 'project' })` for the `security-config` check.
- Otherwise keep `runSecurityScan({ cwd, scope: 'all' })`.

Update `checkSecurityConfig` detail to include the scan scope:

```text
scope=project; scanned 3 files; no findings
```

Do not turn ambient user findings into a project failure. If a future reviewer
wants ambient user security in doctor, add a separate opt-in check, not this
project readiness check.

**Verify**:
Add a doctor test where:

- home has a suspicious user-level hook;
- repo has clean project Codex/Claude hook configs;
- repo policy has `host_adapters.scope = "project"`;
- `runDoctor(repoRoot).checks.find(id === "security-config").status === "ok"`;
- detail contains `scope=project`.

Also keep the existing invalid JSON test, but make sure project invalid JSON
still yields `fail` when project scope is active.

### Step 4: Update project-scoped installation docs

In both Chinese guide copies, change the acceptance command:

```bash
./.ai/harness/bin/local-repo-harness security scan --json
```

to:

```bash
./.ai/harness/bin/local-repo-harness security scan --scope project --json
```

Add one sentence: user-level findings are ambient host risk and can be checked
separately with `--scope user` or the default all-scope scan; they do not by
themselves prove project-scope install leakage.

**Verify**:
`diff -u docs/reference-configs/project-scoped-install-zh-CN.md assets/reference-configs/project-scoped-install-zh-CN.md`
-> exits 0.

### Step 5: Run focused gates

Run:

```bash
bun test tests/cli/security.test.ts tests/cli/doctor.test.ts tests/cli/init-hook.test.ts --timeout 60000 --max-concurrency 4
bun src/cli/index.ts security scan --scope project --json
bun run check:release
```

Expected result: all commands exit 0.

## Test plan

- Unit test `runSecurityScan({ scope: "project" })` ignores user-level findings
  and reports project scanned files only.
- Unit test `runSecurityScan({ scope: "all" })` preserves current behavior.
- CLI test validates `--scope` and `--strict`.
- Doctor test proves project intent uses project security scope.
- Doctor invalid JSON test proves project config parse failures still fail.

## Done criteria

- [ ] `local-repo-harness security scan --scope project --json` exists.
- [ ] Project-scope scan ignores ambient user-level findings.
- [ ] All-scope scan still reports user-level findings.
- [ ] Doctor `security-config` uses project-scope scan for project-intent repos.
- [ ] Project-scoped guide uses `security scan --scope project`.
- [ ] Focused tests and `bun run check:release` exit 0.
- [ ] `plans/README.md` status row updated.

## STOP conditions

Stop and report back if:

- `doctor` cannot determine project hook intent without mutating state.
- Adding `--scope` would break existing CLI consumers with no compatibility
  path.
- Project invalid JSON stops failing.
- A verification command fails twice after a reasonable fix attempt.

## Maintenance notes

This plan does not say user-level findings are unimportant. It says they are a
different question from project-scoped install acceptance. Keep the default
all-scope scan available for broader local security review.
