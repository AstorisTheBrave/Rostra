# Design Spec — Unified Discord Bot: Core Platform (Sub-project 1)

**Date:** 2026-06-05
**Status:** Approved (architecture); pending spec review
**Scope:** The shared core platform only. Feature modules are separate specs built on top of this.

---

## 1. Purpose

Replace 15 archived Discord bots (8 Node/discord.js, 5 Python/discord.py + variants) with one production-grade, sharded TypeScript bot. This spec defines the **shared foundation** every feature module plugs into: process topology, config, data layer, client, loaders, command framework, UI kit, i18n, cross-cutting concerns, and ops.

Feature modules (moderation, security, automod, economy, leveling, tickets, music, games, ai, etc.) are **out of scope here** — each gets its own spec → plan → build cycle layered on this core.

## 2. Hard Constraints (invariants)

1. **Undercover mode:** zero references to Anthropic/Claude/OpenAI/Groq/any AI provider anywhere — code, comments, strings, status, errors, package.json, README, commits. AI replies as bot persona only; model is hidden. Neutral env names (`AI_API_KEY`, `AI_BASE_URL`).
2. No `process.env` access outside `src/config.ts`.
3. No `new PrismaClient()` outside `src/services/database.ts`; all access via `getPrisma()`.
4. **Components V2 only** (`MessageFlags.IsComponentsV2`); no legacy embeds.
5. Slash-only commands; no prefix engine.
6. No `any`; ESM only.
7. Each module self-contained in `src/modules/<name>/`; no cross-module internal imports.
8. Every user string via i18n `t()`.

## 3. Stack

| Concern | Choice |
|---|---|
| Runtime | Node 20+ (tested on v24), ESM |
| Language | TypeScript 5.x strict |
| Discord | discord.js v14 (latest) |
| Scaling | native `ShardingManager` + `cluster/ipc.ts` abstraction (hybrid-sharding swappable via config) |
| Database | PostgreSQL + Prisma |
| Cache | Redis via ioredis; Keyv wrapper for simple KV |
| Jobs | BullMQ (Redis); in-memory fallback when `REDIS_URL` absent |
| Logging | Pino (JSON prod, pretty dev) |
| Validation | Zod (env + all inputs) |
| HTTP | Fastify (health/metrics only; no dashboard) |
| Build | tsup (ESM bundle) |
| Lint/format | Biome (tabs) |
| Profanity | `bad-words` (automod module) |

## 4. Process Topology

```
cluster.ts  (manager process)
  ├─ ShardingManager (totalShards: 'auto', respawn: true)
  ├─ Fastify health server (single port; aggregates shard stats via IPC broadcastEval)
  └─ spawns N × bot.ts (one BotClient per shard process)
        ├─ BotClient (extends discord.js Client)
        ├─ loaders: commands, events, interactions, jobs
        ├─ services: getPrisma(), getCache(), getLogger(), ipc
        └─ BullMQ workers (in-process by default; WORKER_MODE=process to split)
```

- **Shard count:** `'auto'` (Discord-recommended) unless `SHARD_COUNT` env set.
- **IPC abstraction:** `cluster/ipc.ts` exposes `broadcast(fn)`, `fetchValues(prop)`, `send(channel, payload)`, `respawnAll()`. Backed by native `ShardingManager`/`ShardClientUtil` now; a `SHARDING_MODE=hybrid` flag selects a `discord-hybrid-sharding` implementation behind the same interface later — modules never call the sharding lib directly.

## 5. Directory Layout

```
src/
  cluster/        cluster.ts (manager entry), ipc.ts (sharding abstraction)
  client/         BotClient.ts, loaders/{commands,events,interactions,jobs}.ts
  modules/        <feature>/index.ts → { commands, events, interactions, jobs, i18n }
  commands/       (none global; commands live in modules — folder reserved for truly shared)
  events/         core lifecycle events not owned by a module (ready, error)
  services/       database.ts (getPrisma), cache.ts (getCache), logger.ts (getLogger)
  interactions/   router.ts (customId "module:action:scope:arg" dispatch)
  jobs/           queue.ts (BullMQ setup + in-memory fallback), scheduler.ts
  i18n/           index.ts (t()), locales/en/*.json (merged from modules at boot)
  types/          global.d.ts, augment discord.js Client, shared domain types
  utils/          components.ts (V2 kit), embedsBanned.ts(lint guard), permissions.ts,
                  cooldown.ts, errors.ts, rateLimit.ts
  config.ts       Zod env schema + cached typed loader
  bot.ts          shard entry (boots one BotClient)
prisma/
  schema.prisma   unified schema (core models here; modules add models via merged schema)
scripts/
  migrate/        per-bot data migration scripts (LMDB/Mongo/sqlite/quickdb → Postgres)
  deploy-commands.ts
docs/             documentary output + specs
Dockerfile, docker-compose.yml, biome.json, tsconfig.json, tsup.config.ts,
package.json, .env.example, README.md
```

## 6. Core Components

### 6.1 `config.ts`
Single Zod schema for all env vars (collected from the catalogue). Parses `process.env` once at import, validates, freezes, exports typed `config`. Throws a clear aggregated error on missing/invalid vars at boot. Sections: discord (token, clientId, ownerIds, devGuildId), database (`DATABASE_URL`, pool size), redis (`REDIS_URL?`), web (`PORT`, `HOST`), sharding (`SHARD_COUNT?`, `SHARDING_MODE`), logging (`LOG_LEVEL`, `NODE_ENV`), ai (`AI_API_KEY?`, `AI_BASE_URL?`, `AI_MODEL?` — neutral names), music/lavalink (`LAVALINK_*`), feature webhooks. No raw `process.env` elsewhere.

### 6.2 `services/database.ts`
`getPrisma()` → lazy singleton `PrismaClient` per process, cached at module scope. Configured with `connection_limit` from config (≈5/shard). Logs queries in dev. Exposes `disconnectPrisma()` for graceful shutdown.

### 6.3 `services/cache.ts`
`getCache()` → ioredis singleton (if `REDIS_URL`) wrapped by Keyv; in-memory Map fallback otherwise. Helpers: `cacheGet/Set/Del`, `withCache(key, ttl, fn)`, plus raw redis client accessor for sorted-set leaderboard ops. `disconnectCache()` for shutdown.

### 6.4 `services/logger.ts`
Pino root logger; `getLogger(scope)` → child with `{ scope, shard }` bindings. Pretty transport in dev, JSON in prod. Redacts token/secret fields. **Never logs provider names** (undercover).

### 6.5 `client/BotClient.ts`
Extends `Client`. Holds `commands: Collection`, `interactions` registry, `cooldowns`. Correct intents/partials for ported features (Guilds, GuildMembers, GuildMessages, MessageContent, GuildVoiceStates, GuildModeration, etc.). Calls the four loaders in `init()`. Typed via `declare module 'discord.js'` augmentation in `types/`.

### 6.6 Loaders (`client/loaders/`)
Auto-discover `src/modules/*/index.ts`, aggregate their exports:
- **commands:** build `SlashCommandBuilder` trees; register into `client.commands`; collect JSON for deploy.
- **events:** bind module + core event handlers (with error boundary wrapper).
- **interactions:** register component handlers keyed by `module:action` prefix.
- **jobs:** register BullMQ queues/workers + cron schedules.
Dropping a module folder in = it loads. No central manifest to edit.

### 6.7 Command framework
- ~16 top-level commands, each a module namespace using subcommand-groups + subcommands (≤25×25), to stay under Discord's 100-global cap. Mapping in §8.
- Global registration (one REST push via `scripts/deploy-commands.ts`); `/owner` registered guild-scoped to `devGuildId`.
- Execution pipeline per command: resolve → permission guard → cooldown (Redis token bucket) → input validation (Zod) → `execute(ctx)` inside error boundary → on throw, ephemeral V2 error message + logged with trace id.

### 6.8 Interaction router (`interactions/router.ts`)
`interactionCreate` → for components/modals, parse `customId` = `module:action:scope:arg`, look up the owning module's handler, dispatch with parsed args. Central, so modules never touch raw `interactionCreate`.

### 6.9 Components V2 kit (`utils/components.ts`)
Typed helpers returning V2 builders + the `IsComponentsV2` flag: `container({accent, children})`, `text(md)`, `section(text, accessory)`, `gallery(urls)`, `divider(size)`, `reply.success(i, msg)`, `reply.error(i, msg)`, `reply.ephemeral(...)`. Modules build all output through this. A lint guard (`utils/embedsBanned.ts` + Biome rule/CI grep) fails the build if `EmbedBuilder` appears.

### 6.10 i18n (`i18n/`)
`t(key, vars?, locale='en')`. Locale JSON merged from each module's `i18n` export at boot under a `module:` namespace. en-only now; structure ready for more locales. All user strings are keys.

### 6.11 Jobs (`jobs/`)
BullMQ queues when Redis present; in-memory fallback otherwise (timers). Core provides queue factory + a cron scheduler. Modules register jobs (giveaway end, ticket auto-close, reminders, birthday daily, AFK expiry, trivia daily/weekly).

### 6.12 Health server (`cluster.ts` + Fastify)
`/health` (manager up), `/health/shards` (per-shard ready/ping/guild counts via IPC), `/metrics` (basic counters). Single port. No other web surface.

## 7. Data Layer

- One `prisma/schema.prisma` merging all legacy storage (LMDB, quickmongo, Mongoose, quick.db, better-sqlite3, raw PG, aiosqlite, ~25 Yuna sqlite files) into normalized Postgres models. Core models defined now: `Guild` (per-guild config root), `GuildModuleConfig`, `User`, `GuildMember`, `Blacklist` (global), `OwnerAudit`. Feature models added by their module specs.
- Redis: leaderboard sorted sets (`lb:level:<guild>`, `lb:eco:<guild>`, trivia), hot guild-config cache (write-through), rate-limit buckets, antinuke audit memory, BullMQ.
- Pooling: Prisma `?connection_limit=5&pool_timeout=15`; pgBouncer (transaction mode) in front documented in `docker-compose.yml` for 1M-DAU scale.
- Every query in try/catch → structured Pino error log; caller gets a safe result/Result type.

## 8. Command Namespace Map (top-level → groups/subs)

`/mod` (ban,kick,timeout,untimeout,warn,warnings,case,purge,massban,lock,unlock,role,nick,dm) ·
`/security` (antinuke, whitelist, extraowner, quarantine, roleprotect, antiraid) ·
`/automod` (setup, filter, whitelist, history) ·
`/config` (logging, welcome, autorole, jointocreate, serverstats, reactionroles, settings hub) ·
`/economy` (balance,daily,work,beg,crime,fish,mine,gamble,rob,pay,deposit,withdraw,shop,inventory,leaderboard) ·
`/level` (rank, leaderboard, set, add, remove, reward) ·
`/ticket` (create,close,claim,priority,panel) ·
`/apply` (apply, panel, manage, blacklist, export) ·
`/giveaway` (start,end,reroll,delete,list) ·
`/util` (avatar,banner,userinfo,serverinfo,roleinfo,snipe,afk,firstmsg,weather,define,urban,movie,shorten) ·
`/fun` (8ball,roll,flip,rps,ship,rate,meme,mock,fight,wanted,roleplay…) ·
`/tools` (calculate,base,hex,color,countdown,unixtime,time,password,randomuser,embedbuilder,poll) ·
`/music` (play,queue,skip,pause,resume,stop,volume,loop,filter,nowplaying,playlist…) ·
`/game` (tictactoe,chess,connect4,wordle,2048,battleship,rps,trivia-quick…) ·
`/trivia` (start,profile,leaderboard,achievements,categories,streak) ·
`/birthday` (set,remove,list,channel,next) ·
`/feedback` (send, setup) ·
`/owner` (guild-scoped: eval,reload,blacklist,leaveserver,stats,broadcast).
Flat standalone reserved for high-frequency only (e.g. `/ping`, `/help`).

> Count budget: ~18 top-level ≤ 100 cap, with room to spare. Each top-level holds up to 25 groups × 25 subs.

## 9. Cross-cutting

- **Errors:** global `process.on('unhandledRejection'|'uncaughtException')` → Pino log with reason+stack; shard does not crash on rejections. Command/event/interaction boundaries each wrap handlers.
- **Permissions:** `utils/permissions.ts` guard checks bot + user perms before execute; returns localized V2 error on failure.
- **Rate limit / cooldown:** Redis token-bucket per (command,user) and global abuse protection (ported from TitanBot `abuseProtection`).
- **Graceful shutdown:** SIGTERM/SIGINT → stop accepting interactions, drain BullMQ, `disconnectPrisma()`, `disconnectCache()`, `client.destroy()`, flush logs, exit.
- **Validation:** Zod schemas for every command's options and every external payload.

## 10. Ops

- `Dockerfile` (multi-stage, Node 20 alpine, tsup build) + `docker-compose.yml` (bot, postgres, pgbouncer, redis, lavalink optional). No provider names anywhere.
- Scripts: `dev` (tsx watch), `build` (tsup), `start` (node dist cluster), `deploy:commands`, `lint` (biome), `migrate` (prisma), `migrate:data` (per-bot importers).
- `README.md`: setup, env, deploy — undercover-clean.
- CI later: typecheck + biome + tests.

## 11. Migration / Decommission

- `scripts/migrate/<bot>.ts` importers map each legacy store → Postgres.
- `MIGRATION.md`: per-bot decommission steps.
- After a module's features are verified ported and data migrated, delete that bot's `Archive/` subfolder (user instruction). `Archive/` is gitignored.

## 12. Testing

- `node --test` (built-in) for: config validation, components kit (asserts V2 flag, rejects embeds), i18n key resolution, command pipeline (perm/cooldown/error boundary), IPC abstraction, graceful shutdown. Failure-path tests (port TitanBot's pattern). Module tests ship with each module spec.

## 13. Out of Scope (later specs)

Feature module implementations; Lavalink/music internals; AI persona/provider wiring (neutral interface only here); web dashboard (none planned).

## 14. Open Items

- Bot persona name/identity for AI module + status strings — to be supplied by user (must be undercover-clean).
- Lavalink connection details — user to provide for the music module spec.
- GitHub private repo creation via `gh` — on user confirmation.
