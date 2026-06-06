# Release Process & Deployment Reference

> Externalized: full runbook lives in default brain.

## Default Brain

- File vault: `brain/repo-harness/runbooks/runbook-agentic-release-deploy.md`
- gbrain slug: `runbooks/runbook-agentic-release-deploy`

## Repo Role

This repo keeps deployment contract surfaces under `deploy/` and private runtime
state under ignored `_ops/`. Detailed release patterns, Cloudflare examples, and
rollback playbooks belong in the external runbook.

## Webapp Release Shape

- For a SaaS webapp that needs public SEO/SSR plus an authenticated workspace,
  prefer one TanStack Start + Vite app deployed as a Cloudflare Worker under
  `apps/web`.
- Route `/` as SSR/prerender-capable public landing with title/meta/OG/canonical.
- Route `/app` as client-only when it contains authenticated workspace state,
  WebGL/canvas, or browser-only components; use route-level `ssr: false` or an
  equivalent boundary.
- Deploy Start/Workers apps with `wrangler deploy`, not `wrangler pages deploy`.
- Keep API, Agent, MCP, queue, and storage Workers separate only when they own
  distinct runtime authority.
- Treat a static `apps/marketing` Pages project as explicit legacy/rollback or
  content scope, not the default scaffold shape for SEO/SSR webapps.

## Release Filings

Release filing documents live under `deploy/release-checklists/` and must use a
`YYMMDD-<package>-<version>.md` filename, for example
`260531-repo-harness-0.1.3.md`. The filing records the exact release scope,
source commit, verification, publish status, and any hold reason. Readiness
yellow flags from `repo-harness-check` must be recorded with either the accepted
reason or the concrete repair command, including Waza staging drift, gbrain
warnings, or non-authoritative dry-run eval evidence. Do not rely only on npm or
GitHub release metadata for this local audit trail.
