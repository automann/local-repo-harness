# Canonical Chinese Project-Scoped README

## Context

`local-repo-harness` is now positioned as an independent fork for users who want
project-scoped repo-harness adoption. The previous root README still carried a
large amount of upstream-oriented, broad machine-bootstrap framing, while the
project-scoped install guidance lived in duplicated Chinese reference docs.

## Changes

- Replaced the root `README.md` with a Chinese canonical README focused on
  project-scoped bootstrap, project-local adopt recipes, user-level isolation
  checks, CodeGraph no-daemon expectations, and maintainer-only global install
  references.
- Updated `README.zh-CN.md` to point project-scoped users back to the root
  README as the canonical guide.
- Removed the duplicated `project-scoped-install-zh-CN.md` reference copies from
  `docs/reference-configs/` and `assets/reference-configs/`.
- Updated README DX and installer contract tests so the new Chinese README keeps
  the project-scoped path ahead of broad machine bootstrap guidance.

## Verification

- `bun test tests/readme-dx.test.ts tests/install-scripts.test.ts tests/action-command-skills.test.ts --timeout 60000 --max-concurrency 4`
- `bun test --timeout 60000 --max-concurrency 4`
- `bash scripts/check-runtime-compat.sh`
- `bash scripts/check-task-workflow.sh --strict`

