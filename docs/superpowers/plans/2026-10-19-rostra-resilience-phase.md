# Rostra-Wide Resilience Phase Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every Rostra interaction, internal client, external adapter and durable job an explicit rate, concurrency and retry policy without duplicating Fastify's inbound HTTP protection or an upstream SDK's protocol-specific limiter.

**Architecture:** `@rostra/resilience` owns policy, retry classification and admission contracts. Redis owns distributed short-lived budgets and concurrency leases; PostgreSQL remains the source of durable intent and future retry time. Every network or expensive-work caller is classified as Rostra-managed, upstream-managed with Rostra admission, deliberately single-shot, or exempt local work, and CI rejects new unclassified callers.

**Tech Stack:** strict TypeScript ESM, Node.js timers and `fetch`, existing Redis/ioredis, PostgreSQL/Prisma, BullMQ, Pino, Node test runner and GitHub Actions.

**Spec:** `docs/product/roadmap.mdx#phase-r-rostra-wide-rate-limits-retries-and-backpressure`

## Global Constraints

- This phase starts after Phase 01 supplies explicit module manifests and before feature expansion adds more outbound load.
- Fastify route throttling remains the inbound HTTP boundary and is not reimplemented here.
- Discord's REST manager remains authoritative for Discord bucket headers; Rostra controls admission, tenant fairness, queue depth and durable scheduling around it.
- PostgreSQL owns durable retry intent. Redis loss may reduce throughput but must not lose or falsely complete work.
- Never automatically retry validation, authentication, authorization, not-found or other permanent failures.
- Never blindly retry an ambiguous mutation. A mutation needs an idempotency key or an outcome reconciliation step first.
- Honor valid `Retry-After` and reset hints. Otherwise use capped exponential full jitter within a finite attempt and elapsed-time budget.
- Only `@rostra/config` reads environment values. Only `@rostra/database` constructs Prisma clients.
- Do not add a dependency when Node.js or an installed package supplies the required primitive.
- User-facing busy or delayed states use `t()`; logs are structured, correlated and credential-free.
- The phase completes only after review, all owned gates, GitHub review and security-thread triage, a pushed snapshot and matching local/remote hashes.

## Baseline policy classes

| Class | Timeout | Attempts | Total retry budget | Backoff cap | Mutation rule |
| --- | ---: | ---: | ---: | ---: | --- |
| `interactive-read` | 5 seconds | 2 | 2 seconds | 1 second | Read only |
| `internal-read` | 3 seconds | 2 | 1 second | 500 ms | Read only |
| `background-read` | 10 seconds | 5 | 5 minutes | 30 seconds | Read only |
| `background-write` | 15 seconds | 5 | 15 minutes | 60 seconds | Idempotency or reconciliation required |
| `single-shot` | Owner-defined | 1 | 0 | 0 | Explicitly no automatic retry |

Provider reset hints may schedule durable background work later than the table's active retry budget, up to 24 hours. Interactive work never sleeps beyond its budget; it returns a useful delayed/busy state or records durable intent.

## Review Focus

- A `429` with seconds, HTTP-date, malformed or past `Retry-After` must produce a bounded deterministic decision.
- One noisy guild must not starve another guild or consume an adapter's entire concurrency allowance.
- Redis restart during a background mutation must preserve PostgreSQL intent and avoid a duplicate effect.
- A timeout after an upstream may have accepted a write must reconcile outcome instead of resending blindly.
- Shutdown during backoff or a held lease must release volatile capacity and leave durable work recoverable.

---

### Task 1: Policy contract and complete caller inventory

**Files:**
- Create: `packages/resilience/package.json`
- Create: `packages/resilience/tsconfig.json`
- Create: `packages/resilience/src/policy.ts`
- Create: `packages/resilience/src/policy.test.ts`
- Create: `packages/resilience/src/index.ts`
- Create: `docs/architecture/resilience.mdx`
- Create: `docs/architecture/resilience-inventory.mdx`
- Modify: `packages/module-sdk/src/manifest.ts`
- Modify: `packages/module-sdk/src/legacy-adapter.test.ts`
- Modify: `turbo.json`

**Interfaces:**
- Produces: `ResiliencePolicy`, `WorkClass`, `ScopeKey`, `RetryDecision`, `classifyHttpFailure(response, now)` and `retryDelay(policy, attempt, hintMs, random)`.
- Produces: `ModuleManifest.resiliencePolicies: readonly string[]` so a module declares every policy it consumes.

- [ ] **Step 1: Write failing policy tests** for the five baseline classes, full-jitter bounds, valid and malformed `Retry-After`, permanent `4xx`, retryable `408`, `425`, `429`, `5xx` and network failures.
- [ ] **Step 2: Run `pnpm --filter @rostra/resilience test`** and verify failure because the package and policy functions do not exist.
- [ ] **Step 3: Implement the policy types and pure decisions** with no network, Redis or timer code.
- [ ] **Step 4: Inventory every current caller** found through raw `fetch`, Discord REST/SDK methods, external SDKs, internal HTTP clients, cron jobs, bulk loops and queue publishers. Record owner, work class, tenant scope, idempotency, upstream-native limiter and migration task. Explicitly classify browser navigation, health probes, local database/cache reads and pure computation as not requiring Rostra retry control.
- [ ] **Step 5: Add manifest declarations and focused validation tests**, then run package tests, typecheck and lint.
- [ ] **Step 6: Commit** with `feat: define resilience policies and inventory`.

### Task 2: Distributed admission and tenant fairness

**Files:**
- Create: `packages/cache/src/admission.ts`
- Create: `packages/cache/src/admission.test.ts`
- Modify: `packages/cache/package.json`
- Modify: `packages/resilience/package.json`
- Create: `packages/resilience/src/admission.ts`
- Create: `packages/resilience/src/admission.test.ts`
- Modify: `packages/resilience/src/index.ts`

**Interfaces:**
- Consumes: `ResiliencePolicy` and `ScopeKey` from Task 1.
- Produces: `AdmissionStore.consume(policyId, scope, cost, now)`, `AdmissionStore.acquire(policyId, scope, leaseMs)` and `AdmissionLease.release()`.
- Produces: `admit(policy, { adapter, guildId, subjectId, cost, signal })`.

- [ ] **Step 1: Write failing tests** for atomic burst/refill, per-adapter and per-guild caps, lease expiry, explicit release, stricter in-process fallback for low-cost reads, fail-closed mutations and non-starvation across two guilds.
- [ ] **Step 2: Run the focused cache and resilience tests** and verify the missing interfaces fail.
- [ ] **Step 3: Implement atomic Redis operations through `@rostra/cache`** and the smallest in-process fallback. Do not expose raw Redis from the resilience package.
- [ ] **Step 4: Add correlated Pino events** for denial, wait, fallback and lease recovery without logging tokens, bodies or full URLs.
- [ ] **Step 5: Run focused tests, package boundaries, typecheck and lint.**
- [ ] **Step 6: Commit** with `feat: add distributed workload admission`.

### Task 3: Retry execution and durable scheduling

**Files:**
- Create: `packages/resilience/src/execute.ts`
- Create: `packages/resilience/src/execute.test.ts`
- Modify: `packages/resilience/src/index.ts`
- Modify: `packages/database/prisma/schema.prisma`
- Create: `packages/database/prisma/migrations/20261019000000_operation_retry_schedule/migration.sql`
- Modify: `packages/operations/src/index.ts`
- Modify: `packages/operations/src/index.test.ts`
- Modify: `apps/workers/src/runtime.ts`
- Modify: `apps/workers/src/runtime.test.ts`
- Modify: `apps/workers/src/runtime.service.ts`

**Interfaces:**
- Consumes: policy decisions and admission from Tasks 1 and 2.
- Produces: `executeWithPolicy(policyId, scope, call, options)` with abort-aware timeout and injected clock/random for tests.
- Produces: `OperationRecord.nextAttemptAt`, fenced retry settlement and reconciler selection that excludes future work.

- [ ] **Step 1: Write failing retry tests** for success, retryable failure, server hint, elapsed-budget exhaustion, abort, permanent failure and ambiguous mutation rejection.
- [ ] **Step 2: Write failing operation tests** for `nextAttemptAt`, retry-after persistence, no early publish, claim fencing, duplicate delivery and Redis restart recovery.
- [ ] **Step 3: Run both focused suites** and verify the new behavior is absent.
- [ ] **Step 4: Implement abort-aware execution** using Node timers and the Task 1 full-jitter decision.
- [ ] **Step 5: Add the forward-only retry-schedule migration and fenced repository changes.** BullMQ becomes delivery, not retry truth.
- [ ] **Step 6: Run focused unit and Linux PostgreSQL/Redis service tests.**
- [ ] **Step 7: Commit** with `feat: persist bounded operation retries`.

### Task 4: Adopt policies across Rostra

**Files:**
- Create: `integrations/http/package.json`
- Create: `integrations/http/tsconfig.json`
- Create: `integrations/http/src/index.ts`
- Create: `integrations/http/src/index.test.ts`
- Modify: `apps/gateway/src/pipeline/cooldown.ts`
- Modify: `apps/gateway/src/services/apiFanout.ts`
- Modify: `apps/gateway/src/services/commandSync.ts`
- Modify: `apps/gateway/src/services/topgg.ts`
- Modify: `apps/web/src/server/oauth-adapters.server.ts`
- Modify: `packages/web-client/src/index.ts`
- Modify: `modules/ai/service.ts`
- Modify: `modules/feeds/service.ts`
- Modify: `modules/trivia/service.ts`
- Modify: `modules/bulkrole/service.ts`
- Modify: `modules/leveling/card.ts`
- Modify: `modules/profile/card.ts`
- Modify: `modules/roleplay/shipCard.ts`
- Modify: `modules/welcome/card.ts`
- Modify: `modules/music/service.ts`
- Modify: `modules/serverstats/service.ts`
- Modify: `modules/tickets/monitor.ts`

**Interfaces:**
- Consumes: `executeWithPolicy` and `admit` from Tasks 2 and 3.
- Produces: one authorized HTTP adapter entrypoint and policy-wrapped SDK calls. Credentials remain inside their owning integration or service boundary.

- [ ] **Step 1: Add one failing test per caller class**, not per URL: interactive read, internal read, feed poll, asset fetch, Discord high-volume write, external SDK call, bulk mutation and reconnecting client.
- [ ] **Step 2: Verify each test fails for an unclassified or unbounded call.**
- [ ] **Step 3: Migrate raw server-side HTTP calls** to the authorized adapter and preserve each caller's current validation, redaction and fallback behavior.
- [ ] **Step 4: Wrap Discord and external SDK work** with Rostra admission while retaining the SDK's native protocol limiter. Bulk work must checkpoint and yield between tenants.
- [ ] **Step 5: Keep deliberate single-shot work single-shot**, including ambiguous mutations without reconciliation. Record that decision in the inventory instead of adding unsafe retries.
- [ ] **Step 6: Run module, gateway, web-client and integration tests, then update the inventory to zero unclassified callers.**
- [ ] **Step 7: Commit** with `feat: apply resilience policies across runtimes`.

### Task 5: Enforcement, operations and phase evidence

**Files:**
- Create: `tooling/scripts/resilience-boundaries.test.ts`
- Create: `tooling/scripts/check-resilience-boundaries.mjs`
- Modify: `tooling/scripts/check-repository-boundaries.mjs`
- Modify: `.github/workflows/ci.yml`
- Modify: `.github/workflows/service-integration.yml`
- Modify: `docs/runbooks/deployment.mdx`
- Modify: `docs/runbooks/recovery.mdx`
- Modify: `docs/product/capability-status.mdx`
- Modify: `docs/architecture/resilience.mdx`
- Modify: `docs/architecture/resilience-inventory.mdx`
- Create: `docs/phase-reports/phase-r/index.mdx`
- Modify: `docs/sessions/log.mdx`

**Interfaces:**
- Consumes: the complete inventory and implemented policy entrypoints.
- Produces: a CI guard that rejects new raw server-side network callers or undeclared policy IDs, plus measured phase evidence.

- [ ] **Step 1: Write failing boundary tests** with fixtures for raw `fetch`, new Discord REST, undeclared manifest policy and an allowed browser-only call.
- [ ] **Step 2: Implement the boundary checker** and add it to the existing root boundary command.
- [ ] **Step 3: Add disposable CI upstreams** that emit `429`, reset hints, timeouts, connection resets and ambiguous write responses. Prove tenant fairness, bounded attempts, durable restart recovery and graceful shutdown without contacting live providers.
- [ ] **Step 4: Measure queue depth, wait time, retry count, terminal classification and duplicate effects** under the documented fixture workload. Do not claim production capacity from CI data.
- [ ] **Step 5: Update runbooks, capability labels and the Phase R report** with exact limits, fallback behavior, alerts and recovery steps.
- [ ] **Step 6: Run the complete gate**, then inspect every PR review, unresolved thread and GitHub security finding. Fix or document each item, rerun owned checks, push and re-fetch the review state.
- [ ] **Step 7: Verify `git rev-parse HEAD` equals the remote branch SHA** and record the rollback snapshot before marking Phase R complete.
- [ ] **Step 8: Commit** with `docs: record the resilience phase evidence`.
