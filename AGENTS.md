# AGENTS.md

Guidance for coding assistants and contributors working in Rostra. Read `CONTRIBUTING.md` for the
contribution workflow. This file and decision 011 define the Phase 00 revamp contract.

## Read first

1. `docs/overview.mdx` and `docs/architecture/index.mdx` for the current implementation map.
2. `docs/architecture/decisions/011-revamp-contract.mdx` for binding workspace and security rulings.
3. Only the relevant `docs/modules/<name>.mdx` and `docs/style.mdx`.
4. `docs/sessions/log.mdx` and the current production implementation plan.

Older docs describe the pre-migration layout. Where they conflict with this contract, this contract
wins. A workspace path below is its target owner, not a claim that its migration is already complete.
Keep the existing application working until its tested move lands.

## Design priorities

1. Correctness and tenant isolation.
2. Security and least privilege.
3. Recovery and independently survivable failures.
4. Measured performance and predictable resource use.
5. Structure, clear contracts and modular ownership.
6. Simple setup and specialist feature depth.

Within the structure priority, prefer one source of truth, isolated modules and current stable tooling.

## Workspace ownership

- `apps/gateway/`: Discord sharding, interaction acknowledgement and event fanout.
- `apps/api/`: authenticated, validated domain API and external webhook boundaries.
- `apps/web/`: public, member, guild-admin and host-operator web surfaces using the typed API.
- `apps/workers/`: durable jobs, reconciliation, exports and expensive work.
- `apps/realtime/`: optional authoritative rooms with explicit connection authorization.
- `apps/activity/`: embedded Discord client with a separate origin and authentication boundary.
- `modules/<name>/`: feature logic, manifests, settings/data ownership and tests.
- `modules/registry.ts`: checked-in canonical module IDs and lazy imports; add new modules here, not through filesystem discovery.
- `packages/`: narrow shared public contracts with explicit export maps and no cycles.
- `integrations/`: authorized external adapters; credentials stay within their owning boundary.
- `games/`: game rules and renderers; share pure contracts through the game core.
- `infra/`: deployment, Compose, passive ingress, monitoring and recovery tooling.
- `tooling/`: repository checks, shared build/lint configuration and smoke tools.

Shared authorities are `@rostra/config`, `@rostra/database`, `@rostra/cache`, `@rostra/logger`,
`@rostra/i18n`, `@rostra/contracts`, `@rostra/module-sdk` and `@rostra/discord-ui`. Web clients/UI and
auth/operations have separate packages. Use `@rostra/auth` for explicit host or tenant-scoped guild
authorization and `@rostra/operations` for durable operation intent and idempotency. The shared owners now export source through explicit package
maps. Use `@rostra/config`, `@rostra/database`, `@rostra/cache`, `@rostra/logger`, `@rostra/i18n` and
`@rostra/discord-ui`; tests may use `@rostra/testing`. The `@/` alias is a temporary gateway and legacy
module compatibility seam scoped to `apps/gateway/src/` plus `modules/`. Gateway-specific types stay in
`apps/gateway/src/types/module.ts`; `JobDefinition` is exported by `@rostra/contracts`. New packages must
not use the alias. Never import another package's private files, including through relative paths.

## Hard invariants

1. Strict TypeScript and ESM only. No `require()` or `any`; narrow `unknown` at trust boundaries.
2. Only the config owner reads environment variables. Only the database owner constructs the Prisma
   client; consumers use `config` and `getPrisma()` through public exports.
3. All Discord UI comes from the shared Discord UI owner. Never instantiate component builders in a
   feature module. Add a missing shared primitive with a test first. Components V2 only; no legacy embeds.
4. Every user-facing string uses the shared `t()` localization contract. Wrap I/O in error boundaries
   with structured Pino logs, useful failure states and credential redaction.
5. The assistant presents only as Rostra. Never identify its implementation provider or model in code,
   comments, errors, user text, documentation, metadata or commits. Use neutral `AI_API_KEY`,
   `AI_BASE_URL` and `AI_MODEL` configuration. No tool attribution or co-author trailers in commits.
6. Modules never import another module's internals or package-private source paths. Share through
   public package exports and explicit contracts. Use `automation` as the canonical module ID;
   Automation Studio is an optional web label, not a second module.
7. Guild authorization is explicit and tenant-scoped for every action and private-data read. Host
   operators and owner IDs never bypass guild permissions. Test guessed/swapped object IDs and stale
   authorization. Do not broaden access while moving legacy code.
8. Preserve every existing Prisma migration directory and checksum. Move history intact; never
   regenerate it. Failed migration means startup fails. Recovery must support the prior image without
   destructive down migrations.
9. Migration verification never boots a gateway with a real token and never publishes commands.
   Use fake credentials, blocked external adapters and disposable services. Preserve command JSON,
   module inventory, events and behavior unless a tested security fix requires a change.
10. PostgreSQL owns durable intent; Redis delivery is at least once. Consumers must be idempotent,
    return each claim version from the same transaction that increments it, fence settlement by that
    claim version, reconcile recoverable intent and drain on shutdown. New operations write an outbox
    row in the same transaction as their domain mutation; API best-effort delivery and the tracked
    worker relay publish only after commit. Producer connections must fail and close promptly during
    Redis outages; the BullMQ Worker connection keeps its separate retry policy. Each relay poll
    repairs a bounded batch of missing outbox rows left by a rollback image. Do not report an effect
    before it is durable.
11. Stable dependencies only. No alpha, beta, RC or development releases unless that is the package's
    only published stable channel. Verify support and deployment requirements before selecting tooling.
12. Every change updates `docs/sessions/log.mdx` and relevant module or architecture documentation.
    Keep this file current when introducing a pattern or constraint contributors need.
13. No em dashes in source, docs, user text, commits, issues or PR comments. Use a normal hyphen or reword.
14. Before a phase can pass, inspect every pull-request review, conversation comment, unresolved inline thread and
    GitHub security finding, including automated Advanced Security reviews. Resolve every actionable item, document
    false positives with concrete evidence, rerun the owned gate, push the correction and re-fetch review state.
    Never call a phase complete while an actionable thread remains unresolved.
15. For deep design, security, concurrency or multi-file coding that separates cleanly, delegate to a capable
    workhorse subagent at high reasoning. Use a fast subagent at high reasoning for lightweight, mechanical or
    narrowly scoped work. Keep small, sequential or tightly coupled work in the primary task, and review every
    delegated result before it enters a phase snapshot.
16. Persisted configuration or preference caches use `@rostra/cache` coherent writes.
    Advance the PostgreSQL cache revision with the write in one transaction, then publish
    the exact tenant invalidation after commit. Persisted configuration and preference reads
    use a bounded local cache with direct PostgreSQL misses; local entries must expire within
    five minutes when Redis delivery fails. Process-owned runtime maps stay local.

## Discord entrypoints and boundaries

Preserve existing slash commands, grouped coherently under top-level commands. No prefix engine.
Context menus are allowed for specified workflows; Activities are separately authenticated clients,
not privileged shortcuts into guild actions. Budget chat-input registrations by type and scope:
100 global and 100 per guild are separate limits, not an automatic shared pool. Reconcile per-guild
registrations explicitly, and account for context-menu and Activity entrypoints within their own
platform limits before registering them.

Gateway handlers use shared acknowledgement/routing helpers, `defineEvent`, and component IDs scoped
as `module:action:arg`. Keep expensive work in workers. Optional realtime and Activity applications must
build and test in Phase 00, but need not run in the default runtime profile. Do not claim multiplayer
or device verification from scaffold tests.

## Repository inputs

`archive/` is private local reference material, never a workspace, source, package, formatter input,
test input, image context, scan input or generated artifact. Never force-add it. `.superpowers/` is
ignored scratch; production code, plans, tests and docs belong in the normal tree. New production docs
may need explicit staging when a user-level ignore hides them. Never commit local environments,
credentials, dependencies, build output or coverage. Keep the boundary checker and every later tool's
input configuration aligned when adding a tool.
The source neutrality guard covers JS/TS, JSON metadata and `.sh` scripts, including the container
entrypoint. Add a regression and extend its allowlist when introducing another executable source format.

No ingress-provider control plane is in scope. Document passive reverse-proxy/tunnel compatibility
without requesting management credentials or changing external ingress resources.

## Verification and delivery

During this control-plane slice:

```bash
pnpm install --frozen-lockfile
pnpm check:boundaries
pnpm typecheck
pnpm lint
pnpm test
git diff --check
```

The control plane uses pinned pnpm and one frozen lockfile. Root commands cover build, typecheck,
lint, unit/integration tests, boundary checks and clean. `@rostra/gateway` owns the moved runtime and
includes the legacy module tree in its checks until Phase 01 replaces compatibility discovery. Client generation is
uncached and runs before build/typecheck/test consumers without loading deployment credentials.
`pnpm test` uses placeholder environment values supplied by CI or the caller; `pnpm test:env` loads
the local environment. Both cap test-file concurrency at two; root tests serialize workspace tasks so
the cap holds across packages too. Shared-package builds currently typecheck without emitting files.
The worker integration task runs the real PostgreSQL/Redis restart and duplicate-delivery proof; CI
provides its disposable services. Keep local checks lightweight;
use CI for service/browser/security/image matrices where practical. New logic needs a focused test.
Moving code also needs public-export, unchanged migration and normalized command/module parity proof.
Record measured evidence and unresolved limitations before claiming a phase passes.

`main` is protected: use a branch and PR with green CI. Commit with a conventional subject, no attribution
trailers and no em dashes. Do not confuse a locally green slice with completed Phase 00 delivery.
Every completed phase must be pushed to GitHub as a rollback snapshot after its full gate and review
pass. Verify and record matching local and remote commit hashes before claiming phase delivery.
