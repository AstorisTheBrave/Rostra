# Rostra Phase 01 Platform Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development for heavy independent tasks and superpowers:executing-plans for shared contracts, schema changes and final integration. Use a capable workhorse at high reasoning for deep design and coding, and a fast model at high reasoning for lightweight mechanical work. The primary agent reviews every diff.

**Goal:** Replace the Phase 00 compatibility seams with enforceable tenant authorization, explicit module ownership, coherent caches, transactional durable work, recoverable scheduling and measurable operational health without changing Rostra's existing Discord behavior.

**Architecture:** PostgreSQL remains the source of durable intent, role grants, outbox records and scheduled work. Redis carries at-least-once delivery and versioned invalidation messages, never the only copy of required state. A checked-in module registry replaces filesystem discovery, while module manifests, lifecycle supervision and versioned events define runtime ownership. Authorization resolves a typed capability for the exact guild at the boundary and never grants guild access from host or configured-owner identity.

**Tech Stack:** Node.js 22 or newer, strict TypeScript ESM, pnpm workspaces, Prisma/PostgreSQL, Redis, BullMQ, Fastify, discord.js, Pino, Node test runner, Docker Compose and GitHub Actions.

**Spec:** `archive/ROSTRA-CODEX-DOSSIER/07-PHASES/PHASE-01-PLATFORM-CORE.md`, `archive/ROSTRA-CODEX-DOSSIER/03-ARCHITECTURE/MODULE-SDK.md`, decision 011 and the repository `AGENTS.md`.

## Global constraints

- Preserve all 42 module IDs, 47 normalized command definitions and 48 Discord event registrations unless a tested security correction requires a recorded difference.
- Preserve every migration directory and checksum. New migrations are additive and forward-only.
- Default deny at guild boundaries. Host principals, configured owner IDs and guessed object IDs never grant guild permissions.
- Do not mint privileged API capabilities from an eight-hour OAuth snapshot. Privileged authorization must be revalidated against current tenant state before use.
- PostgreSQL commits domain state and outbox intent atomically. Redis publication occurs only after commit and may be repeated.
- Scheduled and queued work is claimed with a lease and monotonically increasing claim version. Only the current claim may settle it.
- Cache invalidation messages are typed and versioned. A write cannot be reported as coherently complete if fleet invalidation fails without a documented fallback.
- Keep the gateway free of expensive durable work. Workers own outbox relay, durable scheduling and retries.
- Keep `archive/` ignored and outside every tool input. Use fake Discord credentials and blocked adapters for verification.
- No new dependency unless the platform cannot provide the required behavior. Stable releases only.
- Every task updates relevant architecture/module docs and `docs/sessions/log.mdx`.
- Commit and push each completed task as a rollback snapshot. Record matching local and remote hashes. A task push is not a Phase 01 pass.
- Before Phase 01 passes, inspect every PR review, inline thread and Advanced Security alert, resolve or document each item, rerun affected tests, push, re-fetch and prove the final remote hash owns every green workflow.
- No em dashes or implementation-provider attribution in source, docs, commits or PR text.

## Review focus

- A configured bot owner without a guild role must fail moderation and ticket actions.
- A removed member or revoked capability must fail the next privileged request rather than retain an eight-hour grant.
- Static registry order, dependency errors and lifecycle failure isolation must be deterministic.
- A domain mutation and its outbox row must commit or roll back together.
- Duplicate publication, stale claims, worker termination and Redis restart must not duplicate a durable effect or lose recoverable work.
- Two independent process-local caches must converge after a versioned invalidation.
- Feature-flag and provisioner failures must be visible and must not silently produce an enabled or successful state.
- Performance reports must compare the same defined workload before and after the affected slice.

## Task 1: Lock the baseline and evidence harness

**Files:**
- Create: `docs/phase-reports/01-platform-core/index.mdx`
- Create: `docs/phase-reports/01-platform-core/baseline.mdx`
- Create: `tooling/scripts/phase01-measure.mjs`
- Create: `tooling/scripts/phase01-measure.test.ts`
- Modify: `.github/workflows/ci.yml`
- Modify: `docs/sessions/log.mdx`

**Interfaces:**
- Consumes: current registry fixtures, API/auth tests, worker service proof and Compose services.
- Produces: deterministic JSON measurements for request p95, database query count, event-loop delay, cold/warm cache behavior and queue lag, plus the Phase 01 evidence index.

- [ ] Write a focused test that rejects missing workload metadata, non-finite samples and incomparable before/after inputs.
- [ ] Capture the unchanged 42/47/48 registry baseline, affected API authorization path, tenant-cache read path and durable-operation path. Record hardware/runtime and iteration counts.
- [ ] Add a CI artifact step for measurements. Keep browser, disposable-service and process-kill workloads on GitHub runners.
- [ ] Record known Phase 00 limits without claiming production capacity.
- [ ] Run the focused test, boundary check, lint and `git diff --check`.
- [ ] Commit `test: establish phase one platform baselines`, push and verify the remote hash.

## Task 2: Make guild authorization explicit and current

**Files:**
- Modify: `packages/auth/src/index.ts`
- Modify: `packages/auth/src/index.test.ts`
- Modify: `packages/database/prisma/schema.prisma`
- Create: `packages/database/prisma/migrations/<timestamp>_guild_capabilities/migration.sql`
- Modify: `apps/api/src/server.ts`
- Modify: `apps/api/src/server.test.ts`
- Modify: `apps/web/src/server/runtime.server.ts`
- Modify: `apps/web/src/server/runtime.server.test.ts`
- Modify: `apps/gateway/src/services/permissions.ts`
- Modify: `modules/moderation/index.ts`
- Create or modify: focused moderation authorization tests
- Modify: `modules/tickets/service.ts`
- Create or modify: focused ticket authorization tests
- Modify: relevant auth, moderation and tickets documentation
- Modify: `docs/sessions/log.mdx`

**Interfaces:**
- Produces: a closed `GuildCapability` union, tenant role/capability rows, exact-guild capability resolution and short-lived principals containing only freshly resolved capabilities.
- Consumes: Discord OAuth identity for login only, current persisted membership and role grants for privileged API authorization.

- [ ] Add failing negative tests for host-to-guild access, configured-owner bypass, swapped guild IDs, stale membership, stale grants and missing capability.
- [ ] Add the smallest additive tenant role model: guild role, capability grant, member-role assignment and required uniqueness/indexes. Do not infer grants from legacy owner IDs.
- [ ] Replace untyped permission literals at the auth boundary with the closed capability contract and default-deny resolver.
- [ ] Revalidate privileged access before minting a service principal. Keep the OAuth snapshot only for navigation hints and non-authoritative display.
- [ ] Remove configured-owner bypass from moderation, tickets and the shared guild-permission helper. Preserve explicit host-only owner commands.
- [ ] Run focused auth/API/web/module tests, Prisma validation/generation and a PostgreSQL migration test.
- [ ] Commit `fix: enforce tenant capability authorization`, push and verify the remote hash.

## Task 3: Replace filesystem module discovery

**Files:**
- Modify: `packages/module-sdk/src/manifest.ts`
- Create: `packages/module-sdk/src/registry.ts`
- Create: `packages/module-sdk/src/events.ts`
- Create: `packages/module-sdk/src/lifecycle.ts`
- Modify: `packages/module-sdk/src/index.ts`
- Create or modify: focused module SDK tests
- Create: `modules/registry.ts`
- Modify: all 42 `modules/<name>/index.ts` entrypoints to export a validated manifest and runtime factory, only where the checked-in registry cannot own the declaration without duplication
- Modify: `apps/gateway/src/client/loaders/modules.ts`
- Modify: `apps/gateway/src/client/loaders/modules.test.ts`
- Modify: `apps/gateway/src/client/loaders/events.ts`
- Modify: `tooling/scripts/snapshot-modules.mjs`
- Modify: `tooling/scripts/registry-snapshots.test.ts`
- Modify: module SDK and architecture docs
- Modify: `docs/sessions/log.mdx`

**Interfaces:**
- Produces: `ModuleManifestV1`, dependency constraints, typed command/event/job descriptors, validated settings schema metadata, deterministic topological registry order and lifecycle state with owned abort/dispose/drain behavior.
- Consumes: current legacy `BotModule` exports through one temporary adapter only when a module has not yet moved behavior behind its runtime factory.

- [ ] Add failing tests for invalid semver, unknown schema version, duplicate ID, missing/incompatible dependency, dependency cycle, invalid budgets, deterministic order, disabled no-op and isolated lifecycle failure.
- [ ] Define the minimal version-1 manifest and event descriptors required by the dossier. Do not add speculative extension APIs.
- [ ] Check in an explicit registry for the 42 canonical IDs, including `automation` as the only automation module ID.
- [ ] Replace `readdir` discovery with registry loading and deterministic dependency order. Keep listener disposal and module-owned work under the lifecycle supervisor.
- [ ] Preserve normalized command JSON, intents, permissions and all 48 event registrations. Block import-time duplicate registration in restart tests.
- [ ] Run module SDK tests, gateway loader tests, registry parity, module tests, typecheck and boundary checks.
- [ ] Commit `refactor: add the deterministic module registry`, push and verify the remote hash.

## Task 4: Add versioned events and fleet cache coherence

**Files:**
- Modify: `packages/cache/src/bus.ts`
- Modify: `packages/cache/src/index.ts`
- Create or modify: cache unit and Redis service tests
- Modify: `apps/gateway/src/services/tenant.ts`
- Modify: `apps/gateway/src/services/tenant.test.ts`
- Modify: module SDK event contracts and tests from Task 3
- Modify: cached module write paths found by `rg "invalidate|cachedConfig|Map<" modules apps packages`
- Modify: cache and event architecture docs
- Modify: `docs/sessions/log.mdx`

**Interfaces:**
- Produces: `CacheInvalidationV1` with owner, tenant, key and monotonic version; subscription handles that dispose cleanly; versioned module event envelopes with tenant scope and payload validation.
- Consumes: successful durable writes and Redis pub/sub delivery.

- [ ] Write failing tests with two independent L1 instances, duplicate/out-of-order invalidations, reconnect and subscription disposal.
- [ ] Publish invalidation only after the owning write commits. Evict stale L1 entries in every subscriber and ignore older versions.
- [ ] Define visible failure behavior: bounded TTL fallback is allowed only when documented and tested; silent coherent-success claims are not.
- [ ] Route module events through versioned validated descriptors while keeping Discord listener adapters unchanged at the edge.
- [ ] Run focused unit tests plus disposable-Redis cross-process proof.
- [ ] Commit `feat: add versioned cache and event coherence`, push and verify the remote hash.

## Task 5: Commit domain mutations with transactional outbox intent

**Files:**
- Modify: `packages/database/prisma/schema.prisma`
- Create: `packages/database/prisma/migrations/<timestamp>_transactional_outbox/migration.sql`
- Modify: `packages/operations/src/index.ts`
- Create: `packages/operations/src/outbox.ts`
- Create or modify: operation unit and PostgreSQL service tests
- Modify: `apps/api/src/server.ts`
- Modify: API operation tests
- Modify: `apps/workers/src/runtime.ts`
- Modify: worker runtime tests
- Modify: operation architecture docs
- Modify: `docs/sessions/log.mdx`

**Interfaces:**
- Produces: an outbox row written in the same Prisma transaction as domain state, relay claim/lease/version fields, idempotent publication and observable relay status.
- Consumes: API/domain mutation callbacks and existing `OperationRecord` identity/idempotency rules.

- [ ] Add failing tests proving atomic rollback, post-commit publication, duplicate relay safety, expired-claim recovery and stale-settlement rejection.
- [ ] Add only the schema fields/table needed to relay durable intent. Reuse existing operation claims and effects rather than create a second job framework.
- [ ] Move publish-after-create callers to the transactional API. The request may return durable acceptance after commit even if immediate Redis publication fails; reconciliation must recover it.
- [ ] Add a tracked outbox relay to workers with graceful drain and metrics.
- [ ] Run focused tests, Prisma checks and disposable PostgreSQL/Redis relay proof.
- [ ] Commit `feat: add transactional operation outbox`, push and verify the remote hash.

## Task 6: Move scheduled work to fenced durable workers

**Files:**
- Modify: `packages/database/prisma/schema.prisma`
- Create: `packages/database/prisma/migrations/<timestamp>_scheduled_task_claims/migration.sql`
- Create: `packages/operations/src/scheduler.ts`
- Create or modify: scheduler unit and service tests
- Modify: `apps/workers/src/runtime.ts`
- Modify: `apps/workers/src/runtime.service.ts`
- Modify: `apps/gateway/src/services/scheduler.ts`
- Modify: `apps/gateway/src/services/scheduler.test.ts`
- Modify: current schedule callers and job registration in affected modules
- Modify: scheduler/recovery docs
- Modify: `docs/sessions/log.mdx`

**Interfaces:**
- Produces: due-task claim, lease, claim version, retry classification, capped next-attempt time, terminal failure retention and worker-owned handler registration.
- Consumes: existing `schedule` and `cancelTask` callers through a compatibility facade that no longer arms gateway timers.

- [ ] Add failing tests for competing claimers, stale settlement, handler absence, retryable/permanent failure, cancellation, shutdown drain and retained terminal failure.
- [ ] Extend `ScheduledTask` additively with claim and retry state. Delete gateway timers and route due work through tracked workers.
- [ ] Add a process-level service test that repeatedly terminates a worker during claimed work, starts a replacement and proves one durable effect with recoverable task state.
- [ ] Keep Discord-dependent final effects behind explicit gateway/API adapters rather than passing a Discord client into worker code.
- [ ] Run focused tests, migration proof and the GitHub process-kill service job.
- [ ] Commit `refactor: run scheduled work in durable workers`, push and verify the remote hash.

## Task 7: Make flags, provisioning and health truthful

**Files:**
- Modify: `apps/gateway/src/services/featureFlags.ts`
- Modify: `apps/gateway/src/services/featureFlags.test.ts`
- Modify: `apps/gateway/src/services/tenant.ts`
- Modify: `apps/gateway/src/services/tenant.test.ts`
- Modify: `apps/gateway/src/services/provisioning/runProvision.ts`
- Create or modify: provisioning tests
- Modify: `apps/api/src/server.ts`
- Modify: `apps/gateway/src/web/server.ts`
- Modify: `apps/workers/src/index.ts`
- Create: shared health/metrics contracts only if existing contracts cannot express the fields
- Modify: operations runbook and architecture docs
- Modify: `docs/sessions/log.mdx`

**Interfaces:**
- Produces: separate global and guild flag resolution, fail-closed persisted-off behavior, visible provisioner results, worker readiness and internal metrics for queue lag, retry count, scheduler state, cache hits/misses and event-loop delay.
- Consumes: database/cache health and the durable runtime state from Tasks 4 to 6.

- [ ] Add failing tests for database failure with a persisted off switch, bus failure, provisioner exception, channel-map persistence failure and degraded readiness.
- [ ] Keep public health detail-free. Expose diagnostics only through the authenticated internal boundary and structured logs.
- [ ] Make feature/provision updates return truthful partial or failed outcomes. Never log an error and return `ok: true`.
- [ ] Add the minimum metrics needed by Phase 01 evidence, without introducing a second metrics framework.
- [ ] Run focused tests, health smoke and failure injection.
- [ ] Commit `fix: expose platform failure states`, push and verify the remote hash.

## Task 8: Prove Phase 01 and create the rollback snapshot

**Files:**
- Complete: `docs/phase-reports/01-platform-core/index.mdx`
- Create: `docs/phase-reports/01-platform-core/architecture.mdx`
- Create: `docs/phase-reports/01-platform-core/migration.mdx`
- Create: `docs/phase-reports/01-platform-core/tests.mdx`
- Create: `docs/phase-reports/01-platform-core/measurements.mdx`
- Create: `docs/phase-reports/01-platform-core/security.mdx`
- Create: `docs/phase-reports/01-platform-core/recovery.mdx`
- Modify: `docs/overview.mdx`
- Modify: `docs/architecture/index.mdx`
- Modify: `docs/product/capability-status.mdx`
- Modify: `docs/product/roadmap.mdx`
- Modify: `docs/sessions/log.mdx`
- Modify: `.github/workflows/*.yml` only where exact evidence jobs require it

**Interfaces:**
- Produces: independently reviewable PASS/PENDING evidence tied to one exact remote commit.
- Consumes: every test, measurement, failure-injection result, migration and rollback result from Tasks 1 to 7.

- [ ] Re-run registry parity and document any intentional security-only difference.
- [ ] Prove cross-guild IDOR denial, owner-bypass denial, stale-auth denial, cross-process invalidation, outbox recovery, repeated worker-kill recovery, failed scheduled-job retention and visible provisioner failure.
- [ ] Compare before/after p95, query counts, event-loop delay, cold/warm cache behavior, provider request frequency and queue lag. State workload and limitations.
- [ ] Rehearse additive migration, failed-migration startup stop and prior-image rollback with no destructive down migration.
- [ ] Run the full local gate: `pnpm install --frozen-lockfile`, `pnpm check:boundaries`, `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`, `git diff --check`.
- [ ] Push the candidate commit. Inspect PR reviews, inline threads and Advanced Security alerts. Resolve or document every finding, rerun affected checks and push corrections.
- [ ] Require all exact-head CI, service/image, security and CodeQL workflows to complete successfully. Re-fetch reviews and security state after the final push.
- [ ] Verify `git rev-parse HEAD` equals the remote branch hash and record both hashes and workflow run IDs in the evidence index.
- [ ] Commit `docs: record phase one platform evidence`, push and verify the final remote hash. Do not merge without explicit user direction.

## Self-review

- **Spec coverage:** The eight tasks cover role/capability tables, tenant isolation, manifest validation, deterministic discovery, lifecycle ownership, versioned events, cache invalidation, transactional outbox, tracked workers, scheduler recovery, feature flags, health, negative security tests, measurements and rollback evidence.
- **Type consistency:** Public contracts live in `@rostra/auth`, `@rostra/module-sdk`, `@rostra/operations` or the existing narrow shared owner. Gateway-only Discord types stay in the gateway. No package-private imports are introduced.
- **Review focus:** Every high-risk statement above has a focused negative or failure-injection test before implementation and a final exact-remote-hash proof.
- **Proportion:** The plan reuses existing operation claims, cache bus, scheduled-task rows, health routes and registry fixtures. It adds no alternative job framework, policy language, ingress controller or speculative extension marketplace.
