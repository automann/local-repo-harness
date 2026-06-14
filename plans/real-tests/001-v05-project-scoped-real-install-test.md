# Plan 001: Re-run v0.5 project-scoped real install acceptance

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report. Do not improvise. When done, update the status row in
> `plans/real-tests/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 69a9dd6..HEAD -- README.md package.json src/cli scripts assets tests`
>
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding. If the CLI
> command boundary or scope flags no longer match, stop and refresh this plan.

## Status

- **Priority**: P0
- **Effort**: L
- **Risk**: HIGH
- **Depends on**: none
- **Category**: tests, migration, dx
- **Planned at**: commit `69a9dd6`, 2026-06-14

## Why this matters

The fork has now absorbed upstream v0.5, which moved repo-local work from
`repo-harness update` to `repo-harness adopt`. The earlier project-scoped real
tests were valuable, but they exercised `repo-harness@0.4.3` and the old
command boundary. We need a fresh black-box install test that proves two things:

- Project-scoped adoption does not fall back to user-level hooks, skills, MCP
  config, brain state, or global tool installs.
- After adoption, the project-scoped workflow actually works: adapters,
  runtime, repo-harness skills, Waza/Mermaid skills, CodeGraph, brain manifest,
  diagnostics, migration checks, security checks, and hook execution all have
  usable evidence.

This plan intentionally tests the package as an installed dependency from a
local tarball, not by running `bun src/cli/index.ts` directly from the source
checkout.

## Current state

Relevant files and roles:

- `package.json` - package version is `0.5.0`; CLI bins are
  `repo-harness` and `repo-harness-hook`; packaged files include `src/`,
  `assets/`, `scripts/`, docs, and skills.
- `README.md:220-276` - safe onboarding path is `repo-harness adopt`, with
  `--host-adapter-scope project`, `--runtime project-vendored-bun`,
  `--skill-scope project`, optional project external tools, optional project
  CodeGraph MCP, and manifest-only brain.
- `README.md:305-338` - `repo-harness init` is broad-impact user/machine
  bootstrap; `repo-harness update` refreshes user-level CLI/runtime; repo-local
  refresh is `repo-harness adopt --repo /path/to/repo`.
- `src/cli/index.ts:111-197` - `update` is global/user runtime refresh and
  rejects `--repo`, `--dry-run`, and `--interactive` with an `adopt` hint.
- `src/cli/index.ts:199-359` - `adopt` owns repo-local install/refresh,
  defaults all scope flags to `none`, and accepts project scope flags for
  host adapters, skills, external tooling, CodeGraph MCP, and brain manifest.
- `src/cli/index.ts:284-290` - `adopt --configure-codegraph`,
  `adopt --brain-root`, and `adopt --brain-mode install-gbrain-cli` are
  rejected because they imply user-level configuration.
- `src/cli/commands/init.ts:430-456` - `runInit` records scope intent through
  `REPO_HARNESS_*` environment variables, later written into repo policy.
- `src/cli/commands/init.ts:470-548` - project-scope repo-harness skills and
  cross-review skills are copied into project skill roots; Waza/Mermaid use
  the skills CLI from the target repo when `externalToolScope=project`.
- `src/cli/commands/init.ts:562-594` - CodeGraph index ensure is separate from
  MCP configuration; `codegraphMcpScope=project` uses local configuration.
- `src/cli/tools/codegraph.ts:266-393` - project Codex MCP config is
  `<repo>/.codex/config.toml`, with args `["serve", "--mcp", "--path", "."]`
  and local command `./node_modules/.bin/codegraph` when available.
- `src/cli/tools/codegraph.ts:396-470` - project Claude MCP config is
  `<repo>/.mcp.json` and must also be scoped to `["serve", "--mcp", "--path",
  "."]`.
- `src/cli/installer/project-runtime.ts` - project runtime writes
  `.ai/harness/bin/repo-harness-hook`,
  `.ai/harness/runtime/repo-harness/`, and `.version`.
- `tests/cli/init.test.ts`, `tests/cli/install.test.ts`,
  `tests/cli/project-runtime.test.ts`, `tests/cli/status.test.ts`,
  `tests/cli/tools.test.ts` - unit-level contracts already cover scope
  handling; this plan upgrades them to black-box package acceptance.

Historical run artifacts:

- `dev-tests/project-scoped-install-acceptance.md` still references
  `repo-harness update --host-adapter-scope ...`; treat it as stale.
- `dev-tests/runs/*repo-harness-0.4.3.tgz` runs are useful as fixture
  examples only. Their results do not prove v0.5 acceptance.
- Older CodeGraph real tests had a false-positive risk: `codegraph install`
  could exit 0 while project Codex MCP config was missing. This plan makes
  `.codex/config.toml` and `status --json` hard gates.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Source sanity | `git status --short --branch` | on expected branch; no unrelated surprise edits |
| Unit baseline | `bun test tests/cli/init.test.ts tests/cli/install.test.ts tests/cli/project-runtime.test.ts tests/cli/status.test.ts tests/cli/tools.test.ts tests/cli/doctor.test.ts tests/cli/security.test.ts tests/cli/migrate.test.ts` | exit 0 |
| Pack local package | `npm pack --pack-destination "$RUN/pkg" --json` | exit 0, writes one `repo-harness-0.5.0.tgz` |
| Install package in target | `npm install --save-dev "$PKG_TGZ"` | exit 0 |
| CLI version | `"$TARGET/node_modules/.bin/repo-harness" --version` | prints `0.5.0` |
| Repo adoption | `repo-harness adopt --repo "$TARGET" ...` | exit 0 unless this plan says a negative test expects exit 2 |
| Status | `repo-harness status --json` from target | exit 0, parseable JSON |
| Doctor | `repo-harness doctor --json` from target | exit 0 for the all-enabled acceptance target |
| Security | `repo-harness security scan --json` from target | exit 0 |
| Migration dry-run | `repo-harness migrate --json` from target | exit 0; no required destructive change after migration is clean |
| Workflow | `bash scripts/check-task-workflow.sh --strict` from target | exit 0 |
| Target tests | `bun test` from target | exit 0 |

## Suggested executor toolkit

- Use `jq` if available for JSON assertions. If unavailable, use `node -e` or
  `bun -e` snippets; do not manually eyeball JSON.
- Use `find`, `shasum`, and small Node scripts for no-write snapshots.
- Do not use source CLI commands as acceptance unless a step explicitly says
  the source CLI is only for investigation.

## Scope

**In scope**:

- Create and update files only under ignored `dev-tests/runs/<timestamp>-v05-*`
  while executing the real test.
- Update `plans/real-tests/README.md` status after the plan completes or
  blocks.

**Out of scope**:

- Publishing `automann/repo-harness` or `repo-harness` to npm.
- Running `repo-harness init`, broad `repo-harness update`, `bun add -g`,
  `npm -g`, or any command that intentionally mutates the real user profile.
  The only allowed `update` invocation is the explicit negative boundary check
  `repo-harness update --repo "$TARGET"`, which must exit 2 before writing.
- Trusting the project Codex hooks file inside the Codex Desktop UI. This is a
  manual host behavior, not required for CLI-level package acceptance.
- Changing source code to make the test pass. If the test finds a bug, record
  it and stop.
- Treating package-manager cache writes under `$RUN` as user-level leakage.

## Git workflow

- Run this from `/Users/syfq/dev/harness/repo-harness`.
- Do not create a branch unless the operator asks.
- Do not commit or push unless the operator asks.
- If a bug is found, leave source unchanged and write a failure report under
  the run directory.

## Test Fixture

### Step 1: Establish source and environment preflight

Run:

```bash
cd /Users/syfq/dev/harness/repo-harness
git status --short --branch | tee /tmp/repo-harness-v05-real-test-git-status.txt
bun test tests/cli/init.test.ts tests/cli/install.test.ts tests/cli/project-runtime.test.ts tests/cli/status.test.ts tests/cli/tools.test.ts tests/cli/doctor.test.ts tests/cli/security.test.ts tests/cli/migrate.test.ts
```

**Verify**:

- `git status` shows the expected branch and no surprise source edits.
- The focused test command exits 0.

### Step 2: Create an isolated run directory

Run:

```bash
SRC=/Users/syfq/dev/harness/repo-harness
RUN="$SRC/dev-tests/runs/$(date +%Y%m%d-%H%M%S)-v05-real-install"
mkdir -p "$RUN"/{pkg,home,npm-cache,npm-prefix,targets,reports}
REAL_HOME="$HOME"
export HOME="$RUN/home"
export XDG_CONFIG_HOME="$RUN/home/.config"
export npm_config_cache="$RUN/npm-cache"
export npm_config_prefix="$RUN/npm-prefix"
export REPO_HARNESS_LATEST_VERSION=0.5.0
export AGENTIC_DEV_CODEGRAPH_ALLOW_REPO_LOCAL=1
export AGENTIC_DEV_CODEGRAPH_ALLOW_GLOBAL=0
printf 'run=%s\nsource=%s\nreal_home=%s\n' "$RUN" "$SRC" "$REAL_HOME" > "$RUN/environment.txt"
bun --version >> "$RUN/environment.txt"
node --version >> "$RUN/environment.txt"
npm --version >> "$RUN/environment.txt"
```

**Verify**:

- `$RUN` is under `dev-tests/runs/`.
- `$HOME` now points to `$RUN/home`.
- No test command is run with the original `$REAL_HOME` as `HOME`.
- CodeGraph probing is allowed to use target-local
  `node_modules/.bin/codegraph` and forbidden from falling back to a global
  `codegraph` binary.

### Step 3: Create no-write snapshot helpers

Create `$RUN/snapshot-user-state.cjs`:

```bash
cat > "$RUN/snapshot-user-state.cjs" <<'NODE'
const fs = require('fs');
const crypto = require('crypto');
const path = require('path');

const [outFile, fakeHome, realHome] = process.argv.slice(2);
const rels = [
  '.codex/hooks.json',
  '.codex/config.toml',
  '.codex/skills',
  '.codex/rules',
  '.claude/settings.json',
  '.claude.json',
  '.claude/skills',
  '.agents/skills',
  '.agents/rules',
  '.agents/.skill-lock.json',
  '.codegraph',
  '.mcp.json',
  '.repo-harness',
];

function hashFile(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function collect(root, rel) {
  const p = path.join(root, rel);
  if (!fs.existsSync(p)) return { exists: false };
  const stat = fs.lstatSync(p);
  if (stat.isSymbolicLink()) {
    return { exists: true, type: 'symlink', target: fs.readlinkSync(p) };
  }
  if (stat.isDirectory()) {
    const files = [];
    const walk = (dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        const s = fs.lstatSync(full);
        if (s.isDirectory()) walk(full);
        else if (s.isSymbolicLink()) files.push({
          rel: path.relative(p, full).replaceAll(path.sep, '/'),
          type: 'symlink',
          target: fs.readlinkSync(full),
        });
        else if (s.isFile()) files.push({
          rel: path.relative(p, full).replaceAll(path.sep, '/'),
          size: s.size,
          sha256: hashFile(full),
        });
      }
    };
    walk(p);
    files.sort((a, b) => a.rel.localeCompare(b.rel));
    return { exists: true, type: 'dir', files };
  }
  if (stat.isFile()) return { exists: true, type: 'file', size: stat.size, sha256: hashFile(p) };
  return { exists: true, type: 'other' };
}

const result = { generated_at: new Date().toISOString(), fakeHome, realHome, fake: {}, real: {} };
for (const rel of rels) {
  result.fake[rel] = collect(fakeHome, rel);
  result.real[rel] = collect(realHome, rel);
}
fs.writeFileSync(outFile, JSON.stringify(result, null, 2) + '\n');
NODE

node "$RUN/snapshot-user-state.cjs" "$RUN/reports/user-before.json" "$HOME" "$REAL_HOME"
```

**Verify**:

- `$RUN/reports/user-before.json` exists and contains `fake` and `real` keys.
- It contains no secret values, only existence, sizes, and hashes.

### Step 4: Pack and install the local package

Run:

```bash
cd "$SRC"
npm pack --pack-destination "$RUN/pkg" --json > "$RUN/npm-pack.json" 2> "$RUN/npm-pack.err"
PKG_TGZ="$RUN/pkg/$(node -e 'const fs=require("fs"); const p=JSON.parse(fs.readFileSync(process.argv[1],"utf8"))[0]; console.log(p.filename)' "$RUN/npm-pack.json")"
test -f "$PKG_TGZ"
printf '%s\n' "$PKG_TGZ" > "$RUN/package.txt"
```

**Verify**:

- `npm pack` exits 0.
- `$PKG_TGZ` exists.
- The tarball filename is `repo-harness-0.5.0.tgz`.
- Do not continue if the package came from the public registry instead of this
  local source checkout.

### Step 5: Seed target repositories

Create a shell helper in `$RUN/create-target.sh`:

```bash
cat > "$RUN/create-target.sh" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
target="$1"
pkg="$2"
with_codegraph="${3:-no}"
mkdir -p "$target"
cd "$target"
git init -q
git config user.email "repo-harness-test@example.invalid"
git config user.name "repo-harness Test"
npm init -y >/dev/null
npm install --save-dev "$pkg" >/dev/null
if [[ "$with_codegraph" == "yes" ]]; then
  npm install --save-dev @colbymchenry/codegraph@1.0.1 >/dev/null
fi
mkdir -p src tests
cat > src/index.ts <<'TS'
export function add(a: number, b: number): number {
  return a + b;
}
TS
cat > tests/index.test.ts <<'TS'
import { expect, test } from "bun:test";
import { add } from "../src/index";

test("add", () => {
  expect(add(2, 3)).toBe(5);
});
TS
node -e 'const fs=require("fs"); const p=JSON.parse(fs.readFileSync("package.json","utf8")); p.scripts={test:"bun test"}; fs.writeFileSync("package.json", JSON.stringify(p,null,2)+"\n")'
git add .
git commit -m "seed target project" >/dev/null
SH
chmod +x "$RUN/create-target.sh"

"$RUN/create-target.sh" "$RUN/targets/contract-only" "$PKG_TGZ" no
"$RUN/create-target.sh" "$RUN/targets/core-project" "$PKG_TGZ" no
"$RUN/create-target.sh" "$RUN/targets/external-skills" "$PKG_TGZ" no
"$RUN/create-target.sh" "$RUN/targets/codegraph" "$PKG_TGZ" yes
"$RUN/create-target.sh" "$RUN/targets/all-enabled" "$PKG_TGZ" yes
```

**Verify**:

- Each target has `node_modules/.bin/repo-harness`.
- Each target has a clean git working tree before adoption.
- `"$RUN/targets/all-enabled/node_modules/.bin/repo-harness" --version`
  prints `0.5.0`.
- `bun test` exits 0 in every target before adoption.
- Every profile command that runs `adopt`, `status`, `doctor`, `security`,
  `migrate`, workflow helpers, or target tests must prepend the target-local
  bin directory:
  `export PATH="$TARGET/node_modules/.bin:$PATH"`. This keeps helper
  resolution project-local without requiring a global `repo-harness`.

## Profiles

### Step 6: Profile A - dry-run and contract-only adoption

Purpose: prove the lowest-impact repo-local path does not write host adapters,
skills, external tools, CodeGraph MCP, or brain state.

Run:

```bash
TARGET="$RUN/targets/contract-only"
RH="$TARGET/node_modules/.bin/repo-harness"
export PATH="$TARGET/node_modules/.bin:$PATH"

"$RH" adopt --repo "$TARGET" --dry-run \
  --host-adapter-scope none \
  --skill-scope none \
  --external-tool-scope none \
  --codegraph-mcp-scope none \
  --brain-mode skip \
  --no-codegraph \
  --json > "$RUN/reports/profile-a-dry-run.json"

"$RH" adopt --repo "$TARGET" \
  --host-adapter-scope none \
  --skill-scope none \
  --external-tool-scope none \
  --codegraph-mcp-scope none \
  --brain-mode skip \
  --no-codegraph \
  --json > "$RUN/reports/profile-a-adopt.json"

(cd "$TARGET" && "$RH" status --json > "$RUN/reports/profile-a-status.json")
(cd "$TARGET" && "$RH" security scan --json > "$RUN/reports/profile-a-security.json")
(cd "$TARGET" && "$RH" migrate --json > "$RUN/reports/profile-a-migrate.json")
(cd "$TARGET" && bash scripts/check-task-workflow.sh --strict > "$RUN/reports/profile-a-workflow.txt")
```

**Verify**:

- Dry-run creates no `.ai/harness/workflow-contract.json`, `.codex/`,
  `.claude/`, `.agents/`, `.mcp.json`, or `.codegraph`.
- Apply creates `.ai/harness/workflow-contract.json` and workflow support
  files.
- Apply does not create `.codex/hooks.json`, `.claude/settings.json`,
  `.agents/skills/`, `.claude/skills/`, `.codex/config.toml`, `.mcp.json`,
  or `.codegraph/`.
- `.ai/harness/brain-manifest.json` may exist as part of the repo-local
  workflow contract, but status must report brain mode `skip` and manifest
  `not-required`; no user brain root or `.repo-harness` config may be written.
- `profile-a-status.json` reports intent:
  `hooks=none`, `skills=none`, `externalTools=none`,
  `codegraphMcp=none`, `brain=skip`.
- Workflow, security, and migrate commands exit 0.

### Step 7: Profile B - project adapters, runtime, and repo-harness skills

Purpose: prove the main project-only path writes active adapters and skills
only inside the target project.

Run:

```bash
TARGET="$RUN/targets/core-project"
RH="$TARGET/node_modules/.bin/repo-harness"
export PATH="$TARGET/node_modules/.bin:$PATH"

"$RH" adopt --repo "$TARGET" \
  --host-adapter-scope project \
  --runtime project-vendored-bun \
  --skill-scope project \
  --external-tool-scope none \
  --codegraph-mcp-scope none \
  --brain-mode manifest-only \
  --no-codegraph \
  --json > "$RUN/reports/profile-b-adopt.json"

(cd "$TARGET" && "$RH" status --json > "$RUN/reports/profile-b-status.json")
(cd "$TARGET" && "$RH" doctor --json > "$RUN/reports/profile-b-doctor.json" || true)
(cd "$TARGET" && "$RH" security scan --json > "$RUN/reports/profile-b-security.json")
(cd "$TARGET" && "$RH" migrate --json > "$RUN/reports/profile-b-migrate.json")
(cd "$TARGET" && bash scripts/check-task-workflow.sh --strict > "$RUN/reports/profile-b-workflow.txt")
(cd "$TARGET" && bun test > "$RUN/reports/profile-b-target-test.txt")
```

**Verify**:

- `.codex/hooks.json` exists and has 8 managed route entries.
- `.claude/settings.json` exists and has 8 managed route entries.
- Every managed command contains `.ai/harness/bin/repo-harness-hook`.
- No managed command contains `command -v repo-harness-hook` or
  `exec repo-harness hook`; those are global PATH runtime fallbacks and are not
  allowed in this profile.
- `.ai/harness/bin/repo-harness-hook` exists and is executable.
- `.ai/harness/runtime/repo-harness/.version` contains `0.5.0`.
- `.agents/skills/repo-harness/SKILL.md` and
  `.claude/skills/repo-harness/SKILL.md` exist.
- `.agents/skills/repo-harness/.repo-harness-installed-copy` contains
  `scope=project` and `host=codex`.
- `.claude/skills/repo-harness/.repo-harness-installed-copy` contains
  `scope=project` and `host=claude`.
- `.agents/skills/claude-review/SKILL.md` exists.
- `.claude/skills/codex-review/SKILL.md` exists.
- No fake-home user roots are created:
  `$HOME/.codex/hooks.json`, `$HOME/.claude/settings.json`,
  `$HOME/.codex/skills`, `$HOME/.claude/skills`, `$HOME/.agents/skills`,
  `$HOME/.repo-harness`, and `$HOME/.mcp.json` must all be absent.
- `profile-b-status.json` reports project configured for both hosts and
  missing user adapters.
- `doctor` may warn about CodeGraph readiness because this profile disables
  CodeGraph. It must not fail for project adapters, project runtime, or
  project skills.

### Step 8: Profile C - project Waza and Mermaid skills

Purpose: prove explicit third-party skill install uses project scope and the
skills CLI without `-g`.

Run:

```bash
TARGET="$RUN/targets/external-skills"
RH="$TARGET/node_modules/.bin/repo-harness"
export PATH="$TARGET/node_modules/.bin:$PATH"

"$RH" adopt --repo "$TARGET" \
  --host-adapter-scope project \
  --runtime project-vendored-bun \
  --skill-scope project \
  --external-tool-scope project \
  --codegraph-mcp-scope none \
  --brain-mode skip \
  --no-codegraph \
  --json > "$RUN/reports/profile-c-adopt.json" 2> "$RUN/reports/profile-c-adopt.err"

(cd "$TARGET" && npx -y skills ls --json > "$RUN/reports/profile-c-skills-ls.json")
(cd "$TARGET" && "$RH" status --json > "$RUN/reports/profile-c-status.json")
(cd "$TARGET" && "$RH" security scan --json > "$RUN/reports/profile-c-security.json")
(cd "$TARGET" && bash scripts/check-task-workflow.sh --strict > "$RUN/reports/profile-c-workflow.txt")
```

**Verify**:

- Waza project skills exist under `.agents/skills/`:
  `think`, `hunt`, `check`, `health`.
- Mermaid project skill exists under `.agents/skills/mermaid`.
- Claude-visible project skill entries exist where the skills CLI writes them;
  at minimum, `npx skills ls --json` from the target reports project-scope
  entries for `health` and `mermaid`.
- `profile-c-adopt.err` and `profile-c-adopt.json` do not contain ` -g ` in
  the external skills command lines.
- The external skill commands include `--copy`.
- Fake-home user skill roots remain absent:
  `$HOME/.codex/skills`, `$HOME/.claude/skills`, `$HOME/.agents/skills`.
- `profile-c-status.json` reports
  `scopes.externalTools.scope === "project"`,
  `waza === "present"`, and `mermaid === "present"`.
- If network access or the external `skills` package is unavailable, mark this
  profile BLOCKED, not passed. Do not accept fallback user-level writes.

### Step 9: Profile D - project CodeGraph index and MCP

Purpose: prove CodeGraph uses target-local dependency and project-local MCP
configuration, with no user-level MCP fallback.

Run:

```bash
TARGET="$RUN/targets/codegraph"
RH="$TARGET/node_modules/.bin/repo-harness"
export PATH="$TARGET/node_modules/.bin:$PATH"

test -x "$TARGET/node_modules/.bin/codegraph"

"$RH" adopt --repo "$TARGET" \
  --host-adapter-scope project \
  --runtime project-vendored-bun \
  --skill-scope project \
  --external-tool-scope none \
  --codegraph-mcp-scope project \
  --sync-codegraph \
  --brain-mode skip \
  --json > "$RUN/reports/profile-d-adopt.json" 2> "$RUN/reports/profile-d-adopt.err"

(cd "$TARGET" && "$RH" status --json > "$RUN/reports/profile-d-status.json")
(cd "$TARGET" && "$RH" doctor --json > "$RUN/reports/profile-d-doctor.json")
(cd "$TARGET" && "$RH" tools ensure codegraph --check --json > "$RUN/reports/profile-d-codegraph-check.json")
(cd "$TARGET" && ./node_modules/.bin/codegraph --version > "$RUN/reports/profile-d-codegraph-version.txt")
(cd "$TARGET" && ./node_modules/.bin/codegraph status . > "$RUN/reports/profile-d-codegraph-status.txt")
```

**Verify**:

- `.codegraph/` exists.
- `.codex/config.toml` exists and contains `[mcp_servers.codegraph]`.
- `.codex/config.toml` contains `command = "./node_modules/.bin/codegraph"`
  when the local binary exists.
- `.codex/config.toml` contains
  `args = ["serve", "--mcp", "--path", "."]`.
- `.codex/config.toml` contains a CodeGraph MCP env table with
  `CODEGRAPH_TELEMETRY = "0"`, `DO_NOT_TRACK = "1"`, and project-local
  `CODEGRAPH_INSTALL_DIR = ".ai/harness/codegraph-runtime"`.
- `.mcp.json` exists and contains `mcpServers.codegraph.args` exactly
  `["serve", "--mcp", "--path", "."]`.
- `.mcp.json` contains `mcpServers.codegraph.env` with
  `CODEGRAPH_TELEMETRY=0`, `DO_NOT_TRACK=1`, and
  `CODEGRAPH_INSTALL_DIR=.ai/harness/codegraph-runtime`.
- `$HOME/.codex/config.toml`, `$HOME/.claude.json`, and
  `$HOME/.claude/settings.json`, and `$HOME/.codegraph` remain absent.
- `profile-d-status.json` reports CodeGraph index present and project MCP
  configured for both Codex and Claude.
- `profile-d-doctor.json` exits 0. Warnings are acceptable only if they are
  unrelated host trust advisories; CodeGraph readiness, project Codex MCP,
  project Claude MCP, and project index must not be failing.

### Step 10: Profile E - all-enabled long-run target

Purpose: prove the realistic happy path remains stable across repeated
adoption, hook execution, diagnostics, target code changes, and target tests.

Run first adoption:

```bash
TARGET="$RUN/targets/all-enabled"
RH="$TARGET/node_modules/.bin/repo-harness"
export PATH="$TARGET/node_modules/.bin:$PATH"

"$RH" adopt --repo "$TARGET" \
  --host-adapter-scope project \
  --runtime project-vendored-bun \
  --skill-scope project \
  --external-tool-scope project \
  --codegraph-mcp-scope project \
  --sync-codegraph \
  --brain-mode manifest-only \
  --json > "$RUN/reports/profile-e-adopt-1.json" 2> "$RUN/reports/profile-e-adopt-1.err"

(cd "$TARGET" && "$RH" status --json > "$RUN/reports/profile-e-status-1.json")
(cd "$TARGET" && "$RH" doctor --json > "$RUN/reports/profile-e-doctor-1.json")
(cd "$TARGET" && "$RH" security scan --json > "$RUN/reports/profile-e-security-1.json")
(cd "$TARGET" && "$RH" migrate --json > "$RUN/reports/profile-e-migrate-1.json")
(cd "$TARGET" && bash scripts/check-task-workflow.sh --strict > "$RUN/reports/profile-e-workflow-1.txt")
(cd "$TARGET" && bun test > "$RUN/reports/profile-e-target-test-1.txt")
```

Run idempotent second adoption:

```bash
(cd "$TARGET" && find .codex .claude .agents .ai/harness -maxdepth 6 -type f -print | sort | xargs shasum -a 256 > "$RUN/reports/profile-e-stable-before.sha")

"$RH" adopt --repo "$TARGET" \
  --host-adapter-scope project \
  --runtime project-vendored-bun \
  --skill-scope project \
  --external-tool-scope project \
  --codegraph-mcp-scope project \
  --sync-codegraph \
  --brain-mode manifest-only \
  --json > "$RUN/reports/profile-e-adopt-2.json" 2> "$RUN/reports/profile-e-adopt-2.err"

(cd "$TARGET" && find .codex .claude .agents .ai/harness -maxdepth 6 -type f -print | sort | xargs shasum -a 256 > "$RUN/reports/profile-e-stable-after.sha")
diff -u "$RUN/reports/profile-e-stable-before.sha" "$RUN/reports/profile-e-stable-after.sha" > "$RUN/reports/profile-e-stable.diff" || true
```

Run hook/runtime smoke:

```bash
RESTRICTED_PATH="$RUN/restricted-bin"
mkdir -p "$RESTRICTED_PATH"
ln -sf "$(command -v bash)" "$RESTRICTED_PATH/bash"
ln -sf "$(command -v bun)" "$RESTRICTED_PATH/bun"
ln -sf "$(command -v git)" "$RESTRICTED_PATH/git"
SMOKE_PATH="$RESTRICTED_PATH:/usr/bin:/bin"
PATH="$SMOKE_PATH" command -v repo-harness >/dev/null && exit 1
PATH="$SMOKE_PATH" command -v repo-harness-hook >/dev/null && exit 1

(cd "$TARGET" && PATH="$SMOKE_PATH" .ai/harness/bin/repo-harness-hook SessionStart --route default > "$RUN/reports/profile-e-hook-session.out" 2> "$RUN/reports/profile-e-hook-session.err")
(cd "$TARGET" && PATH="$SMOKE_PATH" .ai/harness/bin/repo-harness-hook PostToolUse --route always > "$RUN/reports/profile-e-hook-always.out" 2> "$RUN/reports/profile-e-hook-always.err")
(cd "$TARGET" && PATH="$SMOKE_PATH" .ai/harness/bin/repo-harness-hook PostToolUse --route bash > "$RUN/reports/profile-e-hook-bash.out" 2> "$RUN/reports/profile-e-hook-bash.err")
```

Run post-change refresh:

```bash
cat >> "$TARGET/src/index.ts" <<'TS'

export function multiply(a: number, b: number): number {
  return a * b;
}
TS
cat >> "$TARGET/tests/index.test.ts" <<'TS'

import { multiply } from "../src/index";

test("multiply", () => {
  expect(multiply(3, 4)).toBe(12);
});
TS

(cd "$TARGET" && bun test > "$RUN/reports/profile-e-target-test-2.txt")

"$RH" adopt --repo "$TARGET" \
  --host-adapter-scope project \
  --runtime project-vendored-bun \
  --skill-scope project \
  --external-tool-scope project \
  --codegraph-mcp-scope project \
  --sync-codegraph \
  --brain-mode manifest-only \
  --json > "$RUN/reports/profile-e-adopt-3.json" 2> "$RUN/reports/profile-e-adopt-3.err"

(cd "$TARGET" && "$RH" status --json > "$RUN/reports/profile-e-status-3.json")
(cd "$TARGET" && "$RH" doctor --json > "$RUN/reports/profile-e-doctor-3.json")
(cd "$TARGET" && "$RH" security scan --json > "$RUN/reports/profile-e-security-3.json")
(cd "$TARGET" && bash scripts/check-task-workflow.sh --strict > "$RUN/reports/profile-e-workflow-3.txt")
(cd "$TARGET" && bun test > "$RUN/reports/profile-e-target-test-3.txt")
```

**Verify**:

- First, second, and third adoption exit 0.
- `profile-e-stable.diff` is empty or only contains expected timestamp/run
  evidence files under `.ai/harness/runs/`; stable adapter/runtime/skill
  configs must not drift.
- Hook smoke commands exit 0 with `PATH` restricted to bash, bun, git, and
  macOS baseline system tools in `/usr/bin:/bin`.
- `command -v repo-harness` and `command -v repo-harness-hook` fail under the
  smoke `PATH`.
- Hook smoke must not require a global `repo-harness` or global
  `repo-harness-hook`.
- Status reports:
  `hooks=project`, `runtime=project-vendored-bun`, `skills=project`,
  `externalTools=project`, `codegraphMcp=project`,
  `brain=manifest-only`.
- Project Waza/Mermaid, CodeGraph, and brain manifest are all present.
- Project CodeGraph MCP config carries telemetry opt-out env for both Codex and
  Claude.
- Target `bun test`, workflow check, security scan, doctor, and migrate dry-run
  all exit 0 after the target code change.

### Step 11: Negative command-boundary regression checks

Purpose: prove v0.5 boundary protections are still active.

Run:

```bash
TARGET="$RUN/targets/all-enabled"
RH="$TARGET/node_modules/.bin/repo-harness"
export PATH="$TARGET/node_modules/.bin:$PATH"

set +e
"$RH" update --repo "$TARGET" --json > "$RUN/reports/negative-update-repo.out" 2> "$RUN/reports/negative-update-repo.err"
echo $? > "$RUN/reports/negative-update-repo.exit"

"$RH" adopt --repo "$TARGET" --configure-codegraph --json > "$RUN/reports/negative-adopt-configure-codegraph.out" 2> "$RUN/reports/negative-adopt-configure-codegraph.err"
echo $? > "$RUN/reports/negative-adopt-configure-codegraph.exit"

"$RH" adopt --repo "$TARGET" --brain-root "$RUN/brain" --json > "$RUN/reports/negative-adopt-brain-root.out" 2> "$RUN/reports/negative-adopt-brain-root.err"
echo $? > "$RUN/reports/negative-adopt-brain-root.exit"

"$RH" install --target both --scope user --runtime project-vendored-bun > "$RUN/reports/negative-user-project-runtime.out" 2> "$RUN/reports/negative-user-project-runtime.err"
echo $? > "$RUN/reports/negative-user-project-runtime.exit"
set -e
```

**Verify**:

- `negative-update-repo.exit` is `2`.
- `negative-update-repo.err` contains `update no longer refreshes repositories`
  and `repo-harness adopt --repo <path>`.
- `negative-adopt-configure-codegraph.exit` is `2` and stderr says
  user-level MCP config belongs to update/setup.
- `negative-adopt-brain-root.exit` is `2` and stderr says user-level brain
  config belongs to update/init.
- `negative-user-project-runtime.exit` is `2` and output says
  `--runtime project-vendored-bun requires --scope project`.
- None of these negative commands create or modify fake-home user-level roots.

### Step 12: Final no-write snapshot

Run:

```bash
node "$RUN/snapshot-user-state.cjs" "$RUN/reports/user-after.json" "$HOME" "$REAL_HOME"
diff -u "$RUN/reports/user-before.json" "$RUN/reports/user-after.json" > "$RUN/reports/user-no-write.diff" || true
```

**Verify**:

- In the `fake` section, all no-write paths remain absent unless this plan
  explicitly allows a path under `$RUN` package-manager cache. The no-write set
  itself must remain absent:
  `.codex/hooks.json`, `.codex/config.toml`, `.codex/skills`, `.claude/settings.json`,
  `.claude.json`, `.claude/skills`, `.agents/skills`, `.codegraph`, `.mcp.json`, `.repo-harness`.
- In the `real` section, no hashed no-write path changed compared to before.
- Any diff is a STOP condition unless it is only `generated_at`.

## Test plan

The real test must produce a run report at `$RUN/result.md` with:

- Source commit SHA and branch.
- Tarball path and tarball filename.
- Tool versions: Bun, Node, npm, npx, CodeGraph.
- Exit matrix for Profiles A-E and negative checks.
- No-write summary for fake home and real home.
- Assertion list with PASS/FAIL/BLOCKED per criterion.
- Links or paths to key artifacts:
  - `profile-a-status.json`
  - `profile-b-status.json`
  - `profile-c-skills-ls.json`
  - `profile-d-status.json`
  - `profile-d-codegraph-check.json`
  - `profile-e-status-3.json`
  - `profile-e-doctor-3.json`
  - `profile-e-security-3.json`
  - `user-no-write.diff`

Minimum machine assertions:

- `repo-harness --version` from installed target package is `0.5.0`.
- All project-scoped acceptance profiles use `adopt`, not `update`.
- `update --repo` is rejected with exit 2.
- Profile B has project adapters, project runtime, project repo-harness skills,
  and no user-level writes.
- Profile C has project Waza/Mermaid skills and no `-g` external skill command.
- Profile D has project CodeGraph index plus project Codex and Claude MCP
  configs, and no user-level MCP writes.
- Profile E all-enabled long-run remains functional after repeated adoption,
  hook smoke, target code change, and target tests.
- Final no-write snapshot has no forbidden user-level changes.

## Done criteria

All must hold:

- [ ] Focused v0.5 unit baseline exits 0.
- [ ] Local `repo-harness-0.5.0.tgz` is packed from the current source checkout.
- [ ] Every target installs and runs the CLI from `node_modules/.bin`, not from
      the source checkout.
- [ ] CodeGraph profiles resolve target-local `node_modules/.bin/codegraph`
      with `AGENTIC_DEV_CODEGRAPH_ALLOW_GLOBAL=0`.
- [ ] Profiles A-E complete with the expected pass/warn rules above.
- [ ] Negative command-boundary checks exit with expected code 2.
- [ ] `user-no-write.diff` contains no forbidden fake-home or real-home
      changes.
- [ ] `$RUN/result.md` exists and says `Result: PASS`.
- [ ] `plans/real-tests/README.md` status row is updated to DONE with the run
      directory path, or BLOCKED with the blocker.

## STOP conditions

Stop and report if:

- Drift check shows that the v0.5 command boundary has changed.
- `npm pack` does not produce a local `repo-harness-0.5.0.tgz`.
- Any acceptance command invokes public `repo-harness@0.5.0` from the registry
  instead of the local tarball.
- Any project-scoped profile creates or modifies `$HOME/.codex/hooks.json`,
  `$HOME/.claude/settings.json`, `$HOME/.codex/config.toml`, `$HOME/.claude.json`,
  `$HOME/.codex/skills`, `$HOME/.claude/skills`, `$HOME/.agents/skills`,
  `$HOME/.codegraph`, `$HOME/.repo-harness`, or the corresponding real-home paths.
- External Waza/Mermaid install falls back to `-g` or user skill roots.
- CodeGraph reports success but either `.codex/config.toml` or `.mcp.json` is
  missing from the project.
- `doctor --json` fails in Profile D or Profile E for CodeGraph, project
  adapters, project runtime, or project skills.
- Hook smoke requires global `repo-harness` or global `repo-harness-hook`.
- A failure appears to require source changes. Record the failure in
  `$RUN/result.md` and stop; do not patch code as part of this plan.

## Maintenance notes

- This real test should be re-run after any future change touching
  `src/cli/index.ts`, `src/cli/commands/init.ts`, `src/cli/commands/install.ts`,
  `src/cli/tools/codegraph.ts`, project runtime, skill installation, status,
  doctor, security, migration, or README first-run examples.
- Keep `dev-tests/project-scoped-install-acceptance.md` in sync later if this
  plan becomes the accepted test contract. Its current `update` examples are
  stale after v0.5.
- If the team later publishes the fork under a scoped npm package, add one
  extra profile that installs from the published package. Do not remove the
  local tarball profile; it is the pre-publish release gate.
