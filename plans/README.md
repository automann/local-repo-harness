# Active Improve Plans

Generated and updated by the improve skill on 2026-06-17. This index tracks the
active project-scoped CodeGraph, Bun/Node runtime compatibility,
package-boundary-free project bootstrap, post-0.5.5 real-acceptance diagnostic
cleanup plans, the remaining project-scope doctor readiness cleanup, and the
local-only VCS isolation needed to keep downstream project installs out of
product Git history. Plan 012 narrows that VCS isolation with explicit profiles,
a tracked whitelist, and root `.gitignore` precedence so public downstream
projects do not accidentally treat repo-harness governance as product source.
Older plans in this directory and `plans/archive/` remain historical context
unless a future task explicitly reactivates them.

Execute in the order below unless dependencies say otherwise. Each executor:
read the plan fully before starting, honor its STOP conditions, and update your
row when done.

## Execution order & status

| Plan | Title | Priority | Effort | Depends on | Status |
|------|-------|----------|--------|------------|--------|
| 001 | Make project-scoped CodeGraph independent of target root package.json | P1 | L | - | DONE |
| 002 | Remove stale `repo-harness` fallbacks from generated wrappers | P1 | S | - | DONE (verified 2026-06-16; 26aee5c) |
| 003 | Standardize shell JavaScript runtime invocation | P1 | L | 002 | DONE (verified 2026-06-16; 26aee5c) |
| 004 | Add a runtime compatibility gate | P1 | M | 002, 003 | DONE (verified 2026-06-16; 26aee5c) |
| 005 | Add package-boundary-free project bootstrap for local-repo-harness | P1 | L | 001 | DONE (verified 2026-06-16) |
| 006 | Canonicalize project helper entrypoints | P1 | M | - | DONE (verified 2026-06-16; focused helper/docs/runtime gates) |
| 007 | Clarify helper runtime policy semantics | P1 | M | 006 | DONE (verified 2026-06-16; migration/reclaim/workflow gates) |
| 008 | Clean project-scope external tooling reports | P1 | M | - | DONE (verified 2026-06-16; Waza reporting/generation gates) |
| 009 | Make security scan and doctor scope-aware | P1 | M | 006 | DONE (verified 2026-06-16; scope-aware security/doctor gates) |
| 010 | Make doctor readiness fully project-scope aware | P1 | S | 009 | DONE (verified 2026-06-16; focused, release, and real install gates) |
| 011 | Keep project-scoped installs out of downstream Git history | P1 | L | 005, 009, 010 | DONE (verified 2026-06-17; release gate passed for 0.5.9) |
| 012 | Narrow local-only VCS policy with profiles and tracked whitelist | P1 | L | 011 | DONE (verified 2026-06-18; `check:release` passed for 0.5.11) |

Status values: TODO | IN PROGRESS | DONE | BLOCKED (with one-line reason) | REJECTED (with one-line rationale)

## Dependency notes

- 001 stands alone. It deliberately removes the extra CodeGraph dependency on
  the target repo root package boundary. It does not redesign how
  `local-repo-harness` itself is installed into a project.
- 002 should land before the runtime cleanup because it removes a known stale
  command boundary and keeps downstream wrapper tests focused on
  `local-repo-harness`.
- 003 depends on 002 so Bun/Node behavior is tested through the correct command
  name. It performs the broad script-level cleanup.
- 004 depends on 002 and 003 because the static gate is meant to prevent
  reintroducing patterns that should already have been removed.
- 005 depends on the managed tool-root pattern from 001. It extends that pattern
  from CodeGraph to `local-repo-harness` itself, so a target repo with no root
  `package.json` does not leak `bun add` writes into an ancestor package.
- 006 handles the immediate false-negative exposed by the 0.5.5 real acceptance
  run: package-mode installs intentionally use root `scripts/*.sh` wrappers or
  `local-repo-harness run <helper>`, not `.ai/harness/scripts/check-*.sh`.
- 007 depends on 006 because it codifies the same helper-entrypoint contract in
  `.ai/harness/policy.json`, so future agents can infer the correct execution
  surface without reading shell implementation details.
- 008 is independent of 006 and 007. It cleans diagnostic output so
  project-scoped Waza/tooling reports no longer look like user-level leakage
  when project skills are actually present.
- 009 depends on 006 only because both plans touch the project-scoped install
  guide. It separates project-level security acceptance from ambient user-level
  hook findings.
- 010 depends on 009 because 009 made `security-config` project-scope aware but
  left `cli-on-path`, `codex-adapter`, and `claude-adapter` as global/PATH WARNs
  in project-intent `doctor --json` output. It finishes the doctor readiness
  cleanup for strict project-scoped installs.
- 011 depends on 005 because package-boundary-free project bootstrap established
  the managed tool-root pattern that now needs a Git boundary. It depends on 009
  and 010 because the VCS boundary must appear in the same scope-aware
  `doctor --json` readiness surface rather than as a separate undocumented
  check.
- 012 depends on 011 because 011 added the local-only VCS machinery, but real
  downstream testing showed its default policy is too broad: `--vcs-scope local`
  currently makes install state, workflow state, and product intent all local.
  012 keeps the machinery and narrows the policy using profiles,
  `tracked_whitelist`, and root `.gitignore` precedence.

## Findings considered and rejected

- Use `bun init -y` as the package-boundary workaround: rejected because it
  creates application scaffold files (`README.md`, `index.ts`, `tsconfig.json`)
  when the adoption flow only needs tool isolation.
- Keep CodeGraph under the target root `node_modules/.bin`: rejected because
  Bun walks up to an ancestor `package.json` when the target repo lacks one,
  which is exactly the leakage this design is meant to prevent.
- Add a `repo-harness` compatibility alias bin: rejected because the fork has
  intentionally standardized on `local-repo-harness`; stale runtime fallbacks
  should be removed rather than hidden.
- Depend on Node being available in project-scoped installs: rejected because
  `project-vendored-bun` is the documented runtime target and prior real tests
  already exposed Bun-only failures.
- Treat `bun add -d local-repo-harness@latest` as the default project-scoped
  install command: rejected for zero-package repos because Bun walks up to an
  ancestor package boundary and can modify unrelated parent `package.json`,
  `bun.lock`, and `node_modules`.
- Restore `.ai/harness/scripts/check-agent-tooling.sh` and
  `.ai/harness/scripts/check-task-workflow.sh` for default project-scoped
  package installs: rejected because runtime reclaim deliberately removed those
  generated helper copies after root wrappers and project CLI dispatch became
  the supported package-mode execution surface.
- Treat pre-existing user-level Vibe Island or GitNexus hook findings as
  project-scoped install failures: rejected because they are ambient host risk,
  not evidence that local-repo-harness wrote to user-level config during a
  project-scoped install.
- Treat missing global PATH CLI or missing global host adapters as failures for
  project-scoped recipe C installs: rejected because project-scoped installs use
  `.ai/harness/bin/local-repo-harness`, project hook adapters, and project
  skills; global adapters are optional ambient host setup unless the policy
  intent is user/global.
- Rely on project path isolation alone: rejected because writing under the
  target repo prevents user-level leakage but still lets Git commit runtime,
  skills, hooks, MCP config, and workflow state into the downstream product.
- Rely only on `.git/info/exclude`: rejected because tracked `.gitignore`
  negations such as `!.codex/hooks.json` can make local-only paths appear
  untracked anyway. Local overlay ignores and cleanup checks are required.
- Ask users to remember not to commit `local-repo-harness` artifacts manually:
  rejected because this is exactly the kind of state boundary the installer and
  doctor should enforce mechanically.
- Add a user-extensible `local_only_whitelist`: rejected because it is too easy
  for agents or users to turn it into a broad "remove project source from Git"
  footgun. Plan 012 keeps only three layers: root `.gitignore` hard boundary,
  `tracked_whitelist`, and VCS profile scopes.
