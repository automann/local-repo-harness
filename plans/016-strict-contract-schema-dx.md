# Plan 016: Make contract schema failures explicit and prevent recursive workflow gates

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report - do not improvise. When done, update the status row for this plan
> in `plans/README.md` unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 87c24d3..HEAD -- scripts/verify-contract.sh assets/templates/helpers/verify-contract.sh scripts/verify-sprint.sh assets/templates/helpers/verify-sprint.sh assets/hooks/lib/workflow-state.sh .ai/hooks/lib/workflow-state.sh assets/templates/contract.template.md assets/templates/review.template.md scripts/lib/project-init-lib.sh scripts/ensure-task-workflow.sh assets/templates/helpers/ensure-task-workflow.sh scripts/plan-to-todo.sh assets/templates/helpers/plan-to-todo.sh assets/skill-commands/repo-harness-sprint/SKILL.md QUICK_START.md README.md package.json assets/skill-version.json src/cli/index.ts tests/helper-scripts.test.ts tests/workflow-state-lib.test.ts tests/bootstrap-files.test.ts tests/readme-dx.test.ts tests/workflow-contract.test.ts tests/cli/bootstrap.test.ts`
>
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding. If the
> live behavior already blocks recursive workflow commands and documents the
> strict schema rules clearly, stop and report instead of duplicating it.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: `plans/014-tighten-review-and-edge-case-gates.md`, `plans/015-hydrate-contract-worktree-local-context.md`
- **Category**: bug, dx, tests
- **Planned at**: commit `87c24d3`, 2026-06-20

## Why this matters

The downstream `swarm-discussion-codex` row 6 run on `local-repo-harness@0.5.16`
proved that the core gates can work, but also exposed two workflow-contract DX
bugs. First, agents can put `verify-sprint` inside a task contract's
`commands_succeed`, causing `verify-sprint -> verify-contract -> verify-sprint`
self-recursion and a long silent hang. Second, the contract/review schema is
actually a strict protocol, but templates present fields like `manual_checks`,
`External Source`, and `P1 blockers` as free-form prose. Agents therefore write
natural language, learn the exact accepted enum only by repeated failed
snapshots, and waste time on schema archaeology instead of task execution.

This plan is the 0.5.17 stabilization task for those two issues. After it
lands, task contracts should reject meta workflow commands before executing
them, and strict review/manual-override values should be discoverable from
templates, errors, skill prompts, and tests.

## Current state

Relevant files and roles:

- `scripts/verify-contract.sh` - parses `exit_criteria` and executes
  `commands_succeed`, `commands_fail`, and `manual_checks`.
- `assets/templates/helpers/verify-contract.sh` - generated downstream helper
  copy; must stay behaviorally identical to `scripts/verify-contract.sh`.
- `scripts/verify-sprint.sh` and `assets/templates/helpers/verify-sprint.sh` -
  outer Sprint verification gate. These commands must not be run from inside a
  contract command list.
- `assets/hooks/lib/workflow-state.sh` - shared review and external acceptance
  parser used by `verify-sprint`, hooks, and finish/ship gates.
- `.ai/hooks/lib/workflow-state.sh` - self-hosted runtime copy that must remain
  in parity with `assets/hooks/lib/workflow-state.sh`.
- `assets/templates/contract.template.md`,
  `assets/templates/review.template.md`, `scripts/lib/project-init-lib.sh`,
  `scripts/ensure-task-workflow.sh`,
  `assets/templates/helpers/ensure-task-workflow.sh`,
  `scripts/plan-to-todo.sh`, and
  `assets/templates/helpers/plan-to-todo.sh` - sources of generated contract and
  review guidance.
- `assets/skill-commands/repo-harness-sprint/SKILL.md` and `QUICK_START.md` -
  user/agent prompts that currently tell agents to place edge cases in
  `commands_succeed`/`commands_fail` but do not warn that `verify-sprint` is a
  meta gate.
- `tests/helper-scripts.test.ts`, `tests/workflow-state-lib.test.ts`,
  `tests/bootstrap-files.test.ts`, `tests/readme-dx.test.ts`, and
  `tests/workflow-contract.test.ts` - current regression surfaces for helpers,
  review parsing, templates, docs, and workflow contract files.
- `package.json`, `assets/skill-version.json`, `src/cli/index.ts`, and
  `README.md` - version, help text, and public package metadata for the 0.5.17
  release prep step.

Current `verify-contract.sh` executes every `commands_succeed` entry directly:

```bash
scripts/verify-contract.sh:596-603
if ((${#commands_succeed[@]})); then
  for cmd in "${commands_succeed[@]}"; do
    if bash -lc "$cmd" >/tmp/contract-command.log 2>&1; then
      pass "commands_succeed" "$cmd" "commands_succeed: $cmd"
    else
      fail "commands_succeed" "$cmd" "commands_succeed: $cmd"
    fi
  done
fi
```

Current `commands_fail` has the same blind execution behavior:

```bash
scripts/verify-contract.sh:606-613
if ((${#commands_fail[@]})); then
  for cmd in "${commands_fail[@]}"; do
    if bash -lc "$cmd" >/tmp/contract-command.log 2>&1; then
      fail "commands_fail" "$cmd" "commands_fail unexpectedly succeeded: $cmd"
    else
      pass "commands_fail" "$cmd" "commands_fail: $cmd"
    fi
  done
fi
```

Current `manual_checks` already behaves like a fixed enum, but the unsupported
message does not tell an agent where custom human evidence belongs:

```bash
scripts/verify-contract.sh:630-647
case "$check" in
  "Evaluator review file recommends pass")
    fail "manual_checks" "$check" "manual_checks deprecated: use Evaluator review file is terminal pass"
    ;;
  "Evaluator review file is terminal pass")
    ...
    ;;
  *)
    fail "manual_checks" "$check" "manual_checks unsupported: $check"
    ;;
esac
```

Current external acceptance parsing requires a precise manual-override source
and precise P1 blocker value:

```bash
assets/hooks/lib/workflow-state.sh:1438-1451
if [[ "$acceptance_lc" == "manual_override" ]]; then
  if [[ "$source_lc" != "manual-override" ]]; then
    printf 'fail\t%s\t%s\tManual override requires External Source: manual-override.\n' "${reviewer:--}" "${source:--}"
    return 0
  fi
  if [[ "$p1_lc" != "none" ]]; then
    printf 'fail\t%s\t%s\tManual override requires P1 blockers: none; got %s.\n' "${reviewer:--}" "${source:--}" "${p1_blockers:-missing}"
    return 0
  fi
  ...
  printf 'manual_override\t%s\t%s\tManual override recorded for external acceptance: %s\n' "${reviewer:--}" "${source:--}" "$manual_override"
  return 0
fi
```

Current contract template includes the stricter manual check, but it does not
say that `manual_checks` is not a free-form evidence field, nor that outer
workflow gates are forbidden inside contract command lists:

````md
assets/templates/contract.template.md:64-83
## Exit Criteria (Machine Verifiable)

```yaml
exit_criteria:
  files_exist:
    - docs/spec.md
  commands_succeed:
    - bun run typecheck
  commands_fail: []
  manual_checks:
    - "Evaluator review file is terminal pass"
```
````

Current review template leaves the exact manual-override shape blank:

```md
assets/templates/review.template.md:30-41
## External Acceptance Advice

> **External Acceptance**: unavailable
> **External Reviewer**:
> **External Source**:
> **External Started**:
> **External Completed**:

- P1 blockers:
- P2 advisories:
- Acceptance checklist:
- Manual Override:
```

Current Quick Start Step 2 tells agents to put edge cases in
`commands_succeed` / `commands_fail`, then to run repo workflow checks, but it
does not separate task-local commands from outer workflow commands:

```md
QUICK_START.md:316-319
第 3 步，严格按计划的 scope / non-scope 实现；把边界场景写进 contract——预期成功放
`commands_succeed`，预期失败放 `commands_fail`。然后运行该 row 的 acceptance command 和
repo workflow checks；需要外部验收时用 cross-review skills 填写 External Acceptance Advice。
只有当 review 记录 `Status: Reviewed`、`Recommendation: pass` 且验证全部通过，才可进入 closeout。
```

Current `repo-harness-sprint` skill has the same ambiguity:

```md
assets/skill-commands/repo-harness-sprint/SKILL.md:39
Before closeout, convert discovered edge cases into `commands_succeed` or
`commands_fail` contract gates, then require review `Status: Reviewed`,
`Recommendation: pass`, and passing or constrained manual-override external
acceptance.
```

The repo is Bun-based. Recon commands and expected success surfaces:

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Focused helper tests | `bun test tests/helper-scripts.test.ts --test-name-pattern "verify-contract"` | exit 0 |
| Workflow parser tests | `bun test tests/workflow-state-lib.test.ts` | exit 0 |
| Template/docs tests | `bun test tests/bootstrap-files.test.ts tests/readme-dx.test.ts tests/workflow-contract.test.ts` | exit 0 |
| Syntax | `bash -n scripts/verify-contract.sh assets/templates/helpers/verify-contract.sh scripts/verify-sprint.sh assets/templates/helpers/verify-sprint.sh assets/hooks/lib/workflow-state.sh scripts/ensure-task-workflow.sh assets/templates/helpers/ensure-task-workflow.sh scripts/plan-to-todo.sh assets/templates/helpers/plan-to-todo.sh scripts/lib/project-init-lib.sh` | exit 0 |
| Full tests | `bun test` | exit 0 |
| Release gate | `bun run check:release` | exit 0 |

## Scope

**In scope**:

- Add an early guard in `scripts/verify-contract.sh` and
  `assets/templates/helpers/verify-contract.sh` that rejects meta workflow
  commands in both `commands_succeed` and `commands_fail` before `bash -lc`
  runs them.
- Improve `manual_checks` unsupported/deprecated failure messages so they list
  the supported enum and tell agents to put custom human assertions in
  `Acceptance Notes` or the review file.
- Normalize `P1 blockers` values enough to accept common non-semantic variants
  such as `None`, `none.`, and `None.` as `none`, while still rejecting any
  actual blocker text. Do not broaden `External Source`; keep
  `manual-override` as the explicit enum.
- Improve external-acceptance failure text so it prints exact expected values
  for manual override.
- Update generated templates and docs to separate task-local machine commands,
  outer workflow/closeout gates, fixed enum checks, and free-form human
  evidence.
- Add regression tests for both bugs.
- Prepare 0.5.17 release metadata by bumping `package.json`,
  `assets/skill-version.json`, the CLI bootstrap package example, and the
  README current-version text from 0.5.16 to 0.5.17 after implementation tests
  pass. Do not publish to npm in this plan.

**Out of scope**:

- Do not redesign the contract YAML format into a full schema language.
- Do not make `manual_checks` a general-purpose free-form checklist.
- Do not change the meaning of `commands_succeed` or `commands_fail` for normal
  task-local commands.
- Do not change `verify-sprint` closeout semantics beyond clearer diagnostics
  and the P1 blocker normalization described here.
- Do not implement automatic repair for old contract worktrees.
- Do not publish the npm package.

## Git workflow

- Branch: `codex/strict-contract-schema-dx`
- Commit style: follow the existing history, for example
  `fix: hydrate contract worktree local context` or
  `docs: refine sprint row closeout checks`.
- Do not push, merge, or publish unless the operator explicitly asks.

## Steps

### Step 1: Add a meta workflow command detector to contract verification

In `scripts/verify-contract.sh`, add a helper near the existing parsing and
execution helpers. Mirror the exact same helper into
`assets/templates/helpers/verify-contract.sh`.

The helper should classify commands as forbidden when they invoke repo-harness
workflow/meta gates rather than task-local acceptance checks. Cover at least
these shapes:

- `bash scripts/verify-sprint.sh`
- `scripts/verify-sprint.sh`
- `./scripts/verify-sprint.sh`
- `local-repo-harness run verify-sprint`
- `./.ai/harness/bin/local-repo-harness run verify-sprint`
- `bash scripts/check-task-workflow.sh --strict`
- `scripts/check-task-workflow.sh --strict`
- `local-repo-harness run check-task-workflow`
- `./.ai/harness/bin/local-repo-harness run check-task-workflow`
- `local-repo-harness sprint execute-approved ...`
- `local-repo-harness sprint next ...`
- `bash scripts/contract-worktree.sh finish`
- `local-repo-harness run contract-worktree finish`

Use conservative string/regex matching; do not parse shell ASTs. The rule is
not a security sandbox, it is a recursion and DX guard. Avoid broad matches
that would reject innocent commands containing the words in comments or file
names.

When a forbidden command is found in `commands_succeed` or `commands_fail`, do
not execute it. Record a normal contract failure with a clear message such as:

```text
commands_succeed unsupported meta workflow command: <cmd> (run verify-sprint and closeout workflow checks outside exit_criteria)
```

Keep the result kind as `commands_succeed` or `commands_fail` so existing JSON
consumers still see a contract criterion failure.

**Verify**:

```bash
bash -n scripts/verify-contract.sh assets/templates/helpers/verify-contract.sh
```

Expected: exit 0.

### Step 2: Add regression tests for recursive/meta command rejection

In `tests/helper-scripts.test.ts`, add focused tests next to the existing
`verify-contract` tests around lines 2713-2835.

Create a temporary contract with:

```yaml
exit_criteria:
  commands_succeed:
    - ./.ai/harness/bin/local-repo-harness run verify-sprint
```

Assert:

- `bash scripts/verify-contract.sh --contract task.contract.md --strict --report-file report.json`
  exits 1.
- stdout contains `unsupported meta workflow command`.
- `report.json` contains `"kind":"commands_succeed"` and `"passed":false`.
- The command returns promptly. If the test runner supports a timeout in
  `spawnSync`, use a short timeout so a regression cannot hang the suite.

Add a second case for `commands_fail` with:

```yaml
exit_criteria:
  commands_fail:
    - bash scripts/verify-sprint.sh
```

Expected: it also exits 1 without running the nested verifier.

**Verify**:

```bash
bun test tests/helper-scripts.test.ts --test-name-pattern "meta workflow command"
```

Expected: exit 0 and both new tests pass.

### Step 3: Make strict `manual_checks` behavior self-explanatory

In `scripts/verify-contract.sh` and
`assets/templates/helpers/verify-contract.sh`, keep the supported
`manual_checks` enum narrow:

- supported: `"Evaluator review file is terminal pass"`
- deprecated: `"Evaluator review file recommends pass"`
- unsupported: everything else

Do not accept arbitrary custom text in `manual_checks`.

Improve failure messages:

- Deprecated value should say it is deprecated and give the replacement.
- Unsupported value should say:

```text
manual_checks unsupported: <value>. Supported manual_checks values: "Evaluator review file is terminal pass". Put custom human assertions in Acceptance Notes or the review file, not exit_criteria.manual_checks.
```

Add a regression test in `tests/helper-scripts.test.ts` that writes a contract
with:

```yaml
manual_checks:
  - "Retained smoke is not copied from fixture"
```

and asserts strict verification fails with the supported-values message.

**Verify**:

```bash
bun test tests/helper-scripts.test.ts --test-name-pattern "manual_checks"
```

Expected: exit 0; existing manual-check behavior still passes for
`Evaluator review file is terminal pass` when the review is `Reviewed/pass`.

### Step 4: Normalize P1 blocker spelling for manual override, but keep enums explicit

In `assets/hooks/lib/workflow-state.sh`, add a small normalization helper near
`workflow_manual_override_placeholder`, for example:

```bash
workflow_normalize_none_value() {
  printf '%s' "${1:-}" |
    sed -E 's/^[[:space:]]+//; s/[[:space:]]+$//; s/[.。]+$//' |
    tr '[:upper:]' '[:lower:]'
}
```

Use it only for P1 blocker comparison in
`workflow_external_acceptance_status`. Preserve the raw value in error messages
when the normalized value is not `none`.

Expected behavior:

- `- P1 blockers: none` passes.
- `- P1 blockers: None` passes.
- `- P1 blockers: none.` passes.
- `- P1 blockers: None.` passes.
- `- P1 blockers: release regression` fails.
- missing P1 blockers still fails for manual override.
- `External Source` still requires the explicit enum `manual-override`.

Update `tests/workflow-state-lib.test.ts` to cover `None.` for both normal pass
and manual override. Keep the existing failure expectations for real blockers.

**Verify**:

```bash
bun test tests/workflow-state-lib.test.ts
```

Expected: exit 0.

### Step 5: Update templates and generated copies to express the schema boundary

Update all contract template sources in scope:

- `assets/templates/contract.template.md`
- `scripts/lib/project-init-lib.sh`
- `scripts/ensure-task-workflow.sh`
- `assets/templates/helpers/ensure-task-workflow.sh`
- `scripts/plan-to-todo.sh`
- `assets/templates/helpers/plan-to-todo.sh`

Template guidance should say:

- `commands_succeed` and `commands_fail` are for task-local commands only.
- Do not place `verify-sprint`, `check-task-workflow`, `contract-worktree
  finish`, `sprint execute-approved`, or other repo workflow/closeout commands
  inside `exit_criteria`.
- Run outer workflow gates after contract verification and record their results
  in review/notes/checks, not inside the contract command list.
- `manual_checks` is a verifier-owned enum. Keep only
  `"Evaluator review file is terminal pass"` unless the verifier code adds a
  new supported value.
- Custom human assertions belong in `Acceptance Notes` or the review file.

Update review template sources in the same generated locations. Review guidance
should include this exact manual-override recipe:

```md
Manual override must use exactly:
> **External Acceptance**: manual_override
> **External Source**: manual-override
- P1 blockers: none
- Manual Override: <concrete reason>
```

Keep `Status: Pending` and `Recommendation: fail` as initial template defaults.

**Verify**:

```bash
bash -n scripts/lib/project-init-lib.sh scripts/ensure-task-workflow.sh assets/templates/helpers/ensure-task-workflow.sh scripts/plan-to-todo.sh assets/templates/helpers/plan-to-todo.sh
```

Expected: exit 0.

### Step 6: Update docs and action-command guidance

Update `assets/skill-commands/repo-harness-sprint/SKILL.md` and
`QUICK_START.md` so the Sprint row execution prompt cannot be interpreted as
"put all checks into `commands_succeed`".

The Step 2 wording should say:

- Contract `commands_succeed` / `commands_fail` should contain row acceptance
  commands and task-local edge cases.
- Do not put repo workflow/meta commands such as `verify-sprint`,
  `check-task-workflow --strict`, or `contract-worktree finish` into
  `commands_succeed` or `commands_fail`.
- Run those workflow commands separately after the review is terminal pass.
- `manual_checks` supports only the documented enum. Use review notes for
  custom manual claims.

Update the cross-review section in `QUICK_START.md` if needed so the manual
override exact recipe remains visible.

Update `README.md` current version text from `0.5.16` to `0.5.17` only after
the implementation is complete and tests are passing. If the operator decides
not to bump in this implementation PR, leave README/package version changes
out and report that release prep is pending.

**Verify**:

```bash
bun test tests/readme-dx.test.ts
```

Expected: exit 0.

### Step 7: Add template parity tests

Extend existing tests rather than adding a new test runner:

- In `tests/bootstrap-files.test.ts`, assert
  `assets/templates/contract.template.md` contains the "task-local commands"
  warning and the supported manual-check enum guidance.
- In `tests/bootstrap-files.test.ts` or `tests/workflow-contract.test.ts`, assert
  the generated helper/template surface still includes `commands_fail`.
- In `tests/readme-dx.test.ts`, assert `QUICK_START.md` warns that
  `verify-sprint` is an outer workflow gate, not a contract command.

If existing tests already cover similar template text, extend those test cases
instead of creating brittle duplicate tests.

**Verify**:

```bash
bun test tests/bootstrap-files.test.ts tests/readme-dx.test.ts tests/workflow-contract.test.ts
```

Expected: exit 0.

### Step 8: Run focused and full verification

Run:

```bash
bash -n scripts/verify-contract.sh assets/templates/helpers/verify-contract.sh scripts/verify-sprint.sh assets/templates/helpers/verify-sprint.sh assets/hooks/lib/workflow-state.sh scripts/ensure-task-workflow.sh assets/templates/helpers/ensure-task-workflow.sh scripts/plan-to-todo.sh assets/templates/helpers/plan-to-todo.sh scripts/lib/project-init-lib.sh
bun test tests/helper-scripts.test.ts --test-name-pattern "verify-contract"
bun test tests/workflow-state-lib.test.ts
bun test tests/bootstrap-files.test.ts tests/readme-dx.test.ts tests/workflow-contract.test.ts
bun test
bun run check:release
```

Expected:

- all commands exit 0;
- no test hangs on recursive `verify-sprint`;
- `check:release` exits 0.

If `bun run check:release` is too slow in a delegated executor environment,
run `bun test` plus the focused commands, then stop and report the skipped
release gate explicitly. Do not claim release readiness without it.

### Step 9: Prepare 0.5.17 version metadata

Only after Steps 1-8 pass, bump:

- `package.json` version: `0.5.16` -> `0.5.17`
- `assets/skill-version.json` `version` and `templateVersion`: `0.5.16` ->
  `0.5.17`
- `src/cli/index.ts` bootstrap package example: `local-repo-harness@0.5.16` ->
  `local-repo-harness@0.5.17`
- `README.md` current version text: `local-repo-harness@0.5.16` ->
  `local-repo-harness@0.5.17`

Do not change package name, bin aliases, or npm publish settings. Do not run
`npm publish`.

**Verify**:

```bash
rg -n '"version": "0.5.17"|local-repo-harness@0.5.17' package.json assets/skill-version.json README.md src/cli/index.ts
bun run check:release
```

Expected: both version strings are present and release gate exits 0.

## Test plan

Add or update tests for these exact cases:

- `verify-contract` rejects a `commands_succeed` entry that invokes
  `verify-sprint`, and it does not hang.
- `verify-contract` rejects a `commands_fail` entry that invokes
  `verify-sprint`, and it does not hang.
- `verify-contract` unsupported `manual_checks` output lists the supported enum
  and points custom evidence to Acceptance Notes/review.
- `workflow_external_acceptance_status` accepts `P1 blockers: None.` as no
  blockers for both normal external acceptance and constrained manual override.
- `workflow_external_acceptance_status` still rejects real blocker text and
  wrong manual-override source.
- Templates/docs contain the task-local vs workflow-meta boundary.

Use existing test files as patterns:

- command-verifier fixture style:
  `tests/helper-scripts.test.ts:2713-2835`
- external acceptance parser style:
  `tests/workflow-state-lib.test.ts:46-144`
- docs/template assertion style:
  `tests/bootstrap-files.test.ts`, `tests/readme-dx.test.ts`,
  `tests/workflow-contract.test.ts`

## Done criteria

All must hold:

- [ ] `commands_succeed` and `commands_fail` reject documented workflow/meta
      commands before execution.
- [ ] A contract containing `verify-sprint` inside `commands_succeed` fails
      promptly with a clear unsupported-meta-command message.
- [ ] `manual_checks` remains a fixed enum and unsupported values produce an
      actionable supported-values message.
- [ ] `P1 blockers: None.` is accepted as equivalent to `none`; real blocker
      text is still rejected.
- [ ] Templates and docs distinguish task-local contract commands from outer
      workflow checks.
- [ ] `package.json`, `assets/skill-version.json`, CLI help text, and README
      version text are bumped to 0.5.17 when release prep is included.
- [ ] Focused tests, `bun test`, and `bun run check:release` pass.
- [ ] No source files outside the in-scope list are modified.
- [ ] `plans/README.md` status row for plan 016 is updated if the executor was
      responsible for index maintenance.

## STOP conditions

Stop and report back without improvising if:

- The live verifier no longer resembles the excerpts above.
- Adding the meta-command guard would require shell AST parsing or a large
  command execution rewrite.
- A normal task-local command is rejected by the new guard in tests.
- Fixing manual override would require accepting ambiguous `External Source`
  values instead of keeping the explicit `manual-override` enum.
- Generated helper copies cannot be kept in sync with root scripts.
- `check:release` fails for reasons unrelated to this plan and cannot be
  resolved with an in-scope change.

## Maintenance notes

- Future contract criteria should decide whether they are machine enum fields,
  task-local command fields, or human evidence fields. Do not mix those roles.
- Reviewers should scrutinize the meta-command detector for false positives:
  it must block recursive workflow gates without turning `commands_succeed` into
  a broad shell policy engine.
- Keep root scripts and `assets/templates/helpers/*` copies synchronized. A
  downstream project-scoped install may execute the packaged helper copy.
- If future workflow checks need to be recorded in a structured place, add a
  separate `workflow_checks`/`closeout_checks` field instead of overloading
  `commands_succeed`.
