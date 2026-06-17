# VCS profile switching docs

Date: 2026-06-18

## Scope

Expanded the project-scoped install documentation so downstream users can choose
and switch VCS profiles intentionally instead of treating `--vcs-profile` as a
one-time install flag.

## Changes

- Added README guidance for choosing among `project-local-install`,
  `tracked-governance`, `ephemeral-agent-workspace`, and `self-host`.
- Added README switching recipes that reuse the original install/adopt scope
  flags while changing only `--vcs-profile`.
- Added audit and cleanup examples that pass `--vcs-profile` explicitly.
- Added QUICK_START guidance for day-to-day profile checks before work, after
  switching, and before final submission.
- Documented that new commands should prefer `--vcs-profile`; legacy
  `--vcs-scope local` maps to `project-local-install`, while
  `--vcs-scope tracked` maps to `self-host`.
- Added README DX assertions to keep the switching guidance from regressing.

## Verification

- `bun test tests/readme-dx.test.ts tests/bootstrap-files.test.ts --timeout 60000 --max-concurrency 4`
  passed.
- `git diff --check` passed.
