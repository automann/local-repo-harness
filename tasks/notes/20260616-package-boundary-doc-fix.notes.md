# project package boundary docs fix

## Context

The project-scoped install guide used `bun init -y` as a quick way to create a
target-project package boundary before `bun add`.

## Finding

`bun init -y` is too broad for adoption-only repos: it creates application
scaffold files such as `README.md`, `index.ts`, `tsconfig.json`, and Bun type
dependencies. The project-scoped install flow only needs a minimal
`package.json` so Bun does not walk up to an ancestor package boundary.

## Change

- Replaced `bun init -y` guidance with a minimal `package.json` creation
  snippet.
- Documented that `bun init -y` should not be used just to establish the
  package boundary.
