# CodeGraph Direct MCP No-Daemon

## Context

The v0.5.7 project-scoped install acceptance report showed that the install
itself was project-local, but CodeGraph MCP still registered a live daemon under
`~/.codegraph/daemons`. The daemon process used the project-managed CodeGraph
binary, so this was not a global fallback, but it still violated strict
no-user-level-residue expectations.

## Changes

- Add `CODEGRAPH_NO_DAEMON=1` to project-local CodeGraph MCP configuration for
  both Codex `.codex/config.toml` and Claude `.mcp.json`.
- Leave global/user CodeGraph MCP configuration unchanged.
- Harden `rh_run_js_source` by creating a private temporary directory before
  writing the helper JavaScript file, avoiding BSD `mktemp` suffix-template
  collisions such as `repo-harness-js.XXXXXX.js`.
- Bump package, generated template metadata, and project-scoped install docs to
  `0.5.8`.

## Verification

- `bun test tests/cli/tools.test.ts tests/cli/init.test.ts tests/helper-scripts.test.ts --timeout 60000 --max-concurrency 4`
- Tarball-backed project install smoke with current `local-repo-harness-0.5.8.tgz`
  at `/tmp/local-repo-harness-058-smoke-RaDu3n/project`.

The smoke installed the project-managed CLI, ran recipe-C-style `adopt`, and
reported CLI version `0.5.8`. `doctor --json` reported
`ok=14,warn=0,fail=0,na=5`; CodeGraph readiness was `source=local`,
`global_fallback_used=false`, and the generated project MCP env included
`CODEGRAPH_NO_DAEMON=1`. A fake HOME was used during the smoke and no
`$HOME/.codegraph/daemons` files were created after starting the project MCP
briefly.
