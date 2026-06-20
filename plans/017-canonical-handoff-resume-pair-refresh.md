# Plan 017: Make handoff/resume a canonical generated pair

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report; do not improvise. When done, update the status row for this plan in
> `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 0479125..HEAD -- scripts/prepare-handoff.sh scripts/codex-handoff-resume.sh scripts/check-task-workflow.sh assets/templates/helpers/prepare-handoff.sh assets/templates/helpers/codex-handoff-resume.sh assets/templates/helpers/check-task-workflow.sh assets/hooks/session-start-context.sh .ai/hooks/session-start-context.sh QUICK_START.md README.md assets/skill-commands/repo-harness-sprint/SKILL.md tests/helper-scripts.test.ts tests/hook-runtime.test.ts tests/readme-dx.test.ts tests/bootstrap-files.test.ts package.json assets/skill-version.json src/cli/index.ts`
>
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding. On a
> mismatch, treat it as a STOP condition unless the live code already clearly
> implements this plan's intent.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: plans/013-canonical-sprint-row-execution-entrypoint.md, plans/016-strict-contract-schema-dx.md
- **Category**: dx
- **Planned at**: commit `0479125`, 2026-06-20
- **Target release**: 0.5.18

## Why this matters

Real Sprint backlog row execution exposed a repeated handoff/resume conflict:
agents edited `.ai/harness/handoff/current.md` or closeout state, then forgot to
refresh `.ai/harness/handoff/resume.md`. The strict workflow gate caught the
pair as stale, but the recovery path was unclear and based only on file mtimes.
This plan makes the model explicit: `current.md` is the handoff source artifact,
`resume.md` is a generated read model derived from it, and `prepare-handoff` is
the canonical repo-local pair writer.

After this lands, stale handoff/resume state should fail with an actionable
repair command instead of forcing agents to infer which file to edit. Session
start should also avoid injecting a resume packet whose recorded handoff
checksum no longer matches the current handoff.

## Current state

- `scripts/prepare-handoff.sh` writes repo handoff current and then refreshes
  resume unless `REPO_HARNESS_SKIP_RESUME_REFRESH=1`.
- `scripts/codex-handoff-resume.sh` writes resume from repo state, but it does
  not record which exact handoff content it was generated from.
- `scripts/check-task-workflow.sh` checks the handoff/resume pair with mtimes
  and one semantic check, but it cannot prove content-level derivation.
- `assets/hooks/session-start-context.sh` injects resume only if resume mtime is
  newer than handoff mtime; it also lacks checksum awareness.
- Helper scripts have root copies and generated template copies. Keep them in
  sync.

Relevant current excerpts:

`scripts/prepare-handoff.sh:15-22`:

```bash
if [[ -f ".ai/hooks/lib/workflow-state.sh" ]]; then
  # shellcheck source=/dev/null
  . ".ai/hooks/lib/workflow-state.sh"
  workflow_write_handoff "${1:-manual}"
  echo "Updated $(workflow_handoff_file)"
  if [[ "${REPO_HARNESS_SKIP_RESUME_REFRESH:-0}" != "1" && -f "scripts/codex-handoff-resume.sh" ]]; then
    bash scripts/codex-handoff-resume.sh --cwd "$(pwd -P)" --reason "${1:-manual}" >/dev/null
  fi
```

`scripts/codex-handoff-resume.sh:207-225`:

```bash
resume_file="$(safe_repo_file "$(policy_get '.handoff_resume.resume_packet_file' '.ai/harness/handoff/resume.md')" '.ai/harness/handoff/resume.md' '.ai/harness/')"
repo_handoff="$(safe_repo_file "$(policy_get '.harness.handoff_file' '.ai/harness/handoff/current.md')" '.ai/harness/handoff/current.md' '.ai/harness/')"
checks_file="$(safe_repo_file "$(policy_get '.harness.checks_file' '.ai/harness/checks/latest.json')" '.ai/harness/checks/latest.json' '.ai/harness/')"
research_dir="$(safe_repo_file "$(policy_get '.tasks.research_dir' 'docs/researches')" 'docs/researches' 'docs/researches')"
todo_file="$(safe_repo_file "$(policy_get '.tasks.todo_file' 'tasks/todos.md')" 'tasks/todos.md' 'tasks/')"
plan_file="$(active_plan || true)"
contract_file="$(derive_contract "$plan_file" || true)"
notes_file="$(derive_notes "$plan_file" || true)"
global_handoff="$(latest_global_handoff || true)"

mkdir -p "$(dirname "$resume_file")"

cat > "$resume_file" <<EOF_RESUME
# Codex Resume Packet
<!-- generated-by: repo-harness codex-handoff-resume v1 -->

> **Generated**: $(date '+%Y-%m-%d %H:%M:%S')
> **Reason**: ${reason}
> **Working Directory**: ${cwd}
```

`scripts/check-task-workflow.sh:402-427`:

```bash
check_handoff_resume_pair() {
  local handoff_file="$1"
  local resume_file="$2"
  local handoff_mtime resume_mtime

  [[ -f "$handoff_file" || -f "$resume_file" ]] || return 0

  if [[ -f "$handoff_file" && ! -f "$resume_file" ]]; then
    report_issue "Handoff current exists but resume packet is missing: $resume_file"
    return 0
  fi

  if [[ ! -f "$handoff_file" && -f "$resume_file" ]]; then
    report_issue "Resume packet exists but handoff current is missing: $handoff_file"
    return 0
  fi

  handoff_mtime="$(file_mtime "$handoff_file")"
  resume_mtime="$(file_mtime "$resume_file")"
  if [[ "$resume_mtime" =~ ^[0-9]+$ && "$handoff_mtime" =~ ^[0-9]+$ && "$resume_mtime" -lt "$handoff_mtime" ]]; then
    report_issue "Resume packet is older than handoff current: $resume_file < $handoff_file"
  fi
```

`assets/hooks/session-start-context.sh:71-82`:

```bash
resume_current_for_handoff() {
  local handoff_file resume_mtime handoff_mtime
  resume_available || return 1

  handoff_file="$(workflow_handoff_file)"
  [[ -f "$handoff_file" ]] || return 0

  resume_mtime="$(file_mtime "$resume_file" || true)"
  handoff_mtime="$(file_mtime "$handoff_file" || true)"
  [[ -n "$resume_mtime" && -n "$handoff_mtime" ]] || return 0

  [[ "$resume_mtime" -ge "$handoff_mtime" ]]
}
```

Existing tests to model:

- `tests/helper-scripts.test.ts:3426-3471` covers `prepare-handoff`.
- `tests/helper-scripts.test.ts:3504-3542` covers `codex-handoff-resume`.
- `tests/helper-scripts.test.ts:3844-3869` covers strict handoff/resume failure.
- `tests/hook-runtime.test.ts:1268-1294` covers session-start skipping stale resume.

Repo conventions:

- Use Bash helper scripts with `set -euo pipefail`.
- Prefer portable shell with macOS support. Use `shasum -a 256` first and
  `sha256sum` fallback for SHA-256.
- Keep root helpers and packaged helper templates byte-identical when both
  exist.
- Keep generated hook assets and `.ai/hooks` self-host copies in sync when the
  source repo carries both.
- Tests are Bun tests under `tests/*.test.ts`; use focused test filters before
  the release gate.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Focused helper tests | `bun test tests/helper-scripts.test.ts --test-name-pattern "handoff|resume|check-task-workflow"` | exit 0; matching tests pass |
| Focused session-start tests | `bun test tests/hook-runtime.test.ts --test-name-pattern "session-start-context.*resume"` | exit 0; matching tests pass |
| Docs/readme tests | `bun test tests/readme-dx.test.ts tests/bootstrap-files.test.ts` | exit 0 |
| Workflow strict check | `bash scripts/check-task-workflow.sh --strict` | prints `[workflow] OK`, exits 0 |
| Task sync | `bash scripts/check-task-sync.sh` | exits 0 |
| Release gate | `bun run check:release` | exits 0; includes `bun test`, workflow checks, and npm dry-run |

## Scope

**In scope**:

- `scripts/codex-handoff-resume.sh`
- `assets/templates/helpers/codex-handoff-resume.sh`
- `scripts/prepare-handoff.sh`
- `assets/templates/helpers/prepare-handoff.sh`
- `scripts/check-task-workflow.sh`
- `assets/templates/helpers/check-task-workflow.sh`
- `assets/hooks/session-start-context.sh`
- `.ai/hooks/session-start-context.sh`
- `QUICK_START.md`
- `README.md`
- `assets/skill-commands/repo-harness-sprint/SKILL.md`
- `tests/helper-scripts.test.ts`
- `tests/hook-runtime.test.ts`
- `tests/readme-dx.test.ts`
- `tests/bootstrap-files.test.ts`
- Version files for the 0.5.18 release if the implementation is otherwise
  complete: `package.json`, `assets/skill-version.json`, `src/cli/index.ts`,
  and version-specific tests.
- `plans/README.md` and a completion note under `tasks/notes/` after
  implementation, if that is the repo's current closeout convention.

**Out of scope**:

- Do not implement a new `local-repo-harness handoff refresh` CLI command in
  this plan. Use the existing public helper entrypoint:
  `local-repo-harness run prepare-handoff <reason>`.
- Do not add post-edit hook auto-refresh as the primary fix. Implicit writes
  hide state ownership; hooks may emit advice later, but this plan's source of
  truth is an explicit pair writer.
- Do not change Sprint row closeout semantics or reintroduce
  `verify-sprint` into Step 3 closeout prompts.
- Do not make `.ai/harness/handoff/resume.md` tracked product state; it remains
  runtime/generated workflow state governed by existing VCS profiles.
- Do not change global Codex handoff behavior beyond keeping
  `prepare-codex-handoff.sh` compatible with the repo-local pair metadata.

## Git workflow

- Suggested branch: `codex/canonical-handoff-resume-pair`
- Commit message style: conventional, matching recent history. Example:
  `fix: tighten contract schema workflow gates`
- Do not push or open a PR unless the operator explicitly asks.

## Steps

### Step 1: Record generated-from metadata in resume packets

Update `scripts/codex-handoff-resume.sh` and
`assets/templates/helpers/codex-handoff-resume.sh`.

Add a small helper that computes a SHA-256 for a repo file:

```bash
file_sha256() {
  local file="$1"
  [[ -f "$file" ]] || return 1
  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$file" | awk '{print $1}'
    return 0
  fi
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$file" | awk '{print $1}'
    return 0
  fi
  return 1
}
```

Before writing the resume packet, compute:

- `repo_handoff_sha="$(file_sha256 "$repo_handoff" || true)"`

Then add metadata lines near the existing generated/reason/working-directory
header:

```markdown
> **Generated From Handoff**: ${repo_handoff}
> **Generated From Handoff SHA256**: ${repo_handoff_sha:-(unavailable)}
```

The checksum must be computed from the sanitized `repo_handoff` path already
resolved by `safe_repo_file`. Do not hash a policy-provided path before it has
passed through `safe_repo_file`.

**Verify**:

```bash
cmp scripts/codex-handoff-resume.sh assets/templates/helpers/codex-handoff-resume.sh
bun test tests/helper-scripts.test.ts --test-name-pattern "codex-handoff-resume"
```

Expected result: `cmp` exits 0, and the matching resume tests pass.

### Step 2: Make strict workflow check validate checksum, not just mtime

Update `scripts/check-task-workflow.sh` and
`assets/templates/helpers/check-task-workflow.sh`.

Add helpers to:

- compute current handoff checksum with the same `shasum` / `sha256sum`
  fallback;
- parse `Generated From Handoff` and `Generated From Handoff SHA256` from the
  resume packet;
- report a single clear issue if the resume packet is missing generated-from
  metadata, points at a different handoff file, or records a checksum that no
  longer matches current handoff content.

Recommended behavior:

- If both files exist and resume has checksum metadata, checksum is
  authoritative.
- If the checksum mismatches, report:

  ```text
  [workflow] Resume packet is stale for handoff current: .ai/harness/handoff/resume.md was generated from <hash>, expected <hash>. Refresh with: local-repo-harness run prepare-handoff workflow-sync
  ```

- If generated marker exists but checksum metadata is missing, report:

  ```text
  [workflow] Resume packet lacks handoff checksum metadata; refresh with: local-repo-harness run prepare-handoff workflow-sync
  ```

- Keep the existing historical-plan semantic check.
- Keep the current mtime check only as a fallback for legacy resume packets if
  there is no checksum metadata yet. The fallback message should also include
  the same remediation command.

Do not make strict check auto-refresh files. It should only report the exact
command.

**Verify**:

```bash
cmp scripts/check-task-workflow.sh assets/templates/helpers/check-task-workflow.sh
bun test tests/helper-scripts.test.ts --test-name-pattern "check-task-workflow.*handoff|check-task-workflow.*resume"
```

Expected result: `cmp` exits 0, and matching tests pass.

### Step 3: Make session-start resume injection checksum-aware

Update `assets/hooks/session-start-context.sh` and
`.ai/hooks/session-start-context.sh`.

Change `resume_current_for_handoff` so it follows this order:

1. If no repo handoff exists, resume may be injected as today.
2. If resume has `Generated From Handoff SHA256` and it is not
   `(unavailable)`, compute the current handoff checksum and require an exact
   match.
3. If checksum metadata is absent, retain the current mtime fallback for
   backward compatibility.

This keeps old projects from losing resume context immediately after upgrade,
while new packets become content-validated.

**Verify**:

```bash
cmp assets/hooks/session-start-context.sh .ai/hooks/session-start-context.sh
bun test tests/hook-runtime.test.ts --test-name-pattern "session-start-context.*resume"
```

Expected result: `cmp` exits 0, and matching session-start tests pass.

### Step 4: Make `prepare-handoff` visibly the canonical pair writer

Update `scripts/prepare-handoff.sh` and
`assets/templates/helpers/prepare-handoff.sh`.

Keep the current behavior that writes current first and refreshes resume second.
Improve the human output so agents see that the pair was refreshed. For example:

```text
Updated .ai/harness/handoff/current.md
Updated .ai/harness/handoff/resume.md
```

When `REPO_HARNESS_SKIP_RESUME_REFRESH=1` is set, preserve the existing skip
behavior and do not print a false resume refresh line. `prepare-codex-handoff.sh`
uses this skip mode before it writes the Codex/global handoff; do not break it.

**Verify**:

```bash
cmp scripts/prepare-handoff.sh assets/templates/helpers/prepare-handoff.sh
bun test tests/helper-scripts.test.ts --test-name-pattern "prepare-handoff"
```

Expected result: `cmp` exits 0, and prepare-handoff tests pass.

### Step 5: Add regression tests for stale checksum and repair flow

Update `tests/helper-scripts.test.ts`.

Add tests that cover:

1. `codex-handoff-resume` writes `Generated From Handoff` and
   `Generated From Handoff SHA256`.
2. `check-task-workflow --strict` fails when handoff content changes after
   resume generation even if resume mtime is newer than handoff mtime. This is
   the regression that proves checksum beats mtime.
3. The strict failure includes the remediation command
   `local-repo-harness run prepare-handoff workflow-sync`.
4. Running `scripts/prepare-handoff.sh workflow-sync` repairs the pair, after
   which `scripts/check-task-workflow.sh --strict` passes.

Use existing `tmpWorkspace`, `copyHelpers`, and `run` helpers from the same test
file. Keep the test repo minimal but include the directories/files required by
`check-task-workflow --strict`, following the existing
`helper-check-workflow-handoff-resume` and `helper-check-workflow-runtime`
fixtures.

**Verify**:

```bash
bun test tests/helper-scripts.test.ts --test-name-pattern "handoff|resume|check-task-workflow"
```

Expected result: matching tests pass.

### Step 6: Update docs and Sprint prompt guidance

Update docs after behavior is implemented:

- `QUICK_START.md`: in the Sprint backlog row closeout section, tell users to
  refresh stale handoff/resume via
  `local-repo-harness run prepare-handoff closeout` or the project shim form.
  Keep the text short. Do not reintroduce a Step 3 `verify-sprint` rerun.
- `README.md`: describe `prepare-handoff` as the repo-local handoff/resume pair
  refresh command.
- `assets/skill-commands/repo-harness-sprint/SKILL.md`: closeout guidance
  should say that if strict workflow reports stale handoff/resume, run the
  canonical pair writer and then rerun strict workflow check.

Update `tests/readme-dx.test.ts` and `tests/bootstrap-files.test.ts` so docs and
generated templates keep the new instruction.

**Verify**:

```bash
bun test tests/readme-dx.test.ts tests/bootstrap-files.test.ts
```

Expected result: docs tests pass.

### Step 7: Bump release metadata to 0.5.18 after implementation passes

Only after Steps 1-6 pass, bump release metadata:

- `package.json`: `"version": "0.5.18"`
- `assets/skill-version.json`: `version` and `templateVersion` to `0.5.18`,
  and add a concise `breakingChanges` or release note entry if that file uses
  such history.
- `src/cli/index.ts`: update any bootstrap help example that pins the package
  version.
- Version-specific tests such as `tests/cli/bootstrap.test.ts` and
  `tests/bootstrap-files.test.ts`.

**Verify**:

```bash
bun test tests/skill-version.test.ts tests/bootstrap-files.test.ts tests/cli/bootstrap.test.ts
```

Expected result: version tests pass.

### Step 8: Run final gates and close the plan

Run focused parity checks first:

```bash
cmp scripts/codex-handoff-resume.sh assets/templates/helpers/codex-handoff-resume.sh
cmp scripts/prepare-handoff.sh assets/templates/helpers/prepare-handoff.sh
cmp scripts/check-task-workflow.sh assets/templates/helpers/check-task-workflow.sh
cmp assets/hooks/session-start-context.sh .ai/hooks/session-start-context.sh
git diff --check
```

Then run:

```bash
bash scripts/check-task-sync.sh
bash scripts/check-task-workflow.sh --strict
bun test
bun run check:release
```

Expected result: all commands exit 0. `check-task-workflow --strict` prints
`[workflow] OK`; `check:release` reaches the npm dry-run gate successfully.

Update:

- `plans/README.md`: mark plan 017 DONE with date and verification summary.
- `tasks/notes/017-canonical-handoff-resume-pair-refresh.notes.md`: add a
  short implementation note and the exact verification commands/results.

## Test plan

New/updated tests should cover:

- Resume packet checksum metadata is emitted.
- Strict workflow catches content-stale resume packets even when mtime would
  pass.
- Strict workflow includes a precise repair command.
- `prepare-handoff` repairs a stale pair.
- Session-start does not inject checksum-stale resume packets.
- Root/template helper parity remains exact.
- Docs tell Sprint row agents to repair stale handoff/resume with the canonical
  pair writer and do not reintroduce closeout `verify-sprint`.

Use existing tests as patterns:

- `tests/helper-scripts.test.ts:3426-3542` for prepare/resume helper tests.
- `tests/helper-scripts.test.ts:3844-3869` for strict workflow failures.
- `tests/hook-runtime.test.ts:1268-1294` for session-start stale resume
  behavior.

## Done criteria

All must hold:

- [ ] `scripts/codex-handoff-resume.sh` and its asset template write
      generated-from handoff checksum metadata.
- [ ] `scripts/check-task-workflow.sh --strict` validates checksum metadata and
      prints an explicit `local-repo-harness run prepare-handoff workflow-sync`
      remediation when stale.
- [ ] Session-start resume injection is checksum-aware with mtime fallback only
      for legacy packets.
- [ ] `prepare-handoff` visibly refreshes the pair when resume refresh is not
      skipped.
- [ ] Sprint row closeout docs mention stale handoff/resume repair via the
      canonical pair writer and do not tell users to hand-edit either file.
- [ ] No post-edit auto-refresh is added as the primary fix.
- [ ] Helper/template and hook/self-host parity `cmp` commands exit 0.
- [ ] `bun test` exits 0.
- [ ] `bun run check:release` exits 0.
- [ ] Release metadata is bumped to `0.5.18`.
- [ ] `plans/README.md` and task notes are updated.

## STOP conditions

Stop and report back if:

- The live code no longer has separate `prepare-handoff`,
  `codex-handoff-resume`, and `check-task-workflow` helpers matching the
  current-state excerpts.
- You need to add a new top-level `handoff` CLI command to make the design work.
  That is intentionally out of scope for 0.5.18.
- The checksum implementation would require a nonstandard dependency or network
  install.
- Strict workflow cannot be made to pass in this repo after refreshing the pair
  with `prepare-handoff`.
- Fixing session-start checksum behavior requires changing hook route registry
  or host adapter install semantics.

## Maintenance notes

- Treat `.ai/harness/handoff/current.md` as the source artifact and
  `.ai/harness/handoff/resume.md` as a generated read model. Future features
  should update both through `prepare-handoff` or an explicitly designed
  successor command, not by hand-editing both files.
- Keep mtime only as compatibility fallback. New correctness checks should use
  generated-from metadata.
- If a future release adds `local-repo-harness handoff refresh`, make it a thin
  alias over the same pair-writer semantics and preserve this plan's checksum
  contract.
- Reviewers should scrutinize path safety: policy-configured handoff/resume
  paths must still be sanitized through the existing repo/harness containment
  helpers before hashing or writing.
