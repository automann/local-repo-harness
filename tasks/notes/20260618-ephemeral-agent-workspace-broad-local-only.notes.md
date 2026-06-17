# Ephemeral Agent Workspace Broad Local-Only Paths

Date: 2026-06-18

## Scope

`ephemeral-agent-workspace` now treats the full agent/governance workspace surface as
local-only:

- `.agents/`
- `.claude/`
- `docs/`
- `skills-lock.json`

The broader paths are profile-specific and do not change `project-local-install`,
`tracked-governance`, or `self-host`.

## Rationale

Temporary/private agent workspaces should not accidentally commit local agent
framework state or product-intent drafts into a downstream product repository.
The profile still preserves the three-layer VCS decision model: project
`.gitignore` remains the hard boundary, `tracked_whitelist` can keep selected
paths tracked, and the profile supplies the default local/tracked scopes.

## Verification

- `bun test tests/cli/vcs-local-only.test.ts --timeout 60000 --max-concurrency 4`
- `bun test tests/readme-dx.test.ts --timeout 60000 --max-concurrency 4`
- `git diff --check`
