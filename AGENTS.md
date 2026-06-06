# AGENTS.md

Guidance for AI coding assistants (Claude Code, Gemini CLI, Codex, Cursor, etc.) working in this repo.
Tool-agnostic and committed — if your tool also reads `CLAUDE.md`/`GEMINI.md`, symlink them to this file.
Human contributors: read [CONTRIBUTING.md](CONTRIBUTING.md); it covers the same ground in more depth.

## What this is

Rostra — an all-in-one Discord bot. Node 20+ ESM · TypeScript strict · discord.js v14 · Prisma + PostgreSQL
· Redis · BullMQ · Fastify · Pino · Zod · Biome. Each feature is a self-contained module under
`src/modules/<name>/` that's auto-discovered at boot.

## Read first (don't scan the whole repo)

1. `docs/overview.mdx` — the map.
2. `docs/architecture/index.mdx` — how it fits together.
3. Only the `docs/modules/<name>.mdx` for the area you're touching.
4. `docs/style.mdx` — conventions. `docs/sessions/log.mdx` — recent change history.

## Hard invariants (CI enforces these — a PR that breaks them fails)

1. **ESM + TypeScript strict.** No `require()`. No `any` (use `unknown` + narrow).
2. **No raw env / DB.** Read env only via `config` (`src/config.ts`); construct the DB client only in
   `src/services/database.ts` (`getPrisma()`).
3. **UI only from `@/ui`.** Never instantiate discord.js component builders (`ButtonBuilder`,
   `ActionRowBuilder`, `ContainerBuilder`, `StringSelectMenuBuilder`, `ModalBuilder`, `TextInputBuilder`)
   in a module. If `@/ui` is missing something, **add it to `@/ui` (with a test) first**, then use it.
4. **Components V2 only** — never `EmbedBuilder`/legacy embeds.
5. **Undercover mode.** This bot ships an AI assistant whose provider is a hidden implementation detail.
   Never reference any AI provider/model name (OpenAI, Anthropic, Claude, GPT, Groq, Gemini, Llama, Mistral,
   …) anywhere — code, comments, strings, status, errors, `package.json`, README, or commit messages. The
   assistant presents only as "Rostra". Use neutral env names (`AI_API_KEY`, `AI_BASE_URL`, `AI_MODEL`).
   **Do not add AI-tool trailers/co-author lines to commits.**
6. **Slash-only commands**, namespaced under a top-level command via subcommands/groups (Discord's
   100-command cap).
7. **Modules are isolated** — never import another module's internals; share only via `services/`, `utils/`,
   `ui/`, `types/`, `i18n/`.
8. **Every user-facing string** goes through `t()` (`src/i18n`). Wrap I/O in try/catch with Pino logs.

## Shared building blocks (import these)

- `getPrisma()` · `config` · `getCache()`/`getRedis()` · `getLogger(scope)`
- `@/ui` — buttons, selects, modals, layout, patterns (`confirmRow`, `settingsPanel`, `paginatorRow`)
- `defineEvent(name, { execute })` — typed event handlers
- `withSafeAck` — already wired into the pipeline/router; handlers needn't manage the 3s deadline
- customId convention for components: `module:action:arg` (the module's `ComponentHandler` routes it)

## Module shape

```ts
// src/modules/<name>/index.ts
const myModule: BotModule = {
  name: "mymodule",
  commands: [/* SlashCommand[] */],
  events: [/* RegisteredEvent[] */],
  components: [/* ComponentHandler[] */],
  jobs: [/* JobDefinition[] */],
  i18n: { key: "string {var}" },
};
export default myModule;
```

Reference modules: `src/modules/core` (minimal), `src/modules/moderation` & `src/modules/tickets` (richer,
DB + components).

## Commands

```bash
npm run typecheck     # tsc --noEmit
npm run lint          # Biome (lint:fix to autofix)
npm run test:env      # node:test via tsx, with .env loaded
npm run dev           # run locally (watch)
npm run prisma:generate
npm run deploy:commands
```

## Definition of done for a change

`typecheck` + `lint` + `test:env` all pass; new logic has a `*.test.ts`; UI built via `@/ui`; invariants
respected; `docs/modules/*.mdx` + `docs/sessions/log.mdx` updated if structure changed; conventional commit
message (no AI trailers).
