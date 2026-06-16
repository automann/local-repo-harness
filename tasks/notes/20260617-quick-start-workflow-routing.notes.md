# Quick Start Workflow Routing Guide

## Context

The root README now lists the public `repo-harness-*` action command skills, but
that list does not teach a new user how to run a real repo-harness task or how
to combine those skills with Waza, Mermaid, cross-review skills, and CodeGraph.

## Changes

- Added `QUICK_START.md` as the user-facing workflow guide after project-scoped
  installation.
- Linked the new guide from the root README's public command and skill section.
- Added `QUICK_START.md` to the npm package file list so the README link is
  available in the published package.
- Added tests that require the quick start to cover skill routing, external
  tooling combinations, CodeGraph boundaries, and project-scoped isolation
  warnings.

## Verification

- `bun test tests/readme-dx.test.ts tests/bootstrap-files.test.ts tests/action-command-skills.test.ts tests/install-scripts.test.ts --timeout 60000 --max-concurrency 4`
- `git diff --check`
- `bash scripts/check-task-sync.sh`
- `bash scripts/check-task-workflow.sh --strict`
- `npm pack --dry-run --json`
