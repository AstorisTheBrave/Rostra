# Getting Started

## Requirements

- Node.js 20 or newer
- PostgreSQL (required)
- Redis (recommended; required for hybrid clustering and live reloads)
- A Discord application with a bot token

## Local setup

```bash
git clone https://github.com/AstorisTheBrave/Rostra
cd Rostra
npm install
cp .env.example .env        # fill in DISCORD_TOKEN, DISCORD_CLIENT_ID, DATABASE_URL, REDIS_URL
npx prisma migrate deploy   # set up the database
npm run deploy:commands     # register slash commands with Discord
npm run dev                 # start in watch mode
```

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
