# Getting Started

This page is the run from source path, for developers comfortable with Node.js. If you just want to run the
bot and are not a developer, use the beginner friendly [[Self-Hosting]] guide instead, which uses Docker and
sets up the database for you.

## Requirements

- A Node.js version satisfying `engines.node` in `package.json`, with Corepack 0.35.0
- PostgreSQL (required)
- Redis (recommended; required for hybrid clustering and live reloads)
- A Discord application with a bot token

## Local setup

```bash
git clone https://github.com/AstorisTheBrave/Rostra
cd Rostra
corepack enable
pnpm install --frozen-lockfile
cp .env.example .env        # fill in DISCORD_TOKEN, DISCORD_CLIENT_ID, DATABASE_URL, REDIS_URL
pnpm prisma:generate        # generate the database client
pnpm prisma:migrate         # set up the database
pnpm deploy:commands        # register slash commands with Discord
pnpm dev                    # start in watch mode
```

The repository pins pnpm and maintains one lockfile. Keep `--frozen-lockfile` so installation uses
the reviewed dependency versions and workspace security overrides. See
[CONTRIBUTING.md](https://github.com/AstorisTheBrave/Rostra/blob/main/CONTRIBUTING.md) for canonical setup.

## Required intents

Enable these for your bot in the Discord Developer Portal:

- Server Members
- Message Content
- Presence (only needed for vanity status roles)

## Docker

```bash
docker compose up --build
# or pull the published image
docker pull ghcr.io/astoristhebrave/rostra:latest
```

## Configuration

All settings come from environment variables. See `.env.example` for the full list. The most important:

| Variable | Purpose |
| --- | --- |
| `DISCORD_TOKEN`, `DISCORD_CLIENT_ID` | bot credentials (required) |
| `DATABASE_URL` | PostgreSQL connection (required) |
| `REDIS_URL` | shared cache, leaderboards, control bus |
| `OWNER_IDS` | comma separated user ids for owner commands |
| `SHARDING_MODE` | `native` (default) or `hybrid` |

## Next steps

- Run `/setup` in your server to enable systems and set a language.
- See [[Commands]] for everything Rostra can do.
- Planning to grow large? Read [[Hybrid Sharding]].
