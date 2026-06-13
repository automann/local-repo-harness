# Project-scoped install phase 1 notes

## Scope

- Added first-class install scope vocabulary: `user`, `project`, and `none`.
- Kept `--location global|local` as a compatibility alias while adding `--scope user|project|none`.
- Preserved default `repo-harness update` behavior as user-scoped host adapters.

## Implementation

- Codex now supports project-scoped adapter writes to `<repo>/.codex/hooks.json`.
- Claude and Codex adapter paths accept an explicit project cwd, with `install` resolving local/project scope to the git root when possible.
- `repo-harness update --host-adapter-scope project` installs project adapters and passes the scope into migration so `.codex/hooks.json` and `.claude/settings.json` are not retired immediately.
- `--host-adapter-scope none` skips host adapter writes and tells migration not to manage project adapter files.
- `repo-harness status` reports user and project adapter state separately for each supported host.

## Documentation and Tests

- README, hook operations, and runtime-harness architecture docs now describe user scope as the default and project scope as an explicit supported mode.
- Generated `.gitignore` keeps `.codex/*` ignored while allowing `.codex/hooks.json` to be tracked for project-scoped adapters.
- Focused verification:
  - `bun test tests/cli/install.test.ts tests/cli/registry.test.ts tests/cli/status.test.ts tests/cli/init.test.ts`
  - `bun test tests/migration-script.test.ts tests/create-project-dirs.runtime.test.ts tests/init-project.settings.runtime.test.ts tests/readme-dx.test.ts tests/scaffold-parity.test.ts`
