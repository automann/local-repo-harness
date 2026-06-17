# Lessons Learned (Self-Improvement Loop)

> Capture correction-derived prevention rules here.
> Promote repeated patterns into durable project rules during spa day.

## Template
- Date:
- Triggered by correction:
- Mistake pattern:
- Prevention rule:
- Where to apply next time:

## Entries

- Date: 2026-06-17
- Triggered by correction: Real project install testing showed `vcs cleanup --apply` reported cleanup commands but removed nothing when review-only files remained, and `bootstrap --version` looked supported while Commander treated it as the top-level CLI version flag.
- Mistake pattern: Safety gates and CLI shortcuts can silently make remediation commands look successful or supported without performing the intended project-scoped action.
- Prevention rule: When adding remediation commands, test mixed safe/review-required states and assert both help text and bad-flag behavior; use one canonical version-pinning flag for project-managed runtimes.
- Where to apply next time: Project-scoped install cleanup, bootstrap/update CLI surfaces, and release readiness tests.
