# Contributing to Rostra

Thanks for helping with Rostra. This guide gets a contributor from a fresh checkout to the current workspace conventions.

## Set up

Use Node.js `22.22.2+` or `24.15.0+`, or a supported later major, with Corepack 0.35.0. pnpm is pinned in `package.json`; keep the single reviewed `pnpm-lock.yaml`.

```bash
corepack enable
pnpm install --frozen-lockfile
cp .env.example .env
pnpm prisma:generate
```

`pnpm test` supplies placeholders through the caller or CI. `pnpm test:env` reads the local `.env`. Do not put production credentials in a development environment. Integration and browser checks need disposable PostgreSQL and Redis services; the CI jobs provide those services.

## Useful checks

```bash
pnpm check:boundaries
pnpm typecheck
pnpm lint
pnpm test
pnpm test:integration
pnpm build
git diff --check
```

The unit-test graph serializes workspace tasks and caps test-file concurrency at two. The service integration task uses PostgreSQL and Redis. Browser verification is available with `pnpm test:browser --project=chromium` after generating the database client and starting disposable services. Never use a real Discord token or publish commands in migration, parity or browser verification.

## Workspace map

- `apps/gateway/` owns Discord sharding, interactions and event fanout.
- `apps/api/` owns authenticated domain routes and webhook boundaries.
- `apps/web/` uses the typed API; it does not connect directly to the database.
- `apps/workers/` owns durable queue consumers and graceful drain.
- `apps/realtime/` and `apps/activity/` are optional authenticated apps.
- `modules/<name>/` contains the current feature modules and their tests.
- `packages/` contains shared services and explicit public contracts.
- `games/`, `integrations/`, `infra/` and `tooling/` own their corresponding implementations and checks.

See the [workspace overview](docs/overview.mdx), [architecture map](docs/architecture/index.mdx), and relevant [module guide](docs/modules/).

## Conventions

1. Use strict TypeScript and ESM. Avoid `any`; narrow `unknown` at trust boundaries.
2. Runtime environment access belongs only in `@rostra/config`. Prisma construction belongs only in `@rostra/database`; use its public `getPrisma()` export.
3. Use `@rostra/discord-ui` for all Discord components. Components V2 only; do not build legacy embeds in a module.
4. User-facing strings use the shared localization contract. Wrap I/O in error boundaries and structured logs with credential redaction.
5. The public assistant identity is Rostra. Use only neutral configuration names and do not name its implementation in code, documentation, metadata, errors or commits.
6. Modules do not import one another's internals or package-private source. Use explicit public `@rostra/*` exports. The `@/` alias is limited to the gateway and existing module compatibility window.
7. Guild actions and private reads require explicit tenant-scoped authorization. Host access does not bypass guild permissions. Add tests for guessed or swapped object IDs and stale authorization where relevant.
8. PostgreSQL owns durable intent. Redis delivery is at least once; consumers must be idempotent, fence settlement with the claim version, and drain on shutdown.
9. Preserve migration directories and bytes. A failed migration must stop startup; never use destructive down migrations for code rollback.
10. Stable dependencies only. Check the required platform support before adding tooling.
11. Update `docs/sessions/log.mdx` and relevant module or architecture docs with each change. Keep `AGENTS.md` current when a new contributor-facing constraint appears.
12. Do not use em dashes in source, docs, user text, issues, pull requests or commits.

## Module changes

The current compatibility module exports its `BotModule` from the module entrypoint, with commands, events, interactions, components, jobs and translations as needed. Follow nearby modules and the compatibility types in `apps/gateway/src/types/module.ts`. Durable queue consumers belong to `apps/workers/`, not to a gateway shard. Keep modules isolated and put shared behavior behind an owning package's public export.

For schema changes, edit `packages/database/prisma/schema.prisma`, generate the client with `pnpm prisma:generate`, and add a forward-only migration. Preserve all existing migration directories and checksums. Add focused tests for new logic and update the module guide.

## Pull requests

Use a focused branch and pull request. `main` is protected and needs the required CI checks. Use a conventional commit subject such as `feat:`, `fix:`, `docs:` or `test:`. Do not add attribution trailers. A local green gate does not prove remote CI, independent review, image/security matrices or phase delivery; record outstanding evidence accurately.
