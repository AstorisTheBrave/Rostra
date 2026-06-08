# Glossary

Plain language definitions for the words you will run into around Rostra and Discord bots. If a guide uses a
term you do not know, it is probably here.

## Bot basics

**Bot** - a program that logs into Discord like a user and does jobs automatically, such as moderation or
music. Rostra is a bot.

**Application** - the entry you create in the Discord Developer Portal that represents your bot. See
[[Creating Your Bot]].

**Token** - your bot's secret password. Anyone who has it can control your bot, so never share it or post it
anywhere. If it leaks, reset it in the Developer Portal.

**Client ID (Application ID)** - your bot's public number. Safe to share. Used in the invite link and in
settings as `DISCORD_CLIENT_ID`.

**Invite link** - the URL that adds your bot to a server, with the permissions it needs already selected.

**Slash command** - a command you start by typing `/` in Discord, like `/setup`. Rostra is slash command
only, so there are no prefix commands like `!ban`.

## Permissions and access

**Permission** - something Discord lets a member or bot do, such as Manage Roles or Ban Members. Rostra can
only do what it has permission to do. See [[Permissions and Intents]].

**Intent** - a category of events Discord will send your bot, such as message content or member presence. Some
features need their intent switched on in the Developer Portal. See [[Permissions and Intents]].

**Role hierarchy** - roles are ranked in a list. A bot can only manage roles that sit below its own highest
role. If something will not assign, this is usually why.

**Owner ID** - your own Discord user ID, set as `OWNER_IDS`, which unlocks owner only commands. Not the same
as server ownership.

## Hosting words

**Self-hosting** - running your own copy of the bot on a computer you control. See [[Self-Hosting]].

**Managed hosting** - a service that runs the bot for you with a few clicks, no terminal needed. See
[[Easy Hosting]].

**VPS** - a small cloud computer you rent that stays on all the time, so your bot is always online. See
[[Hosting on a VPS]].

**Docker** - a tool that packages the bot, its database, and Redis into one box that starts with a single
command. See [[Hosting with Docker]].

**Environment variable** - a setting the bot reads on startup, like your token, usually kept in a file named
`.env`. See [[Environment Variables]].

**PostgreSQL** - the database where Rostra stores every server's settings and data.

**Redis** - a fast memory store Rostra uses for things like leaderboards and live changes. Required once you
scale to clusters.

## Scaling words

**Shard** - one connection to Discord. Large bots split across many shards, with each shard handling a slice
of the servers. Discord requires roughly one shard per 2,500 servers.

**Native sharding** - Rostra's default, where it runs the right number of shards for you in one place.

**Cluster (hybrid sharding)** - grouping shards into separate processes or machines for very large bots. See
[[Hybrid Sharding]].

**Feature flag** - a switch that turns a feature on or off across the whole fleet without a restart. See
[[Feature Flags]].

## Rostra words

**Components V2** - the modern Discord layout system Rostra uses for all of its menus and panels, instead of
old style embeds.

**Localization** - showing the bot in different languages, per server and per member. See [[Localization]].

## See also

- [[Using Rostra]] - the no code track
- [[Hosting Rostra]] - the technical track
- [[FAQ]] - common questions and fixes
