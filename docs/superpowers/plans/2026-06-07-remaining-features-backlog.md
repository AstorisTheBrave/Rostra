# Remaining Features Backlog (build everything)

status: active · owner: AstorisTheBrave · 2026-06-07

## Progress (update as items land)

- [x] 1. Feeds: Reddit + RSS - `feat(feeds)` 7103650
- [x] 2. Highlights - `feat(highlight)` d76bcd9
- [x] 3. Sticky messages - `feat(sticky)` e4d9bd6
- [x] 4. Reputation - `feat(reputation)` bfc3253
- [x] 5. Voice roles - `feat(voicerole)` 581f132
- [x] 6. Bulk role - `feat(bulkrole)` d630067
- [x] 7. Role menus (dropdown self-roles, extended `reactionroles`) - `feat(reactionroles)` 89258ae
- [x] 8. Server stats channels - `feat(serverstats)` beb4942
- [x] 9. Anti-raid / panic mode - `feat(security)` 91a8def
- [x] 10. Verification depth - `feat(verification)` (captcha + auto-kick)
- [x] 11. Starboard depth - `feat(starboard)` (remove-threshold hysteresis + reward roles; multi-board deferred)
- [x] 12. Advanced automod - `feat(automod)` (custom keyword/wildcard/regex rule engine + per-rule action)
- [x] 13. Modmail - `feat(modmail)` (DM-to-staff threads; ModmailConfig + ModmailThread; DirectMessages intent)
- [x] 14. Image cards - `feat(cards)` (leveling rank card + optional welcome card via `@napi-rs/canvas`)
- [x] 15. Economy depth - `feat(economy)` (shop + inventory + buyable roles; ShopItem + InventoryItem)
- [x] 16. Polls, suggestions, counting - three modules: `feat(counting)`, `feat(poll)`, `feat(suggest)`
- [ ] 17. Logging + music + giveaway depth (next - the final item)

Done in the 2026-06-07 build session: items 1-16 (each its own commit + tests + docs; 198 tests, all
green). Item 16 shipped as three small self-contained modules (counting, poll, suggest) rather than one
`community` module. Next session: start at item 17 (depth items - more logging event types: bulk delete /
voice / nickname; music filters/autoplay/playlists; giveaway entry requirements role/level/account-age).
This is the LAST backlog item - after it, the "build everything" backlog is complete.

The maintainer wants **every** remaining all-in-one feature built (no dashboard, no custom commands, no
deferring). This doc is the authoritative backlog + the patterns to follow. Reference material lives in
`Archive/` (gitignored): `yagpdb-docs`, `arcane-docs`, `zyn-bot`. Work top-down; each item is its own
PR/commit, CI green, tests + docs each time.

## Current state (already built - do NOT rebuild)

v0.1.1 released. ~37 commands, 41 DB tables, 137 tests, 0 vulns, `main` protected (ruleset: PR + green CI,
admin bypass). Modules: core (help/stats/shards), moderation (+tempban/temprole), security/antinuke
(+`/security setup`), automod (+setup), logging (+setup), welcome/autorole (+setup), tickets, economy,
leveling, giveaways, joinToCreate, reactionroles, birthday, extras (afk/snipe/autoresponder), utility,
trivia, games, music, ai, tags, vanityroles, feedback, roleplay (+ship image card), reminders, steal,
profile (+level/economy stats card), starboard, feeds (YouTube RSS + Twitch Helix), verification, setup
wizard. Platform: GuildTenant (cached config + read-through kill-switch), durable ScheduledTask scheduler,
centralized cron (manager), hash-gated command registration, 5-min config caching, custom application
emojis (`@/ui` `emoji()`).

## Non-negotiable patterns (read `AGENTS.md` + `CLAUDE.md` first)

- Module = `src/modules/<name>/` with `index.ts` default-exporting a `BotModule`. One top-level slash
  command + subcommands. All UI via `@/ui` (Components V2, never raw builders). Every string via `t()`.
- Config: cached via `cachedConfig`/`invalidateConfig` (5-min). Per-guild master switch: gate hot paths
  with `isFeatureBlocked(guildId, "<feature>")` and add the feature to `/setup` FEATURES + the emoji
  registry (`src/ui/emojis.ts`) + `/help` categories (`src/modules/core/categories.ts`) + README.
- Timed/durable actions: `schedule({type,runAt,guildId,payload})` + `registerTaskHandler(type, fn)` at
  module import (durable scheduler). Recurring jobs: `registerCron` in `src/jobs/builtins.ts` (runs in the
  manager; post via REST `Routes.channelMessages` when no client is available, like feeds).
- New model -> `prisma generate` -> regenerate baseline:
  `npx prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script --output prisma/migrations/0_init/migration.sql`
- Per change: `npm run typecheck` + `npm run lint:fix` + `npm run test:env` green; add `*.test.ts` for pure
  logic; add `docs/modules/<name>.mdx` + a `docs/sessions/log.mdx` entry; conventional commit (NO em
  dashes, NO AI co-author trailers); push to main (admin bypass). Custom emojis already uploaded; new
  registry names just need a unicode fallback.

## Backlog (prioritized)

### 1. Feeds: Reddit + RSS (extend the `feeds` module)
Same pattern as YouTube (keyless). Reddit: `https://www.reddit.com/r/<sub>/new/.rss`. Generic RSS: any feed
URL, parse newest `<item>`/`<entry>`. Add `/feeds reddit <sub> <channel>` and `/feeds rss <url> <channel>`.
Twitter/X has no free API - use a Nitter RSS instance if one is configured (env `NITTER_BASE`), else skip.

### 2. Highlights (Sapphire-style)
DM a user when a keyword they subscribed to is said. Model `Highlight {id,guildId,userId,word}`.
`/highlight add|remove|list`. `messageCreate` scans content for any subscribed word (cache per guild), DMs
the subscriber with a jump link (rate-limit + ignore self + ignore if user is in-channel recently).

### 3. Sticky messages
Keep a message pinned to the bottom of a channel. Model `StickyMessage {channelId @id,guildId,content,
lastMessageId}`. `/sticky set|remove`. On `messageCreate` in that channel, delete the old sticky repost and
re-post (debounced). 

### 4. Reputation
Model `RepUser {guildId,userId,points @@id}`. `/rep give @user` (24h cooldown, no self), `/rep [user]`,
`/rep leaderboard` (Redis sorted set `lb:rep:<guild>` like economy/leveling).

### 5. Voice roles
Model `VoiceRoleConfig {guildId @id, roleId}` (or per-channel). `voiceStateUpdate`: add role on join voice,
remove on leave. `/voicerole set|disable|status`. Gate on tenant flag.

### 6. Bulk role
`/role all add|remove <role> [filter: humans|bots|all]`. Iterate members (fetch), respect hierarchy, chunk
with delays to avoid rate limits. Manage Roles. Consider a durable/queued approach for big guilds.

### 7. Role menus (select-menu self roles)
Extend reactionroles or new `rolemenu`: a string-select where each option toggles a role. `/rolemenu
create|addrole|post`. Component handler toggles roles (single/multi mode).

### 8. Server stats channels
Voice channels whose names show live counts (members, bots, online). Model `StatsChannel {channelId @id,
guildId, type, template}`. A cron (every ~10 min, rate-limit aware) updates names via REST. `/serverstats
add|remove`.

### 9. Anti-raid / panic mode (Wick/D-Sec direction; extend security)
Detect join floods (N joins in M seconds via an in-memory window per guild) -> auto lockdown (raise verif
level / kick new joins / pause invites) + alert. `/security antiraid <on|off|threshold>`. Panic command for
manual lockdown. Use the scheduler to auto-lift.

### 10. Verification depth
Auto-kick unverified after a timeout (schedule `verify_kick` on join, cancel on verify). Optional simple
math/text captcha in the ephemeral flow before granting the role.

### 11. Starboard depth (from the starboard docs, since deleted from Archive - re-clone
`https://github.com/starboardbot/docs` if needed)
Multiple starboards, per-channel/role/emoji overrides, auto-star channels, separate remove-threshold,
star-reward roles, hall of fame. Each is additive to the existing `starboard` module.

### 12. Advanced automod (YAGPDB trigger/condition/effect)
A configurable rule engine: rules with a trigger (regex/keyword/spam), conditions (channel/role exempt),
and effects (delete/warn/timeout/log). Model `AutomodRule`. Big - do after the smaller wins.

### 13. Modmail
DM-to-staff threads. A user DMs the bot -> opens/relays to a staff channel (or ticket). Model `Modmail`.
Reuse the tickets channel/overwrite pattern.

### 14. Image cards
Leveling rank card as an image (mirror `profile/card.ts` with the XP bar). Welcome card image. Both use
`@napi-rs/canvas` (already a dep; Docker has fonts).

### 15. Economy depth
Shop + items + buyable roles. Models `ShopItem`, `Inventory`. `/shop`, `/buy`, `/inventory`, `/use`.

### 16. Polls, suggestions, counting
- Polls: `/poll` with button/emoji voting + results.
- Suggestions: `/suggest` -> a suggestions channel with up/down vote buttons + status. Model `Suggestion`.
- Counting: a channel where users count up; the bot validates and reacts. Model `CountingConfig`.

### 17. Logging + music + giveaway depth
More log event types (bulk delete, voice, nickname); music filters/autoplay/playlists; giveaway entry
requirements (role/level/account-age).

## Suggested order

Knock out 1-8 first (small, high value, all on existing patterns), then 9-11 (security/starboard depth),
then 12-17 (bigger engines). Keep CI green and release-please will batch versions automatically; merge the
release PR whenever you want to cut + publish the `:latest` image.
