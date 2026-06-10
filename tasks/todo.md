# Deferred Goal Ledger

> **Status**: Backlog
> **Updated**: 2026-06-10 12:41 +0800
> **Scope**: Medium/long-term goals deferred from active plan execution

Current plan tasks live in the active plan's `## Task Breakdown`.
Do not duplicate that execution checklist here. Record only work intentionally deferred beyond this slice, with the tradeoff and revisit trigger.

## Deferred Goals

| Goal | Why Deferred | Tradeoff | Revisit Trigger |
|------|--------------|----------|-----------------|
| Complete hook framework Slice 5 downstream-chain and performance hardening | Deferred from `plans/plan-20260610-1040-hook-framework-audit-fixes.md` so the verified P0-P1/Slices 1-4 merge batch can land cleanly. | Leaves lower-priority observability, pending lifecycle, timeout, realpath containment, and measured optimization work out of this commit. | Start when the next hook framework slice focuses on `[SyncChain] WARN`, architecture pending lifecycle, `sync-brain-docs.sh` containment, generated host timeouts, or prompt/brain-sync performance. |
