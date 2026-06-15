# Project-scoped CodeGraph real-test fixes

## Context

The npm real-test thread reported project-scoped adoption as partially passing:
hooks, runtime, project skills, and no-user-fallback checks were clean, but
CodeGraph project readiness was incomplete and SessionStart printed JSON parse
noise when the security scanner produced empty output.

Source report:

- `/Users/syfq/dev/harness/dev-tests/local-repo-harness-npm-real-20260615-144915/REPORT.md`

## Fix

- `adopt --codegraph-mcp-scope project` now configures project-local CodeGraph
  MCP stubs even when the CodeGraph CLI is missing.
- Project Codex config uses `.codex/config.toml` with
  `./node_modules/.bin/codegraph`, `serve --mcp --path .`, and project runtime
  telemetry env.
- Project Claude config uses `.mcp.json` with the same local command and env.
- Doctor and `check-agent-tooling.sh` now derive CodeGraph remediation from the
  repo policy intent, so project scope reports
  `npm install --save-dev @colbymchenry/codegraph` and
  `local-repo-harness tools configure codegraph --location local` instead of
  global commands.
- Generated policy and helper templates now keep project CodeGraph commands
  project-local and avoid expanding machine-specific user PATH values.
- `security-sentinel.sh` silently ignores empty or invalid scanner output during
  SessionStart instead of emitting `SyntaxError: Unexpected end of JSON input`.

## Verification

- `bun test tests/check-agent-tooling.test.ts tests/cli/doctor.test.ts tests/migration-script.test.ts`
- `bun test tests/cli/tools.test.ts tests/cli/init.test.ts tests/hook-runtime.test.ts tests/cli/status.test.ts tests/cli/codegraph.test.ts tests/cli/codegraph-resolver.test.ts`
- `git diff --check`
- `bash scripts/check-task-sync.sh`
- `bash scripts/check-task-workflow.sh --strict`
- `bash scripts/check-deploy-sql-order.sh`
- `bash scripts/check-architecture-sync.sh`
- `bun scripts/inspect-project-state.ts --repo . --format text`
- `bash scripts/migrate-project-template.sh --repo . --dry-run`
- `npm pack --dry-run --json`
- Smoke without CodeGraph dependency:
  `/Users/syfq/dev/harness/dev-tests/local-repo-harness-fix-smoke-20260615-162015/smoke-summary.json`
- Smoke with project CodeGraph dependency:
  `/Users/syfq/dev/harness/dev-tests/local-repo-harness-codegraph-installed-smoke-20260615-162101/smoke-summary.json`

## Boundary

This does not make `adopt` auto-install third-party CodeGraph dependencies.
The documented complete project-scoped CodeGraph path remains:

```bash
npm install --save-dev @colbymchenry/codegraph
local-repo-harness adopt --repo "$PWD" --codegraph-mcp-scope project --sync-codegraph
```
