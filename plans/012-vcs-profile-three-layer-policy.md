# Plan 012: Narrow local-only VCS policy with profiles and tracked whitelist

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report; do not improvise. When done, update the status row for this plan in
> `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 60cc088..HEAD -- src/cli/vcs/local-only.ts src/cli/commands/bootstrap.ts src/cli/commands/init.ts src/cli/commands/status.ts src/cli/commands/doctor.ts src/cli/commands/vcs.ts src/cli/index.ts scripts/lib/project-init-lib.sh scripts/migrate-project-template.sh assets/workflow-contract.v1.json README.md QUICK_START.md tests/cli/vcs-local-only.test.ts tests/cli/bootstrap.test.ts tests/cli/init.test.ts tests/cli/doctor.test.ts tests/cli/status.test.ts tests/migration-script.test.ts tests/readme-dx.test.ts`
>
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding. On a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: HIGH
- **Depends on**: plans/011-local-only-vcs-isolation.md
- **Category**: bug | security | dx | migration
- **Planned at**: commit `60cc088`, 2026-06-17

## Why this matters

Plan 011 added a local-only VCS boundary so project-scoped installs do not
leak `local-repo-harness`, CodeGraph, skills, hooks, MCP config, and runtime
state into downstream Git history. The real `swarm-discussion-codex` acceptance
run proved that the cleanup command now works, but it also exposed that the
policy is too broad: `--vcs-scope local` maps install state, workflow state, and
product intent all to `local`, so cleanup staged hundreds of deletions,
including project governance and product-intent files.

For public or downstream projects, local-repo-harness must distinguish the
repo-harness governance layer from the user's product source. We cannot assume
every collaborator or downstream consumer uses the repo-harness workflow. The
new model must keep installed tooling local by default, keep repo-harness
workflow artifacts local unless explicitly whitelisted, and avoid treating
product intent as an install artifact. It must also honor the project root
`.gitignore` as a hard boundary: if the project author ignores a path there,
repo-harness must not force that path back into tracked state through a profile
or whitelist.

## Current state

Relevant files and roles:

- `src/cli/vcs/local-only.ts` - resolves VCS policy, computes local-only paths,
  writes `.git/info/exclude` and local overlay `.gitignore` files, audits
  tracked/unignored local-only paths, and performs `git rm --cached` cleanup.
- `src/cli/commands/bootstrap.ts` - installs the project-managed
  `local-repo-harness` runtime into `.ai/harness/tools/local-repo-harness`,
  syncs the local-only boundary, then delegates to `adopt`.
- `src/cli/commands/init.ts` - implements `adopt`, derives project-scoped
  intent, writes `REPO_HARNESS_*` environment variables for the shell migration,
  and syncs the local-only boundary after apply/dry-run.
- `src/cli/index.ts` - defines public CLI flags for `bootstrap`, `adopt`, and
  the `vcs` subcommand.
- `src/cli/commands/status.ts` - reports resolved VCS scopes and local-only
  audit counts.
- `src/cli/commands/doctor.ts` - turns the local-only audit into the
  `local-only-vcs-boundary` readiness check.
- `src/cli/commands/vcs.ts` - exposes `vcs audit` and `vcs cleanup`.
- `scripts/lib/project-init-lib.sh` and `scripts/migrate-project-template.sh`
  - write `.ai/harness/policy.json`, merge policy overrides, and render the
  migration summary.
- `README.md` and `QUICK_START.md` - public user guidance for project-scoped
  install and post-install acceptance.
- `tests/cli/vcs-local-only.test.ts`, `tests/cli/bootstrap.test.ts`,
  `tests/cli/init.test.ts`, `tests/cli/doctor.test.ts`,
  `tests/cli/status.test.ts`, `tests/migration-script.test.ts`, and
  `tests/readme-dx.test.ts` - focused regression surfaces.

Current `src/cli/vcs/local-only.ts` excerpts:

```ts
export type VcsScope = "local" | "tracked";
export type VcsArtifactGroup = "install-state" | "workflow-state" | "product-intent";
export type VcsMode = "minimal" | "standard" | "self-host";

export interface LocalVcsPolicyOptions {
  vcsScope?: VcsScope;
  installStateScope?: VcsScope;
  workflowStateScope?: VcsScope;
  productIntentScope?: VcsScope;
  mode?: VcsMode;
  projectScoped?: boolean;
}
```

```ts
function policyDefaults(opts: LocalVcsPolicyOptions): VcsScope {
  if (opts.mode === "self-host") return "tracked";
  if (opts.projectScoped === true) return "local";
  return "tracked";
}

export function resolveLocalVcsPolicy(repoRoot: string, opts: LocalVcsPolicyOptions = {}): LocalVcsPolicy {
  const data = policyFile(repoRoot);
  const raw = data?.vcs ?? {};
  const base = opts.vcsScope ?? scopeFrom(raw.scope) ?? policyDefaults(opts);
  return {
    installStateScope:
      opts.installStateScope ?? opts.vcsScope ?? scopeFrom(raw.install_state_scope) ?? scopeFrom(raw.installStateScope) ?? base,
    workflowStateScope:
      opts.workflowStateScope ?? opts.vcsScope ?? scopeFrom(raw.workflow_state_scope) ?? scopeFrom(raw.workflowStateScope) ?? base,
    productIntentScope:
      opts.productIntentScope ?? opts.vcsScope ?? scopeFrom(raw.product_intent_scope) ?? scopeFrom(raw.productIntentScope) ?? base,
    excludeStrategy: "git-info-exclude-plus-local-overlays",
    manifestPath: ...,
    source,
  };
}
```

This is the bug: one `base` scope fans out to all three groups. A project-scoped
install defaults `projectScoped=true`, so all three groups become `local`.

Current local-only groups:

```ts
const INSTALL_STATE_PATHS = [
  ".ai/harness/tools/local-repo-harness/",
  ".ai/harness/tools/codegraph/",
  ".ai/harness/bin/local-repo-harness",
  ".ai/harness/bin/local-repo-harness-hook",
  ".ai/harness/bin/codegraph",
  ".ai/harness/runtime/local-repo-harness/",
  ".ai/harness/codegraph-runtime/",
  ".ai/harness/local-only-manifest.json",
  ".agents/skills/repo-harness/",
  ".agents/skills/think/",
  ".agents/skills/hunt/",
  ".agents/skills/check/",
  ".agents/skills/health/",
  ".agents/skills/mermaid/",
  ".agents/skills/claude-review/",
  ".claude/skills/repo-harness/",
  ".claude/skills/codex-review/",
  ".codex/hooks.json",
  ".codex/config.toml",
  ".codex/.gitignore",
  ".claude/settings.json",
  ".claude/.gitignore",
  ".agents/.gitignore",
  ".ai/.gitignore",
  ".ai/harness/.gitignore",
  ".mcp.json",
  ".codegraph/",
  "_ops/",
];

const WORKFLOW_STATE_PATHS = [
  "plans/",
  "tasks/",
  ".ai/context/",
  ".ai/harness/",
  ".ai/hooks/",
  ".claude/.skill-version",
  ".claude/templates/",
  "docs/reference-configs/",
  "deploy/README.md",
  "deploy/env/.gitkeep",
  "deploy/scripts/.gitkeep",
  "deploy/submissions/.gitkeep",
  "deploy/runbooks/.gitkeep",
  "deploy/release-checklists/.gitkeep",
  "deploy/sql/.gitkeep",
  "CLAUDE.md",
  "AGENTS.md",
];

const PRODUCT_INTENT_PATHS = [
  "docs/spec.md",
  "docs/architecture/",
  "docs/researches/",
];
```

In the latest real downstream test, `.ai/harness/local-only-manifest.json`
contained 28 install-state entries, 59 workflow-state entries, and 3
product-intent entries. Running `vcs cleanup --apply` removed 727 paths from
the Git index, including `docs/spec.md`, `tasks/*`, `docs/researches/*`, root
`scripts/*`, `AGENTS.md`, and `CLAUDE.md`. That proves cleanup works, but the
policy boundary is too wide.

Current `src/cli/commands/init.ts` excerpt:

```ts
const vcsScope = opts.vcsScope ?? (mode === "self-host" ? "tracked" : projectScoped ? "local" : "tracked");
commandEnv = {
  ...,
  REPO_HARNESS_VCS_SCOPE: vcsScope,
  REPO_HARNESS_INSTALL_STATE_VCS_SCOPE: vcsScope,
  REPO_HARNESS_WORKFLOW_STATE_VCS_SCOPE: vcsScope,
  REPO_HARNESS_PRODUCT_INTENT_VCS_SCOPE: vcsScope,
};
```

Current `scripts/lib/project-init-lib.sh` excerpt:

```sh
REPO_HARNESS_VCS_SCOPE="${REPO_HARNESS_VCS_SCOPE:-tracked}" \
REPO_HARNESS_INSTALL_STATE_VCS_SCOPE="${REPO_HARNESS_INSTALL_STATE_VCS_SCOPE:-${REPO_HARNESS_VCS_SCOPE:-tracked}}" \
REPO_HARNESS_WORKFLOW_STATE_VCS_SCOPE="${REPO_HARNESS_WORKFLOW_STATE_VCS_SCOPE:-${REPO_HARNESS_VCS_SCOPE:-tracked}}" \
REPO_HARNESS_PRODUCT_INTENT_VCS_SCOPE="${REPO_HARNESS_PRODUCT_INTENT_VCS_SCOPE:-${REPO_HARNESS_VCS_SCOPE:-tracked}}" \
rh_run_js_source "$policy_file" <<'JS_EOF'
...
policy.vcs.scope = process.env.REPO_HARNESS_VCS_SCOPE;
policy.vcs.install_state_scope = process.env.REPO_HARNESS_INSTALL_STATE_VCS_SCOPE;
policy.vcs.workflow_state_scope = process.env.REPO_HARNESS_WORKFLOW_STATE_VCS_SCOPE;
policy.vcs.product_intent_scope = process.env.REPO_HARNESS_PRODUCT_INTENT_VCS_SCOPE;
policy.vcs.exclude_strategy = "git-info-exclude-plus-local-overlays";
policy.vcs.local_only_manifest = ".ai/harness/local-only-manifest.json";
```

Current `src/cli/commands/doctor.ts` excerpt:

```ts
const audit = auditLocalOnlyVcs(statusReport.repo.repoRoot);
if (audit.safeToCommit) {
  return {
    id,
    describe,
    status: 'ok',
    detail: `local-only entries=${audit.localOnly.length}; manifest=${audit.policy.manifestPath}`,
  };
}
```

The doctor check does not distinguish install-state failures from
workflow/product review advisories, so broad policy errors become a single
`fail`.

Repo conventions to follow:

- Keep `doctor`, `status`, `vcs audit`, and `security scan` read-only.
- `vcs cleanup --apply` must never delete working tree files. It may only use
  `git rm --cached` on safe paths.
- Keep project-scoped installs local-first. Do not add any user-level fallback
  writes under `~/.codex`, `~/.claude`, `~/.agents`, `~/.codegraph`, or
  `~/.repo-harness`.
- Match current TypeScript style: named exported functions, small pure helpers,
  `spawnSync` for Git calls, no external dependency for simple JSON parsing.
- Match current tests: create temp repos with `mkdtempSync`, `git init -q`,
  `spawnSync`/`execFileSync`, and cleanup with `rmSync(..., { recursive: true,
  force: true })`.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Focused VCS tests | `bun test tests/cli/vcs-local-only.test.ts --timeout 60000 --max-concurrency 4` | all selected tests pass |
| Focused bootstrap/adopt tests | `bun test tests/cli/bootstrap.test.ts tests/cli/init.test.ts --timeout 60000 --max-concurrency 4` | all selected tests pass |
| Focused status/doctor tests | `bun test tests/cli/status.test.ts tests/cli/doctor.test.ts --timeout 60000 --max-concurrency 4` | all selected tests pass |
| Migration/docs tests | `bun test tests/migration-script.test.ts tests/readme-dx.test.ts --timeout 60000 --max-concurrency 4` | all selected tests pass |
| Full tests | `bun test --timeout 60000 --max-concurrency 4` | all tests pass |
| Project state inspection | `bun scripts/inspect-project-state.ts --repo . --format text` | exits 0 |
| Migration dry run | `bash scripts/migrate-project-template.sh --repo . --dry-run` | exits 0 |
| Task sync gate | `bash scripts/check-task-sync.sh` | exits 0 |
| Workflow gate | `bash scripts/check-task-workflow.sh --strict` | exits 0 |
| Release gate | `bun run check:release` | exits 0 |

## Suggested executor toolkit

- Use Waza `/think` if available before implementing Step 1. Ask it to review
  the precedence model: root `.gitignore` hard boundary, `tracked_whitelist`,
  then profile scopes.
- Use Waza `/check` or cross-review skills after Step 5. Ask specifically
  whether cleanup can still stage deletions for `docs/spec.md`, `tasks/`,
  `plans/`, `AGENTS.md`, `CLAUDE.md`, or root `scripts/*` in the default
  profile.
- Use CodeGraph only if call tracing becomes hard. The likely call paths are
  `bootstrap -> syncLocalVcsBoundary -> adopt -> runInit -> migration -> syncLocalVcsBoundary`
  and `doctor/status -> auditLocalOnlyVcs`.

## Scope

**In scope**:

- `src/cli/vcs/local-only.ts`
- `src/cli/commands/bootstrap.ts`
- `src/cli/commands/init.ts`
- `src/cli/commands/status.ts`
- `src/cli/commands/doctor.ts`
- `src/cli/commands/vcs.ts`
- `src/cli/index.ts`
- `scripts/lib/project-init-lib.sh`
- `scripts/migrate-project-template.sh`
- `assets/workflow-contract.v1.json` only if its VCS metadata needs to expose
  the new profile fields.
- `README.md`
- `QUICK_START.md`
- `tests/cli/vcs-local-only.test.ts`
- `tests/cli/bootstrap.test.ts`
- `tests/cli/init.test.ts`
- `tests/cli/doctor.test.ts`
- `tests/cli/status.test.ts`
- `tests/migration-script.test.ts`
- `tests/readme-dx.test.ts`
- `tasks/lessons.md` only if a correction-derived rule needs to be recorded
  after implementation.

**Out of scope**:

- Do not reintroduce any user-level install path or global fallback.
- Do not add `local_only_whitelist`, `local_only_extra`, or a user-extensible
  allowlist for arbitrary local-only project paths. This plan intentionally
  uses only three layers: root `.gitignore`, `tracked_whitelist`, and profile
  scopes.
- Do not make `local-repo-harness` a general Git cleanup tool for arbitrary
  ignored files. Scope hard-boundary checks to paths that repo-harness knows
  through profile groups or whitelist entries.
- Do not make root `.gitignore` the only local-only mechanism. Keep
  `.git/info/exclude` and local overlay `.gitignore` files because root
  negations can otherwise re-expose local-only paths.
- Do not automatically untrack workflow-state or product-intent files that are
  already tracked unless they are exact known-generated files with a managed
  marker and not protected by `tracked_whitelist`.
- Do not delete working tree files during cleanup.
- Do not change package publishing, version bumping, or npm release metadata in
  this plan.

## Git workflow

- Branch: `codex/vcs-profile-policy`
- Commit message style: conventional commits, for example
  `feat: narrow local-only vcs policy profiles`
- Do not push or open a PR unless the operator asks.

## Design target

Implement a profile-based VCS policy with this precedence:

```text
1. Root .gitignore hard boundary
2. tracked_whitelist explicit tracked exceptions
3. VCS profile default scopes
```

There is no `local_only_whitelist`.

### Profile data model

Use this shape as the canonical profile model. It may be stored directly under
`.ai/harness/policy.json` or in a dedicated `.ai/harness/vcs-profile.json` with
`policy.vcs.profile_file` pointing to it. Prefer a dedicated profile file only
if it simplifies migration and status output; otherwise keep the policy in one
file to reduce downstream surface.

```json
{
  "version": 1,
  "name": "project-local-install",
  "scopes": {
    "install_state_scope": "local",
    "workflow_state_scope": "local",
    "product_intent_scope": "tracked"
  },
  "tracked_whitelist": []
}
```

`tracked_whitelist` paths are repo-relative and may be exact files or directory
prefixes ending in `/`. They remove matching paths from the computed local-only
entry list unless the path is ignored by the root `.gitignore`.

### Built-in profiles

Implement these built-in profiles:

| Profile | install_state_scope | workflow_state_scope | product_intent_scope | Purpose |
|---------|---------------------|----------------------|----------------------|---------|
| `project-local-install` | `local` | `local` | `tracked` | Default for downstream project-scoped installs. Keeps local-repo-harness tooling and governance workflow state local, while allowing product-intent docs to be committed. |
| `ephemeral-agent-workspace` | `local` | `local` | `local` | Temporary or private agent workspaces where even product-intent docs should remain local unless whitelisted. |
| `tracked-governance` | `local` | `tracked` | `tracked` | Teams that want repo-harness governance docs in Git but still keep installed tooling local. |
| `self-host` | `tracked` | `tracked` | `tracked` | The local-repo-harness source repo or explicit self-hosted governance repos. |

Default behavior:

- `bootstrap` default profile: `project-local-install`.
- `adopt --mode standard` with any project-scoped hooks, skills, external
  tools, CodeGraph MCP, or manifest-only brain: `project-local-install`.
- `adopt --mode self-host`: `self-host`.
- `--vcs-scope tracked`: compatibility shorthand for the `self-host` scope
  values unless a more specific profile is passed.
- `--vcs-scope local`: compatibility shorthand for `project-local-install`, not
  a command to make all three groups local.
- Explicit per-group flags, if implemented, override the selected profile.

Add CLI flags:

```text
--vcs-profile <project-local-install|ephemeral-agent-workspace|tracked-governance|self-host>
--tracked-whitelist <path[,path...]>
```

If the codebase already has a clearer parsing pattern for repeatable flags, use
that instead of comma parsing. The JSON policy should store
`tracked_whitelist` as an array either way.

### Root `.gitignore` hard boundary

Root `.gitignore` is the user's hard project boundary. For any repo-harness
candidate path:

- If root `.gitignore` ignores the path, `tracked_whitelist` must not re-enable
  it.
- If the path is both root-ignored and whitelisted, `vcs audit` should report a
  conflict such as `tracked_whitelist_ignored_by_project_gitignore`.
- If the path is both root-ignored and already tracked, `vcs audit` should
  report `tracked_but_project_ignored`. Cleanup may offer `git rm --cached`
  only for paths that are also known repo-harness managed paths; do not scan or
  clean arbitrary project files.
- Local overlay `.gitignore` files written by repo-harness do not count as root
  hard boundaries.

Use `git check-ignore -v -- <path>` to distinguish root `.gitignore` hits from
`.git/info/exclude` and local overlay hits. Parse the source file column and
compare it to `<repoRoot>/.gitignore` or `.gitignore`. If the output format is
not stable enough in a fixture, STOP and report instead of guessing.

### Cleanup safety

Default cleanup must be safe even when a profile makes workflow state local:

- Auto-clean install-state tracked paths when they are in the built-in
  install-state list.
- Auto-clean workflow-state generated helper paths only when
  `generatedMarkerRequired` passes.
- Do not auto-clean tracked workflow/product directories such as `plans/`,
  `tasks/`, `docs/reference-configs/`, `docs/spec.md`, `docs/architecture/`,
  `docs/researches/`, `AGENTS.md`, or `CLAUDE.md` unless the specific file has
  an explicit repo-harness generated marker and is not whitelisted.
- Report workflow/product tracked paths that lack a generated marker as
  `requiresUserReview`, not as automatic cleanup candidates.

## Steps

### Step 1: Add profile resolution and tracked whitelist support

Update `src/cli/vcs/local-only.ts`.

Add types similar to:

```ts
export type VcsProfileName =
  | "project-local-install"
  | "ephemeral-agent-workspace"
  | "tracked-governance"
  | "self-host";

export interface LocalVcsProfile {
  version: 1;
  name: VcsProfileName | string;
  scopes: {
    install_state_scope: VcsScope;
    workflow_state_scope: VcsScope;
    product_intent_scope: VcsScope;
  };
  tracked_whitelist: string[];
}
```

Extend `LocalVcsPolicy` to include at least:

```ts
profileName: string;
trackedWhitelist: string[];
profilePath?: string;
```

Replace the single `policyDefaults()` base-scope behavior with profile
resolution:

- Read `opts.vcsProfile`, `raw.profile`, or default based on `mode` and
  `projectScoped`.
- Resolve built-in profile scopes.
- Merge `raw.tracked_whitelist`, `raw.trackedWhitelist`, and CLI whitelist
  entries.
- Apply explicit per-group overrides last.
- Preserve backwards compatibility for old `raw.scope`, but map `local` to the
  `project-local-install` profile rather than all-local.

Apply `trackedWhitelist` inside `computeLocalOnlyEntries()` after entries are
created. Whitelist matching should support exact paths and directory prefixes
ending in `/`. Keep `safeRelPath()` validation.

**Verify**:

Add or update tests in `tests/cli/vcs-local-only.test.ts`:

- `resolveLocalVcsPolicy(repo, { projectScoped: true })` returns
  `install=local`, `workflow=local`, `productIntent=tracked`, profile
  `project-local-install`.
- A policy with legacy `{ "vcs": { "scope": "local" } }` resolves to the same
  `project-local-install` scopes, not all-local.
- A policy with profile `ephemeral-agent-workspace` resolves all three groups
  local.
- A policy with profile `tracked-governance` keeps install local but workflow
  and product tracked.
- `tracked_whitelist: ["AGENTS.md", "tasks/"]` removes those entries from
  local-only entries when workflow scope is local.

Run:

```sh
bun test tests/cli/vcs-local-only.test.ts --timeout 60000 --max-concurrency 4
```

Expected: all tests pass.

### Step 2: Implement root `.gitignore` hard-boundary auditing

Update `src/cli/vcs/local-only.ts`.

Add a helper that checks whether a candidate path is ignored specifically by
the root `.gitignore`, not by `.git/info/exclude` or repo-harness local overlay
files. Suggested shape:

```ts
function rootGitignoreMatch(repoRoot: string, relPath: string): { ignored: boolean; source?: string; pattern?: string }
```

Extend `VcsAuditReport` with a new field such as:

```ts
projectIgnoredConflicts: VcsIssue[];
```

Use this for two cases:

- A whitelisted tracked path is ignored by root `.gitignore`.
- A tracked repo-harness candidate path is ignored by root `.gitignore`.

Do not let `tracked_whitelist` remove a path from local-only entries when root
`.gitignore` ignores it. In that case, keep the path local-only or report a
conflict, depending on its profile group, but do not report it as safe tracked.

Update `safeToCommit` so hard-boundary conflicts make audit unsafe unless they
are only informational and untracked. The recommended rule is:

```text
safeToCommit = no trackedLocalOnly + no unignoredLocalOnly + no requiresUserReview + no projectIgnoredConflicts
```

Update `formatVcsAudit()` and JSON output to include the conflict count and
first few paths.

**Verify**:

Add tests in `tests/cli/vcs-local-only.test.ts`:

- Root `.gitignore` contains `AGENTS.md`; policy has
  `tracked_whitelist: ["AGENTS.md"]`; audit reports a conflict and does not
  treat `AGENTS.md` as safely tracked.
- Root `.gitignore` contains `.codex/*` plus `!.codex/hooks.json`; local overlay
  still makes `.codex/hooks.json` ignored as an install-state path.
- A repo-harness local overlay `.codex/.gitignore` does not count as a root
  `.gitignore` hard-boundary conflict.

Run:

```sh
bun test tests/cli/vcs-local-only.test.ts --timeout 60000 --max-concurrency 4
```

Expected: all tests pass.

### Step 3: Tighten cleanup auto-removal rules

Update `src/cli/vcs/local-only.ts`.

Add an explicit cleanup eligibility function instead of filtering only by
`requiresUserReview`:

```ts
function cleanupEligibility(entry: LocalOnlyEntry, relPath: string): "auto" | "review"
```

Rules:

- `install-state`: auto cleanup when the path is in the built-in install-state
  list.
- `workflow-state`: auto cleanup only for exact generated helper files that
  pass `generatedMarkerRequired`.
- `product-intent`: review-only by default.
- Any root `.gitignore` hard-boundary conflict involving a known repo-harness
  managed path may be auto-cleaned only if it also satisfies the group rule
  above. Otherwise it remains review-only.

Make `cleanupLocalOnlyVcs()` use this eligibility function. It must not stage
deletions for `plans/`, `tasks/`, `docs/reference-configs/`, `docs/spec.md`,
`docs/architecture/`, `docs/researches/`, `AGENTS.md`, or `CLAUDE.md` in the
default `project-local-install` profile.

**Verify**:

Update tests in `tests/cli/vcs-local-only.test.ts`:

- With default project-scoped profile, tracked `.mcp.json` is auto-cleaned.
- With default project-scoped profile, tracked `AGENTS.md`, `tasks/todos.md`,
  and `plans/example.md` are reported for review or ignored by whitelist logic,
  but are not auto-cleaned.
- With `tracked_whitelist: ["AGENTS.md", "tasks/"]`, tracked `AGENTS.md` and
  `tasks/todos.md` are not local-only findings.
- With `ephemeral-agent-workspace`, tracked `docs/spec.md` is review-only, not
  auto-cleaned.
- A generated helper file containing an existing generated marker remains
  auto-cleanable.

Run:

```sh
bun test tests/cli/vcs-local-only.test.ts --timeout 60000 --max-concurrency 4
```

Expected: all tests pass and no expected cleanup command includes broad
workflow/product paths.

### Step 4: Wire profile options through bootstrap, adopt, policy, and migration

Update `src/cli/index.ts`, `src/cli/commands/bootstrap.ts`,
`src/cli/commands/init.ts`, `scripts/lib/project-init-lib.sh`, and
`scripts/migrate-project-template.sh`.

Add public flags to `bootstrap`, `adopt`, and `vcs audit/cleanup`:

```text
--vcs-profile <name>
--tracked-whitelist <path[,path...]>
```

Keep `--vcs-scope` for compatibility, but update descriptions:

```text
--vcs-scope <scope>  Compatibility shorthand: local=project-local-install, tracked=self-host
```

Add fields to `BootstrapOptions` and `InitCommandOptions` as needed. Pass the
new profile and whitelist through `buildAdoptArgs()` so bootstrap delegation
does not lose intent.

Update `runInit()` environment:

```ts
REPO_HARNESS_VCS_PROFILE
REPO_HARNESS_TRACKED_WHITELIST
REPO_HARNESS_INSTALL_STATE_VCS_SCOPE
REPO_HARNESS_WORKFLOW_STATE_VCS_SCOPE
REPO_HARNESS_PRODUCT_INTENT_VCS_SCOPE
```

The three per-group env values should come from the resolved profile, not from
one broad `vcsScope` value. For the default project-scoped install they should
be:

```text
install=local
workflow=local
product-intent=tracked
```

Update policy writing in `scripts/lib/project-init-lib.sh` so
`.ai/harness/policy.json` stores:

```json
{
  "vcs": {
    "profile": "project-local-install",
    "install_state_scope": "local",
    "workflow_state_scope": "local",
    "product_intent_scope": "tracked",
    "tracked_whitelist": [],
    "exclude_strategy": "git-info-exclude-plus-local-overlays",
    "local_only_manifest": ".ai/harness/local-only-manifest.json"
  }
}
```

If using a dedicated `.ai/harness/vcs-profile.json`, write the same profile
shape there and keep `policy.vcs.profile_file` in sync. Do not create both
unless tests prove both are necessary.

Update the migration summary line from one broad `VCS scope` to profile-aware
output, for example:

```text
- VCS profile: project-local-install (install=local, workflow=local, product-intent=tracked; tracked whitelist=0)
```

**Verify**:

Extend `tests/cli/bootstrap.test.ts`:

- Default bootstrap delegated args include `--vcs-profile project-local-install`
  or otherwise preserve equivalent profile intent.
- Bootstrap JSON `sync local-only vcs boundary` detail includes
  `profile=project-local-install` and the three resolved scopes.

Extend `tests/cli/init.test.ts`:

- Default project-scoped recipe resolves install local, workflow local, product
  tracked.
- `--mode self-host` resolves all tracked and skips local-only sync unless
  explicit local profile/scope is passed.
- Passing `--vcs-profile tracked-governance --tracked-whitelist AGENTS.md`
  writes those values to `.ai/harness/policy.json`.

Extend `tests/migration-script.test.ts`:

- The generated policy contains `vcs.profile`, `tracked_whitelist`, and the
  new default scopes.
- The migration text includes `VCS profile:`.

Run:

```sh
bun test tests/cli/bootstrap.test.ts tests/cli/init.test.ts tests/migration-script.test.ts --timeout 60000 --max-concurrency 4
```

Expected: all selected tests pass.

### Step 5: Update status, doctor, and vcs command output

Update `src/cli/commands/status.ts`, `src/cli/commands/doctor.ts`, and
`src/cli/commands/vcs.ts`.

Status JSON should include:

```json
{
  "scopes": {
    "vcs": {
      "profile": "project-local-install",
      "installStateScope": "local",
      "workflowStateScope": "local",
      "productIntentScope": "tracked",
      "trackedWhitelist": [],
      "projectIgnoredConflicts": 0
    }
  }
}
```

Human status should show profile and all three scopes:

```text
vcs: profile=project-local-install; install=local; workflow=local; product-intent=tracked; safe-to-commit=yes
```

Doctor should distinguish severity:

- Install-state tracked or unignored local-only artifacts: `fail`.
- Root `.gitignore` conflicts involving whitelist/profile expectations:
  `fail` if tracked, otherwise `warn`.
- Workflow/product tracked paths that are local by profile but require review:
  `warn` unless they are known generated files eligible for cleanup and remain
  tracked after cleanup.
- No findings: `ok`.

Update remediation text:

```text
local-repo-harness vcs cleanup --repo <repo> --dry-run
```

Do not mention global install, global PATH, `npm install -g`, or user-level
adapter commands in this VCS check.

**Verify**:

Update `tests/cli/status.test.ts`:

- Project opt-in repo with default policy reports profile
  `project-local-install` and product intent tracked.
- Human output contains `profile=project-local-install`.

Update `tests/cli/doctor.test.ts`:

- Project-only install passes when install artifacts are local-only and product
  intent is tracked.
- Tracked `.mcp.json` remains a `fail`.
- Tracked `docs/spec.md` is not a local-only failure under default
  `project-local-install`.
- Root `.gitignore` conflict with `tracked_whitelist` is surfaced in the VCS
  check detail.

Update `tests/cli/vcs-local-only.test.ts` CLI coverage:

- `vcs audit --json` includes profile, whitelist, and conflict fields.
- `vcs cleanup --apply --json` does not include workflow/product paths in
  `removedFromIndex` unless they satisfy generated-marker cleanup rules.

Run:

```sh
bun test tests/cli/status.test.ts tests/cli/doctor.test.ts tests/cli/vcs-local-only.test.ts --timeout 60000 --max-concurrency 4
```

Expected: all selected tests pass.

### Step 6: Update docs and release-facing guidance

Update `README.md` and `QUICK_START.md`.

Required docs changes:

- Replace any statement that says default `--vcs-scope local` keeps install
  artifacts, workflow state, and product intent all local.
- Explain the three-layer judgment:

```text
1. Root .gitignore is the hard boundary.
2. tracked_whitelist explicitly keeps selected governance/intent paths tracked.
3. The selected vcs profile supplies default scopes for all remaining
   repo-harness-managed paths.
```

- State explicitly that there is no `local_only_whitelist`.
- Document the default `project-local-install` profile:
  install state local, workflow state local, product intent tracked.
- Document when to use `tracked-governance`, `ephemeral-agent-workspace`, and
  `self-host`.
- Show examples:

```bash
./.ai/harness/bin/local-repo-harness adopt \
  --repo "$PWD" \
  --host-adapter-scope project \
  --runtime project-vendored-bun \
  --skill-scope project \
  --external-tool-scope project \
  --codegraph-mcp-scope project \
  --sync-codegraph \
  --brain-mode manifest-only \
  --vcs-profile project-local-install
```

```bash
./.ai/harness/bin/local-repo-harness adopt \
  --repo "$PWD" \
  --vcs-profile project-local-install \
  --tracked-whitelist AGENTS.md,tasks/,plans/
```

- Warn that root `.gitignore` wins over `tracked_whitelist`.
- Update acceptance guidance so users expect install artifacts to be ignored
  and product docs not to be bulk untracked under the default profile.

**Verify**:

Update `tests/readme-dx.test.ts`:

- README mentions `--vcs-profile project-local-install`.
- README mentions `tracked_whitelist` or `--tracked-whitelist`.
- README states root `.gitignore` wins.
- README does not mention `local_only_whitelist`.

Run:

```sh
bun test tests/readme-dx.test.ts --timeout 60000 --max-concurrency 4
```

Expected: all tests pass.

### Step 7: Run full validation and real-target safety check

Run focused gates first:

```sh
bun test tests/cli/vcs-local-only.test.ts --timeout 60000 --max-concurrency 4
bun test tests/cli/bootstrap.test.ts tests/cli/init.test.ts --timeout 60000 --max-concurrency 4
bun test tests/cli/status.test.ts tests/cli/doctor.test.ts --timeout 60000 --max-concurrency 4
bun test tests/migration-script.test.ts tests/readme-dx.test.ts --timeout 60000 --max-concurrency 4
```

Expected: all pass.

Run repo gates:

```sh
bun test --timeout 60000 --max-concurrency 4
bun scripts/inspect-project-state.ts --repo . --format text
bash scripts/migrate-project-template.sh --repo . --dry-run
bash scripts/check-task-sync.sh
bash scripts/check-task-workflow.sh --strict
bun run check:release
```

Expected: all exit 0.

If `/Users/syfq/dev/harness/swarm-discussion-codex` is available and the
operator permits touching that test repo, perform this extra acceptance check
there. If not permitted, skip and record that it was not run.

```sh
cd /Users/syfq/dev/harness/swarm-discussion-codex
git status --short
./.ai/harness/bin/local-repo-harness vcs audit --repo "$PWD" --json
./.ai/harness/bin/local-repo-harness vcs cleanup --repo "$PWD" --dry-run --json
```

Expected under the new default profile:

- Install-state paths such as `.ai/harness/tools/local-repo-harness/`,
  `.agents/skills/repo-harness/`, `.codex/hooks.json`, `.mcp.json`, and
  `.codegraph/` are local-only.
- `docs/spec.md` is not a local-only entry under `project-local-install`.
- `AGENTS.md`, `CLAUDE.md`, `tasks/`, and `plans/` are workflow-state local by
  default, but cleanup does not auto-remove already tracked files unless they
  are exact generated managed files.
- Dry-run output does not propose broad deletion of `docs/spec.md`, `tasks/`,
  `plans/`, `docs/researches/`, root `scripts/`, `AGENTS.md`, or `CLAUDE.md`.

Do not run `cleanup --apply` in the real target unless the operator explicitly
asks. The dry-run is enough for this plan's safety proof.

## Test plan

- `tests/cli/vcs-local-only.test.ts`
  - Add profile default tests.
  - Add legacy `scope: local` compatibility tests.
  - Add `tracked_whitelist` exact-file and directory-prefix tests.
  - Add root `.gitignore` hard-boundary conflict tests.
  - Add cleanup safety tests for install-state auto cleanup versus
    workflow/product review-only behavior.
- `tests/cli/bootstrap.test.ts`
  - Assert profile flags survive bootstrap delegation.
  - Assert bootstrap sync detail includes profile/scopes.
- `tests/cli/init.test.ts`
  - Assert default project-scoped install writes profile and resolved scopes.
  - Assert self-host remains tracked.
  - Assert profile and whitelist CLI inputs write to policy.
- `tests/cli/status.test.ts`
  - Assert JSON and text show profile, whitelist, conflicts, and resolved
    scopes.
- `tests/cli/doctor.test.ts`
  - Assert install-state failures stay fail.
  - Assert product intent is not failed under default profile.
  - Assert root `.gitignore` whitelist conflicts are surfaced.
- `tests/migration-script.test.ts`
  - Assert policy and migration report include profile fields.
- `tests/readme-dx.test.ts`
  - Assert docs include the new CLI and do not advertise `local_only_whitelist`.

## Done criteria

All must hold:

- [ ] `resolveLocalVcsPolicy()` supports built-in profiles and
      `tracked_whitelist`.
- [ ] Default project-scoped install resolves to
      `profile=project-local-install`, `install=local`, `workflow=local`,
      `product-intent=tracked`.
- [ ] `--vcs-scope local` no longer means all three VCS groups are local.
- [ ] Root `.gitignore` wins over `tracked_whitelist`, and conflicts appear in
      audit JSON/human output.
- [ ] `vcs cleanup --apply` auto-cleans install-state but does not auto-untrack
      broad workflow/product paths.
- [ ] `doctor --json` separates install-state failures from workflow/product
      review advisories.
- [ ] README/QUICK_START document the three-layer judgment and state that no
      `local_only_whitelist` exists.
- [ ] Focused tests and full repo/release gates listed above pass.
- [ ] `plans/README.md` status row for Plan 012 is updated.

## STOP conditions

Stop and report back instead of improvising if:

- The live code no longer matches the excerpts in this plan after the drift
  check.
- Commander option parsing makes `--tracked-whitelist` ambiguous or conflicts
  with existing comma-containing path behavior.
- `git check-ignore -v` cannot reliably distinguish root `.gitignore` from
  `.git/info/exclude` and local overlays in tests.
- Implementing root `.gitignore` hard-boundary checks requires scanning or
  mutating arbitrary project paths outside repo-harness candidate paths.
- A focused test suggests `cleanup --apply` would stage deletion of
  `docs/spec.md`, `tasks/`, `plans/`, `docs/researches/`, root `scripts/`,
  `AGENTS.md`, or `CLAUDE.md` under the default profile.
- Fixing this appears to require writing to user-level config paths.

## Maintenance notes

- Future plans that add new generated paths must classify them as
  `install-state`, `workflow-state`, or `product-intent` and decide whether the
  default profile should treat them as local or tracked.
- Reviewers should scrutinize cleanup eligibility more than profile parsing.
  The worst regression is a command that silently stages deletion of user-owned
  project files.
- Keep profile documentation synchronized across CLI help, README,
  `.ai/harness/policy.json`, status JSON, doctor output, and
  `.ai/harness/local-only-manifest.json`.
- Do not add a user-extensible `local_only_whitelist` without a separate design
  review. It is intentionally omitted because it is too easy to turn into a
  broad "remove project source from Git" footgun.
