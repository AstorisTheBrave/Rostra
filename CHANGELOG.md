# Changelog

All notable changes to Rostra are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project aims to follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.1](https://github.com/AstorisTheBrave/Rostra/compare/rostra-v0.1.0...rostra-v0.1.1) (2026-06-06)


### Added

* add cache singleton with redis and in-memory fallback ([fdf6603](https://github.com/AstorisTheBrave/Rostra/commit/fdf660343b8db46306d9e9de6355a677eb3d3559))
* add command pipeline (perms, cooldown, error boundary) and interaction router ([2a7ee3f](https://github.com/AstorisTheBrave/Rostra/commit/2a7ee3f266b7a489c6f8dd00c2dd9f4f0fc1ddba))
* add components v2 ui kit (no legacy embeds) ([051c2de](https://github.com/AstorisTheBrave/Rostra/commit/051c2debff24f96095afee205b1f99d112861aa9))
* add i18n helper with namespaced locale registration ([60bcca6](https://github.com/AstorisTheBrave/Rostra/commit/60bcca63917097badb64ac97a8fed7d38794cd24))
* add module contracts, BotClient, loaders, and job queue ([da132a3](https://github.com/AstorisTheBrave/Rostra/commit/da132a3553c42b39e9b8c030350c38c2a44abc3c))
* add pino logger singleton with scoped children ([1a80280](https://github.com/AstorisTheBrave/Rostra/commit/1a802801f11602d35cd61d0ca78f04e962a27d64))
* add prisma core schema and cached getPrisma singleton ([1ce1e5f](https://github.com/AstorisTheBrave/Rostra/commit/1ce1e5ffbb5ecd56bb66611eb289ee334f134868))
* add shard/manager entries, core module, deploy script, and ops (Docker/CI/README) ([cdca04b](https://github.com/AstorisTheBrave/Rostra/commit/cdca04b20b8db751a4430e552f8980748a8754b6))
* add sharding ipc abstraction (native, hybrid-swappable) ([424c902](https://github.com/AstorisTheBrave/Rostra/commit/424c902f29b04114830315ce973346e0a86e7441))
* add tags, vanity status-roles, feedback; wire ticket/giveaway/reactionrole UI to @/ui; add GuildPresences intent + @/ui invariant ([e1d146e](https://github.com/AstorisTheBrave/Rostra/commit/e1d146ec9c087939e7b052d292232dd9177d6b00))
* add top.gg service, fastify web server, and stats autoposter ([3d5fe8c](https://github.com/AstorisTheBrave/Rostra/commit/3d5fe8c567c8226a788ea213af5580fc0fe5ab88))
* add zod-validated cached env config loader ([96abd47](https://github.com/AstorisTheBrave/Rostra/commit/96abd47d9d8861959beb589bbf867e1faab3e128))
* **ai:** add /ask assistant with hidden provider and persona sanitizer ([e77d32c](https://github.com/AstorisTheBrave/Rostra/commit/e77d32c0fb30b2edf4da52b896f3ac71c9b638aa))
* **automod:** add filters (invite/link/spam/mention/profanity/caps) via bad-words ([55cf0de](https://github.com/AstorisTheBrave/Rostra/commit/55cf0de47b3fdfb61297806d14a8f168884dd883))
* **birthday:** add birthday announcements with daily scheduler and temp role ([3b9e583](https://github.com/AstorisTheBrave/Rostra/commit/3b9e583dc8ee332b987fc2296277b1611dfaa728))
* **core:** add centralized safeAck auto-defer for slow interaction handlers ([dd87cbf](https://github.com/AstorisTheBrave/Rostra/commit/dd87cbf7fac108701a5b135c4020874bf446df99))
* **core:** add safeAck heartbeat for long tasks + V2 follow-up fallback ([8ad3f6a](https://github.com/AstorisTheBrave/Rostra/commit/8ad3f6ac36fd6484e8d9c6b41c515b90095186e1))
* **economy:** add currency, daily/work/crime/rob/gamble, bank, redis leaderboard ([bfb5e79](https://github.com/AstorisTheBrave/Rostra/commit/bfb5e7924ecaf5a3edd0bb83c1f336a48a62b46a))
* **extras:** add afk, snipe, and autoresponder ([71d1440](https://github.com/AstorisTheBrave/Rostra/commit/71d1440ae272af92c749a27e532198b61bbf7cd1))
* **games:** add tic-tac-toe (2P) and rock-paper-scissors button games ([20c245d](https://github.com/AstorisTheBrave/Rostra/commit/20c245dc1b1d9e791da941b5e27f88fd43dab442))
* **giveaways:** add giveaways with enter button and timed auto-end ([f5a44a1](https://github.com/AstorisTheBrave/Rostra/commit/f5a44a1a2adb29b922705e041761a20e6b3f9a28))
* **joinToCreate:** add temporary voice channels via a join hub ([2b3a4ab](https://github.com/AstorisTheBrave/Rostra/commit/2b3a4ab5cfbd7f1fdd267e50296b6cc216a0ddb7))
* **leveling:** add XP/levels, rank, role rewards, redis leaderboard ([90dbc0b](https://github.com/AstorisTheBrave/Rostra/commit/90dbc0bbf01e5eaf6153244a9fd511c77f4c70b1))
* **logging:** add configurable audit logging module ([f41e238](https://github.com/AstorisTheBrave/Rostra/commit/f41e238ceea950571ed14a01a7ef944e63965aad))
* **moderation:** add /mod command suite with relational case history ([0e9c45d](https://github.com/AstorisTheBrave/Rostra/commit/0e9c45d11bb2aac64e0bfb0e2fb54bc463552e38))
* **music:** add Lavalink player (/music) with multi-node config ([85599ad](https://github.com/AstorisTheBrave/Rostra/commit/85599adc8bc13d36ba6a1cbb6fcc7edbcb29fd53))
* **reactionroles:** add self-assign role panels with toggle buttons ([3652ddc](https://github.com/AstorisTheBrave/Rostra/commit/3652ddca09896714bf61a129746abff4cc40161f))
* **security:** add antinuke module (/security config + audit-driven punishment) ([f737e28](https://github.com/AstorisTheBrave/Rostra/commit/f737e2866b1785b7acaf2804a1e18f8b84cb1dcd))
* **tickets:** add ticket system with button interactions (open/claim/close) ([47c8966](https://github.com/AstorisTheBrave/Rostra/commit/47c896655834319cab2a7922ef9cb29dacd0fe4c))
* **trivia:** add Open Trivia DB quiz with answer buttons and scores ([5dd5733](https://github.com/AstorisTheBrave/Rostra/commit/5dd57332508d81f9d45588eb694184a5d1b1da72))
* **ui:** add centralized Components-V2 UI library (buttons, selects, modals, patterns) ([f440c7a](https://github.com/AstorisTheBrave/Rostra/commit/f440c7aec3674f5002c2a8580f7d8eef6aae0538))
* **utility:** add /util avatar|banner|userinfo|serverinfo; extend V2 kit with gallery/section ([50daf25](https://github.com/AstorisTheBrave/Rostra/commit/50daf25213792a67679966fabdb580a7a2200e12))
* **welcome:** add welcome/goodbye messages and autorole module ([88e91d6](https://github.com/AstorisTheBrave/Rostra/commit/88e91d6c3be239739bfe1a1ca7ad562869ba08cb))


### Changed

* **ui:** wire trivia + games to @/ui; fix CI (node 22 + env + invariant guards) ([39acacf](https://github.com/AstorisTheBrave/Rostra/commit/39acacf5029366eb6677322c4bb595b09acaa62e))

## [Unreleased]

### CI / Ops

- Dependabot for `npm` (grouped minor/patch) and `github-actions`, weekly.
- Automated releases via release-please: conventional commits open a release PR that bumps the
  version + `CHANGELOG.md` and, on merge, tags `vX.Y.Z`, cuts a GitHub release, and publishes the
  versioned GHCR image.
- README badges: CI status, latest release, GHCR image.

## [0.1.0] - 2026-06-05

First release — a full all-in-one bot unifying 15 legacy bots into one sharded TypeScript platform.

### Added

**Core platform**
- Sharded runtime: native `ShardingManager` with a `cluster/ipc.ts` abstraction (hybrid-sharding swappable).
- Cached singletons: `config` (Zod-validated env), `getPrisma()` (PostgreSQL), `getCache()`/`getRedis()`, `getLogger()`.
- `BotClient` with auto-discovered modules and command/event/interaction/job loaders.
- Command pipeline: permission guard → cooldown → error boundary, with a `safeAck` auto-defer (+ heartbeat) so slow handlers never miss Discord's 3s deadline.
- `@/ui` Components-V2 library (buttons, selects, modals, layout, patterns) — the single source of truth for all UI.
- i18n helper, BullMQ job queue (in-memory fallback), Fastify health endpoint + top.gg webhook/autoposter, graceful shutdown.

**Feature modules**
- Moderation, Security (antinuke), Auto-moderation, Logging, Welcome/autorole, Tickets, Economy, Leveling,
  Giveaways, Join-to-create voice, Reaction roles, Birthdays, Tags, Vanity status-roles, Feedback, Trivia,
  Games (tic-tac-toe, rock-paper-scissors), Music (Lavalink), an assistant (`/ask`), and utility/extras
  (avatar/userinfo/serverinfo, AFK, snipe, autoresponder).
- 25 slash commands, all Components V2, all i18n-keyed.

**Ops**
- Prisma baseline migration, Dockerfile + docker-compose, CI (typecheck, lint, tests, and guards for
  Components-V2-only / `@/ui`-only / undercover), `MIGRATION.md`, full `docs/`.

[Unreleased]: https://github.com/AstorisTheBrave/Rostra/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/AstorisTheBrave/Rostra/releases/tag/v0.1.0
