# Changelog

All notable changes to Rostra are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project aims to follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.2](https://github.com/AstorisTheBrave/Rostra/compare/v0.1.1...v0.1.2) (2026-06-13)


### Added

* **automod:** add a custom keyword/wildcard/regex rule engine ([28c81ed](https://github.com/AstorisTheBrave/Rostra/commit/28c81ede9c1d4a53dae32f6ea2206cdfafedfbe1))
* **automod:** severity-weighted escalation ladder, case funnel, offender DM ([fd2f88f](https://github.com/AstorisTheBrave/Rostra/commit/fd2f88f1ceb72d991ef48a08efbdc1f5cbdd9e06))
* **bulkrole:** add or remove a role across the whole server ([d630067](https://github.com/AstorisTheBrave/Rostra/commit/d630067e08e1744bf819c14007e604373cbfe4fe))
* **cards:** add leveling rank card and welcome image card ([99beec2](https://github.com/AstorisTheBrave/Rostra/commit/99beec2a50b4a74f070bae740c38a623b8ba5b89))
* **counting:** add a count-up game channel ([5adbdb0](https://github.com/AstorisTheBrave/Rostra/commit/5adbdb0c1aab41d9752e8c98e12a496d0a5f5891))
* **docker:** turnkey container (auto-migrate) + beginner hosting wiki ([791fcdc](https://github.com/AstorisTheBrave/Rostra/commit/791fcdca66c0d62354841f1bf7c0ae461f726279))
* **economy:** add a shop with items and buyable roles ([c09234e](https://github.com/AstorisTheBrave/Rostra/commit/c09234ecac8c63ae30849990a06c6165cffaf151))
* **feeds:** add Reddit and generic RSS/Atom sources ([7103650](https://github.com/AstorisTheBrave/Rostra/commit/71036507d04d0e565a158fd55933233467390854))
* **feeds:** add YouTube + Twitch notification feeds ([4447d4c](https://github.com/AstorisTheBrave/Rostra/commit/4447d4cde675c6979a86cd84d84cd89577431408))
* **giveaways:** gate entry by role, level, and account age ([9775103](https://github.com/AstorisTheBrave/Rostra/commit/9775103ed075f012728c03ee05ec9c1dc55fa738))
* **highlight:** DM members when a watched word is said ([d76bcd9](https://github.com/AstorisTheBrave/Rostra/commit/d76bcd9f46ec5a22f5d6c172fbf9bc8dd76ca792))
* **hosting:** add panel-start.mjs launcher for game panels (Ori/Pterodactyl) + wiki ([9d95ad5](https://github.com/AstorisTheBrave/Rostra/commit/9d95ad57956c653f5df5461daaaf8e7d50d49e81))
* **i18n:** localization platform core - ICU engine, service, pipeline ([03c154b](https://github.com/AstorisTheBrave/Rostra/commit/03c154bcb7af9f7172852c1aac3273a23b875403))
* **i18n:** translate-everything pipeline - AI drafts + validation gate ([7f398ca](https://github.com/AstorisTheBrave/Rostra/commit/7f398ca93c00ef8d21fd72c80282e7f658cc61f8))
* **i18n:** translation pipeline (generated bundle + coverage) + wave-1 content ([fda6672](https://github.com/AstorisTheBrave/Rostra/commit/fda66723001eb02ee41088135278501f90507e3f))
* **i18n:** user surfaces - /preferences, /setup language, /help switch, opt-outs ([a9c7b74](https://github.com/AstorisTheBrave/Rostra/commit/a9c7b74602f8b61a11645a3cdab112aa14719a1d))
* **i18n:** wave-1 translations + native command-metadata localization ([8735113](https://github.com/AstorisTheBrave/Rostra/commit/8735113bcd5b23e7f3fee68d45ad5e2ac691538f))
* **i18n:** zero-restart hot reload - Redis control bus + live overlay ([c53c6c5](https://github.com/AstorisTheBrave/Rostra/commit/c53c6c5b1c8a6d79d8963bb5714a550e834870e8))
* **logging:** audit-log actor attribution + kick and member-role events ([8f514c6](https://github.com/AstorisTheBrave/Rostra/commit/8f514c6413114e8b3c7303f666b80180d2f731b5))
* **logging:** log bulk deletes, voice activity, and nickname changes ([9de67ce](https://github.com/AstorisTheBrave/Rostra/commit/9de67ce6b2f4f0eb1a1cf8b4f6d9364514efccb2))
* **moderation:** /mod case lookup and /mod modstats ([a54e4e0](https://github.com/AstorisTheBrave/Rostra/commit/a54e4e0a0af9f695785e217328147e20aeaaec62))
* **modmail:** add DM-to-staff modmail threads ([ca753d4](https://github.com/AstorisTheBrave/Rostra/commit/ca753d4a38f479e9178be6588f974d11d5e5fc46))
* **modmail:** appeal-only mode + block list to curb DM abuse ([183d0db](https://github.com/AstorisTheBrave/Rostra/commit/183d0db4f87bb34d3482e4323b3da461d2de1d4e))
* **permissions:** shared owner-bypass gate; wire into tickets + moderation ([5550e14](https://github.com/AstorisTheBrave/Rostra/commit/5550e14fa8a2775229a0ff5ebd6c3019474f2a7a))
* **poll:** add button polls with live results ([3bc50d7](https://github.com/AstorisTheBrave/Rostra/commit/3bc50d747d60b7282ee368d4e17e6cfbc47cccc3))
* **reactionroles:** add dropdown (select-menu) self-role panels ([89258ae](https://github.com/AstorisTheBrave/Rostra/commit/89258aeef839752d3666eb9e70d95d2f6e2d2503))
* **reputation:** give and track reputation points ([bfc3253](https://github.com/AstorisTheBrave/Rostra/commit/bfc3253ec19887103be4c02dc781dd3c9a9953e1))
* **roleplay:** render /roleplay ship as an image card using the zyn ship background ([942eba3](https://github.com/AstorisTheBrave/Rostra/commit/942eba32c50219df1a7e0820d6d4d81c91f07202))
* **scaling:** dormant-by-default feature flags + live kill-switches ([1fb0168](https://github.com/AstorisTheBrave/Rostra/commit/1fb0168f7c05c94be438b9d0f518fce9fdfc523a))
* **scaling:** Redis leader election for single-instance manager jobs ([53f5a35](https://github.com/AstorisTheBrave/Rostra/commit/53f5a356ef82b8732a6d06c04d0a4c81a05bdbe4))
* **scaling:** wire hybrid clustering behind SHARDING_MODE=hybrid ([56b9d42](https://github.com/AstorisTheBrave/Rostra/commit/56b9d42ad045a76d2943a89c5ad625694c3350bf))
* **security:** add anti-raid lockdown and panic mode ([91a8def](https://github.com/AstorisTheBrave/Rostra/commit/91a8defa13270335f5d179b4f35c0632807609f0))
* **serverstats:** live server-count voice channels ([beb4942](https://github.com/AstorisTheBrave/Rostra/commit/beb49420fdd7ac1ba43ca2956335d459e09a9334))
* **setup:** /setup check read-only provisioning health probe ([a8ed2a0](https://github.com/AstorisTheBrave/Rostra/commit/a8ed2a00e1aac6d0c096bc736fca28e80e3ac4bb))
* **setup:** /setup provision creates and wires Rostra's channels + Verified role ([95d6283](https://github.com/AstorisTheBrave/Rostra/commit/95d6283881f578b4a6c168dbc31181f57945af54))
* **starboard:** add remove-threshold hysteresis and reward roles ([0f8b137](https://github.com/AstorisTheBrave/Rostra/commit/0f8b1378cf4fd70ddb7775e25befcdb9f171026c))
* **starboard:** add starboard built from the official Starboard docs ([9d2017a](https://github.com/AstorisTheBrave/Rostra/commit/9d2017a6b10747908ee55a7ffdd62fe555b52328))
* **starboard:** complete the engine - blacklists, downvotes, filters, tiers, overrides ([b191421](https://github.com/AstorisTheBrave/Rostra/commit/b191421790ccf5f0f128ed4030eae6c81b469114))
* **starboard:** rebuild as a full multi-board system ([8ec3fca](https://github.com/AstorisTheBrave/Rostra/commit/8ec3fca49c130d7fb7ead201a719f8c16c6d6169))
* **sticky:** keep a message pinned to the bottom of a channel ([e4d9bd6](https://github.com/AstorisTheBrave/Rostra/commit/e4d9bd6bff6657cdf396c384c313e88044c8791f))
* **suggest:** add a suggestions board with voting and staff decisions ([451bb9b](https://github.com/AstorisTheBrave/Rostra/commit/451bb9bbda17f9b7b19f5d45b639c11b90ed7bfa))
* **tickets:** phase 1 - state machine, priority, SLA schema + helpers ([2721a24](https://github.com/AstorisTheBrave/Rostra/commit/2721a2497c53b7e64cd048374d1511a6ac006cd9))
* **tickets:** phase 10 - per-guild custom queues ([b0a757f](https://github.com/AstorisTheBrave/Rostra/commit/b0a757fb16d2e5da6d320974897c928db8de40e8))
* **tickets:** phase 11 - watchers notified on escalate/close ([e05294c](https://github.com/AstorisTheBrave/Rostra/commit/e05294c919039e3686de104f57730c9c4177cfad))
* **tickets:** phase 12 - staff performance stats ([4e4bd61](https://github.com/AstorisTheBrave/Rostra/commit/4e4bd6128b1d72a9dfcfb8e298a29ac0ce0ab0a2))
* **tickets:** phase 2 - message capture + transcripts + richer close ([2c04c17](https://github.com/AstorisTheBrave/Rostra/commit/2c04c17388eef172f672eb2d78582bba57df636a))
* **tickets:** phase 3 - priority levels and escalation ([5e59ce6](https://github.com/AstorisTheBrave/Rostra/commit/5e59ce63ad70fec71fc493222df84b0ecf8df492))
* **tickets:** phase 4 - manager-side SLA-breach monitor cron ([68c7a14](https://github.com/AstorisTheBrave/Rostra/commit/68c7a14b1a4491659fff186c32788fc7784d09b4))
* **tickets:** phase 5 - category-queue panel with per-queue SLA ([52d38b2](https://github.com/AstorisTheBrave/Rostra/commit/52d38b2214221432ba76d38949b77239ce33dcba))
* **tickets:** phase 6 - transfer between queues + /ticket info ([cfff890](https://github.com/AstorisTheBrave/Rostra/commit/cfff890daa6daf3c1da4e31ea10f74de372a14d8))
* **tickets:** phase 7 - close-to-archive + reopen within window ([eedb585](https://github.com/AstorisTheBrave/Rostra/commit/eedb585dc477200a6453427c87d2ef06a8dfd688))
* **tickets:** phase 8 - live dashboard overview ([7572667](https://github.com/AstorisTheBrave/Rostra/commit/7572667d98a8af39b374859748a517a98bee9f41))
* **tickets:** phase 9 - close reason + tags ([e699ecd](https://github.com/AstorisTheBrave/Rostra/commit/e699ecd379d4398a2a08383ba9915ddc6a5c8664))
* **ui:** nest action rows in container; setup toggles now inside the box ([46ba2ff](https://github.com/AstorisTheBrave/Rostra/commit/46ba2ff2b753e4ad35f6a76db22a33f36ba41880))
* **verification:** account-age gate kicks too-new accounts on join ([857d4ef](https://github.com/AstorisTheBrave/Rostra/commit/857d4efcee415a9d2fdb688c03c679db46e76bca))
* **verification:** add a button-gate verification module (YAGPDB-style) ([cc51708](https://github.com/AstorisTheBrave/Rostra/commit/cc5170879ae896e8ea5b02929b9db15181bafedd))
* **verification:** add captcha and auto-kick for unverified members ([34da226](https://github.com/AstorisTheBrave/Rostra/commit/34da2263bdf81f1a470cc1a7df82a5d1ce015e67))
* **voicerole:** grant a role while a member is in voice ([581f132](https://github.com/AstorisTheBrave/Rostra/commit/581f1321baa186c50cee44f22085eadb9c37dcf4))


### Fixed

* **automod,cards:** enable profanity via wizard + bundle card fonts ([9324461](https://github.com/AstorisTheBrave/Rostra/commit/93244616600a42af1be6fe88a634242196f98596))
* **hosting:** panel-start launches via --import tsx so @/ alias resolves ([d1950f3](https://github.com/AstorisTheBrave/Rostra/commit/d1950f3d2d1aec6853807033e4944ba9288b7090))
* **hosting:** run panel cluster via tsx CLI + pin TSX_TSCONFIG_PATH for @/ alias ([b846fe5](https://github.com/AstorisTheBrave/Rostra/commit/b846fe59d426301f60b8adf27250c1d14612a18c))
* **modmail:** route DMs across shards via broadcastEval ([e60513a](https://github.com/AstorisTheBrave/Rostra/commit/e60513a7ca659b708432315880fd057231cf14c3))
* **panel:** disable Prisma advisory lock so migrations run over pooled DBs ([0b7ce8c](https://github.com/AstorisTheBrave/Rostra/commit/0b7ce8cd048b682bbe8c84e36110741243dc4fa7))
* **panel:** migrate over DIRECT_URL to avoid pooler advisory-lock (P1002) ([473a450](https://github.com/AstorisTheBrave/Rostra/commit/473a450f41e12ff42185eec0e85ac825a4ca40ec))
* **ui:** recover reply when it races safeAck auto-defer (40060) ([7d927a9](https://github.com/AstorisTheBrave/Rostra/commit/7d927a9bca70ef0ba342634f5ed431ca03d87feb))
* **undercover:** drop AI model/provider names from i18n:draft tooling ([667582a](https://github.com/AstorisTheBrave/Rostra/commit/667582aeeab237871142f3599c8aa4469cdd89c9))

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
