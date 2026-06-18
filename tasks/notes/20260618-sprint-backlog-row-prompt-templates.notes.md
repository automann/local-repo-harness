# Sprint Backlog Row Prompt Templates

Date: 2026-06-18

## Scope

Updated `QUICK_START.md` with a focused section for executing approved Sprint
backlog rows just in time.

## Decisions

- A Sprint backlog is an ordered roadmap, not a place to pre-generate every
  detailed implementation plan.
- One Sprint row maps to one `plan -> contract -> worktree -> verify` cycle.
- Each row should be expanded with `repo-harness-sprint run` and `$think` only
  when it is next in line.
- The next row should not begin until the current row is verified, closed, and
  the sprint file has been re-read from disk.

## Verification

- `bun test tests/readme-dx.test.ts --timeout 60000 --max-concurrency 4`
- `git diff --check`
