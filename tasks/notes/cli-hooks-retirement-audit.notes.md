# Implementation Notes: cli-hooks-retirement-audit

## Boundary

`repo-harness` has moved from a scaffold/skill-configuration-first product shape
to a CLI+hooks automation plugin. The active mainline is:

- `repo-harness init`: global CLI, hook adapters, repo-harness runtime aliases,
  Waza `think`/`hunt`/`check`/`health`, Mermaid, brain root, and CodeGraph MCP.
- `repo-harness update`: existing-repo workflow install/refresh.
- `repo-harness-scaffold`: branch command for new project/module creation.

`scripts/setup-plugins.sh` is now only a compatibility shim. It must not install
Claude marketplace plugins, Superpowers, feature-dev/frontend-design/
code-simplifier/hookify, or LSP bundles.

## Decisions

- Kept `mermaid` as the retained diagram skill and removed active
  `diagram-design` guidance from current architecture requests and active
  reference surfaces.
- Kept scaffold generation scripts because they still back the branch command;
  they are not the existing-repo adoption path.
- Collapsed `references/plugins-core.md` into a retired reference so old Claude
  plugin recommendations cannot be mistaken for current install guidance.
- Preserved compatibility aliases such as `repo-harness-skill` and historical
  `project-initializer` markers where tests and migration paths still need them.

## Verification

- `bun test tests/cli/global-runtime-init.test.ts tests/cli/init.test.ts tests/setup-plugins-structure.test.ts tests/bootstrap-files.test.ts tests/action-command-skills.test.ts tests/check-agent-tooling.test.ts tests/workflow-contract.test.ts tests/create-project-dirs.runtime.test.ts tests/migration-script.test.ts`
