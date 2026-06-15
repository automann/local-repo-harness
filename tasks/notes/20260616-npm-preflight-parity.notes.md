# npm preflight parity repair

## Context

Release preflight for the next `local-repo-harness` npm publish found that
`assets/hooks/security-sentinel.sh` had drifted from the self-hosted
`.ai/hooks/security-sentinel.sh` copy.

## Change

- Synced the self-hosted security sentinel hook with the packaged asset copy.
- Re-ran the parity regression test and the full Bun test suite.

## Verification

- `bun test tests/workflow-contract.test.ts --timeout 60000 --max-concurrency 4`
- `bun test --timeout 60000 --max-concurrency 4`
