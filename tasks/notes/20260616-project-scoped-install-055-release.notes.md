# local-repo-harness 0.5.5 Project-Scoped Install Release Prep

Date: 2026-06-16

## Summary

Prepared the `0.5.5` release after real project-scoped install testing found
three small but release-visible regressions:

- `local-repo-harness status` reported a stale hard-coded CLI version.
- Generated helper wrappers did not consistently prefer the project-managed
  `.ai/harness/bin/local-repo-harness` shim.
- `check-agent-tooling.sh` could report project-scoped Waza skills as missing
  even when the project skill roots were populated.

The release also keeps the current package/docs stamps aligned with
`local-repo-harness@0.5.5`.

## Surfaces

- CLI status version reporting now derives from package metadata.
- Project init/adopt helper generation resolves the project shim first.
- Agent tooling checks recognize project-scoped Waza skill installs.
- Chinese project-scoped install docs call out `0.5.5` as the recommended
  release for this install-test round.

## Verification

- First `bun run check:release` attempt reached `789 pass / 0 fail` across 75
  test files before the governance task-sync gate required this note.

No new durable lesson is promoted yet; this is a release-prep synchronization
record for the current implementation slice.
