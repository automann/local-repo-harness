# Active Improve Plans

Generated and updated by the improve skill on 2026-06-16. This index tracks the
active project-scoped CodeGraph and Bun/Node runtime compatibility plans. Older
plans in this directory and `plans/archive/` remain historical context unless a
future task explicitly reactivates them.

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
