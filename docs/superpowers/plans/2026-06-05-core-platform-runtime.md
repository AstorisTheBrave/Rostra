# Core Platform - Runtime Implementation Plan (1b)

> **For agentic workers:** Execute task-by-task; TDD where unit-testable; commit per task. Live Discord
> behavior (login, command registration) requires a real token and is verified by build/typecheck +
> the project owner's smoke-test, not unit tests.

**Goal:** Turn the tested foundation into a running, shardable bot: a `BotClient`, auto-loaders for
modules, a slash-command execution pipeline, an interaction router, a job queue, a Fastify health server
with the top.gg vote webhook + stats autoposter, the `cluster.ts`/`bot.ts` entry points, graceful
shutdown, command deployment, build wiring, and ops files.

**Architecture:** Manager process (`cluster.ts`) runs `ShardingManager` + Fastify + autoposter; each
shard (`bot.ts`) boots a `BotClient` that auto-discovers `src/modules/*` and registers their commands,
events, components, and jobs. All output is Components V2; all cross-shard calls go through `Ipc`.

**Tech Stack:** discord.js v14, Fastify 5, BullMQ (+ in-memory fallback), @top-gg/sdk + topgg-autoposter,
tsup (with path-alias plugin), node:test.

**Invariants:** no `any`; ESM; Components V2 only; undercover; slash-only; no `process.env` outside config;
`getPrisma()` only; modules self-contained.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/types/module.ts` | Module contract: `SlashCommand`, `ComponentHandler`, `RegisteredEvent`, `JobDefinition`, `BotModule`, `CommandContext` |
| `src/client/BotClient.ts` | `Client` subclass; collections; `init()` calls loaders |
| `src/client/defineEvent.ts` | typed event factory (`RegisteredEvent`) avoiding `any` |
| `src/client/loaders/commands.ts` | discover modules → build command map + JSON |
| `src/client/loaders/events.ts` | register module + core events |
| `src/client/loaders/interactions.ts` | register component handlers by prefix |
| `src/client/loaders/jobs.ts` | register BullMQ queues/workers + cron |
| `src/client/loaders/modules.ts` | discover `src/modules/*/index.ts` → `BotModule[]` |
| `src/pipeline/runCommand.ts` | perms guard → cooldown → validate → execute → error boundary |
| `src/pipeline/cooldown.ts` | Redis token-bucket (memory fallback) |
| `src/pipeline/permissions.ts` | user/bot permission checks |
| `src/interactions/router.ts` | `interactionCreate` dispatch (commands, components, autocomplete) |
| `src/jobs/queue.ts` | queue factory: BullMQ if Redis, else in-memory |
| `src/services/topgg.ts` | `Api` singleton, `hasVoted`, vote recording |
| `src/web/server.ts` | Fastify: `/health`, `/health/shards`, `/metrics`, `/votes/topgg` |
| `src/web/autopost.ts` | aggregate guild count via IPC, post to top.gg |
| `src/cluster.ts` | manager entry: ShardingManager + web + autopost |
| `src/bot.ts` | shard entry: BotClient.init + login + shutdown hooks |
| `src/lifecycle/shutdown.ts` | graceful shutdown registration |
| `src/modules/core/index.ts` | sample module: `/ping`, `/help` (validates the whole chain) |
| `src/scripts/deploy-commands.ts` | REST command registration |
| `tsup.config.ts` | add esbuild path-alias + `.ts` resolution |
| `Dockerfile`, `docker-compose.yml`, `README.md` | ops (undercover-clean) |
| `.github/workflows/ci.yml` | typecheck + lint + test + EmbedBuilder grep guard |

---

## Key Contracts (lock these)

```ts
// src/types/module.ts
import type {
	AutocompleteInteraction,
	Awaitable,
	ChatInputCommandInteraction,
	ClientEvents,
	PermissionResolvable,
	RESTPostAPIApplicationCommandsJSONBody,
} from "discord.js";
import type { BotClient } from "@/client/BotClient.ts";

export interface CommandContext {
	interaction: ChatInputCommandInteraction;
	client: BotClient;
}

export interface SlashCommand {
	data: { toJSON(): RESTPostAPIApplicationCommandsJSONBody; name: string };
	ownerOnly?: boolean;
	guildOnly?: boolean;
	cooldownMs?: number;
	userPermissions?: PermissionResolvable[];
	botPermissions?: PermissionResolvable[];
	execute(ctx: CommandContext): Awaitable<void>;
	autocomplete?(interaction: AutocompleteInteraction, client: BotClient): Awaitable<void>;
}

export interface ComponentHandler {
	prefix: string; // matches first segment of customId "prefix:..."
	execute(interaction: import("discord.js").MessageComponentInteraction | import("discord.js").ModalSubmitInteraction, args: string[], client: BotClient): Awaitable<void>;
}

export interface RegisteredEvent {
	name: keyof ClientEvents;
	once: boolean;
	register(client: BotClient): void;
}

export interface JobDefinition {
	name: string;
	cron?: string;
	handler(payload: unknown): Awaitable<void>;
}

export interface BotModule {
	name: string;
	commands?: SlashCommand[];
	events?: RegisteredEvent[];
	components?: ComponentHandler[];
	jobs?: JobDefinition[];
	i18n?: Record<string, string>; // en strings, registered under namespace = module name
}
```

```ts
// src/client/defineEvent.ts - typed, no `any`
import type { ClientEvents } from "discord.js";
import type { BotClient } from "@/client/BotClient.ts";
import type { RegisteredEvent } from "@/types/module.ts";
import { getLogger } from "@/services/logger.ts";

const log = getLogger("event");

export function defineEvent<K extends keyof ClientEvents>(
	name: K,
	opts: { once?: boolean; execute: (client: BotClient, ...args: ClientEvents[K]) => unknown },
): RegisteredEvent {
	return {
		name,
		once: opts.once ?? false,
		register(client) {
			const bind = (opts.once ? client.once : client.on).bind(client);
			bind(name, (...args) => {
				try {
					Promise.resolve(opts.execute(client, ...(args as ClientEvents[K]))).catch((err) =>
						log.error({ err, event: name }, "event handler rejected"),
					);
				} catch (err) {
					log.error({ err, event: name }, "event handler threw");
				}
			});
		},
	};
}
```

---

## Tasks

### Task 1: Module contract types
- Create `src/types/module.ts` (code above). Verify: `npm run typecheck` (will fail until BotClient exists - create a minimal stub first or do Task 2 together). Commit.

### Task 2: BotClient + defineEvent
- Create `src/client/BotClient.ts`: extends `Client` with correct intents/partials; holds
  `commands: Collection<string, SlashCommand>`, `components: ComponentHandler[]`, `cooldowns`;
  `ipc: Ipc` (set in init); `async init()` runs module discovery + loaders.
- Create `src/client/defineEvent.ts` (code above).
- Test: `src/client/BotClient.test.ts` - `new BotClient()` has empty `commands` collection and expected intents bitfield includes Guilds.
- Commit.

### Task 3: Module loader + command/event/interaction/job loaders
- `src/client/loaders/modules.ts`: read `src/modules/*/index.ts`, import default `BotModule`, return list.
  (Use `node:fs` readdir + dynamic `import()` of `file://` URLs; skip non-dirs.)
- `commands.ts`: fill `client.commands` (dedupe by name, warn on clash); collect JSON array.
- `events.ts`: call `event.register(client)` for each module event.
- `interactions.ts`: push module components into `client.components`.
- `jobs.ts`: register jobs into the queue (Task 6).
- Each loader registers i18n via `registerLocale("en", module.name, module.i18n)`.
- Test: `src/client/loaders/modules.test.ts` - point loader at a temp fixture dir with one module file,
  assert it returns the module with its command. Commit.

### Task 4: Command pipeline
- `src/pipeline/permissions.ts`: `checkPermissions(interaction, cmd)` → `{ ok: boolean; reason?: string }`
  (owner check via `config.discord.ownerIds`, guildOnly, user/bot perms).
- `src/pipeline/cooldown.ts`: `consume(key, ms)` → `{ ok; retryAfterMs }` using Redis `INCR`+`PEXPIRE`
  when `getRedis()`, else an in-memory Map with timestamps.
- `src/pipeline/runCommand.ts`: orchestrates guard → cooldown → `cmd.execute(ctx)` inside try/catch;
  on failure `reply.error(interaction, t("common:error.generic"))` + Pino log with a generated trace id.
- Tests: `cooldown.test.ts` (memory path: second consume within window fails; after expiry passes);
  `permissions.test.ts` (owner bypass; missing user perm fails) using lightweight fake interaction objects.
- Commit.

### Task 5: Interaction router
- `src/interactions/router.ts`: a `defineEvent("interactionCreate", …)` that:
  - ChatInput → look up `client.commands`, call `runCommand`.
  - Autocomplete → call `cmd.autocomplete`.
  - Component/Modal → split `customId` on `:`, match `client.components` by `prefix`, call with rest args.
- Test: `router.test.ts` - `parseCustomId("mod:ban:confirm:123")` helper returns `{ prefix:"mod", args:["ban","confirm","123"] }`. Commit.

### Task 6: Job queue
- `src/jobs/queue.ts`: if `getRedis()`, create BullMQ `Queue`/`Worker` per job; else an in-memory
  scheduler (setTimeout/cron via a tiny parser or `node-cron` if added). Expose `enqueue(name, payload)`
  and `registerJob(def)`.
- Test: `queue.test.ts` - in-memory path: `registerJob` + `enqueue` runs the handler. Commit.

### Task 7: top.gg service + web server + autopost
- `src/services/topgg.ts`: lazy `Api` singleton (only if `config.topgg.token`); `hasVoted(userId)` with
  short Redis TTL cache; `recordVote(vote)` → upsert `User`, create `UserVote`.
- `src/web/server.ts`: Fastify; `/health` → 200; `/health/shards` → IPC-aggregated (manager passes a
  getter); `/metrics`; `POST /votes/topgg` → verify `Authorization` against `config.topgg.webhookAuth`,
  parse body, `recordVote`.
- `src/web/autopost.ts`: `startAutopost(getCount)` posts every 30 min if token set.
- Test: `topgg.test.ts` - webhook auth check rejects wrong/missing header (pure function `verifyVoteAuth`).
  Commit.

### Task 8: Entries + shutdown + deploy + build wiring
- `src/lifecycle/shutdown.ts`: `registerShutdown(fn)`; on SIGINT/SIGTERM run all, disconnect prisma/cache,
  destroy client, exit.
- `src/bot.ts`: construct BotClient, `await client.init()`, register shutdown, `client.login(token)`;
  global `unhandledRejection`/`uncaughtException` → Pino log (no crash).
- `src/cluster.ts`: `ShardingManager(resolve bot.ts, { token, totalShards, respawn })`; start Fastify;
  start autopost (count via `manager.broadcastEval(c => c.guilds.cache.size)` summed); `spawn()`.
- `src/scripts/deploy-commands.ts`: build JSON from a throwaway module load, `REST.put` global (+ guild
  for `/owner`).
- `tsup.config.ts`: add esbuild plugin resolving `@/*` → `src/*` and stripping `.ts` for bundling
  (use `esbuild`'s `resolve` via `esbuildOptions` or `tsup`'s `esbuildPlugins` with a small alias plugin).
- Verify: `npm run typecheck`, `npm run build` (must emit `dist/cluster.js` + `dist/bot.js`),
  `npm run test:env`. Commit.

### Task 9: Sample core module
- `src/modules/core/index.ts`: `BotModule` with `/ping` (latency via Components V2) and `/help`
  (lists loaded command names). i18n strings under `core`.
- Test: loader test extended to load the real `core` module and assert `/ping` present. Commit.

### Task 10: Ops
- `Dockerfile` (multi-stage node:20-alpine: install, prisma generate, build, run `dist/cluster.js`).
- `docker-compose.yml`: services `bot`, `postgres`, `pgbouncer`, `redis`, optional `lavalink`.
- `README.md`: setup, env, run, deploy - undercover-clean (no provider names).
- `.github/workflows/ci.yml`: install → prisma generate → typecheck → lint → test → `grep -r "EmbedBuilder" src && exit 1 || true` guard.
- Commit + update `docs/sessions/log.mdx` and `memory.md`.

---

## Self-Review checklist (run after build)
- All spec runtime items (§4, §6.5–6.8, §6.11–6.12, §9, §9a, §10) mapped to a task ✓
- No `any` (event typing via `defineEvent`) ✓
- Components V2 only (CI grep guard) ✓
- Undercover (no provider strings; neutral AI env) ✓
- top.gg autopost from manager ✓; Lavalink config only (player logic = music module) ✓
