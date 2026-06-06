# Core Platform - Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the tested foundation layer of the Rostra bot - project scaffold plus the four cached singletons (config, logger, database, cache), the Components-V2 UI kit, the i18n helper, and the sharding IPC abstraction - so feature modules and the runtime layer have a solid, isolated base.

**Architecture:** Single modular ESM TypeScript package. Each concern is a small focused file under `src/` exporting a cached accessor (`config`, `getLogger`, `getPrisma`, `getCache`). UI is Components V2 only (no embeds). All env access funnels through one Zod-validated loader. The sharding IPC layer is an interface with a native implementation now and a hybrid implementation swappable by config later.

**Tech Stack:** Node 20+ (ESM), TypeScript 5 strict, discord.js v14, Prisma + PostgreSQL, ioredis + Keyv, Pino, Zod, Biome, tsup, tsx, node:test (via tsx import).

**Conventions (enforced as CIT invariants - see `CLAUDE.md`):** no `any`; ESM only; no `process.env` outside `config.ts`; no `new PrismaClient()` outside `database.ts`; Components V2 only; undercover mode (zero AI-provider references anywhere).

---

## File Structure

| File | Responsibility |
|---|---|
| `package.json` | scripts + deps, undercover-clean metadata |
| `tsconfig.json` | strict ESM, path alias `@/*` → `src/*` |
| `tsup.config.ts` | ESM bundle of `src/cluster.ts` + `src/bot.ts` |
| `biome.json` | lint/format, tabs |
| `.env.example` | every env var, neutral names |
| `prisma/schema.prisma` | core models (Guild, GuildModuleConfig, User, GuildMember, Blacklist, UserVote, OwnerAudit) |
| `src/config.ts` | Zod env schema, parsed once, cached, frozen |
| `src/services/logger.ts` | Pino root + `getLogger(scope)` |
| `src/services/database.ts` | `getPrisma()` cached singleton + `disconnectPrisma()` |
| `src/services/cache.ts` | `getCache()` (Redis/Keyv or memory) + raw redis accessor + `disconnectCache()` |
| `src/utils/components.ts` | Components-V2 builders + `reply.*` helpers |
| `src/i18n/index.ts` | `t(key, vars, locale)`; loads `locales/en/*.json` |
| `src/i18n/locales/en/common.json` | core strings |
| `src/cluster/ipc.ts` | `Ipc` interface + `createIpc()` (native now, hybrid later) |
| `src/types/global.d.ts` | shared types + discord.js Client augmentation |

Tests live beside source as `*.test.ts`.

---

## Task 0: Project scaffold

**Files:**
- Create: `package.json`, `tsconfig.json`, `tsup.config.ts`, `biome.json`, `.env.example`, `src/types/global.d.ts`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "rostra",
  "version": "0.1.0",
  "description": "All-in-one Discord bot",
  "type": "module",
  "private": true,
  "engines": { "node": ">=20" },
  "scripts": {
    "dev": "tsx watch src/cluster.ts",
    "build": "tsup",
    "start": "node dist/cluster.js",
    "typecheck": "tsc --noEmit",
    "lint": "biome check .",
    "lint:fix": "biome check --write .",
    "test": "node --import tsx --test \"src/**/*.test.ts\"",
    "deploy:commands": "tsx src/scripts/deploy-commands.ts",
    "prisma:generate": "prisma generate",
    "prisma:migrate": "prisma migrate dev"
  },
  "dependencies": {
    "@prisma/client": "^6.1.0",
    "@top-gg/sdk": "^3.1.6",
    "bad-words": "^4.0.0",
    "discord.js": "^14.16.3",
    "fastify": "^5.1.0",
    "ioredis": "^5.4.1",
    "keyv": "^5.2.1",
    "@keyv/redis": "^4.2.0",
    "pino": "^9.5.0",
    "pino-pretty": "^13.0.0",
    "zod": "^3.24.1"
  },
  "devDependencies": {
    "@biomejs/biome": "^1.9.4",
    "@types/bad-words": "^3.0.3",
    "@types/node": "^22.10.2",
    "prisma": "^6.1.0",
    "tsup": "^8.3.5",
    "tsx": "^4.19.2",
    "typescript": "^5.7.2"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2023"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "exactOptionalPropertyTypes": false,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "verbatimModuleSyntax": false,
    "outDir": "dist",
    "rootDir": ".",
    "baseUrl": ".",
    "paths": { "@/*": ["src/*"] },
    "types": ["node"]
  },
  "include": ["src/**/*.ts", "prisma/**/*.ts"],
  "exclude": ["node_modules", "dist", "Archive"]
}
```

- [ ] **Step 3: Create `tsup.config.ts`**

```ts
import { defineConfig } from "tsup";

export default defineConfig({
	entry: ["src/cluster.ts", "src/bot.ts"],
	format: ["esm"],
	target: "node20",
	platform: "node",
	splitting: false,
	clean: true,
	sourcemap: true,
	dts: false,
});
```

- [ ] **Step 4: Create `biome.json`**

```json
{
	"$schema": "https://biomejs.dev/schemas/1.9.4/schema.json",
	"organizeImports": { "enabled": true },
	"formatter": { "enabled": true, "indentStyle": "tab", "lineWidth": 100 },
	"linter": {
		"enabled": true,
		"rules": {
			"recommended": true,
			"suspicious": { "noExplicitAny": "error" },
			"style": { "useNodejsImportProtocol": "error" }
		}
	},
	"files": { "ignore": ["dist", "node_modules", "Archive", "prisma/migrations"] }
}
```

- [ ] **Step 5: Create `.env.example`** (neutral names; no provider references)

```dotenv
# Discord
DISCORD_TOKEN=
DISCORD_CLIENT_ID=
OWNER_IDS=
DEV_GUILD_ID=

# Runtime
NODE_ENV=development
LOG_LEVEL=info

# Database (Postgres)
DATABASE_URL=postgresql://user:pass@localhost:5432/rostra?connection_limit=5&pool_timeout=15

# Cache / queues (optional - in-memory fallback if unset)
REDIS_URL=

# Web (health + webhooks)
PORT=3000
HOST=0.0.0.0

# Sharding
SHARD_COUNT=
SHARDING_MODE=native

# AI (neutral names - provider is an implementation detail)
AI_API_KEY=
AI_BASE_URL=
AI_MODEL=

# Music (Lavalink - JSON array of nodes with failover)
LAVALINK_NODES=[]
LAVALINK_RECONNECT_TRIES=5
LAVALINK_RESUME=true
LAVALINK_REST_TIMEOUT=10000

# top.gg (optional)
TOPGG_TOKEN=
TOPGG_WEBHOOK_AUTH=
TOPGG_BOT_ID=
```

- [ ] **Step 6: Create `src/types/global.d.ts`**

```ts
import type { Collection } from "discord.js";

declare module "discord.js" {
	interface Client {
		commands: Collection<string, unknown>;
	}
}

export {};
```

- [ ] **Step 7: Install and verify**

Run: `npm install && npm run typecheck`
Expected: install succeeds; `tsc --noEmit` exits 0 (no source files yet beyond the `.d.ts`).

- [ ] **Step 8: Commit**

```bash
git add package.json tsconfig.json tsup.config.ts biome.json .env.example src/types/global.d.ts package-lock.json
git commit -m "chore: scaffold project tooling and config"
```

---

## Task 1: `config.ts` - Zod env loader

**Files:**
- Create: `src/config.ts`
- Test: `src/config.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { test } from "node:test";
import assert from "node:assert/strict";

test("loadConfig parses required vars and applies defaults", async () => {
	const { loadConfig } = await import("./config.ts");
	const cfg = loadConfig({
		DISCORD_TOKEN: "t",
		DISCORD_CLIENT_ID: "123",
		DATABASE_URL: "postgresql://localhost/db",
		OWNER_IDS: "1,2,3",
		LAVALINK_NODES: "[]",
	});
	assert.equal(cfg.discord.token, "t");
	assert.deepEqual(cfg.discord.ownerIds, ["1", "2", "3"]);
	assert.equal(cfg.web.port, 3000);
	assert.equal(cfg.sharding.mode, "native");
	assert.equal(cfg.redis.url, undefined);
	assert.deepEqual(cfg.lavalink.nodes, []);
});

test("loadConfig throws aggregated error on missing required vars", async () => {
	const { loadConfig } = await import("./config.ts");
	assert.throws(() => loadConfig({}), /DISCORD_TOKEN/);
});

test("loadConfig parses LAVALINK_NODES json array", async () => {
	const { loadConfig } = await import("./config.ts");
	const cfg = loadConfig({
		DISCORD_TOKEN: "t",
		DISCORD_CLIENT_ID: "123",
		DATABASE_URL: "postgresql://localhost/db",
		LAVALINK_NODES: '[{"id":"main","host":"h","port":2333,"password":"p","secure":false}]',
	});
	assert.equal(cfg.lavalink.nodes.length, 1);
	assert.equal(cfg.lavalink.nodes[0]?.host, "h");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test src/config.test.ts`
Expected: FAIL - cannot find module `./config.ts`.

- [ ] **Step 3: Write `src/config.ts`**

```ts
import { z } from "zod";

const csv = (v: string | undefined): string[] =>
	v ? v.split(",").map((s) => s.trim()).filter(Boolean) : [];

const lavalinkNode = z.object({
	id: z.string(),
	host: z.string(),
	port: z.number().int(),
	password: z.string(),
	secure: z.boolean().default(false),
});

const schema = z.object({
	DISCORD_TOKEN: z.string().min(1),
	DISCORD_CLIENT_ID: z.string().min(1),
	OWNER_IDS: z.string().optional(),
	DEV_GUILD_ID: z.string().optional(),
	NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
	LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
	DATABASE_URL: z.string().min(1),
	REDIS_URL: z.string().optional(),
	PORT: z.coerce.number().int().default(3000),
	HOST: z.string().default("0.0.0.0"),
	SHARD_COUNT: z.coerce.number().int().positive().optional(),
	SHARDING_MODE: z.enum(["native", "hybrid"]).default("native"),
	AI_API_KEY: z.string().optional(),
	AI_BASE_URL: z.string().optional(),
	AI_MODEL: z.string().optional(),
	LAVALINK_NODES: z.string().default("[]"),
	LAVALINK_RECONNECT_TRIES: z.coerce.number().int().default(5),
	LAVALINK_RESUME: z.coerce.boolean().default(true),
	LAVALINK_REST_TIMEOUT: z.coerce.number().int().default(10000),
	TOPGG_TOKEN: z.string().optional(),
	TOPGG_WEBHOOK_AUTH: z.string().optional(),
	TOPGG_BOT_ID: z.string().optional(),
});

export type Config = {
	env: "development" | "production" | "test";
	discord: { token: string; clientId: string; ownerIds: string[]; devGuildId?: string };
	logLevel: string;
	database: { url: string };
	redis: { url?: string };
	web: { port: number; host: string };
	sharding: { count?: number; mode: "native" | "hybrid" };
	ai: { apiKey?: string; baseUrl?: string; model?: string };
	lavalink: {
		nodes: z.infer<typeof lavalinkNode>[];
		reconnectTries: number;
		resume: boolean;
		restTimeout: number;
	};
	topgg: { token?: string; webhookAuth?: string; botId?: string };
};

export function loadConfig(source: Record<string, string | undefined> = process.env): Config {
	const parsed = schema.safeParse(source);
	if (!parsed.success) {
		const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
		throw new Error(`Invalid environment configuration: ${issues}`);
	}
	const e = parsed.data;
	const nodes = z.array(lavalinkNode).parse(JSON.parse(e.LAVALINK_NODES));
	return Object.freeze({
		env: e.NODE_ENV,
		discord: {
			token: e.DISCORD_TOKEN,
			clientId: e.DISCORD_CLIENT_ID,
			ownerIds: csv(e.OWNER_IDS),
			devGuildId: e.DEV_GUILD_ID,
		},
		logLevel: e.LOG_LEVEL,
		database: { url: e.DATABASE_URL },
		redis: { url: e.REDIS_URL },
		web: { port: e.PORT, host: e.HOST },
		sharding: { count: e.SHARD_COUNT, mode: e.SHARDING_MODE },
		ai: { apiKey: e.AI_API_KEY, baseUrl: e.AI_BASE_URL, model: e.AI_MODEL },
		lavalink: {
			nodes,
			reconnectTries: e.LAVALINK_RECONNECT_TRIES,
			resume: e.LAVALINK_RESUME,
			restTimeout: e.LAVALINK_REST_TIMEOUT,
		},
		topgg: { token: e.TOPGG_TOKEN, webhookAuth: e.TOPGG_WEBHOOK_AUTH, botId: e.TOPGG_BOT_ID },
	});
}

let cached: Config | undefined;
/** Cached, validated, frozen config. The ONLY place env is read. */
export const config: Config = (cached ??= loadConfig());
```

> Note: importing `config` triggers validation. In tests we call `loadConfig(fakeEnv)` directly to avoid needing real env.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import tsx --test src/config.test.ts`
Expected: PASS (3 tests). The eager `config` export will throw if real env is missing - guard tests import only `loadConfig`, which they do.

- [ ] **Step 5: Commit**

```bash
git add src/config.ts src/config.test.ts
git commit -m "feat: add zod-validated cached env config loader"
```

---

## Task 2: `services/logger.ts` - Pino singleton

**Files:**
- Create: `src/services/logger.ts`
- Test: `src/services/logger.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { test } from "node:test";
import assert from "node:assert/strict";

test("getLogger returns a child logger bound to scope", async () => {
	const { getLogger } = await import("./logger.ts");
	const log = getLogger("test-scope");
	assert.equal(typeof log.info, "function");
	assert.equal(typeof log.error, "function");
	// child loggers from the same root are reused per scope
	const log2 = getLogger("test-scope");
	assert.equal(log, log2);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test src/services/logger.test.ts`
Expected: FAIL - module not found.

- [ ] **Step 3: Write `src/services/logger.ts`**

```ts
import { pino, type Logger } from "pino";
import { config } from "@/config.ts";

const redactPaths = ["token", "*.token", "password", "*.password", "auth", "*.auth", "DISCORD_TOKEN"];

const root: Logger =
	config.env === "production"
		? pino({ level: config.logLevel, redact: redactPaths })
		: pino({
				level: config.logLevel,
				redact: redactPaths,
				transport: { target: "pino-pretty", options: { colorize: true, translateTime: "SYS:HH:MM:ss" } },
			});

const children = new Map<string, Logger>();

/** Scoped child logger (cached per scope). Never log provider names (undercover). */
export function getLogger(scope: string): Logger {
	let child = children.get(scope);
	if (!child) {
		child = root.child({ scope });
		children.set(scope, child);
	}
	return child;
}

export { root as logger };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import tsx --test src/services/logger.test.ts`
Expected: PASS. (Requires real env for the eager `config` import - set `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`, `DATABASE_URL` in a local `.env` or export them, or run via `node --import tsx --env-file=.env --test`.)

> Add `--env-file=.env` to the `test` script if env-coupled tests are run locally. Pure tests (config) don't need it.

- [ ] **Step 5: Commit**

```bash
git add src/services/logger.ts src/services/logger.test.ts
git commit -m "feat: add pino logger singleton with scoped children"
```

---

## Task 3: Prisma schema + `services/database.ts`

**Files:**
- Create: `prisma/schema.prisma`, `src/services/database.ts`
- Test: `src/services/database.test.ts`

- [ ] **Step 1: Write `prisma/schema.prisma` (core models)**

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model Guild {
  id        String   @id
  prefix    String?
  locale    String   @default("en")
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  modules   GuildModuleConfig[]
  members   GuildMember[]
}

model GuildModuleConfig {
  id       String  @id @default(cuid())
  guildId  String
  module   String
  enabled  Boolean @default(true)
  settings Json    @default("{}")
  guild    Guild   @relation(fields: [guildId], references: [id], onDelete: Cascade)

  @@unique([guildId, module])
  @@index([guildId])
}

model User {
  id        String     @id
  createdAt DateTime   @default(now())
  members   GuildMember[]
  votes     UserVote[]
}

model GuildMember {
  id      String @id @default(cuid())
  guildId String
  userId  String
  guild   Guild  @relation(fields: [guildId], references: [id], onDelete: Cascade)
  user    User   @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([guildId, userId])
  @@index([guildId])
  @@index([userId])
}

model Blacklist {
  id        String   @id @default(cuid())
  targetId  String   @unique
  scope     String   // "user" | "guild"
  reason    String?
  createdAt DateTime @default(now())
}

model UserVote {
  id        String   @id @default(cuid())
  userId    String
  votedAt   DateTime @default(now())
  isWeekend Boolean  @default(false)
  source    String   @default("topgg")
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
}

model OwnerAudit {
  id        String   @id @default(cuid())
  ownerId   String
  action    String
  detail    Json     @default("{}")
  createdAt DateTime @default(now())

  @@index([ownerId])
}
```

- [ ] **Step 2: Generate the client**

Run: `npx prisma generate`
Expected: "Generated Prisma Client".

- [ ] **Step 3: Write the failing test**

```ts
import { test } from "node:test";
import assert from "node:assert/strict";

test("getPrisma returns a cached singleton", async () => {
	const { getPrisma } = await import("./database.ts");
	const a = getPrisma();
	const b = getPrisma();
	assert.equal(a, b);
	assert.equal(typeof a.$connect, "function");
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `node --import tsx --test src/services/database.test.ts`
Expected: FAIL - module not found.

- [ ] **Step 5: Write `src/services/database.ts`**

```ts
import { PrismaClient } from "@prisma/client";
import { config } from "@/config.ts";
import { getLogger } from "@/services/logger.ts";

const log = getLogger("database");
let client: PrismaClient | undefined;

/** Cached PrismaClient singleton. The ONLY place a client is constructed. */
export function getPrisma(): PrismaClient {
	if (!client) {
		client = new PrismaClient({
			log: config.env === "development" ? ["warn", "error"] : ["error"],
		});
		log.info("prisma client initialized");
	}
	return client;
}

export async function disconnectPrisma(): Promise<void> {
	if (client) {
		await client.$disconnect();
		client = undefined;
		log.info("prisma client disconnected");
	}
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `node --import tsx --env-file=.env --test src/services/database.test.ts`
Expected: PASS (does not connect to DB - only constructs the client).

- [ ] **Step 7: Commit**

```bash
git add prisma/schema.prisma src/services/database.ts src/services/database.test.ts
git commit -m "feat: add prisma core schema and cached getPrisma singleton"
```

---

## Task 4: `services/cache.ts` - Redis/Keyv with memory fallback

**Files:**
- Create: `src/services/cache.ts`
- Test: `src/services/cache.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { test } from "node:test";
import assert from "node:assert/strict";

test("cache get/set/del works with in-memory fallback (no REDIS_URL)", async () => {
	const { cacheSet, cacheGet, cacheDel } = await import("./cache.ts");
	await cacheSet("k1", { n: 1 }, 1000);
	assert.deepEqual(await cacheGet<{ n: number }>("k1"), { n: 1 });
	await cacheDel("k1");
	assert.equal(await cacheGet("k1"), undefined);
});

test("withCache computes once then serves cached", async () => {
	const { withCache } = await import("./cache.ts");
	let calls = 0;
	const fn = async () => {
		calls++;
		return 42;
	};
	assert.equal(await withCache("wc", 1000, fn), 42);
	assert.equal(await withCache("wc", 1000, fn), 42);
	assert.equal(calls, 1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --env-file=.env --test src/services/cache.test.ts`
Expected: FAIL - module not found.

- [ ] **Step 3: Write `src/services/cache.ts`**

```ts
import Keyv from "keyv";
import KeyvRedis from "@keyv/redis";
import Redis from "ioredis";
import { config } from "@/config.ts";
import { getLogger } from "@/services/logger.ts";

const log = getLogger("cache");

let keyv: Keyv | undefined;
let redis: Redis | undefined;

function init(): Keyv {
	if (keyv) return keyv;
	if (config.redis.url) {
		redis = new Redis(config.redis.url, { maxRetriesPerRequest: null, lazyConnect: false });
		redis.on("error", (err) => log.error({ err }, "redis error"));
		keyv = new Keyv({ store: new KeyvRedis(redis), namespace: "rostra" });
		log.info("cache backed by redis");
	} else {
		keyv = new Keyv({ namespace: "rostra" });
		log.warn("REDIS_URL unset - using in-memory cache (not shared across shards)");
	}
	keyv.on("error", (err) => log.error({ err }, "cache error"));
	return keyv;
}

/** The Keyv instance (Redis or memory). */
export function getCache(): Keyv {
	return init();
}

/** Raw ioredis client for sorted-set ops (leaderboards). Undefined when no Redis. */
export function getRedis(): Redis | undefined {
	init();
	return redis;
}

export async function cacheGet<T>(key: string): Promise<T | undefined> {
	return (await getCache().get(key)) as T | undefined;
}

export async function cacheSet<T>(key: string, value: T, ttlMs?: number): Promise<void> {
	await getCache().set(key, value, ttlMs);
}

export async function cacheDel(key: string): Promise<void> {
	await getCache().delete(key);
}

export async function withCache<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
	const hit = await cacheGet<T>(key);
	if (hit !== undefined) return hit;
	const value = await fn();
	await cacheSet(key, value, ttlMs);
	return value;
}

export async function disconnectCache(): Promise<void> {
	await keyv?.disconnect?.();
	if (redis) {
		redis.disconnect();
		redis = undefined;
	}
	keyv = undefined;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import tsx --env-file=.env --test src/services/cache.test.ts`
Expected: PASS (uses in-memory Keyv because `.env` has empty `REDIS_URL`).

- [ ] **Step 5: Commit**

```bash
git add src/services/cache.ts src/services/cache.test.ts
git commit -m "feat: add cache singleton with redis and in-memory fallback"
```

---

## Task 5: `utils/components.ts` - Components V2 kit

**Files:**
- Create: `src/utils/components.ts`
- Test: `src/utils/components.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { MessageFlags } from "discord.js";

test("text() builds a TextDisplay with content", async () => {
	const { text } = await import("./components.ts");
	const td = text("# Hello");
	assert.equal(td.data.content, "# Hello");
});

test("buildResponse always sets IsComponentsV2 flag", async () => {
	const { buildResponse, text } = await import("./components.ts");
	const res = buildResponse([text("hi")]);
	assert.equal((res.flags & MessageFlags.IsComponentsV2) === MessageFlags.IsComponentsV2, true);
	assert.equal(res.components.length, 1);
});

test("errorContainer sets a red accent and message", async () => {
	const { errorContainer } = await import("./components.ts");
	const c = errorContainer("nope");
	// ContainerBuilder exposes accent via .data.accent_color
	assert.equal(typeof c.data.accent_color, "number");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test src/utils/components.test.ts`
Expected: FAIL - module not found.

- [ ] **Step 3: Write `src/utils/components.ts`**

```ts
import {
	ContainerBuilder,
	MessageFlags,
	SeparatorBuilder,
	SeparatorSpacingSize,
	TextDisplayBuilder,
	type InteractionReplyOptions,
	type RepliableInteraction,
} from "discord.js";

export const Accent = { success: 0x2ecc71, error: 0xe74c3c, info: 0x5865f2, warn: 0xf1c40f } as const;

export function text(markdown: string): TextDisplayBuilder {
	return new TextDisplayBuilder().setContent(markdown);
}

export function divider(large = false): SeparatorBuilder {
	return new SeparatorBuilder()
		.setDivider(true)
		.setSpacing(large ? SeparatorSpacingSize.Large : SeparatorSpacingSize.Small);
}

type ContainerChild = TextDisplayBuilder | SeparatorBuilder;

export function container(accent: number, children: ContainerChild[]): ContainerBuilder {
	const c = new ContainerBuilder().setAccentColor(accent);
	for (const child of children) {
		if (child instanceof TextDisplayBuilder) c.addTextDisplayComponents(child);
		else c.addSeparatorComponents(child);
	}
	return c;
}

export function successContainer(message: string): ContainerBuilder {
	return container(Accent.success, [text(message)]);
}

export function errorContainer(message: string): ContainerBuilder {
	return container(Accent.error, [text(`⚠️ ${message}`)]);
}

type TopLevel = ContainerBuilder | TextDisplayBuilder | SeparatorBuilder;

/** Wraps components into a V2 reply payload - always sets IsComponentsV2. */
export function buildResponse(
	components: TopLevel[],
	opts: { ephemeral?: boolean } = {},
): InteractionReplyOptions & { flags: number; components: TopLevel[] } {
	let flags = MessageFlags.IsComponentsV2 as number;
	if (opts.ephemeral) flags |= MessageFlags.Ephemeral;
	return { flags, components } as InteractionReplyOptions & {
		flags: number;
		components: TopLevel[];
	};
}

export const reply = {
	async success(i: RepliableInteraction, message: string, ephemeral = false): Promise<void> {
		await send(i, [successContainer(message)], ephemeral);
	},
	async error(i: RepliableInteraction, message: string, ephemeral = true): Promise<void> {
		await send(i, [errorContainer(message)], ephemeral);
	},
	async components(i: RepliableInteraction, components: TopLevel[], ephemeral = false): Promise<void> {
		await send(i, components, ephemeral);
	},
};

async function send(i: RepliableInteraction, components: TopLevel[], ephemeral: boolean): Promise<void> {
	const payload = buildResponse(components, { ephemeral });
	if (i.deferred || i.replied) await i.editReply(payload);
	else await i.reply(payload);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import tsx --test src/utils/components.test.ts`
Expected: PASS (3 tests). No env needed.

- [ ] **Step 5: Commit**

```bash
git add src/utils/components.ts src/utils/components.test.ts
git commit -m "feat: add components v2 ui kit (no legacy embeds)"
```

---

## Task 6: `i18n/index.ts` - translation helper

**Files:**
- Create: `src/i18n/locales/en/common.json`, `src/i18n/index.ts`
- Test: `src/i18n/index.test.ts`

- [ ] **Step 1: Create `src/i18n/locales/en/common.json`**

```json
{
	"error.generic": "Something went wrong. Please try again.",
	"error.missingPermissions": "You don't have permission to do that.",
	"error.botMissingPermissions": "I'm missing the permissions needed for that.",
	"error.cooldown": "Slow down - try again in {seconds}s.",
	"ping.pong": "Pong! {ms}ms"
}
```

- [ ] **Step 2: Write the failing test**

```ts
import { test } from "node:test";
import assert from "node:assert/strict";

test("t resolves a key and interpolates vars", async () => {
	const { t } = await import("./index.ts");
	assert.equal(t("common:ping.pong", { ms: 42 }), "Pong! 42ms");
});

test("t returns the key when missing", async () => {
	const { t } = await import("./index.ts");
	assert.equal(t("common:does.not.exist"), "common:does.not.exist");
});

test("registerLocale merges module strings under a namespace", async () => {
	const { t, registerLocale } = await import("./index.ts");
	registerLocale("en", "demo", { hi: "Hello {name}" });
	assert.equal(t("demo:hi", { name: "Ada" }), "Hello Ada");
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `node --import tsx --test src/i18n/index.test.ts`
Expected: FAIL - module not found.

- [ ] **Step 4: Write `src/i18n/index.ts`**

```ts
import common from "./locales/en/common.json" with { type: "json" };

type Vars = Record<string, string | number>;
type Bundle = Record<string, Record<string, string>>; // namespace -> key -> value

const locales: Record<string, Bundle> = { en: { common } };

/** Register a module's strings under a namespace for a locale. */
export function registerLocale(locale: string, namespace: string, strings: Record<string, string>): void {
	(locales[locale] ??= {})[namespace] = { ...(locales[locale]?.[namespace] ?? {}), ...strings };
}

function interpolate(template: string, vars?: Vars): string {
	if (!vars) return template;
	return template.replace(/\{(\w+)\}/g, (_, k: string) => (k in vars ? String(vars[k]) : `{${k}}`));
}

/** Translate `namespace:key` with optional vars. Returns the key if missing. */
export function t(key: string, vars?: Vars, locale = "en"): string {
	const [ns, ...rest] = key.split(":");
	const path = rest.join(":");
	const value = locales[locale]?.[ns ?? ""]?.[path] ?? locales.en?.[ns ?? ""]?.[path];
	return value ? interpolate(value, vars) : key;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node --import tsx --test src/i18n/index.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add src/i18n/index.ts src/i18n/locales/en/common.json src/i18n/index.test.ts
git commit -m "feat: add i18n helper with namespaced locale registration"
```

---

## Task 7: `cluster/ipc.ts` - sharding abstraction

**Files:**
- Create: `src/cluster/ipc.ts`
- Test: `src/cluster/ipc.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { test } from "node:test";
import assert from "node:assert/strict";

test("createIpc returns a no-op shard context when client has no shard", async () => {
	const { createIpc } = await import("./ipc.ts");
	const fakeClient = { shard: null, guilds: { cache: { size: 7 } } } as unknown as import("discord.js").Client;
	const ipc = createIpc(fakeClient);
	assert.equal(ipc.mode, "native");
	// with no ShardingManager, broadcast returns local-only values
	const values = await ipc.fetchValues((c) => (c as { guilds: { cache: { size: number } } }).guilds.cache.size);
	assert.deepEqual(values, [7]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test src/cluster/ipc.test.ts`
Expected: FAIL - module not found.

- [ ] **Step 3: Write `src/cluster/ipc.ts`**

```ts
import type { Client } from "discord.js";
import { config } from "@/config.ts";

export interface Ipc {
	readonly mode: "native" | "hybrid";
	/** Run a function on every shard's client; returns one result per shard. */
	broadcast<T>(fn: (client: Client) => T): Promise<T[]>;
	/** Convenience: same as broadcast but named for value collection. */
	fetchValues<T>(fn: (client: Client) => T): Promise<T[]>;
}

class NativeIpc implements Ipc {
	readonly mode = "native" as const;
	constructor(private readonly client: Client) {}

	async broadcast<T>(fn: (client: Client) => T): Promise<T[]> {
		if (this.client.shard) {
			return (await this.client.shard.broadcastEval(fn)) as T[];
		}
		// Single-process (no ShardingManager): run locally.
		return [fn(this.client)];
	}

	fetchValues<T>(fn: (client: Client) => T): Promise<T[]> {
		return this.broadcast(fn);
	}
}

/**
 * Returns the IPC implementation for the current sharding mode.
 * Modules use this interface only; swapping to hybrid-sharding later is a
 * config change (`SHARDING_MODE=hybrid`) plus a HybridIpc class - no module edits.
 */
export function createIpc(client: Client): Ipc {
	// Hybrid implementation is added in the runtime plan when the dep is introduced.
	if (config.sharding.mode === "hybrid") {
		// Falls back to native until HybridIpc lands; interface is identical.
		return new NativeIpc(client);
	}
	return new NativeIpc(client);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import tsx --env-file=.env --test src/cluster/ipc.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/cluster/ipc.ts src/cluster/ipc.test.ts
git commit -m "feat: add sharding ipc abstraction (native, hybrid-swappable)"
```

---

## Task 8: Full foundation gate + push

**Files:** none (verification)

- [ ] **Step 1: Typecheck the whole foundation**

Run: `npm run typecheck`
Expected: exit 0, no errors.

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: no errors (warnings acceptable). Fix with `npm run lint:fix` if needed.

- [ ] **Step 3: Run the full test suite**

Run: `node --import tsx --env-file=.env --test "src/**/*.test.ts"`
Expected: all tests PASS. (Create a local `.env` from `.env.example` with placeholder `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`, `DATABASE_URL` - no live services required for these tests.)

- [ ] **Step 4: Commit any lint fixes and push**

```bash
git add -A
git commit -m "chore: foundation typecheck + lint pass"
git push origin main
```

---

## Self-Review

**Spec coverage (foundation portion of §3, §6.1–6.4, §6.9–6.10, §4 IPC, §7 data):**
- §6.1 config loader → Task 1 ✓
- §6.2 getPrisma → Task 3 ✓
- §6.3 getCache (+ raw redis for leaderboards) → Task 4 ✓
- §6.4 logger → Task 2 ✓
- §6.9 Components V2 kit (+ embed ban) → Task 5 ✓ (Biome `noExplicitAny` + kit funnels all output; a CI grep for `EmbedBuilder` is added in the runtime plan's CI task)
- §6.10 i18n → Task 6 ✓
- §4 IPC abstraction (native + hybrid switch) → Task 7 ✓
- §7 data layer core models → Task 3 ✓
- Undercover invariant: no provider strings in any file above ✓ (neutral `AI_*` env names; logger redaction)

**Deferred to Plan 1b (Runtime):** BotClient + loaders, command pipeline (perms/cooldown/error boundary), interaction router, jobs/BullMQ, Fastify health + top.gg webhook, top.gg autoposter + `services/topgg.ts`, `cluster.ts`/`bot.ts` entries, graceful shutdown, deploy-commands, Dockerfile/compose/README, CI (incl. `EmbedBuilder` grep guard).

**Placeholder scan:** none - every step has complete code or an exact command.

**Type consistency:** `getPrisma`, `getCache`/`getRedis`, `getLogger(scope)`, `config`, `t(key,vars,locale)`, `registerLocale`, `createIpc(client)`, `buildResponse`/`reply.*` names are consistent across tasks and match the runtime plan's expected imports.

**Note on test env coupling:** `logger.ts` imports the eager `config`, so any test importing logger/database/cache transitively needs env. The `--env-file=.env` flag covers this locally; the `test` npm script can add it. Pure tests (config, components, i18n) need no env.
```
