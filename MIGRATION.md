# Migration & Decommissioning Guide

How to move off the 15 archived bots onto Rostra. Rostra is feature-complete across all of their domains;
this guide maps each old bot to its Rostra replacement and gives a safe cutover order.

## 1. Stand up Rostra

1. Provision **PostgreSQL** and (for production) **Redis**.
2. `cp .env.example .env` and fill in: `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`, `OWNER_IDS`, `DATABASE_URL`,
   `REDIS_URL`, and optional integrations (`LAVALINK_NODES`, `TOPGG_*`, `AI_*`).
3. `npm install && npm run prisma:generate`
4. `npm run prisma:migrate` — creates every table (moderation, security, automod, logging, welcome,
   tickets, economy, leveling, giveaways, joinToCreate, reactionroles, birthday, extras, trivia, plus core).
5. `npm run deploy:commands` — registers the slash commands globally.
6. `npm start` (or `docker compose up --build`).

## 2. Bot → Rostra feature map

| Archived bot | Replaced by Rostra module(s) |
|---|---|
| AeroX-Security-Bot | security, automod, moderation, logging, welcome, utility |
| ratiosrc-by-satyansh | moderation, security, giveaways, utility |
| arrkiii | music, moderation, automod, welcome, reactionroles, utility, fun(games) |
| TitanBot | moderation, economy, leveling, tickets, giveaways, birthday, welcome, logging, utility, reactionroles |
| Appy-Bot | tickets (+ applications-style flows) |
| Feedback-Bot | extras/utility (feedback can be added as a small module if still needed) |
| Trivia-Bot | trivia |
| i-karen | security/antinuke, moderation |
| GuildTag-Bot | (guild tag — niche; add as a small module if still needed) |
| Join2Create-Bot | joinToCreate |
| VanityRoles-Bot | (status-role — add as a small module if still needed) |
| Reo-Bot | moderation, automod, tickets, giveaways, welcome, joinToCreate, music, ai |
| Yuna-CV2-AIO | moderation, automod, security, economy, leveling, games, ai, extras, birthday, reactionroles |

> Items marked "add as a small module if still needed" (guild tags, vanity status-roles, feedback) were
> low-usage in the archives; they follow the established module pattern and can be added on request.

## 3. Cutover (per server, low-risk)

1. Invite Rostra; keep the old bot(s) running in parallel.
2. Configure the matching Rostra modules (`/security enable`, `/automod enable`, `/logging channel`,
   `/welcome`, `/ticket enable` + `/ticket panel`, `/level enable`, `/economy`, etc.).
3. Migrate any data you care about (see §4); most servers just reconfigure fresh.
4. Verify Rostra behaves (mod actions, automod, tickets, leveling).
5. **Remove the old bot** from the server.
6. Once every server is migrated, deauthorize/shut down the archived bot applications.

## 4. Data migration (optional)

The archived bots used a mix of stores (LMDB, Mongo/quickmongo, better-sqlite3, raw Postgres, aiosqlite,
quick.db). Rostra uses one Postgres schema. There is **no automatic importer** — most data (economy
balances, levels, warnings) is per-guild and commonly started fresh. If a specific server needs its
balances/levels/cases preserved, write a one-off script under `scripts/migrate/<bot>.ts` that reads the old
store and calls the relevant Rostra service (`economy.updateBalance`, `leveling.setLevel`,
`moderation.createCase`, etc.). Do this before removing the old bot.

## 5. Removing the archived source

The `Archive/` folder (the 15 original bot repos) is **gitignored** and kept locally for reference only.
Once a bot's features are verified live on Rostra, its `Archive/<bot>/` subfolder can be deleted. This is
irreversible for anything not already in version control, so delete only after confirming the replacement
works in production.
