# Environment Variables

Rostra reads its settings from environment variables, usually in a file named `.env` next to the code. This
page explains each one in plain language. If you use Docker, the database and Redis values are set for you.

## The only ones you must set

| Variable | What it is | Where to get it |
| --- | --- | --- |
| `DISCORD_TOKEN` | Your bot's secret password. Keep it private. | Developer Portal, Bot tab. See [[Creating Your Bot]]. |
| `DISCORD_CLIENT_ID` | Your application's ID. | Developer Portal, General Information, Application ID. |

## Recommended

| Variable | What it is |
| --- | --- |
| `OWNER_IDS` | Your Discord user ID (comma separated for several owners). Unlocks owner only commands. |

## Database and Redis

| Variable | What it is |
| --- | --- |
| `DATABASE_URL` | Where the PostgreSQL database is. With Docker this is set automatically. |
| `DIRECT_URL` | Optional. A direct (non-pooled) database URL used only for migrations. Set it when `DATABASE_URL` is a pooled connection (for example `pooled.db.prisma.io`, a Neon `-pooler` host, or pgbouncer), otherwise migrations fail with a `P1002` advisory-lock error. Leave unset for a plain or Docker database. |
| `REDIS_URL` | Where Redis is. Recommended. With Docker this is set automatically. Required for clustering and live reloads. |

If you are not using Docker, you need your own PostgreSQL and Redis, and you put their connection URLs here.
Free hosted options exist for both if you do not want to install them.

## Optional features

| Variable | What it is |
| --- | --- |
| `LAVALINK_NODES` | Music audio nodes, as a JSON list. Leave as `[]` to turn music off. |
| `TOPGG_TOKEN`, `TOPGG_WEBHOOK_AUTH` | Bot list stats and vote webhook, only if you list on top.gg. |
| `AI_API_KEY`, `AI_BASE_URL`, `AI_MODEL` | Backend for the assistant command. Optional. |
| `TRANSLATE_API_KEY`, `TRANSLATE_BASE_URL`, `TRANSLATE_MODEL` | Only for `npm run i18n:draft` when generating translation drafts. |

## Scaling (advanced)

| Variable | What it is |
| --- | --- |
| `SHARDING_MODE` | `native` (default) or `hybrid`. See [[Hybrid Sharding]]. |
| `TOTAL_SHARDS` | Total shard count. Leave unset for automatic. |
| `SHARDS_PER_CLUSTER` | Hybrid clustering only: shards per cluster process. |

## Other

| Variable | What it is |
| --- | --- |
| `PORT`, `HOST` | The health and status web server address. Defaults are fine. |
| `LOG_LEVEL` | How much detail to log. `info` by default. |
| `DEV_GUILD_ID` | A server where commands register instantly, for development. |

## Example minimal .env

```
DISCORD_TOKEN=your-bot-token
DISCORD_CLIENT_ID=your-application-id
OWNER_IDS=your-user-id
```

With Docker, that is all you need. The full list with defaults is in the `.env.example` file in the
repository.
