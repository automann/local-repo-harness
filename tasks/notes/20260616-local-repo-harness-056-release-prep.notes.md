# local-repo-harness 0.5.6 Release Prep

## Summary

- Bumped package, skill, and template versions from `0.5.5` to `0.5.6`.
- Updated release-facing README and project-scoped install guide references.
- Added release-history context for the project-scoped helper dispatch, external tooling diagnostics, and scope-aware security/doctor changes.

## Verification

- `bun test tests/skill-version.test.ts tests/bootstrap-files.test.ts tests/cli/bootstrap.test.ts --timeout 60000 --max-concurrency 4`
- `bun run check:release`
