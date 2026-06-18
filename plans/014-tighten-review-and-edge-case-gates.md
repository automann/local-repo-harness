# Plan 014: Tighten review and edge-case gates

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report; do not improvise. When done, update the status row for this plan in
> `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 966024e..HEAD -- scripts/verify-sprint.sh assets/templates/helpers/verify-sprint.sh scripts/verify-contract.sh assets/templates/helpers/verify-contract.sh assets/hooks/lib/workflow-state.sh assets/hooks/prompt-guard.sh scripts/ship-worktrees.sh assets/templates/helpers/ship-worktrees.sh assets/templates/review.template.md .claude/templates/review.template.md assets/templates/contract.template.md .claude/templates/contract.template.md scripts/plan-to-todo.sh assets/templates/helpers/plan-to-todo.sh scripts/ensure-task-workflow.sh assets/templates/helpers/ensure-task-workflow.sh scripts/lib/project-init-lib.sh assets/skill-commands/repo-harness-sprint/SKILL.md QUICK_START.md tests/helper-scripts.test.ts tests/bootstrap-files.test.ts tests/workflow-contract.test.ts tests/readme-dx.test.ts`
>
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding. On a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: HIGH
- **Depends on**: plans/013-canonical-sprint-row-execution-entrypoint.md
- **Category**: bug | dx | tests
- **Planned at**: commit `966024e`, 2026-06-19

## Why this matters

Plan 013 made Sprint row execution easier to discover, but the downstream
0.5.14 Sprint row run exposed a different class of failure: the workflow can
close a row even when the review artifact is still semantically unfinished and
important edge cases only live in human notes.

The row 1 incident was not mainly a `swarm-discussion-codex` implementation
bug from local-repo-harness' point of view. The downstream wrapper/runtime bugs
belong in the downstream project and runtime package. The local-repo-harness
problem is that its gates let the row escape:

- A review file with `> **Status**: Pending` could still satisfy
  `verify-sprint.sh` if `> **Recommendation**: pass` was present.
- A manual external-acceptance override could bypass normal reviewer/source and
  blocker checks too broadly.
- Contract verification has no first-class negative command gate, so expected
  failure cases such as "blank runtime must fail cleanly" or "explicit runtime
  path must not silently fall back" are easy to leave as prose instead of
  machine-enforced acceptance.

After this plan lands, one Sprint backlog row should map to one
`plan -> contract -> worktree -> verify` cycle that cannot pass unless the
review artifact has a terminal status, external acceptance is either a real
pass or a constrained override, and known P1/P2 edge cases are represented in
machine gates or explicitly recorded as residual risk.

## Current state

Relevant files and roles:

- `scripts/verify-sprint.sh` and
  `assets/templates/helpers/verify-sprint.sh` - Sprint closeout gate.
- `scripts/verify-contract.sh` and
  `assets/templates/helpers/verify-contract.sh` - task contract verification
  gate.
- `assets/hooks/lib/workflow-state.sh` - shared workflow artifact parsing,
  including review and external acceptance helpers.
- `assets/hooks/prompt-guard.sh` - prompt-time enforcement and guidance.
- `scripts/ship-worktrees.sh` and
  `assets/templates/helpers/ship-worktrees.sh` - fallback worktree shipping
  checks.
- `assets/templates/review.template.md`,
  `.claude/templates/review.template.md`,
  `assets/templates/contract.template.md`,
  `.claude/templates/contract.template.md`,
  `scripts/plan-to-todo.sh`,
  `assets/templates/helpers/plan-to-todo.sh`,
  `scripts/ensure-task-workflow.sh`,
  `assets/templates/helpers/ensure-task-workflow.sh`, and
  `scripts/lib/project-init-lib.sh` - distributed/generated review and contract
  templates that must stay in sync.
- `assets/skill-commands/repo-harness-sprint/SKILL.md` and `QUICK_START.md` -
  agent/user workflow instructions.
- `tests/helper-scripts.test.ts`, `tests/bootstrap-files.test.ts`,
  `tests/workflow-contract.test.ts`, and `tests/readme-dx.test.ts` - existing
  regression surfaces for helpers, templates, and docs.

Current Sprint verification treats "review recommends pass" as the whole
review gate:

```sh
scripts/verify-sprint.sh:72-82
review_status="fail"
review_message="Sprint review recommends pass."
if [[ -z "$review_file" || ! -f "$review_file" ]]; then
  review_message="Missing sprint review file."
  echo "Missing sprint review file" >&2
elif grep -Eq '^> \*\*Recommendation\*\*:[[:space:]]*pass([[:space:]]*)$' "$review_file"; then
  review_status="pass"
else
  review_message="Sprint review does not recommend pass."
  echo "Sprint review does not recommend pass" >&2
fi
```

```sh
scripts/verify-sprint.sh:93-98
status="fail"
exit_code=1
if [[ "$contract_exit" -eq 0 && "$review_status" == "pass" ]]; then
  status="pass"
  exit_code=0
fi
```

The generated helper copy in `assets/templates/helpers/verify-sprint.sh` has
the same behavior.

Current contract verification has one review-related manual check, and it only
looks at the recommendation line:

```sh
scripts/verify-contract.sh:88-92
review_recommends_pass() {
  local review_file="$1"
  [[ -n "$review_file" && -f "$review_file" ]] || return 1
  grep -Eq '^> \*\*Recommendation\*\*:[[:space:]]*pass[[:space:]]*$' "$review_file"
}
```

```sh
scripts/verify-contract.sh:534-547
manual_checks)
  local check="${criteria_value:-}"
  if [[ "$check" == "Evaluator review file recommends pass" ]]; then
    ...
    if review_recommends_pass "$review_file"; then
      record_pass "manual_check:$check"
    else
      record_fail "manual_check:$check"
    fi
  fi
  ;;
```

There is no `commands_fail` criterion, only positive command execution checks.

Current external acceptance parsing lets a `Manual Override:` line become the
result before normal external acceptance checks run:

```sh
assets/hooks/lib/workflow-state.sh:1311-1349
manual_override="$(
  printf '%s\n' "$section" |
    sed -nE 's/^-?[[:space:]]*Manual Override:[[:space:]]*([^[:space:]].*)[[:space:]]*$/\1/p' |
    head -n 1 |
    sed -E 's/[[:space:]]+$//'
)"

if [[ -n "$manual_override" ]]; then
  printf 'manual_override\t%s\t%s\tManual override recorded for external acceptance: %s\n' "${reviewer:--}" "${source:--}" "$manual_override"
  return 0
fi
```

Normal external acceptance pass is stricter and checks status, expected
reviewer/source, and P1 blockers:

```sh
assets/hooks/lib/workflow-state.sh:1359-1379
if [[ "$external_status" != "pass" ]]; then
  printf 'fail\t%s\t%s\tExternal Acceptance is %s\n' "${reviewer:--}" "${source:--}" "$external_status"
  return 1
fi
...
p1_blockers="$(workflow_external_acceptance_field "$review_file" "P1 blockers")"
if [[ -n "$p1_blockers" && "$p1_blockers" != "none" ]]; then
  printf 'fail\t%s\t%s\tExternal acceptance has P1 blockers: %s\n' "$reviewer" "$source" "$p1_blockers"
  return 1
fi
```

The prompt guard currently tells agents that an unavailable external result can
be overridden by a concrete `Manual Override` line:

```sh
assets/hooks/prompt-guard.sh:711-727
External review status requirements:
...
If the required external review is unavailable, it does not satisfy external
acceptance unless the review file records a concrete `Manual Override:` reason.
```

Current contract templates still define the completion gate as review
recommendation plus external acceptance or manual override:

```md
assets/templates/contract.template.md:29
- Completion gate: `scripts/verify-sprint.sh` must see this contract pass, the review recommend pass, and `## External Acceptance Advice` pass or record a manual override.
```

```md
assets/templates/contract.template.md:80-81
  manual_checks:
    - "Evaluator review file recommends pass"
```

Current tests encode the weaker behavior. For example, the happy-path
`verify-sprint` test writes a review with a pass recommendation and external
acceptance, but no terminal review status:

```ts
tests/helper-scripts.test.ts:2715-2774
const review = [
  '# Sprint Review',
  '',
  '> **Recommendation**: pass',
  ...
].join('\n');
...
expect(result.status).toBe(0);
```

## Desired behavior

1. `verify-sprint.sh` must require both:
   - `> **Recommendation**: pass`
   - a terminal review status, not `Pending`

2. The canonical terminal status should be explicit and documented. Use
   `Reviewed` as the default template value for a completed passing review.
   The gate may accept a small backwards-compatible set of terminal synonyms
   only if tests document them, for example `Reviewed`, `Accepted`, `Passed`,
   or `Complete`. It must reject missing status, blank status, and `Pending`.

3. JSON output should remain backwards-compatible where possible. Keep the
   existing `review.status` pass/fail gate result if public tests depend on it,
   but add structured review metadata such as:

   ```json
   {
     "review": {
       "status": "fail",
       "metadata_status": "Pending",
       "recommendation": "pass",
       "message": "Sprint review status is Pending; expected Reviewed."
     }
   }
   ```

   If the implementation chooses a slightly different field name, tests must
   pin it and docs must describe it.

4. Contract verification must stop treating
   `"Evaluator review file recommends pass"` as sufficient. Replace it with a
   stricter manual check, for example:

   ```yaml
   manual_checks:
     - "Evaluator review file is terminal pass"
   ```

   The stricter check must require recommendation pass and terminal review
   status. Existing generated templates and inline copies must be updated
   together.

5. Manual external-acceptance override must be constrained. A manual override
   can satisfy closeout only when all of these are true:
   - `External Acceptance: manual_override`
   - `External Source: manual-override`
   - `Manual Override:` is non-empty and not a placeholder such as `n/a`,
     `none`, `todo`, or `...`
   - `P1 blockers: none`

   Do not let an arbitrary `Manual Override:` line bypass normal pass checks.
   The override result should remain visible as `manual_override`, not be
   collapsed into a normal external `pass`.

6. Add a first-class negative command gate to contract verification:

   ```yaml
   commands_fail:
     - "command that is expected to exit non-zero"
   ```

   `commands_fail` passes only when the command exits non-zero. It fails if the
   command exits zero or cannot be launched in a way that makes the failure
   meaningful. It must be reported separately from `commands_succeed` in
   human-readable output and JSON output.

7. Update templates and workflow instructions so agents represent known edge
   cases as contract gates instead of review prose:
   - expected success paths go in `commands_succeed`
   - expected failure paths go in `commands_fail`
   - unavoidable ungated risk goes in `## Residual Risk`, with an explicit
     reason

8. Keep implementation scoped to local-repo-harness governance gates. Do not
   fix downstream `swarm-discussion-codex` wrapper bugs, runtime package bugs,
   or CodeGraph/runtime install behavior in this plan.

## Implementation steps

### 1. Add shared review parsing semantics

- Introduce a small shell helper in `assets/hooks/lib/workflow-state.sh` for
  parsing review metadata:
  - recommendation value
  - status value
  - terminal-pass boolean
  - human-readable failure message
- Reuse the helper in `scripts/verify-sprint.sh`,
  `assets/templates/helpers/verify-sprint.sh`,
  `scripts/verify-contract.sh`, and
  `assets/templates/helpers/verify-contract.sh`.
- Keep parsing line-oriented and dependency-free. Do not add `jq`, `yq`, Node,
  or Bun requirements to shell helpers for this change.
- Make missing review file, missing status, `Pending`, non-pass
  recommendation, and unknown terminal status produce distinct messages.

### 2. Tighten Sprint closeout gate

- Update `scripts/verify-sprint.sh` and the generated helper copy so Sprint
  closeout fails unless the review is a terminal pass.
- Preserve existing contract-verification behavior except for the stricter
  review gate.
- Update JSON output to expose the parsed review status and recommendation.
- Add regression tests in `tests/helper-scripts.test.ts`:
  - `Status: Reviewed` plus `Recommendation: pass` passes when the contract
    passes.
  - `Status: Pending` plus `Recommendation: pass` fails.
  - missing status plus `Recommendation: pass` fails.
  - `Status: Reviewed` plus `Recommendation: fail` fails.
  - JSON output includes enough review metadata to diagnose the failure.

### 3. Tighten contract review manual checks

- Update `scripts/verify-contract.sh` and
  `assets/templates/helpers/verify-contract.sh`:
  - keep supporting the old string
    `"Evaluator review file recommends pass"` only as a failing/deprecated
    check, or migrate generated contracts so new contracts use the new string.
  - implement the new string
    `"Evaluator review file is terminal pass"`.
- Prefer failing old contracts loudly with an actionable message over silently
  accepting recommendation-only checks.
- Add tests in `tests/helper-scripts.test.ts`:
  - new manual check passes only with terminal review status and pass
    recommendation.
  - old manual check no longer gives a false pass.
  - failure output points at the review status/recommendation issue.

### 4. Constrain manual external-acceptance override

- Update `assets/hooks/lib/workflow-state.sh` so a `Manual Override:` line is
  considered only when `External Acceptance: manual_override` is also present.
- Require `External Source: manual-override`, `P1 blockers: none`, and a
  concrete non-placeholder override reason.
- Update `assets/hooks/prompt-guard.sh` to describe the stricter override
  shape. The prompt should make clear that manual override is an explicit
  operator escape hatch, not a substitute for an unavailable external review.
- Update `scripts/ship-worktrees.sh` and
  `assets/templates/helpers/ship-worktrees.sh` fallback logic so it uses the
  same constrained manual-override semantics instead of accepting
  `External Acceptance: manual_override` too broadly.
- Add tests:
  - manual override with `P1 blockers: none`, source `manual-override`, and a
    concrete reason passes the external acceptance helper.
  - manual override with P1 blockers fails.
  - manual override without explicit `External Acceptance: manual_override`
    fails.
  - manual override with placeholder reason fails.

### 5. Add `commands_fail` contract criteria

- Extend `scripts/verify-contract.sh` and
  `assets/templates/helpers/verify-contract.sh` to parse `commands_fail` as a
  list sibling of `commands_succeed`.
- Implement execution semantics:
  - command exits non-zero: record pass
  - command exits zero: record fail
  - command is blank: record fail
  - shell launch error: record fail with stderr context
- Report `commands_fail` entries with a distinct label, for example
  `commands_fail:<command>`, in both text and JSON output.
- Add tests:
  - `commands_fail: ["false"]` passes.
  - `commands_fail: ["true"]` fails.
  - mixed `commands_succeed` and `commands_fail` produce the expected total
    pass/fail status.

### 6. Update templates and generated copies

Update every distributed or inline template copy, not just the visible template
files:

- `assets/templates/review.template.md`
- `.claude/templates/review.template.md`
- `assets/templates/contract.template.md`
- `.claude/templates/contract.template.md`
- `scripts/plan-to-todo.sh`
- `assets/templates/helpers/plan-to-todo.sh`
- `scripts/ensure-task-workflow.sh`
- `assets/templates/helpers/ensure-task-workflow.sh`
- `scripts/lib/project-init-lib.sh`

Required template changes:

- Make the review template describe `Status: Pending` as initial state and
  `Status: Reviewed` as the required completed state.
- Change contract completion-gate wording from "review recommend pass" to
  "review status is terminal and recommendation is pass".
- Replace the default manual check string with
  `"Evaluator review file is terminal pass"`.
- Add a `commands_fail: []` placeholder or nearby comment if it fits the
  existing contract schema style.
- Add concise guidance that P1/P2 edge cases should become `commands_succeed`
  or `commands_fail` entries, and only ungated risk belongs in residual risk.

### 7. Update workflow docs and skill wording

- Update `assets/skill-commands/repo-harness-sprint/SKILL.md` so the Sprint
  closeout instructions say:
  - one backlog row closes only after terminal review status, pass
    recommendation, external acceptance, and strict verification
  - manual override must use the constrained explicit shape
  - edge cases discovered during planning or review must be added to the row
    contract before closeout
- Update `QUICK_START.md` only where needed. Keep it operational and avoid
  re-explaining every helper internals detail.

### 8. Verify against the incident shape

Add a focused regression fixture or test case that mirrors the failure mode:

- contract verification passes
- review contains `> **Status**: Pending`
- review contains `> **Recommendation**: pass`
- external acceptance appears successful or manually overridden

Expected result: `verify-sprint.sh` exits non-zero, JSON status is `fail`, and
the message identifies non-terminal review status.

This test is the core acceptance gate for the plan.

## Verification

Run these commands from the repository root:

```sh
bash -n scripts/verify-sprint.sh scripts/verify-contract.sh assets/templates/helpers/verify-sprint.sh assets/templates/helpers/verify-contract.sh assets/hooks/lib/workflow-state.sh assets/hooks/prompt-guard.sh scripts/ship-worktrees.sh assets/templates/helpers/ship-worktrees.sh scripts/plan-to-todo.sh assets/templates/helpers/plan-to-todo.sh scripts/ensure-task-workflow.sh assets/templates/helpers/ensure-task-workflow.sh scripts/lib/project-init-lib.sh
```

Expected: exit code 0.

```sh
bun test tests/helper-scripts.test.ts
```

Expected: exit code 0, including new tests for terminal review status,
manual override constraints, and `commands_fail`.

```sh
bun test tests/bootstrap-files.test.ts tests/workflow-contract.test.ts tests/readme-dx.test.ts
```

Expected: exit code 0.

```sh
bun run check:task-workflow
bun run check:runtime-compat
bun run check:release
```

Expected: each exits 0. If `check:release` is too slow in a delegated
environment, run the focused commands above plus the most specific failing
release subcheck, then report the skipped release gate explicitly.

## Acceptance criteria

- A review file with `Status: Pending` and `Recommendation: pass` cannot pass
  `verify-sprint.sh`.
- A review file with missing status and `Recommendation: pass` cannot pass
  `verify-sprint.sh`.
- A review file with terminal status and `Recommendation: pass` can pass when
  all other Sprint gates pass.
- Contract manual checks require terminal review status, not only pass
  recommendation.
- Manual external acceptance override requires explicit
  `External Acceptance: manual_override`, `External Source: manual-override`,
  `P1 blockers: none`, and a concrete non-placeholder reason.
- `commands_fail` exists and is tested as a first-class contract criterion.
- All review/contract templates and inline generated copies use the same gate
  language and default manual check string.
- Docs and `repo-harness-sprint` instructions tell agents to convert discovered
  edge cases into contract gates before closing the row.
- No downstream project files or runtime package files are changed as part of
  this plan.

## STOP conditions

- Any in-scope file changed after commit `966024e` in a way that invalidates
  the current-state excerpts.
- Review metadata parsing requires a new runtime dependency or a parser rewrite
  larger than this plan's shell-helper scope.
- Tightening the JSON shape would break existing public consumers without a
  backwards-compatible field or migration path.
- Existing generated templates diverge so much that updating all copies would
  require redesigning project initialization.
- Implementing `commands_fail` cannot be done without making command execution
  semantics inconsistent with existing `commands_succeed`.
- Tests show that current workflows depend on accepting `Status: Pending` as a
  passing review state. Treat that as a product decision requiring user review,
  not as a compatibility reason to keep the bug.

## Out of scope

- Fixing downstream `swarm-discussion-codex` wrapper/runtime bugs.
- Fixing `swarm-discussion-runtime` fixture or command-surface drift.
- Redesigning Sprint backlog schema or adding autonomous Sprint goal mode.
- Changing project-scoped install/bootstrap behavior.
- Changing CodeGraph, gbrain, Waza, Mermaid, or cross-review installation
  behavior.
- Replacing shell helpers with TypeScript helpers.
