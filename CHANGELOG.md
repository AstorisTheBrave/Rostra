# Changelog

All notable changes to Rostra are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project aims to follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.1](https://github.com/AstorisTheBrave/Rostra/compare/v0.1.0...v0.1.1) (2026-06-06)


### Added

* **core:** add centralized cron registry + daily task pruning (platform step 4) ([d8be7fa](https://github.com/AstorisTheBrave/Rostra/commit/d8be7fadb50c92cf62a2e080ae6bba23ba62e6c7))
* **core:** add centralized GuildTenant config service (platform step 2) ([2e7dd68](https://github.com/AstorisTheBrave/Rostra/commit/2e7dd68ef166cd03b0f37a5767773d9b34049010))
* **core:** add durable crash-safe scheduler (platform step 3) ([d32d851](https://github.com/AstorisTheBrave/Rostra/commit/d32d8512535a93c6906c1fefa8fd4160b991f041))
* **core:** extend tenant read-through to leveling and economy ([4d8ea92](https://github.com/AstorisTheBrave/Rostra/commit/4d8ea926271f8368548d72ef2b5c95ed5f233b53))
* **core:** hash-gated automatic slash-command registration ([534431b](https://github.com/AstorisTheBrave/Rostra/commit/534431b2db2b60288ed18be2cdbc0218f6cf056c))
* **core:** per-system setup wizards for automod/logging/welcome ([8d28ade](https://github.com/AstorisTheBrave/Rostra/commit/8d28ade94cb9f180b1bcd04b35a1f0f6f41f3314))
* **core:** redesign /help and add /stats and /shards panels ([c7a47d5](https://github.com/AstorisTheBrave/Rostra/commit/c7a47d555277404395683f2dae0e04771797b922))
* **core:** tenant read-through - /setup toggles gate the baseline systems ([37675c6](https://github.com/AstorisTheBrave/Rostra/commit/37675c63cb882c97a8e2ddf9e8436c667b9b9ce2))
* **moderation:** durable /mod tempban via the scheduler ([91a7961](https://github.com/AstorisTheBrave/Rostra/commit/91a7961edbfd7fb918e0770686eb141d941d3136))
* **moderation:** durable /mod temprole via the scheduler (step 3 consumer) ([2d4115f](https://github.com/AstorisTheBrave/Rostra/commit/2d4115f41bb7551cf9859fa43a66d03ed89a7fdb))
* **profile:** add image profile cards via @napi-rs/canvas (zyn-bot port) ([4e04f7a](https://github.com/AstorisTheBrave/Rostra/commit/4e04f7a49e77f06e3f3fd4337612471f3fa788ad))
* **profile:** show leveling and economy stats on the card ([b4c8746](https://github.com/AstorisTheBrave/Rostra/commit/b4c87466031b55ac01444c73d9ccfa37800cf278))
* **reminders:** add personal reminders with per-shard scheduling (zyn-bot port) ([2d36a74](https://github.com/AstorisTheBrave/Rostra/commit/2d36a74f39ea7f282146698b2b781357c7d047a6))
* **roleplay:** add gif reaction actions and ship (ported from zyn-bot) ([74d77df](https://github.com/AstorisTheBrave/Rostra/commit/74d77dfbdbce81e2fa7f310b0521deebc06af4f9))
* **security:** add /security setup one-click antinuke wizard (per-system wizard) ([ebb534b](https://github.com/AstorisTheBrave/Rostra/commit/ebb534b7f7e3887dc714cc9dca1f11d65a481d46))
* **setup:** add /setup server wizard writing to the GuildTenant (platform step 5) ([af65cb1](https://github.com/AstorisTheBrave/Rostra/commit/af65cb15fef02881cd5d4fbd091d1a63053d4c6a))
* **steal:** add /steal to import custom emojis (zyn-bot port) ([1e9c1e1](https://github.com/AstorisTheBrave/Rostra/commit/1e9c1e13ad5fe1db7f27bb5c5c2030b62a6d0696))
* **ui:** add custom application-emoji system with unicode fallbacks ([30bcc61](https://github.com/AstorisTheBrave/Rostra/commit/30bcc61b59c1a1d84d0290e0db64feaeca883028))
* **ui:** upload application emojis and bake in their ids ([83e74ad](https://github.com/AstorisTheBrave/Rostra/commit/83e74ad2d93861032c8b8ac6eb29ac5a4c81fb4d))


### Fixed

* resolve CodeQL alerts (rate limiting, pinned actions, ci permissions) ([b8eb821](https://github.com/AstorisTheBrave/Rostra/commit/b8eb82184dcb86462bd98e517ceb8e22dae52c1f))


### Performance

* **cache:** add 5-minute config-cache convention and a Giveaway composite index ([449084b](https://github.com/AstorisTheBrave/Rostra/commit/449084b2f32d5355c0b3c4aff77292d049e73631))

## [Unreleased]

### CI / Ops

- Dependabot for `npm` (grouped minor/patch) and `github-actions`, weekly.
- Automated releases via release-please: conventional commits open a release PR that bumps the
  version + `CHANGELOG.md` and, on merge, tags `vX.Y.Z`, cuts a GitHub release, and publishes the
  versioned GHCR image.
- README badges: CI status, latest release, GHCR image.

## [0.1.0] - 2026-06-05

First release - a full all-in-one bot unifying 15 legacy bots into one sharded TypeScript platform.

### Added

**Core platform**
- Sharded runtime: native `ShardingManager` with a `cluster/ipc.ts` abstraction (hybrid-sharding swappable).
- Cached singletons: `config` (Zod-validated env), `getPrisma()` (PostgreSQL), `getCache()`/`getRedis()`, `getLogger()`.
- `BotClient` with auto-discovered modules and command/event/interaction/job loaders.
- Command pipeline: permission guard → cooldown → error boundary, with a `safeAck` auto-defer (+ heartbeat) so slow handlers never miss Discord's 3s deadline.
- `@/ui` Components-V2 library (buttons, selects, modals, layout, patterns) - the single source of truth for all UI.
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
