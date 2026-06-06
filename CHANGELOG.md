# Changelog

All notable changes to Rostra are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project aims to follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
