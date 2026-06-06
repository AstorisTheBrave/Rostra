# Design Spec - Unified Discord Bot: Core Platform (Sub-project 1)

**Date:** 2026-06-05
**Status:** Approved (architecture); pending spec review
**Scope:** The shared core platform only. Feature modules are separate specs built on top of this.

---

## 1. Purpose

Replace 15 archived Discord bots (8 Node/discord.js, 5 Python/discord.py + variants) with one production-grade, sharded TypeScript bot. This spec defines the **shared foundation** every feature module plugs into: process topology, config, data layer, client, loaders, command framework, UI kit, i18n, cross-cutting concerns, and ops.

Feature modules (moderation, security, automod, economy, leveling, tickets, music, games, ai, etc.) are **out of scope here** - each gets its own spec → plan → build cycle layered on this core.

## 2. Hard Constraints (invariants)

1. **Undercover mode:** zero references to Anthropic/Claude/OpenAI/Groq/any AI provider anywhere - code, comments, strings, status, errors, package.json, README, commits. AI replies as bot persona only; model is hidden. Neutral env names (`AI_API_KEY`, `AI_BASE_URL`).
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
| Music | Lavalink (multi-node + failover) via a client lib (`lavalink-client`/shoukaku) - music module |
| Bot list | `@top-gg/sdk` (`Api`, `Webhook`) + `topgg-autoposter` |

## 4. Process Topology

```
cluster.ts  (manager process)
  ├─ ShardingManager (totalShards: 'auto', respawn: true)
  ├─ Fastify health server (single port)
  │     ├─ /health, /health/shards, /metrics (aggregates shard stats via IPC)
  │     └─ /votes/topgg  (top.gg vote webhook, auth-verified → IPC to owning shard)
  ├─ top.gg stats autoposter (aggregates guild count across shards via IPC, posts)
  └─ spawns N × bot.ts (one BotClient per shard process)
        ├─ BotClient (extends discord.js Client)
        ├─ loaders: commands, events, interactions, jobs
        ├─ services: getPrisma(), getCache(), getLogger(), ipc
        └─ BullMQ workers (in-process by default; WORKER_MODE=process to split)
```

- **Shard count:** `'auto'` (Discord-recommended) unless `SHARD_COUNT` env set.
- **IPC abstraction:** `cluster/ipc.ts` exposes `broadcast(fn)`, `fetchValues(prop)`, `send(channel, payload)`, `respawnAll()`. Backed by native `ShardingManager`/`ShardClientUtil` now; a `SHARDING_MODE=hybrid` flag selects a `discord-hybrid-sharding` implementation behind the same interface later - modules never call the sharding lib directly.

## 5. Directory Layout

```
src/
  cluster/        cluster.ts (manager entry), ipc.ts (sharding abstraction)
  client/         BotClient.ts, loaders/{commands,events,interactions,jobs}.ts
  modules/        <feature>/index.ts → { commands, events, interactions, jobs, i18n }
  commands/       (none global; commands live in modules - folder reserved for truly shared)
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
Single Zod schema for all env vars (collected from the catalogue). Parses `process.env` once at import, validates, freezes, exports typed `config`. Throws a clear aggregated error on missing/invalid vars at boot. Sections: discord (token, clientId, ownerIds, devGuildId), database (`DATABASE_URL`, pool size), redis (`REDIS_URL?`), web (`PORT`, `HOST`), sharding (`SHARD_COUNT?`, `SHARDING_MODE`), logging (`LOG_LEVEL`, `NODE_ENV`), ai (`AI_API_KEY?`, `AI_BASE_URL?`, `AI_MODEL?` - neutral names), music (`LAVALINK_NODES` JSON array, `LAVALINK_RECONNECT_TRIES?`, `LAVALINK_RESUME?`, `LAVALINK_REST_TIMEOUT?`), topgg (`TOPGG_TOKEN?`, `TOPGG_WEBHOOK_AUTH?`, `TOPGG_BOT_ID?`), feature webhooks. All optional integrations no-op when unset. No raw `process.env` elsewhere.

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

## 9a. External Integrations

### top.gg (bot listing)
- **Stats autoposting** runs in the **manager process** (`cluster.ts`), not per-shard: a scheduled task aggregates `serverCount` across all shards via `ipc.fetchValues('guilds.cache.size')`, sums it, then `new Api(config.topgg.token).postStats({ serverCount, shardCount })`. (Per-shard `topgg-autoposter` would post partial counts - avoided.) Posts every 30 min; skipped if `TOPGG_TOKEN` unset.
- **Vote webhook** mounted on the Fastify health server at `POST /votes/topgg`. Uses `@top-gg/sdk` `Webhook(config.topgg.webhookAuth)` verification (rejects bad/missing auth). On a valid `vote` ({ user, bot, type, isWeekend, query }), the manager forwards via IPC to the shard owning that user's mutual guilds (or broadcasts) → a `voteService` records the vote in Postgres (`UserVote` model: userId, votedAt, isWeekend, source) and emits an internal `vote` event modules can subscribe to (e.g. economy reward, perk role). Weekend votes flagged for double rewards.
- **`hasVoted(userId)`** helper in a shared `services/topgg.ts` (lazy `Api` singleton, cached result with short Redis TTL) so any module can gate perks on a recent vote and prompt non-voters with a V2 vote button.
- Config is optional - all of the above no-ops cleanly when top.gg env is absent.

### Lavalink (music) - multi-node + failover
- Music module connects to **multiple Lavalink nodes with automatic failover**. Nodes are configured as a JSON array in env: `LAVALINK_NODES` = `[{ "id","host","port","password","secure" }, ...]` (parsed + Zod-validated in `config.ts` into `config.lavalink.nodes`).
- The music client (`lavalink-client` or shoukaku, decided in the music module spec) is initialized with all nodes; on node disconnect/error it migrates active players to the next healthy node (`moveOnDisconnect`/resume). Node health + reconnect/retry settings are env-tunable (`LAVALINK_RECONNECT_TRIES`, `LAVALINK_RESUME`, `LAVALINK_REST_TIMEOUT`).
- Core platform only reserves the validated `config.lavalink` shape + the `cluster/ipc.ts` voice-state plumbing; actual player logic is the music module spec.

## 10. Ops

- `Dockerfile` (multi-stage, Node 20 alpine, tsup build) + `docker-compose.yml` (bot, postgres, pgbouncer, redis, lavalink optional). No provider names anywhere.
- Scripts: `dev` (tsx watch), `build` (tsup), `start` (node dist cluster), `deploy:commands`, `lint` (biome), `migrate` (prisma), `migrate:data` (per-bot importers).
- `README.md`: setup, env, deploy - undercover-clean.
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

- Bot name: ✅ **Rostra**. Repo: https://github.com/AstorisTheBrave/Rostra (private). AI module persona speaks as "Rostra"; exact status/activity strings TBD at deploy (undercover-clean).
- Lavalink: ✅ multiple nodes with fallback - `LAVALINK_NODES` JSON array (§9a). Concrete node values supplied at deploy.
- GitHub private repo: ✅ approved - created via `gh`.
- top.gg: ✅ integrated (§9a) - autopost from manager, vote webhook on Fastify, `hasVoted` helper.
