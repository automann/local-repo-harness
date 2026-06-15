# local-repo-harness 0.5.2 Release Prep

Release prep for the project-scoped CodeGraph managed tool root slice.

- Merged `codex/project-codegraph-managed-tool-root` into `main`.
- Bumped package, CLI, workflow stamp, README current-release metadata, and
  bootstrap contract test expectations to `0.5.2`.
- Added changelog notes for the harness-owned CodeGraph tool root so
  downstream projects do not need a root `package.json` just to install
  project-scoped CodeGraph.

Verification:

- `bun scripts/check-skill-version.ts`
- `npm run check:release`
