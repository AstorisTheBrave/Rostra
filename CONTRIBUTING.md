# Contributing to Rostra

Thanks for helping improve Rostra! This guide gets you productive fast and keeps the codebase consistent.

## Getting set up

Use Node.js 22.22.2+ or 24.15.0+ with Corepack 0.35.0. The package-manager version is pinned in
`package.json`; do not generate another lockfile. Later supported Node.js majors must be at least 26.

```bash
corepack enable
pnpm install --frozen-lockfile
cp .env.example .env          # placeholder values are fine for tests
pnpm prisma:generate
```

Run the checks (everything must pass before a PR):

```bash
pnpm check:boundaries # repository inputs and workspace control plane
pnpm typecheck        # generate the client, then strict TypeScript
pnpm lint             # Biome (run `pnpm lint:fix` to autofix)
pnpm test:env         # node:test via tsx, with .env loaded, concurrency capped at 2
```

## How the codebase is organized

Each feature is a self-contained **module** in `modules/<name>/` that default-exports a `BotModule`:

```ts
const myModule: BotModule = {
  name: "mymodule",
  commands: [/* SlashCommand[] */],
  events:   [/* RegisteredEvent[] via defineEvent() */],
  components:[/* ComponentHandler[] (buttons/selects/modals) */],
  jobs:     [/* JobDefinition[] */],
  i18n:     { "key": "string {var}" },
};
export default myModule;
```

Gateway commands, events and components are auto-discovered at boot. Durable queue consumers run in
`apps/workers/`; do not create a BullMQ worker from a module or gateway shard. Use `modules/core` (simple) and
`modules/moderation` / `modules/tickets` (richer) as references.

Shared code (import these; don't reinvent them):
- `getPrisma()` - database (`packages/database/src/index.ts`)
- `config` - validated env (`packages/config/src/index.ts`)
- `getCache()` / `getRedis()` - cache & leaderboards (`packages/cache/src/index.ts`)
- `getLogger(scope)` - logging (`packages/logger/src/index.ts`)
- `@rostra/discord-ui` - all UI building blocks (buttons, selects, modals, layout, patterns)
- `@rostra/auth` - explicit host and tenant-scoped guild authorization
- `@rostra/operations` - durable operation and idempotent queue contracts
- `t(key, vars)` - i18n (`packages/i18n/src`)

## Non-negotiable conventions (the CI enforces these)

1. **ESM + TypeScript strict.** No `require()`, no `any` (use `unknown` + narrow).
2. **No raw env / DB.** Never read `process.env` outside `packages/config/src/index.ts`; never `new PrismaClient()`
   outside `packages/database/src/index.ts`.
3. **UI comes from `@rostra/discord-ui` only.** Never instantiate discord.js component builders (`ButtonBuilder`,
   `ActionRowBuilder`, `ContainerBuilder`, `StringSelectMenuBuilder`, `ModalBuilder`, `TextInputBuilder`)
   in a module. If `@rostra/discord-ui` lacks something you need, **add it to `@rostra/discord-ui` (with a test) first**, then use it.
4. **Components V2 only** - never `EmbedBuilder` / legacy embeds.
5. **Slash-only commands**, namespaced under a top-level command via subcommands/groups.
6. **Every user-facing string** goes through the i18n `t()` helper.
7. **Modules are isolated** - don't import another module's internals. Shared owners use explicit
   `@rostra/*` public exports, never package-private paths. Existing modules temporarily use the gateway
   `@/` alias for services and types until Phase 01 replaces compatibility discovery.
8. **Wrap I/O in try/catch** with structured Pino logs; handle missing permissions and API errors
   gracefully.

9. **Document every change.** Add a `docs/sessions/log.mdx` entry and update the relevant
   `docs/modules/<name>.mdx` as part of the change.
10. **No em dashes** in user-facing text, docs, or commit/PR text. Use a normal hyphen or reword.
11. **Stable dependencies only** - no beta/alpha/RC/`-dev` versions unless that is the package's only
    stable channel.

When trade-offs conflict, follow decision 011: correctness and tenant isolation, security, recovery,
measured performance, then structure and modular ownership.

> Note: this project ships an AI assistant whose underlying provider is intentionally a hidden
> implementation detail. Do not reference any AI provider or model name anywhere in code, comments,
> strings, or commits, and do not add AI co-author trailers to commits. The assistant only ever presents
> as "Rostra". The CI checks for this.

## Adding a feature module (checklist)

1. Add any Prisma models to `packages/database/prisma/schema.prisma`, then `pnpm prisma:generate`.
2. Create `modules/<name>/` with `service.ts` (logic, cached config) and `index.ts` (the `BotModule`).
3. Build all UI via `@rostra/discord-ui`; route component clicks with the `module:action:arg` customId convention.
4. Add a unit test for the pure logic (`*.test.ts` beside the source).
5. Run `typecheck` + `lint` + `test:env`; make sure the loader picks it up.
6. Add a short `docs/modules/<name>.mdx` and a line to `docs/sessions/log.mdx`.

## Branching & PRs

`main` is protected by a branch ruleset: changes land through a **pull request with passing CI**, and
force-pushes/deletions are blocked. So:

1. Branch off `main` (`git switch -c feat/my-thing`).
2. Make your change with tests + docs, run the checks locally.
3. Open a PR. CI (typecheck, lint, tests, and the embed/undercover/`@rostra/discord-ui` guards) must be green to merge.

For phase delivery, push the reviewed phase branch to GitHub as a rollback snapshot after its full
verification gate passes. Verify that the local and remote commit hashes match and record both in the
phase evidence report. A local commit alone does not complete a phase.

- Conventional commits: `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`, `build:`, `ci:`.
- Keep PRs focused; describe what changed and how you tested it.
- No em dashes and no AI co-author trailers in commit or PR text.

Happy hacking!
