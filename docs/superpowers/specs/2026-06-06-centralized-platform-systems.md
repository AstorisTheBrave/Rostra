# Spec: Centralized Platform Systems (tenant config, durable scheduler, cron, caching)

status: proposed · owner: AstorisTheBrave · 2026-06-06

Goal: lift Rostra from "many independent modules" to a platform that competes with MEE6 / Wick / Beemo /
Sapphire on reliability and efficiency. Four centralized systems, adapted from Project Anastasia (tenant,
durable recovery, scheduler) and informed by Postgres/Redis best practices.

## 1. Centralized per-guild config: the GuildTenant

**Idea.** One cached, authoritative config object per guild instead of each module doing its own DB read.
The setup wizard and every feature read/write through it. No raw per-request DB lookups on hot paths.

**Shape.** Keep the existing typed per-feature tables (AutomodConfig, TicketConfig, ...) as the source of
truth, but add a `tenant` service that assembles and caches the parts a request needs:

- `getTenant(guildId)` returns a frozen aggregate (feature toggles + channel/role ids + counters).
- Two-layer cache-aside: **L1** in-process LRU (per shard, hot guilds) + **L2** Redis
  `tenant:<guildId>` as JSON with `SET ... EX 300` (5 min). Miss -> DB -> backfill both layers.
- Writes go through `updateTenant(guildId, patch)` which writes the underlying table **and** invalidates
  both cache layers (delete the Redis key, evict L1). This keeps module config caches from going stale
  (the bug we would hit if the wizard wrote tables directly).
- "Channels the wizard creates" (log channel, ticket category, welcome channel, ...) live as ids on the
  tenant, so features resolve them from cache, never a fresh `guild.channels.fetch` scan.

**Why 5 min TTL.** Config changes are rare; a 5-minute Redis TTL bounds staleness while cutting DB trips by
orders of magnitude for read-heavy events (every message hits automod/leveling config).

**Range / blast radius.** New `src/services/tenant.ts` + a `GuildTenant`-style cache key. *Low* to start
(additive); *high* if we migrate every module at once. Rollout: ship the service + cache, migrate the
hottest read paths first (automod, leveling, logging messageCreate handlers), leave the rest reading their
own cached config until touched. No schema change required for v1 (tenant aggregates existing tables).

## 2. Durable scheduler: survive restart and crash

**Problem.** Today each timed feature keeps its own per-shard `setTimeout` map (reminders, giveaways,
birthday temp-role, ticket auto-close). They re-arm on `ready`, but the logic is duplicated and new durable
actions (tempban, tempmute, temprole) have nowhere to live.

**Idea.** One `ScheduledTask` table + one scheduler service:

```
model ScheduledTask {
  id        String   @id @default(cuid())
  type      String   // "reminder" | "giveaway_end" | "tempban_lift" | "tempmute_lift" | "temprole_remove" | "ticket_autoclose" | ...
  runAt     DateTime
  guildId   String?  // present => the owning shard runs it (guild-bound), like today's pattern
  payload   Json
  createdAt DateTime @default(now())
  @@index([runAt])
  @@index([guildId])
}
```

- A central `scheduler` service: `schedule(type, runAt, payload, guildId?)`, `cancel(id)`, and a
  `register(type, handler)` registry. On `ready` it loads pending tasks for guilds this shard owns and arms
  per-shard `setTimeout`s (capped ~24.8d, re-armed). On fire it dispatches to the handler by `type` and
  deletes the row. Crash/restart safe because state is in Postgres.
- Modules stop hand-rolling timers; they call `schedule(...)` and `register(...)`. Reminders and giveaways
  become thin handlers. New: tempban/tempmute/temprole get durable lifts (a real gap vs the big bots).

**Range / blast radius.** New table + `src/services/scheduler.ts`. *Medium*: refactor reminders, giveaways,
birthday to register handlers (behaviour-preserving), then add the new durable mod actions. Each migration
is independently testable.

## 3. Centralized cron: recurring jobs in one place

**Idea.** A single cron registry for recurring work, run by the manager process (or shard 0) so it fires
once cluster-wide: daily birthday sweep, leaderboard snapshots, expired-row cleanup, cache warmups, top.gg
stat post. Use the existing `src/jobs/queue.ts` (BullMQ with in-memory fallback) so it already degrades
without Redis. One `registerCron(name, expr, handler)` surface; modules contribute jobs via the existing
`jobs` field on `BotModule`.

**Range / blast radius.** *Low*: mostly wiring the already-built job queue to a cron registry and moving the
birthday daily scheduler onto it. Additive.

## 4. Caching + indexing (Postgres/Redis)

- **Cache-aside everywhere hot.** Standardize `withCache(key, 300, loader)` (already in `services/cache.ts`)
  for config and leaderboard reads; pipeline multi-key reads with `redis.multi()....exec()` to cut round
  trips (e.g. fetching level + economy for a profile card in one pipeline).
- **Indexes on hot call sites.** Audit and add composite `@@index`: `ModerationCase([guildId, userId])`,
  `Ticket([guildId, status])`, `ScheduledTask([runAt])`, anything queried per-event. LevelUser/EconomyUser
  already have `@@id([guildId, userId])`.
- **Select only what you need.** Use Prisma `select` on hot paths to avoid over-fetching wide rows.
- **Net effect.** Per-message handlers (automod, leveling) read config from L1/L2 cache, never the DB; DB is
  touched on writes and cache misses only.

## 5. Setup wizards write to the tenant

- General `/setup`: applies a sensible baseline across core systems and, where it creates channels/roles,
  writes their ids onto the tenant in one `updateTenant`. Per-system wizards (e.g. `/security setup` with
  the antinuke filter checklist) live in their own modules and call `updateTenant`.
- Because reads come from the tenant cache, a freshly-wizarded guild needs no extra lookups.

## 6. Optional feature ports from Anastasia (separate track)

Starboard, anti-raid / panic mode, sticky messages, verification gate. These are features, not
infrastructure; build them on top of the systems above once those land.

## Recommended rollout order (lowest blast radius first)

1. **Caching/indexing pass** (4) - pure win, additive, no behaviour change.
2. **Tenant service** (1) - additive; migrate the 3 hottest read paths.
3. **Durable scheduler** (2) - new table + service; migrate reminders/giveaways/birthday; add tempban/mute/role.
4. **Centralized cron** (3) - move birthday sweep + add cleanups.
5. **Wizards** (5) - general `/setup` + per-system, writing to the tenant.
6. **Anastasia feature ports** (6) - starboard, anti-raid, sticky, verification.

Each step is its own PR with tests + docs, keeps CI green, and is independently shippable.
