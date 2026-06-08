# Hybrid Sharding


Rostra runs in **native sharding** by default (one process manages all shards, great up to roughly one
host's worth of shards). When you grow past what a single host can hold (very large bots, hundreds of
thousands of servers), switch to **hybrid clustering**: several cluster processes, each running a slice of
the shards, optionally across several machines. You flip this with one environment variable and the right
infrastructure. Nothing in the feature code changes.

### When to switch

Discord uses about one shard per 2,500 servers. At ~100K servers that is roughly 40 shards, which one host
can still run. Switch to hybrid when you want to spread shards across multiple processes or machines for
memory headroom and fault isolation (one cluster crashing does not take the others down).

### Requirements

- **Redis is required** in hybrid mode. The clusters coordinate through it: the control bus (live
  translations, feature flags), leader election (so background jobs run once), and the identify queue all
  use Redis. Set `REDIS_URL`.
- A shared Postgres database (already required) reachable from every cluster.

### Environment variables

| Variable | Meaning |
| --- | --- |
| `SHARDING_MODE` | `native` (default) or `hybrid`. |
| `TOTAL_SHARDS` | Total shard count across the whole fleet. Leave unset for `auto` (Discord recommends a number). |
| `SHARDS_PER_CLUSTER` | Hybrid only. How many shards each cluster process runs. Omit to use the library default. |
| `REDIS_URL` | Required in hybrid mode for cross-cluster coordination. |

Example `.env` for a hybrid deployment:

```
SHARDING_MODE=hybrid
TOTAL_SHARDS=48
SHARDS_PER_CLUSTER=12
REDIS_URL=redis://your-redis-host:6379
DATABASE_URL=postgres://...
DISCORD_TOKEN=...
DISCORD_CLIENT_ID=...
```

That spawns 4 clusters of 12 shards each (48 total).

### How to run

Same entry point as native. Start the manager process:

```
npm run start
```

With `SHARDING_MODE=hybrid` the manager uses the cluster manager instead of the native one, spawns the
cluster processes, and each cluster connects its shard range. The status web server and top.gg autopost run
from the manager exactly as before.

### Single host vs multiple hosts

- **One host, many processes**: set `SHARDING_MODE=hybrid` and `SHARDS_PER_CLUSTER`, run one manager. It
  spawns the cluster processes locally. The library serialises shard identifies within the manager.
- **Multiple hosts**: run a manager per host, each responsible for a shard range, all pointed at the same
  Redis and Postgres. The Redis **identify queue** serialises cluster logins across hosts so you do not
  exceed Discord's identify concurrency, and **leader election** ensures the background jobs (feeds, server
  stats, autopost, command sync) run on only one host. For a fully managed cross-host bridge you can layer
  `discord-cross-hosting` on top later; the seams (the `Ipc` abstraction, the control bus) already support
  it.

### What stays correct at any scale

- Every server is owned by exactly one shard, so per-server state (anti-raid windows, spam counters, AFK,
  and so on) is never split.
- Cross-cluster actions (modmail relay across shards, live translation reloads, feature flag flips) travel
  over the Redis control bus, so they reach every cluster instantly.
- Background jobs run once fleet-wide via leader election.

### Shipping changes without a full restart

Most changes do not need a restart at all: translations (`npm run i18n:push`), feature flags and
kill-switches (`/owner feature set ...`), and per-server settings all apply live across every cluster. Code
changes (new command handlers, bug fixes) use a blue-green or rolling deploy. See
[scaling.mdx](./scaling) for the deploy runbook.

### Note
