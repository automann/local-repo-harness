# Local CLI Command Surface Notes

## Decision

`local-repo-harness` is the only public CLI bin for the package, and
`local-repo-harness-hook` is the only public hook-entry bin. The former
`repo-harness` and `repo-harness-hook` bin aliases are not preserved.

## Scope Boundary

- Keep `repo-harness` as the installed skill slug and `repo-harness-*` as command
  facade skill names.
- Keep `REPO_HARNESS_*` environment variables and `~/.repo-harness` state paths as
  existing protocol/state names.
- Keep README provenance references to the original
  `repo-harness@0.5.0` upstream.
- Update generated adapters, project vendored runtime paths, installer guidance,
  diagnostics, and tests to call `local-repo-harness` / `local-repo-harness-hook`.

## Verification

- Search gate: no bare `repo-harness <subcommand>`, `repo-harness-hook`,
  `.ai/harness/bin/repo-harness-hook`, or `.ai/harness/runtime/repo-harness`
  remains in active command/test/docs surfaces.
- Test gate: run targeted CLI/install/runtime/docs tests plus task-sync before
  release packaging.
