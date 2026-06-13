# Project-scoped install phase 3 notes

Date: 2026-06-14

Scope:

- Added explicit `repo-harness update` tooling scope flags:
  `--skill-scope`, `--external-tool-scope`, and `--codegraph-mcp-scope`.
- Added project skill installation for repo-harness-owned Codex skills under
  `.agents/skills` and Claude skills under `.claude/skills`.
- Kept user-level skill sync as the backward-compatible default and added
  project/none modes that do not mutate user skill roots.
- Scoped cross-review skills to user or project host roots.
- Changed Waza and Mermaid project mode to call the `skills` CLI from the
  target repo without `-g` and without global fallback.
- Split CodeGraph project index handling from MCP registration and added
  project-local MCP config for Codex `.codex/config.toml` and Claude
  `.mcp.json`.
- Kept gbrain manual or manifest-only in project-only mode.
- Added scope metadata to workflow contracts, external-tooling docs, readiness
  reports, README guidance, and tests.

Verification:

- `bun test tests/cli/init.test.ts tests/cli/global-runtime-init.test.ts tests/cli/tools.test.ts tests/check-agent-tooling.test.ts tests/installed-copy-sync.test.ts tests/workflow-contract.test.ts`
- `bun test tests/workflow-contract.test.ts tests/readme-dx.test.ts`
- `bun test` passed with 731 tests.
- `bash scripts/check-agent-tooling.sh --host both --json` exited 0 and stayed
  read-only while reporting missing/partial local host tooling states.
- `bash scripts/check-task-workflow.sh --strict` exited 0 with only unavailable
  brain vault warnings.

Next phase adjustment:

- Plan 004 should treat scope-aware external-tooling metadata and readiness
  reporting as already landed.
- Remaining Plan 004 work should focus on status/doctor mixed-scope UX,
  security and migration classification, architecture/release docs, and release
  gates.
