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

- Date: 2026-06-17
- Triggered by correction: Downstream project installs need `local-repo-harness` tooling to stay local without treating product intent files as install artifacts.
- Mistake pattern: A single broad VCS scope can collapse install state, workflow state, and product intent into one cleanup boundary, making safe local-only machinery too aggressive.
- Prevention rule: Model repo-harness VCS ownership as three layers: root `.gitignore` hard boundary first, explicit tracked whitelist second, and profile scopes third; do not add a `local_only_whitelist`.
- Where to apply next time: Project-scoped bootstrap/adopt defaults, `vcs audit`/`cleanup`, `doctor --json`, and downstream install tutorials.
