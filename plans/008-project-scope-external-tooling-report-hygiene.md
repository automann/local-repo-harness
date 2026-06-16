# Plan 008: Clean project-scope external tooling reports

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report; do not improvise. When done, update the status row for this plan in
> `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 06b655f..HEAD -- scripts/check-agent-tooling.sh assets/templates/helpers/check-agent-tooling.sh tests/check-agent-tooling.test.ts tests/create-project-dirs.runtime.test.ts tests/migration-script.test.ts docs/reference-configs/external-tooling.md assets/reference-configs/external-tooling.md docs/reference-configs/project-scoped-install-zh-CN.md assets/reference-configs/project-scoped-install-zh-CN.md`
>
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding. On a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: dx
- **Planned at**: commit `06b655f`, 2026-06-16

## Why this matters

The external tooling check correctly detected project-scoped Waza skills in the
real acceptance run, but its top-level Waza metadata still printed user-level
paths and user-level update commands such as `~/.codex/skills`,
`~/.agents/skills`, `npx -y skills update`, and `rsync ~/.agents/...`. That is
not an install leak, but it looks like one during strict project-level
acceptance. The report should make the effective project scope obvious and move
user-level staging details into an explicitly labeled reference section.

## Current state

Relevant files and roles:

- `scripts/check-agent-tooling.sh` - source helper script.
- `assets/templates/helpers/check-agent-tooling.sh` - packaged helper template
  copy; keep synchronized with the source helper.
- `tests/check-agent-tooling.test.ts` - already has a project-scoped Waza test
  that only asserts install command avoids `-g`.
- `tests/create-project-dirs.runtime.test.ts` and
  `tests/migration-script.test.ts` - pin generated policy fields such as
  `external_tooling.waza.codex_primary_path`.

Current Waza detection chooses project skills as the effective path:

```js
const effectiveSummary = projectSummary.status === "present"
  ? projectSummary
  : projectSummary.status === "partial" && status !== "present"
    ? projectSummary
    : userSummary;

const effectiveScope = effectiveSummary === projectSummary
  ? (effectiveStatus === "present" ? "project" : "project-partial")
  : "user";
```

But the top-level payload still returns user-scope fields:

```js
source_lock_file: fs.existsSync(skillLockPath) ? skillLockPath : null,
primary_host: "codex",
codex_primary_path: path.join(HOME, ".codex", "skills"),
staging_cache_path: WAZA_STAGING_DIR,
stage_command: "npx -y skills update",
sync_command: syncCommand,
verify_command: `for d in ... diff -qr ~/.agents/skills/$d ~/.codex/skills/$d ...`,
```

Real acceptance evidence from
`/tmp/local-repo-harness-acceptance-20260616-190400/root-agent-tooling.json`:

```json
{
  "tools": {
    "waza": {
      "status": "present",
      "source_lock_file": "/Users/syfq/.agents/.skill-lock.json",
      "codex_primary_path": "/Users/syfq/.codex/skills",
      "staging_cache_path": "/Users/syfq/.agents/skills",
      "install_command": "local-repo-harness adopt --repo . --skill-scope project --external-tool-scope project",
      "stage_command": "npx -y skills update",
      "sync_command": "for d in think hunt check health; do rsync -a --delete ~/.agents/skills/$d/ ~/.codex/skills/$d/; done",
      "hosts": {
        "codex": {
          "path": "/Users/syfq/dev/harness/swarm-discussion-codex/.agents/skills",
          "scope": "project",
          "status": "present"
        }
      }
    }
  }
}
```

Repo conventions to follow:

- Existing JSON consumers may depend on top-level keys. Prefer additive fields
  and deprecating misleading fields before removing them.
- The text report should optimize for operator interpretation: effective
  project paths first, user-level staging paths only when relevant.
- CodeGraph report semantics are already project-local in the real acceptance
  evidence. Do not redesign CodeGraph in this plan.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Tooling report tests | `bun test tests/check-agent-tooling.test.ts --timeout 60000 --max-concurrency 4` | all tests pass |
| Policy generation tests | `bun test tests/create-project-dirs.runtime.test.ts tests/migration-script.test.ts --timeout 60000 --max-concurrency 4` | all selected tests pass |
| Template parity check | `cmp scripts/check-agent-tooling.sh assets/templates/helpers/check-agent-tooling.sh` | exits 0 |
| Release gate | `bun run check:release` | exits 0 |

## Scope

**In scope**:

- `scripts/check-agent-tooling.sh`
- `assets/templates/helpers/check-agent-tooling.sh`
- `tests/check-agent-tooling.test.ts`
- `tests/create-project-dirs.runtime.test.ts`
- `tests/migration-script.test.ts`
- `docs/reference-configs/external-tooling.md`
- `assets/reference-configs/external-tooling.md`
- `docs/reference-configs/project-scoped-install-zh-CN.md`
- `assets/reference-configs/project-scoped-install-zh-CN.md`

**Out of scope**:

- Do not change Waza installation behavior in this plan.
- Do not change CodeGraph readiness behavior.
- Do not remove user-level update support for user-scope installs.
- Do not hide user-scope data inside `scope_summary`; just label it as ambient
  or reference data when project scope is effective.

## Git workflow

- Branch: `codex/project-tooling-report-hygiene`
- Commit message style: conventional commits, for example
  `fix: clarify project-scoped tooling reports`
- Do not push unless the operator asks.

## Steps

### Step 1: Add an explicit effective-scope summary

In `detectWaza()`, compute an aggregate effective scope:

- `project` when every selected host reports `scope === "project"`.
- `project-partial` when any selected host reports `project-partial`.
- `mixed` when selected hosts differ between project and user.
- `user` when no selected host uses project scope.

Add fields like:

```json
{
  "effective_scope": "project",
  "effective_paths": {
    "codex": ".agents/skills",
    "claude": ".claude/skills"
  },
  "project_refresh_command": "local-repo-harness adopt --repo . --skill-scope project --external-tool-scope project",
  "user_reference_paths": {
    "codex": "~/.codex/skills",
    "claude": "~/.claude/skills",
    "staging": "~/.agents/skills"
  }
}
```

Use absolute paths in JSON if the current report style requires absolute paths,
but the field names must make effective vs user reference scope clear.

**Verify**:
`bun test tests/check-agent-tooling.test.ts --timeout 60000 --max-concurrency 4`
-> fails only because assertions have not yet been updated, not because the
script exits non-zero.

### Step 2: Make commands scope-aware

When `effective_scope` starts with `project`:

- `install_command` remains
  `local-repo-harness adopt --repo . --skill-scope project --external-tool-scope project`.
- `stage_command` should be `null`, `"not-applicable-project-scope"`, or the
  same project refresh command. Pick one representation and test it.
- `sync_command` should not contain `~/.agents`, `~/.codex`, or `rsync` between
  user paths.
- `verify_command` should point to the project check, for example
  `bash scripts/check-agent-tooling.sh --json --host both`.
- User-scope `npx -y skills update`, `rsync ~/.agents`, and `diff -qr ~/.agents`
  commands should move under `user_scope_commands` or equivalent.

**Verify**:
`bun test tests/check-agent-tooling.test.ts --timeout 60000 --max-concurrency 4`
-> pass after updating assertions.

### Step 3: Update text output

In `printText(result)`, when Waza effective scope is project:

- Print `Primary: project (...)` or `Effective scope: project`.
- Print per-host project paths.
- Do not print `Source lock`, `Staging`, `Stage`, `Sync Codex`, or user-path
  verify commands as if they are required.
- Optionally print a single line:
  `User staging reference: not used for project-scope readiness`.

**Verify**:
Add a test that runs the script without `--json` in a project-scoped fake repo
and asserts:

- output contains `Effective scope: project`;
- output contains the project skill path;
- output does not contain `~/.agents/skills`;
- output does not contain `rsync -a --delete ~/.agents`.

### Step 4: Update generated policy wording

Generated policy currently includes user-centric Waza fields such as
`external_tooling.waza.codex_primary_path = "~/.codex/skills"` and
`staging_cache_path = "~/.agents/skills"`. Keep compatibility if needed, but add
project-aware fields so policy readers do not interpret those as required
project install targets. For example:

```json
{
  "waza": {
    "effective_scope": "policy-controlled",
    "project_paths": {
      "codex": ".agents/skills",
      "claude": ".claude/skills"
    },
    "user_reference_paths": {
      "codex": "~/.codex/skills",
      "staging": "~/.agents/skills"
    }
  }
}
```

Update tests that pin generated policy fields.

**Verify**:
`bun test tests/create-project-dirs.runtime.test.ts tests/migration-script.test.ts --timeout 60000 --max-concurrency 4`
-> pass.

### Step 5: Synchronize template and docs

Copy or otherwise synchronize the helper source and asset template so:

```bash
cmp scripts/check-agent-tooling.sh assets/templates/helpers/check-agent-tooling.sh
```

exits 0.

Update external-tooling docs and the Chinese project-scoped guide to say:

- Project-scope readiness is determined by project host paths.
- User staging/cache paths may still appear as reference metadata in user-scope
  sections, but they are not project-scope write targets.

**Verify**:
`diff -u docs/reference-configs/external-tooling.md assets/reference-configs/external-tooling.md`
-> exits 0.

### Step 6: Run focused gates

Run:

```bash
bun test tests/check-agent-tooling.test.ts tests/create-project-dirs.runtime.test.ts tests/migration-script.test.ts --timeout 60000 --max-concurrency 4
cmp scripts/check-agent-tooling.sh assets/templates/helpers/check-agent-tooling.sh
bun run check:release
```

Expected result: all commands exit 0.

## Test plan

- Extend the existing project-scoped Waza test to assert top-level effective
  scope and project-safe commands.
- Add a text-output assertion for project scope.
- Keep existing user-scope tests that verify Waza staging/update behavior.
- Update generated policy tests to assert project path fields exist.

## Done criteria

- [ ] Project-scoped Waza report identifies effective project scope at top level.
- [ ] Top-level Waza project-scope commands do not direct users to write
  `~/.agents` or `~/.codex`.
- [ ] User-scope update commands remain available in an explicitly labeled
  user-scope/reference section.
- [ ] Helper source and packaged template are synchronized.
- [ ] Focused tests and `bun run check:release` exit 0.
- [ ] `plans/README.md` status row updated.

## STOP conditions

Stop and report back if:

- A downstream JSON consumer requires the misleading top-level user fields and
  cannot tolerate additive replacement fields.
- Fixing Waza report hygiene requires changing how Waza is installed.
- CodeGraph readiness changes become necessary.
- A verification command fails twice after a reasonable fix attempt.

## Maintenance notes

This is a report semantics change, not an installer change. Reviewers should
verify that user-scope installs still have enough update guidance while
project-scope acceptance no longer looks like it leaked into user paths.
