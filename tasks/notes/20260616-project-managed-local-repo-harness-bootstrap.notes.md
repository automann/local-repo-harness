# Project-Managed local-repo-harness Bootstrap

Date: 2026-06-16

## Summary

Added a package-boundary-free bootstrap path for project-scoped adoption. The new
`local-repo-harness bootstrap` command installs the CLI into the target repo's
managed tool root at `.ai/harness/tools/local-repo-harness/`, writes the project
shim `.ai/harness/bin/local-repo-harness`, then delegates to `adopt` with the
requested project scopes.

This keeps zero-package target repos from needing `bun init -y` or
`bun add -d local-repo-harness`, avoiding Bun's ancestor package-boundary walk.

## Key Surfaces

- CLI command: `local-repo-harness bootstrap`
- Managed runtime root: `.ai/harness/tools/local-repo-harness/`
- Project shim: `.ai/harness/bin/local-repo-harness`
- Default project scopes:
  - `--host-adapter-scope project`
  - `--runtime project-vendored-bun`
  - `--skill-scope project`
  - `--external-tool-scope project`
  - `--codegraph-mcp-scope project`
  - `--brain-mode manifest-only`

## Verification Focus

- Bootstrap works when the target repo has no root `package.json` and an
  ancestor directory does.
- Bootstrap does not create or edit the target root `package.json`.
- Bootstrap does not edit an ancestor `package.json` or create an ancestor
  `bun.lock`.
- The generated shim exits with a clear remediation if the managed CLI runtime
  is missing.
- The Chinese project-scoped install guide and README first-run path point users
  to bootstrap as the default project-only install recipe.
