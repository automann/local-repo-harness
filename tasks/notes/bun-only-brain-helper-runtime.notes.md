# Bun-only Brain Helper Runtime

Diagnosis for downstream project-scoped adoption showed that
`bun --bun local-repo-harness adopt --brain-mode manifest-only` could fail
with `Module not found .../-` when the brain manifest helpers selected Bun as
their JavaScript runtime.

Root cause:

- `check-brain-manifest.sh` and `sync-brain-docs.sh` executed their main JS
  payload with `"$runtime" - ...`.
- That stdin-script form works with Node, but Bun treats `-` as a module path.
- Downstream repos without their own package boundary can also make Bun resolve
  `local-repo-harness` from an ancestor package root, which made the failure
  appear during project-scoped adoption.

Fix:

- Brain helper JS payloads now run from temporary `.js` files, which both Node
  and Bun support.
- Added helper-level and CLI-level Bun-only regression tests.

Verification:

- `bun test tests/helper-scripts.test.ts --timeout 60000`
- `bun test tests/cli/init.test.ts --timeout 60000`
- Re-ran the original project-scoped adopt command against
  `/Users/syfq/dev/harness/swarm-discussion-codex` using the fixed source CLI
  plus a temporary `local-repo-harness` PATH shim; all install, CodeGraph,
  brain sync, and workflow verification steps completed successfully.
