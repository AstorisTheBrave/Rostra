# Contributing to Rostra

Thanks for helping improve Rostra! This guide gets you productive fast and keeps the codebase consistent.

## Getting set up

```bash
npm install
cp .env.example .env          # placeholder values are fine for tests
npm run prisma:generate
```

Run the checks (everything must pass before a PR):

```bash
npm run typecheck     # tsc --noEmit (strict, no `any`)
npm run lint          # Biome (run `npm run lint:fix` to autofix)
npm run test:env      # node:test via tsx, with .env loaded
```

## How the codebase is organized

Each feature is a self-contained **module** in `src/modules/<name>/` that default-exports a `BotModule`:

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

Modules are auto-discovered at boot — drop a folder in and it loads. Use `src/modules/core` (simple) and
`src/modules/moderation` / `src/modules/tickets` (richer) as references.

Shared code (import these; don't reinvent them):
- `getPrisma()` — database (`src/services/database.ts`)
- `config` — validated env (`src/config.ts`)
- `getCache()` / `getRedis()` — cache & leaderboards (`src/services/cache.ts`)
- `getLogger(scope)` — logging (`src/services/logger.ts`)
- `@/ui` — all UI building blocks (buttons, selects, modals, layout, patterns)
- `t(key, vars)` — i18n (`src/i18n`)

## Non-negotiable conventions (the CI enforces these)

1. **ESM + TypeScript strict.** No `require()`, no `any` (use `unknown` + narrow).
2. **No raw env / DB.** Never read `process.env` outside `src/config.ts`; never `new PrismaClient()`
   outside `src/services/database.ts`.
3. **UI comes from `@/ui` only.** Never instantiate discord.js component builders (`ButtonBuilder`,
   `ActionRowBuilder`, `ContainerBuilder`, `StringSelectMenuBuilder`, `ModalBuilder`, `TextInputBuilder`)
   in a module. If `@/ui` lacks something you need, **add it to `@/ui` (with a test) first**, then use it.
4. **Components V2 only** — never `EmbedBuilder` / legacy embeds.
5. **Slash-only commands**, namespaced under a top-level command via subcommands/groups.
6. **Every user-facing string** goes through the i18n `t()` helper.
7. **Modules are isolated** — don't import another module's internals; only shared `services/`, `utils/`,
   `ui/`, `types/`, `i18n/`.
8. **Wrap I/O in try/catch** with structured Pino logs; handle missing permissions and API errors
   gracefully.

> Note: this project ships an AI assistant whose underlying provider is intentionally a hidden
> implementation detail. Do not reference any AI provider or model name anywhere in code, comments,
> strings, or commits — the assistant only ever presents as "Rostra". The CI checks for this.

## Adding a feature module (checklist)

1. Add any Prisma models to `prisma/schema.prisma`, then `npm run prisma:generate`.
2. Create `src/modules/<name>/` with `service.ts` (logic, cached config) and `index.ts` (the `BotModule`).
3. Build all UI via `@/ui`; route component clicks with the `module:action:arg` customId convention.
4. Add a unit test for the pure logic (`*.test.ts` beside the source).
5. Run `typecheck` + `lint` + `test:env`; make sure the loader picks it up.
6. Add a short `docs/modules/<name>.mdx` and a line to `docs/sessions/log.mdx`.

## Commits & PRs

- Conventional commits: `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`.
- Keep PRs focused; describe what changed and how you tested it.
- Make sure `typecheck`, `lint`, and tests pass — CI runs them on every PR.

Happy hacking! 🛠️
