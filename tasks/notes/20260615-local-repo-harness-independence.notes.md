# local-repo-harness Independence Migration Notes

## Summary

- Imported the current `repo-harness` history into the new public `automann/local-repo-harness` repository.
- Renamed the npm package identity to `local-repo-harness` while preserving the `repo-harness` and `repo-harness-hook` runtime commands for compatibility.
- Added a `local-repo-harness` bin alias so `npx -y local-repo-harness ...` can invoke the package directly.
- Updated installer, README, project-scoped install tutorial, self-update advisory, and release/package tests to avoid pulling the upstream `repo-harness` npm package.

## Verification

- `bun test tests/install-scripts.test.ts tests/readme-dx.test.ts tests/cli/doctor.test.ts tests/cli/global-runtime-init.test.ts tests/cli/init-hook.test.ts tests/skill-version.test.ts`
- `bun test tests/bootstrap-files.test.ts`
- `npm pack --dry-run --json`
- `npm run check:release` reached `768 pass, 0 fail` before `check-task-sync` required this task note.
