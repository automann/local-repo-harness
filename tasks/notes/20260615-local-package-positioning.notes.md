# local-repo-harness Package Positioning Notes

## Summary

- Added a top-of-README project statement that identifies `local-repo-harness` as an independent npm package based on `repo-harness@0.5.0`.
- Clarified that this package keeps the `repo-harness` workflow model and CLI compatibility while adding project-scoped install support.
- Updated the npm package description so the registry listing also states the `repo-harness@0.5.0` base and project-scoped install focus.

## Verification

- `bun test tests/readme-dx.test.ts tests/install-scripts.test.ts tests/bootstrap-files.test.ts`
- `bash scripts/check-task-sync.sh`
