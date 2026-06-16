# Project-Scope Doctor Readiness

## Context

Plan 010 addresses the remaining false `doctor --json` warnings from strict
project-scoped installs. In a repo whose policy intends project hook adapters,
global PATH CLI availability and global host adapters are ambient host state,
not project readiness requirements.

## Changes

- Make `cli-on-path`, `codex-adapter`, and `claude-adapter` reference-only
  `na` checks when project hook scope is intended.
- Keep project adapter, project runtime, project skills, project CodeGraph, and
  security checks as the readiness surface.
- Preserve `mixed-scope-adapters` warnings when actual user-level adapters are
  configured alongside project-only intent.
- Update the Chinese project-scoped install guide and 0.5.7 release metadata.

## Verification

- `bun test tests/cli/doctor.test.ts tests/cli/init-hook.test.ts tests/cli/bootstrap.test.ts tests/bootstrap-files.test.ts --timeout 60000 --max-concurrency 4`
- `bun run check:release`
- Real tarball-backed recipe C install at
  `/tmp/local-repo-harness-057-real-20260616-225154`.

Release gate passed with 793 tests, 0 failures, and
`[release] OK: npm package gate passed.`

The real install used `bootstrap --package local-repo-harness-0.5.7.tgz` and
recipe C. The project CLI reported `0.5.7`; `doctor --json` reported
`ok=14,warn=0,fail=0,na=5`; `cli-on-path`, `codex-adapter`, and
`claude-adapter` were `na`; project adapters, project runtime, project skills,
project CodeGraph, and `security-config` were `ok`; the temp HOME user-level
snapshot diff was empty.
