> **Archived**: 2026-06-12 04:33
> **Related Plan**: plans/archive/plan-20260612-0350-loop-engine-02-routing-ab-eval.md
> **Outcome**: Completed
> **Lifecycle**: notes
> **Parent Run ID**: run-20260612-0433

# Implementation Notes: loop-engine-02-routing-ab-eval

> **Status**: Active
> **Plan**: plans/plan-20260612-0350-loop-engine-02-routing-ab-eval.md
> **Contract**: tasks/contracts/20260612-0350-loop-engine-02-routing-ab-eval.contract.md
> **Review**: tasks/reviews/20260612-0350-loop-engine-02-routing-ab-eval.review.md
> **Last Updated**: 2026-06-12 03:50
> **Lifecycle**: notes

## Design Decisions

- The eval is a shadow comparison only. The A arm calls `runPromptGuardVerdictFromPrompt` with scenario-specific state env, while the B arm is supplied by the benchmark agent from `docs/reference-configs/loop-engine-nl-decision-table.md`.
- The scenario pack hides expected answers; the report generator compares an agent-authored `decisions` array against current expected route behavior and turns missing/mismatched decisions into no-go evidence.
- Token delta is an approximate per-prompt comparison of snapshot+NL-table bytes against the current TS verdict JSON. It is a screening metric, not a billing ledger.
- The benchmark grader validates report shape and metrics, not mandatory `go`. A no-go report is still useful proof-point evidence.

## Deviations From Plan Or Spec

- Claude with_skill non-dry-run could not be completed in this session because Claude Code returned a session-limit error. The sprint owner later explicitly instructed this Goal to skip Claude verification and continue, so Codex with_skill evidence is accepted for row 2 closeout.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Change runtime prompt-guard routing now | Rejected | Row 2 is evidence-only; runtime behavior belongs to row 3/7 gates. |
| Require `go` in benchmark grader | Rejected | The sprint needs decisive evidence; no-go must be representable as a passing benchmark artifact. |
| Put reports under tracked source | Rejected | `.ai/harness/runs/` is the established ignored run-snapshot surface. |

## Open Questions

- Optional: rerun Claude with_skill route eval after the session limit resets for cross-agent confidence, but it is no longer a blocking gate in this Goal.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Codex benchmark manifest: `/Users/chris/Projects/repo-harness-workspace/iteration-20260612-040450-route-nl-vs-ts-codex/manifest.json`
- Codex route report: `/Users/chris/Projects/repo-harness-workspace/iteration-20260612-040450-route-nl-vs-ts-codex/codex/with_skill/route-nl-vs-ts/.ai/harness/runs/route-nl-vs-ts-report.json`
- Claude benchmark manifest: `/Users/chris/Projects/repo-harness-workspace/iteration-20260612-040001-route-nl-vs-ts-claude/manifest.json`
- Local run snapshots: `.ai/harness/runs/route-nl-vs-ts-report.json`, `.ai/harness/runs/loop-engine-02-routing-ab-eval.json`

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `tasks/research.md` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.
