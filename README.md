# Rostra

An all-in-one Discord bot: moderation, security (antinuke/automod), tickets, applications, economy,
leveling, giveaways, music, trivia, games, utilities and more — one sharded TypeScript application built
to scale to millions of users.

## Tech

Node 20+ (ESM) · TypeScript (strict) · discord.js v14 · Prisma + PostgreSQL · Redis (cache, leaderboards,
queues) · BullMQ · Fastify (health + webhooks) · Pino · Zod. UI uses Discord Components V2 throughout.

## Requirements

- Node.js 20 or newer
- PostgreSQL database
- Redis (optional in dev — an in-memory fallback is used; required for production scale)

## Setup

```bash
npm install
cp .env.example .env        # then fill in the values
npm run prisma:generate
npm run prisma:migrate      # create the database schema
npm run deploy:commands     # register slash commands with Discord
```

## Configuration

All settings come from environment variables (see `.env.example`). Key ones:

| Variable | Purpose |
|---|---|
| `DISCORD_TOKEN`, `DISCORD_CLIENT_ID` | bot credentials (required) |
| `DATABASE_URL` | PostgreSQL connection (required) |
| `REDIS_URL` | enables shared cache + job queues |
| `OWNER_IDS`, `DEV_GUILD_ID` | owner-only commands + dev command registration |
| `TOTAL_SHARDS`, `SHARDING_MODE` | fixed shard count / `native` or `hybrid` |
| `LAVALINK_NODES` | JSON array of music nodes (multi-node failover) |
| `TOPGG_TOKEN`, `TOPGG_WEBHOOK_AUTH` | bot-list stats + vote webhook |
| `AI_API_KEY`, `AI_BASE_URL`, `AI_MODEL` | AI feature configuration |

## Running

```bash
npm run dev      # watch mode (manager + shards)
npm start        # production
```

Health endpoint: `GET /health`, per-shard stats: `GET /health/shards`, metrics: `GET /metrics`.

## Docker

```bash
docker compose up --build
```

Brings up the bot, PostgreSQL, pgBouncer (transaction pooling), and Redis.

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | run with file watching |
| `npm start` | run the manager (spawns shards) |
| `npm run build` | generate Prisma client + type-check |
| `npm run typecheck` | type-check only |
| `npm run lint` / `lint:fix` | lint and format |
| `npm test` / `test:env` | run tests |
| `npm run deploy:commands` | register slash commands |
| `npm run prisma:migrate` | apply database migrations |

## Project layout

```
src/
  config.ts        validated environment configuration
  services/        logger, database (Prisma), cache (Redis)
  utils/           Components V2 UI kit and shared helpers
  i18n/            translation helper + locales
  client/          BotClient + module loaders
  pipeline/        command permission/cooldown/error pipeline
  interactions/    interaction router
  jobs/            background job queue
  web/             health server + vote webhook + stats autoposter
  cluster/         sharding IPC abstraction
  modules/         feature modules (each self-contained)
  cluster.ts       manager entry (sharding + web)
  bot.ts           shard entry
prisma/            database schema
docs/              architecture, modules, and infrastructure docs
```

## Contributing

See `docs/overview.mdx` for the codebase map and `docs/style.mdx` for conventions. Each feature is a
self-contained module under `src/modules/`.
