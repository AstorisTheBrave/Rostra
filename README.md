# Rostra

**Rostra** is an all-in-one Discord bot that unifies moderation, server security, auto-moderation,
tickets, applications, economy, leveling, giveaways, music, trivia, games, and more into one fast,
sharded application - built to scale to millions of users.

[![CI](https://github.com/AstorisTheBrave/Rostra/actions/workflows/ci.yml/badge.svg)](https://github.com/AstorisTheBrave/Rostra/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/AstorisTheBrave/Rostra?style=flat-square&logo=github)](https://github.com/AstorisTheBrave/Rostra/releases/latest)
[![GHCR image](https://img.shields.io/badge/ghcr.io-rostra-2496ED?style=flat-square&logo=docker&logoColor=white)](https://github.com/AstorisTheBrave/Rostra/pkgs/container/rostra)

![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6?style=flat-square&logo=typescript&logoColor=white)
![discord.js](https://img.shields.io/badge/discord.js-v14-5865F2?style=flat-square&logo=discord&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Prisma-336791?style=flat-square&logo=postgresql&logoColor=white)
![License: MIT](https://img.shields.io/badge/License-MIT-green.svg?style=flat-square)

> Contributions welcome - this is an open project. See [CONTRIBUTING.md](CONTRIBUTING.md).

## Table of contents

- [Features](#features)
- [Tech stack](#tech-stack)
- [Quick start](#quick-start)
- [Docker](#docker)
- [Configuration](#configuration)
- [Commands](#commands)
- [Architecture](#architecture)
- [Contributing](#contributing)
- [Security](#security)
- [License](#license)

## Features

<table>
<tr><td width="50%" valign="top">

### Moderation
- Ban / kick / timeout / warn / purge
- Numbered case history, warnings & notes
- Lock / unlock / slowmode / nickname

### Security (Antinuke)
- Audit-log attribution of destructive actions
- Auto-punish untrusted actors (ban/kick/strip)
- Whitelist + extra owners, per-event toggles

### Auto-moderation
- Anti-invite / link / spam / mass-mention / caps
- Profanity filter with custom word lists
- Exempt roles & channels

### Tickets
- Button panel → private channels
- Claim, add users, close with logging

### Economy
- Daily / work / crime / rob / beg / gamble
- Wallet & bank, pay, leaderboard

### Leveling
- XP per message, level-up announcements
- Role rewards, rank & leaderboard

</td><td width="50%" valign="top">

### Giveaways
- Button entry, timed auto-end, reroll

### Welcome & Logging
- Welcome/goodbye messages + auto-roles
- Configurable audit logging

### Engagement
- Birthdays, reaction-role panels, join-to-create voice
- Trivia, tic-tac-toe, rock-paper-scissors

### Utility & Extras
- avatar / userinfo / serverinfo
- AFK, snipe, autoresponder, tags
- Vanity status-roles, feedback

### Assistant
- Ask Rostra questions in natural language

### Built for scale
- Native sharding, Redis-backed leaderboards & caching
- Components V2 UI throughout (no legacy embeds)

</td></tr>
</table>

## Tech stack

Node.js 20+ (ESM) · TypeScript (strict, no `any`) · discord.js v14 · Prisma + PostgreSQL ·
Redis (cache, leaderboards, queues) · BullMQ · Fastify (health + webhooks) · Pino · Zod · Biome.

## Quick start

```bash
git clone https://github.com/AstorisTheBrave/Rostra.git
cd Rostra
npm install
cp .env.example .env          # fill in your values
npm run prisma:generate
npm run prisma:migrate        # create the database schema
npm run deploy:commands       # register slash commands
npm start
```

Requirements: Node.js 20+, a PostgreSQL database, and (recommended for production) Redis. Without Redis,
an in-memory fallback is used for cache and queues.

## Docker

```bash
docker compose up --build
```

Brings up the bot, PostgreSQL, pgBouncer (transaction pooling), and Redis.

A prebuilt image is published to the GitHub Container Registry on every push to `main` (tagged `latest`,
`main`, and the commit sha) and, on a release, the version tags:

```bash
docker pull ghcr.io/astoristhebrave/rostra:latest
```

## Configuration

All settings come from environment variables (see [`.env.example`](.env.example)):

| Variable | Purpose |
|---|---|
| `DISCORD_TOKEN`, `DISCORD_CLIENT_ID` | bot credentials (required) |
| `DATABASE_URL` | PostgreSQL connection (required) |
| `REDIS_URL` | shared cache, leaderboards, job queues |
| `OWNER_IDS`, `DEV_GUILD_ID` | owner commands + dev command registration |
| `TOTAL_SHARDS`, `SHARDING_MODE` | fixed shard count / `native` \| `hybrid` |
| `LAVALINK_NODES` | JSON array of music nodes (multi-node failover) |
| `TOPGG_TOKEN`, `TOPGG_WEBHOOK_AUTH` | bot-list stats + vote webhook |
| `AI_API_KEY`, `AI_BASE_URL`, `AI_MODEL` | assistant backend (a standard chat-completions endpoint) |

### Required intents

Enable these for the bot in the Discord Developer Portal: Server Members, Message Content, and Presence
(Presence is only needed for vanity status-roles).

## Commands

Commands are slash-only and grouped under top-level commands with subcommands (well under Discord's
100-command limit):

`/setup` · `/mod` · `/security` · `/automod` · `/verification` · `/logging` · `/welcome` · `/ticket` · `/economy` · `/level` ·
`/giveaway` · `/starboard` · `/voicehub` · `/reactionrole` · `/birthday` · `/tag` · `/vanityrole` · `/feedback` ·
`/trivia` · `/game` · `/roleplay` · `/profile` · `/music` · `/ask` · `/afk` · `/snipe` · `/steal` ·
`/reminder` · `/feeds` · `/autoresponder` · `/util` · `/help` · `/stats` · `/shards` · `/ping`

## Architecture

Each feature is a self-contained module under `src/modules/<name>/` exporting
`{ commands, events, interactions, jobs, i18n }`; modules are auto-discovered at boot. Shared
infrastructure lives in `src/services` (database, cache, logger), `src/ui` (the Components-V2 UI library),
`src/pipeline` (permission/cooldown/error handling), and `src/cluster` (sharding). See
[`docs/overview.mdx`](docs/overview.mdx) for the full map.

## Contributing

PRs and issues are very welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md) - it covers the module
pattern, the UI library, coding conventions, and how to run the checks. By participating you agree to the
[Code of Conduct](CODE_OF_CONDUCT.md).

## Security

Found a vulnerability? Please report it privately - see [SECURITY.md](SECURITY.md). Do not open a public
issue for security problems.

Working with an AI coding assistant? See [AGENTS.md](AGENTS.md).
Changes are tracked in [CHANGELOG.md](CHANGELOG.md).

## License

[MIT](LICENSE) © AstorisTheBrave
