# Rostra Phase 00 Monorepo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adopt Rostra's production monorepo without losing existing bot behavior, then prove the gateway, API, web, worker, database, Redis, realtime, and Activity boundaries through runnable tests and documented rollback evidence.

**Architecture:** Preserve the current Discord bot as the first working gateway application while extracting shared ownership into typed workspace packages. Add independently bootable API, web, worker, realtime, and Activity applications around shared contracts. PostgreSQL remains the durable source of truth, Redis handles cache and delivery coordination, and a temporary module compatibility adapter keeps the existing feature set working during the move.

**Tech Stack:** Node.js 22 or newer, strict TypeScript ESM, pnpm workspaces, Turborepo, discord.js, Fastify, Prisma with PostgreSQL, Redis, BullMQ, TanStack Start, React, Zod, Pino, Biome, Node test runner, Playwright, Docker Compose, GitHub Actions.

**Spec:** `archive/ROSTRA-CODEX-DOSSIER/07-PHASES/PHASE-00-MONOREPO.md`, with binding architecture from `archive/ROSTRA-CODEX-DOSSIER/03-ARCHITECTURE/MONOREPO-CONTRACT.md` and mission constraints from `archive/ROSTRA-CODEX-DOSSIER/00-START-HERE/`.

## Global Constraints

- Keep `archive/` ignored and excluded from formatting, build contexts, packages, tests, and generated artifacts. Never force-add it.
- Preserve every existing Prisma migration directory and checksum. Never regenerate the migration history.
- Preserve current command definitions, events, modules, and user-visible behavior through the workspace move unless a tested security fix is required.
- Never boot a real-token gateway or publish Discord commands as part of migration verification.
- Use current stable dependencies only. Verify official support and deployment requirements before selecting versions.
- PostgreSQL owns durable intent. Redis delivery is at least once and consumers must be idempotent.
- Host-operator access never grants implicit guild moderation or private member-data access.
- Keep the assistant implementation neutral in code, documentation, user-visible copy, package metadata, and commits.
- All user-facing strings use the shared localization contract. Discord components come from the shared Discord UI package.
- No ingress-provider control plane is implemented. Document passive reverse-proxy and tunnel compatibility only.
- Keep local verification lightweight. Run isolated static/unit checks locally and move service matrices, browser tests, image builds, and security scans to GitHub Actions where practical.
- Every task updates relevant documentation and `docs/sessions/log.mdx`. Phase completion writes an evidence report under `docs/phase-reports/phase-00/`.
- Every completed phase must be pushed to GitHub as a rollback snapshot, with local and remote commit hashes verified equal. Push the phase branch only after its full gate and review pass; a local commit alone does not complete phase delivery.
- Do not use em dashes in source, documentation, commits, issues, or pull request text.

## Review Focus

- A fresh clone on Linux must not see the lowercase ignored `archive/` in Biome, Turbo, pnpm, Docker, test, secret-scan, or SBOM inputs. Task 1 owns the regression checks.
- Workspace moves must not change the normalized Discord command registry or omit a current module. Task 4 owns before/after snapshot assertions.
- A failed database migration must prevent application startup instead of falling through after retries. Task 7 owns the failure test.
- Duplicate queue delivery and a worker kill between effect and acknowledgement must not produce duplicate durable effects. Tasks 5 and 7 own idempotency and restart smoke tests.
- A host operator without guild authorization must fail guild-domain actions even when object IDs are guessed or swapped. Task 5 owns the negative contract test scaffold that Phase 01 will extend.

---

### Task 1: Repository boundaries, decisions, and agent guidance

**Files:**
- Modify: `.gitignore`
- Create: `.dockerignore`
- Modify: `biome.json`
- Modify: `AGENTS.md`
- Create: `docs/architecture/decisions/011-revamp-contract.mdx`
- Create: `tooling/scripts/check-repository-boundaries.mjs`
- Create: `tooling/scripts/check-repository-boundaries.test.ts`
- Modify: `docs/sessions/log.mdx`

**Interfaces:**
- Consumes: The ignored `archive/` dossier and current repository invariants.
- Produces: `npm run check:boundaries` during the compatibility window, later exposed as `pnpm check:boundaries`; canonical workspace rules for every later task.

- [ ] **Step 1: Write repository-boundary tests**

  Assert the root ignore/config files exclude lowercase `archive/`, `.superpowers/`, dependencies, build output, coverage, secrets, and local environment files. Assert Docker input cannot include `archive/`, `.git/`, `.env*`, `node_modules/`, coverage, or phase scratch artifacts.

- [ ] **Step 2: Run the focused test and confirm it fails for the current lowercase archive and missing Docker ignore**

  Run: `node --import tsx --test tooling/scripts/check-repository-boundaries.test.ts`

- [ ] **Step 3: Implement the boundary checker and exclusions**

  `check-repository-boundaries.mjs` must reject tracked or tool-visible private archive content, missing required ignore entries, and repository source containing forbidden assistant implementation identifiers. It must be deterministic and require no network.

- [ ] **Step 4: Rewrite `AGENTS.md` for the revamp contract**

  Preserve strict ESM, localization, shared Discord UI, Components V2, stable dependency, documentation, and commit rules. Replace obsolete root paths with workspace ownership, put tenant isolation/security/recovery ahead of structure, prohibit owner-ID guild bypasses, preserve migrations, forbid real-token migration boots, and describe scoped command budgets plus context-menu/Activity boundaries.

- [ ] **Step 5: Record the binding architecture rulings**

  Canonical module ID is `automation`; the web label may be Automation Studio. Existing slash commands remain supported while context menus are allowed where the dossier calls for them. Optional realtime and Activity apps must build and test in Phase 0 but need not run in the default profile.

- [ ] **Step 6: Verify and commit**

  Run: focused boundary test, `git check-ignore -v archive`, Biome against tracked files, and `git diff --check`.

  Commit: `chore: define revamp repository boundaries`

### Task 2: Workspace control plane

**Files:**
- Modify: `package.json`
- Replace: `package-lock.json` with `pnpm-lock.yaml`
- Create: `pnpm-workspace.yaml`
- Create: `turbo.json`
- Create: `tsconfig.base.json`
- Create: `tooling/typescript/base.json`
- Create: `tooling/typescript/node.json`
- Create: `tooling/biome/package.json`
- Create: `tooling/scripts/verify-workspace.mjs`
- Create: `tooling/scripts/verify-workspace.test.ts`
- Modify: `.github/dependabot.yml`
- Modify: `docs/sessions/log.mdx`

**Interfaces:**
- Consumes: Task 1 repository boundaries.
- Produces: root commands `pnpm build`, `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm test:integration`, `pnpm check:boundaries`, and `pnpm clean`; shared task outputs and cache inputs.

- [ ] **Step 1: Verify the current stable pnpm and Turborepo releases from official documentation**

  Record the selected versions and support rationale in the Phase 0 report. Do not adopt prerelease software.

- [ ] **Step 2: Write workspace graph tests**

  Assert all required workspace roots are included: `apps/*`, `packages/*`, `modules/*`, `integrations/*`, `games/*`, and `tooling/*`. Assert root scripts use frozen-lockfile-safe commands and Turbo tasks declare dependencies and outputs.

- [ ] **Step 3: Add the workspace control files and root aliases**

  Keep a temporary `npm` compatibility note only in migration documentation, not as a second lockfile. Configure deterministic database-client generation before typecheck/build consumers.

- [ ] **Step 4: Install with the frozen pnpm lock and run the workspace verifier**

  Run: `corepack enable`, `pnpm install --frozen-lockfile`, focused verifier test.

- [x] **Step 5: Commit**

  Commit: `build: add the rostra workspace control plane`

### Task 3: Shared packages and preserved database history

**Files:**
- Create: `packages/config/`
- Create: `packages/contracts/`
- Create: `packages/database/`
- Create: `packages/cache/`
- Create: `packages/logger/`
- Create: `packages/i18n/`
- Create: `packages/discord-ui/`
- Create: `packages/testing/`
- Move: `prisma/` to `packages/database/prisma/`
- Move: applicable `src/services/`, `src/types/`, `src/utils/`, `src/i18n/`, and `src/ui/` sources into the owning packages
- Modify: `prisma.config.ts` or replace it with `packages/database/prisma.config.ts`
- Create: package-level tests and exports for each package
- Modify: `docs/sessions/log.mdx`

**Interfaces:**
- Consumes: Task 2 workspace configs.
- Produces: `@rostra/config`, `@rostra/contracts`, `@rostra/database`, `@rostra/cache`, `@rostra/logger`, `@rostra/i18n`, `@rostra/discord-ui`, `@rostra/testing` with explicit export maps.

- [ ] **Step 1: Write package export and migration-integrity tests**

  Assert every package can be imported through its public export map, no package reads raw environment variables outside config tooling, only database owns client construction, and every pre-move migration path/checksum is preserved.

- [ ] **Step 2: Move shared sources with history-aware Git operations**

  Keep compatibility re-exports only where needed by the gateway move. Do not create competing config/database/UI authorities.

- [ ] **Step 3: Replace root aliases with package imports**

  Preserve behavior and tests. Add package boundary rules that prevent modules from importing package internals.

- [ ] **Step 4: Generate the client, typecheck packages, and run all moved tests**

  Run: `pnpm prisma:generate`, `pnpm --filter './packages/**' typecheck`, focused tests, migration checksum verifier.

- [ ] **Step 5: Commit**

  Commit: `refactor: extract shared rostra packages`

### Task 4: Gateway and legacy module compatibility migration

**Files:**
- Create: `apps/gateway/`
- Create: `packages/module-sdk/`
- Move: gateway/cluster/client/pipeline/router code from `src/` to `apps/gateway/src/`
- Move: each current feature from `src/modules/<name>/` to `modules/<name>/`
- Create: `packages/module-sdk/src/legacy-adapter.ts`
- Create: `packages/module-sdk/src/manifest.ts`
- Create: `tooling/scripts/snapshot-commands.mjs`
- Create: `tooling/scripts/snapshot-modules.mjs`
- Create: registry snapshot fixtures and tests
- Modify: root Docker/runtime scripts that point to `src/cluster.ts`
- Modify: relevant module docs and `docs/sessions/log.mdx`

**Interfaces:**
- Consumes: public packages from Task 3.
- Produces: `@rostra/module-sdk` with validated manifests and lifecycle types; a gateway application whose normalized command/module snapshots match the pre-move baseline.

- [ ] **Step 1: Capture baseline command and module snapshots without REST writes**

  Snapshot normalized command JSON, module IDs, events, components, jobs, intents, and feature flags. Commit stable fixtures only after confirming no secrets or environment-specific data are present.

- [ ] **Step 2: Write failing compatibility tests**

  Tests must prove all current modules load through the adapter, lifecycle cancellation is wired, duplicate IDs fail, package-internal imports fail, and before/after command JSON is identical.

- [ ] **Step 3: Define the minimal manifest and lifecycle contracts**

  `ModuleManifest` includes ID, version, runtime placement, dependencies, capabilities, intents, permissions, settings ownership, commands, routes, events, jobs, external scopes, resource budgets, and health. `ModuleLifecycle` exposes `start(signal)`, `drain()`, and `stop()`.

- [ ] **Step 4: Move the gateway and modules without behavior rewrites**

  Retain the compatibility adapter until Phase 01 replaces discovery with the deterministic registry. Update all CI guards to inspect workspace source paths.

- [ ] **Step 5: Run parity verification**

  Run gateway typecheck/unit tests, all module tests, command snapshot diff, module inventory diff, no-cycle/package-boundary checks, and a fake-token boot test that cannot reach Discord REST.

- [x] **Step 6: Commit**

  Commit: `refactor: move the discord gateway into the workspace`

### Task 5: API and durable worker application seams

**Files:**
- Create: `apps/api/`
- Create: `apps/workers/`
- Create: `packages/auth/`
- Create: `packages/operations/`
- Move: Fastify health/metrics/vote responsibilities to the owning API or gateway packages
- Move: BullMQ worker registrations from gateway processes to `apps/workers/`
- Create: API/worker contract and integration tests
- Modify: relevant architecture/module docs and `docs/sessions/log.mdx`

**Interfaces:**
- Produces: `GET /health/live`, `GET /health/ready`, versioned internal smoke endpoints, `OperationRecord`, `OperationAttempt`, `DomainEventEnvelope`, idempotent queue payloads, tracked worker handles, and graceful drain.
- Consumes: database/cache/logger/contracts packages and the module registry.

- [ ] **Step 1: Write API authorization and worker durability contract tests**

  Include host-versus-guild denial, swapped tenant ID denial, duplicate delivery, unknown handler retention, retryable/permanent error classification, and worker drain tests.

- [ ] **Step 2: Implement independently bootable API and worker apps**

  API readiness checks its dependencies without mutating Discord. Worker startup registers tracked handles and shutdown waits for drain. PostgreSQL records durable intent before Redis delivery.

- [ ] **Step 3: Preserve current vote and metrics behavior through explicit routes/contracts**

  Keep external authentication and redaction behavior. Avoid exposing host-only health detail publicly.

- [ ] **Step 4: Run disposable-service integration tests**

  Use test containers or GitHub service containers. Keep local runs optional and bounded. Prove duplicate delivery and restart recovery.

- [ ] **Step 5: Commit**

  Commit: `feat: separate the api and durable worker runtimes`

### Task 6: Web, realtime, and Activity application boundaries

**Files:**
- Create: `apps/web/`
- Create: `apps/realtime/`
- Create: `apps/activity/`
- Create: `packages/web-ui/`
- Create: `packages/web-client/`
- Create: `games/core/`
- Create: app-level unit, accessibility, and browser smoke tests
- Modify: relevant web/architecture docs and `docs/sessions/log.mdx`

**Interfaces:**
- Produces: public/member/admin/operator route groups, login and callback route contracts, guild selector shell, typed domain client, realtime health endpoint, Activity authentication seam, and pure game-core session/result types.
- Consumes: API contracts and shared auth/config/logging packages.

- [x] **Step 1: Verify the current stable web stack and deployment compatibility from official sources**

  Record choices in the Phase 0 report. Keep charting, rich editing, realtime room engines, and advanced primitives out until their owning phase.

- [x] **Step 2: Write route, accessibility, and auth-boundary tests**

  Cover loading, empty, degraded, unauthorized, and callback-failure states. Verify keyboard navigation and narrow viewport rendering. Use fake OAuth and domain adapters in CI.

- [x] **Step 3: Implement a real login/guild-selection shell**

  The shell must execute the typed API contract and display persisted read-only guild/profile data under fake/disposable integration fixtures. It must not be a dashboard of inert controls.

- [x] **Step 4: Implement buildable realtime and Activity seams**

  Provide authenticated connection contracts, health checks, pure game-core fixtures, and disabled-by-default runtime profiles. Do not claim multiplayer or device verification in Phase 0.

- [x] **Step 5: Run builds and browser smoke tests**

  Run web unit/accessibility tests locally if lightweight. Run browser/device matrices in GitHub Actions.

  - [x] **Step 6: Commit**

  Commit: `feat: add the web realtime and activity boundaries`

### Task 7: Deployment, CI, and cross-service smoke proof

**Files:**
- Create: `infra/compose/compose.yml`
- Create: `infra/compose/compose.dev.yml`
- Create: `infra/compose/compose.vps.yml`
- Create: per-app Dockerfiles or a documented multi-target Dockerfile
- Replace: `docker-entrypoint.sh` with fail-closed migration/startup scripts under `infra/`
- Modify: `.github/workflows/ci.yml`
- Modify: `.github/workflows/codeql.yml`
- Modify: `.github/workflows/docker.yml`
- Create: `.github/workflows/integration.yml`
- Create: `.github/workflows/security.yml`
- Create: `tooling/smoke/`
- Create: `docs/runbooks/deployment.mdx`
- Create: `docs/runbooks/recovery.mdx`
- Modify: `docs/sessions/log.mdx`

**Interfaces:**
- Consumes: all Phase 0 apps and packages.
- Produces: isolated dev and VPS profiles, direct migration connection, immutable app images, `gateway -> API -> web -> worker -> PostgreSQL -> Redis` smoke proof, stable GitHub job names, artifacted logs/traces/reports.

- [x] **Step 1: Write migration-failure and cross-service smoke tests**

  A failed migration exits nonzero and no app starts. The success flow writes one durable smoke operation, delivers it at least once, applies exactly one effect, reads it through the API/web seam, and records correlation IDs across services.

- [x] **Step 2: Implement Compose profiles with bounded defaults**

  Redis queue persistence uses `noeviction` and append-only persistence. Database migrations use a direct connection. Lavalink and resource-intensive optional services stay outside the default profile.

- [x] **Step 3: Expand GitHub Actions**

  Required jobs cover frozen install, generate, typecheck, lint, unit, real PostgreSQL/Redis integration, migration dry-run, every app build, Compose smoke, browser login, command/module diff, package boundary/cycle check, secret scan, dependency review, SBOM, container build, and CodeQL. Use path filters and caches without skipping contract-impacting changes.

- [ ] **Step 4: Prove rollback**

  Document and test how to run the pre-revamp image against the unchanged migration history after stopping new processes. No destructive down migration is required.

- [ ] **Step 5: Commit**

  Commit: `ci: prove the phase zero service boundaries`

### Task 8: Product documentation and Phase 0 completion evidence

**Files:**
- Rewrite: `README.md`
- Rewrite: `docs/overview.mdx`
- Rewrite: `docs/architecture/index.mdx`
- Rewrite or update: deployment/setup/contributing documentation affected by the workspace
- Create: `docs/product/capability-status.mdx`
- Create: `docs/product/roadmap.mdx`
- Create: `docs/phase-reports/phase-00/index.mdx`
- Create: `docs/phase-reports/phase-00/baseline.mdx`
- Create: `docs/phase-reports/phase-00/security-review.mdx`
- Create: `docs/phase-reports/phase-00/performance.mdx`
- Create: `docs/phase-reports/phase-00/rollback.mdx`
- Modify: `CHANGELOG.md`
- Modify: `docs/sessions/log.mdx`

**Interfaces:**
- Consumes: verified results from Tasks 1 through 7.
- Produces: truthful public product documentation and the evidence package used to decide Phase 0 PASS, FAIL, or BLOCKED.

- [ ] **Step 1: Rewrite the README in the maintainer's product voice**

  Present Rostra as a personal open-source product: what it is, why it exists, what currently works, architecture, screenshots/assets that really exist, quick start, operations, docs map, security, contributing, roadmap, and honest capability labels. Do not address an agent or narrate a handoff. Do not claim later-phase features are shipped.

- [ ] **Step 2: Reconcile every stale architectural claim with current source**

  Update paths, commands, runtime boundaries, deployment behavior, module inventory, and limitations. Keep the ignored dossier out of links intended for GitHub readers.

- [ ] **Step 3: Publish the Phase 0 evidence report**

  Include scope, baseline, move map, architecture, unchanged migration proof, command/module parity, test commands/results, service smoke traces, security review, measured startup/build/test resource data, failure drill, rollback, screenshots where relevant, known limitations, and an explicit PASS/FAIL/BLOCKED decision.

- [ ] **Step 4: Run the complete Phase 0 gate**

  Run the root frozen-install, generate, typecheck, lint, unit, integration, build, migration dry-run, boundary/cycle, command/module parity, Compose smoke, and browser smoke commands. Trigger GitHub CI for Linux/service/security/image evidence. Confirm `archive/` is absent from Git and every artifact.

- [ ] **Step 5: Commit**

  Commit: `docs: publish the phase zero product and evidence guide`

## Phase 0 Completion Audit

Phase 0 is complete only when all eight tasks have reviewed commits and the evidence report proves:

- The existing bot runs from its new gateway path with unchanged command/module snapshots.
- PostgreSQL schema and migration history are unchanged and rollback is documented.
- API health, web login shell, worker queue smoke, realtime seam, and Activity seam build and test independently.
- The cross-service smoke flow reaches gateway, API, web, worker, PostgreSQL, and Redis with correlated evidence.
- GitHub Actions proves the Linux, service-container, browser, security, SBOM, and image-build gates.
- The public README reads as a maintainer sharing a real product and clearly separates implemented, tested, verified, planned, platform-limited, and blocked capabilities.
- The archive remains ignored and excluded everywhere without being force-added.
- The reviewed Phase 0 branch is pushed to GitHub as a rollback snapshot after the full gate passes, and its local and remote commit hashes are verified equal and recorded in the evidence report.

After Phase 0 passes, write and execute the Phase 01 plan. The overall revamp remains incomplete until Phases 01 through 12 and all 30 module specifications have their required evidence.
