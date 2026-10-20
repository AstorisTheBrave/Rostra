import { createCoherentCache } from "@rostra/cache";
import type { VanityRoleConfig } from "@rostra/database";
import { getPrisma } from "@rostra/database";
import { getLogger } from "@rostra/logger";

const log = getLogger("vanityroles");

const cache = createCoherentCache<VanityRoleConfig | null>("vanityroles", "guild");

export async function getConfig(guildId: string): Promise<VanityRoleConfig | null> {
	return cache.get(guildId, () =>
		getPrisma()
			.vanityRoleConfig.findUnique({ where: { guildId } })
			.catch((err) => {
				log.error({ err, guildId }, "failed to load vanity config");
				return null;
			}),
	);
}

export async function upsertConfig(
	guildId: string,
	data: Partial<Omit<VanityRoleConfig, "guildId" | "createdAt" | "updatedAt">>,
): Promise<VanityRoleConfig> {
	const { value: cfg } = await cache.write(guildId, (tx) =>
		tx.vanityRoleConfig.upsert({
			where: { guildId },
			create: { guildId, ...data },
			update: data,
		}),
	);
	return cfg;
}

export function invalidate(guildId: string): void {
	cache.evict(guildId);
}

/** True if any of the status/activity texts contains the keyword (case-insensitive). */
export function statusMatches(texts: (string | null | undefined)[], keyword: string): boolean {
	const needle = keyword.toLowerCase();
	return texts.some((value) => (value ?? "").toLowerCase().includes(needle));
}
