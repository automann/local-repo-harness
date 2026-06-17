# VCS profile precedence fix

Date: 2026-06-18

## Context

Real downstream testing of `local-repo-harness@0.5.11` in
`swarm-discussion-codex` showed that `vcs audit --vcs-profile ...` and repeated
`adopt --vcs-profile ...` changed the persisted profile name but did not change
the effective `install_state_scope`, `workflow_state_scope`, or
`product_intent_scope` when an older policy already contained group scopes.

The same profile matrix worked in a clean temp repo, so the defect was not the
profile definitions. It was precedence: raw persisted policy group scopes were
winning over explicit CLI profile/scope selections.

## Changes

- Make explicit `--vcs-profile` and `--vcs-scope` override persisted policy
  group scopes in `resolveLocalVcsPolicy`.
- Treat a persisted profile as canonical profile intent, with group scopes
  derived from that profile unless explicit per-group options are provided.
- Keep legacy raw group scopes only for policies that do not declare a profile.
- Preserve the legacy `--vcs-scope local` mapping to the conservative
  `project-local-install` profile.
- Derive the bootstrap/adopt command environment's legacy `VCS_SCOPE` from the
  resolved three-layer policy instead of forwarding a defaulted raw scope.
- Remove the Commander-level bootstrap default for `--vcs-scope` so explicit
  `--vcs-scope tracked` is not hidden by the default project-local profile.

## Verification

- `bun test tests/cli/vcs-local-only.test.ts --timeout 60000 --max-concurrency 4`
  passed with the new stale-policy regression.
- `bun test tests/cli/vcs-local-only.test.ts tests/cli/init.test.ts tests/cli/bootstrap.test.ts --timeout 60000 --max-concurrency 4`
  passed.
- `bun test tests/cli/status.test.ts tests/cli/doctor.test.ts tests/migration-script.test.ts tests/readme-dx.test.ts --timeout 60000 --max-concurrency 4`
  passed.
- Full `bun test --timeout 60000 --max-concurrency 4` passed with
  `813 pass / 0 fail`.

## Real Downstream Validation

Validated the fixed source CLI against the real `swarm-discussion-codex`
downstream repo, whose `.ai/harness/policy.json` already contained stale
group-scope fields from a previous install.

| Request | install | workflow | product | local-only result |
|---------|---------|----------|---------|-------------------|
| `--vcs-profile project-local-install` | local | local | tracked | 87 local-only entries |
| `--vcs-profile ephemeral-agent-workspace` | local | local | local | 90 local-only entries; `docs/spec.md` is local-only |
| `--vcs-profile tracked-governance` | local | tracked | tracked | 28 local-only entries; workflow/product docs are tracked |
| `--vcs-profile self-host` | tracked | tracked | tracked | 0 local-only entries |
| `--vcs-scope tracked` | tracked | tracked | tracked | resolves to `self-host`; 0 local-only entries |
| `--vcs-scope local` | local | local | tracked | resolves to `project-local-install`; 87 local-only entries |

Also verified `adopt --dry-run --vcs-profile self-host --json` reports the
`sync local-only vcs boundary` step as skipped with
`all vcs scopes are tracked`, proving the apply path receives the resolved
three-layer policy instead of the stale persisted group scopes.
