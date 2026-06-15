# CodeGraph Managed Tool Root

Project-scoped CodeGraph no longer uses the target repository root as its
package boundary. The previous root `bun add -d @colbymchenry/codegraph`
model could walk up to an ancestor package when a non-JavaScript downstream
repo did not have its own `package.json`.

The project-scoped runtime now belongs to local-repo-harness:

- package root: `.ai/harness/tools/codegraph/`
- MCP shim: `.ai/harness/bin/codegraph`
- index/runtime state: `.codegraph/` and `.ai/harness/codegraph-runtime/`

This keeps CodeGraph project-local without adding `@colbymchenry/codegraph` to
the target app's root dependencies. The install mechanism for
`local-repo-harness` itself remains out of scope for this slice.
