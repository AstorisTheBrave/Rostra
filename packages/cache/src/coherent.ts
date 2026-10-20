import { getPrisma, type Prisma } from "@rostra/database";
import { getLogger } from "@rostra/logger";
import {
	type CacheInvalidationV1,
	type PublicationOutcome,
	parseCacheInvalidation,
	publish,
	subscribe,
} from "./bus.ts";
import { CONFIG_TTL_MS } from "./index.ts";

const CHANNEL = "rostra:cache:v1";
const log = getLogger("cache:coherent");
type Scope = "guild" | "user";
type CacheIdentity = Pick<CacheInvalidationV1, "owner" | "tenant" | "key">;

export interface CoherentCache<T> {
	readonly ready: Promise<PublicationOutcome>;
	get(id: string, load: () => Promise<T>): Promise<T>;
	set(id: string, value: T, version: string): void;
	invalidate(message: CacheInvalidationV1): boolean;
	evict(id: string): void;
	write<R>(
		id: string,
		writer: (tx: Prisma.TransactionClient) => Promise<R>,
		local?: (result: R) => T | undefined,
	): Promise<{ value: R; coherence: PublicationOutcome }>;
	dispose(): void;
}

/** One local L1 per owner, bounded even when Redis delivery is unavailable. */
export function createCoherentCache<T>(
	owner: string,
	scope: Scope,
	options: {
		ttlMs?: number;
		maxEntries?: number;
		now?: () => number;
		key?: (id: string) => string;
	} = {},
): CoherentCache<T> {
	const ttlMs = options.ttlMs ?? CONFIG_TTL_MS;
	if (!Number.isFinite(ttlMs) || ttlMs <= 0) throw new Error("Invalid cache TTL");
	const maxEntries = options.maxEntries ?? 5_000;
	if (!Number.isSafeInteger(maxEntries) || maxEntries <= 0) throw new Error("Invalid cache size");
	const now = options.now ?? Date.now;
	const key = options.key ?? ((id: string) => id);
	const entries = new Map<string, { value: T; expires: number; version: bigint }>();
	const versions = new Map<string, bigint>();
	const rememberVersion = (id: string, version: bigint): void => {
		versions.delete(id);
		versions.set(id, version);
		if (versions.size > maxEntries * 2) {
			const oldest = versions.keys().next().value as string;
			versions.delete(oldest);
			entries.delete(oldest);
		}
	};
	const rememberEntry = (id: string, value: T, version: bigint): void => {
		entries.delete(id);
		entries.set(id, { value, expires: now() + ttlMs, version });
		if (entries.size > maxEntries) entries.delete(entries.keys().next().value as string);
	};
	const identity = (id: string): CacheIdentity => ({
		owner,
		tenant: `${scope}:${id}`,
		key: key(id),
	});
	const invalidate = (message: CacheInvalidationV1): boolean => {
		const valid = parseCacheInvalidation(message);
		if (!valid || valid.owner !== owner || !valid.tenant.startsWith(`${scope}:`)) return false;
		const id = valid.tenant.slice(scope.length + 1);
		if (valid.key !== key(id)) return false;
		const next = BigInt(valid.version);
		if (next <= (versions.get(id) ?? 0n)) return false;
		rememberVersion(id, next);
		entries.delete(id);
		return true;
	};
	const subscription = subscribe(CHANNEL, (value) => {
		const message = parseCacheInvalidation(value);
		if (message) invalidate(message);
		else log.warn({ owner }, "invalid cache invalidation ignored");
	});
	void subscription.ready.then((outcome) => {
		if (outcome.status === "ttl-fallback")
			log.warn({ owner, reason: outcome.reason, ttlMs }, "cache subscription uses TTL fallback");
	});
	return {
		ready: subscription.ready,
		async get(id, load) {
			const hit = entries.get(id);
			if (hit && hit.expires > now()) return hit.value;
			for (let attempt = 0; attempt < 2; attempt++) {
				const before = versions.get(id) ?? 0n;
				const value = await load();
				if ((versions.get(id) ?? 0n) === before) {
					rememberEntry(id, value, before);
					return value;
				}
				// Retry once after an invalidation, but do not install a racing result.
				if (attempt === 1) return value;
			}
			throw new Error("unreachable cache read state");
		},
		set(id, value, version) {
			const next = BigInt(version);
			if (next < (versions.get(id) ?? 0n)) return;
			rememberVersion(id, next);
			rememberEntry(id, value, next);
		},
		invalidate,
		evict(id) {
			entries.delete(id);
		},
		async write(id, writer, local) {
			const target = identity(id);
			const { value, coherence } = await commitCoherentWrite(
				target,
				writer,
				(result, committedVersion) => {
					const updated = local ? local(result) : (result as unknown as T);
					if (updated === undefined) {
						rememberVersion(id, BigInt(committedVersion));
						entries.delete(id);
					} else this.set(id, updated, committedVersion);
				},
			);
			return { value, coherence };
		},
		dispose: subscription.dispose,
	};
}

/** Revision update and owning write share a transaction and row lock. */
export async function commitCoherentWrite<T>(
	identity: CacheIdentity,
	writer: (tx: Prisma.TransactionClient) => Promise<T>,
	onCommit: (value: T, version: string) => void,
): Promise<{ value: T; version: string; coherence: PublicationOutcome }> {
	const { value, version } = await getPrisma().$transaction(async (tx) => {
		const revision = await tx.cacheRevision.upsert({
			where: { owner_tenant_key: identity },
			create: { ...identity, version: 1n },
			update: { version: { increment: 1 } },
		});
		return { value: await writer(tx), version: revision.version.toString() };
	});
	try {
		onCommit(value, version);
	} catch (err) {
		log.error({ err, owner: identity.owner, tenant: identity.tenant }, "local cache update failed");
	}
	const message: CacheInvalidationV1 = { schemaVersion: 1, ...identity, version };
	const coherence = await publish(CHANNEL, message);
	if (coherence.status === "ttl-fallback")
		log.warn(
			{
				owner: identity.owner,
				tenant: identity.tenant,
				reason: coherence.reason,
				ttlMs: CONFIG_TTL_MS,
			},
			"cache write uses TTL fallback",
		);
	return { value, version, coherence };
}
