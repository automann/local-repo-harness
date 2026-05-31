# Release Filing: repo-harness 0.1.3

Date: 2026-05-31
Filing ID: 260531-repo-harness-0.1.3
Source commit: 42318f7
Status: Not published

## Naming

Release filing documents use a `YYMMDD-<package>-<version>.md` filename. This
file intentionally uses `260531` so the release artifact sorts by filing date
without relying only on GitHub or npm metadata.

## Scope

- Package: `repo-harness@0.1.3`
- Generated workflow compatibility: `5.2.3`
- Public CLI commands: unchanged
- Host adapter contract: unchanged, still `repo-harness-hook <event> --route <route>`
- Prompt guard architecture: host adapter -> CLI route registry -> `.ai/hooks/prompt-guard.sh` -> TypeScript decision table -> shell-rendered host output

## Included Changes

- AI-native scaffold profile overlays.
- Typed prompt-guard decision table for intent plus workflow-state routing.
- Draft plan plus `implement this plan` regression fix.
- No-active-plan and Approved-plan projection routing fixes.
- Passive copied worktree, completion report, and next-slice prompt handling.
- Deploy SQL invariant reference check.
- `tasks/current.md` scratch-file filtering parity for generated helpers.
- CLI version alignment for `repo-harness --version` and `repo-harness status`.
- English and Chinese README architecture clarification.

## Verification

- `bash scripts/check-npm-release.sh` passed before the publish attempt.
- A later `npm publish` attempt was intentionally interrupted before completion after a filing-name issue was identified.
- Registry check after interruption still returned `repo-harness@0.1.3` as unpublished.

## Publish Hold

Do not publish until this filing is reviewed and the release gate is rerun from
the final commit.
