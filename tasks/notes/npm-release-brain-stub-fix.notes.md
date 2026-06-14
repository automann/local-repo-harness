# NPM Release Brain Stub Fix Notes

## Context

`npm publish` runs `prepublishOnly`, which delegates to
`scripts/check-npm-release.sh`. The release gate failed after tests because
`scripts/check-brain-manifest.sh` required the `hook-operations` repo stub to
mention the exact manifest `brain_path` and `gbrain_slug`.

## Fix

Updated both `docs/reference-configs/hook-operations.md` and
`assets/reference-configs/hook-operations.md` to include the manifest-owned
external runbook pointers:

- `brain/repo-harness/runbooks/runbook-repo-harness-hook-troubleshooting.md`
- `runbooks/runbook-repo-harness-hook-troubleshooting`

This keeps the public CLI naming as `local-repo-harness` while preserving the
existing brain manifest identity.

## Verification

- `bash scripts/check-brain-manifest.sh`
- `bash scripts/check-task-workflow.sh --strict`
