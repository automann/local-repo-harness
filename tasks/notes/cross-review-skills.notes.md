# cross-review-skills — slice notes

Bootstrap self-contained cross-model review skills at `repo-harness init` and add
an advisory hook that lets the agent decide when to fetch an outside opinion.

Plan: `~/.claude/plans/vibe-coding-claude-code-codex-shimmying-balloon.md`.

## Non-obvious decisions

- **Mechanism = peer CLI subprocess, not MCP.** `claude mcp serve` only exposes
  Claude Code's *tools* to the client (verified against the official docs), so it
  is not a reviewer — the article's reverse `codex mcp add claude -- claude mcp serve`
  recipe is asymmetric. Reviews run via `codex exec -s read-only` / `claude -p`
  (read-only, verbatim), the approach gstack already proved.
- **Harness-native + self-contained, no gstack dependency.** gstack's `codex`/`claude`
  skills hard-depend on the gstack `bin/` runtime, so they cannot be `cpSync`'d like
  `diagram-design` or cherry-picked via `skills add`. Auto-installing gstack would
  violate `docs/reference-configs/external-tooling.md` ("must not silently install
  unrelated toolchains"). So the harness ships its own zero-dependency SKILL.md
  pair under `assets/skills/` — a workflow-owned runtime skill, distributable via npx.
- **Host-asymmetric install + collision-safe names.** `codex-review` installs only
  into `~/.claude/skills` (Claude → Codex); `claude-review` only into `~/.codex/skills`
  (Codex → Claude). Names deliberately differ from gstack's `codex`/`claude` skills so
  both can coexist; when gstack is present its `/codex` + `gstack-claude` are the superset.
- **Idempotency by content.** `syncCrossReviewSkills` compares `SKILL.md` contents and
  reports `already present` (a bit stronger than `syncDiagramDesign`'s symlink-only skip);
  a missing bundled source is `skipped`, never `failed`, so init stays resilient.
- **Hook delivery is host-split because of `run-hook.sh:26`.** On the Codex host the
  dispatcher swallows a hook's success stdout (only surfaces on failure), so the
  `[CrossReview]` lines `prompt-guard.sh` emits never reach Codex. Claude gets the
  per-moment nudges via `prompt-guard.sh` (review/release branch → `codex-review`,
  bug-fix branch → debug hint); Codex gets a one-time availability note via
  `session-start-context.sh` (the only hook that runs normally on Codex), gated to
  `HOOK_HOST=codex` → `claude-review`. Advisory only; the agent decides.

## Deviation from plan

- **Deferred** the edit-driven `cross-review-advisory.sh` on `PostToolUse:edit` (the
  spec/test-written moment) and its `route-registry.ts` wiring. The prompt-guard
  review/debug branches plus the Codex session-start note already cover the
  highest-value moments (pre-merge, debug, availability) by reusing the tested intent
  classifier with minimal new surface. The edit-driven script adds a new route script,
  assets↔.ai parity, and a new hook body — tracked as a follow-up, not shipped here.

## Verification

- `bun test tests/cli/init.test.ts tests/hook-runtime.test.ts tests/hook-contracts.test.ts`
  → 93 pass. Full `bun test` → 466 pass; the 4 "fails" are codegraph-subprocess
  timeout flakes under parallel load (each passes in isolation), not regressions.
