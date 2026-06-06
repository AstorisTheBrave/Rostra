import { getPrisma } from "@/services/database.ts";
import { getLogger } from "@/services/logger.ts";
import type { VanityRoleConfig } from "@prisma/client";

const log = getLogger("vanityroles");

const cache = new Map<string, VanityRoleConfig | null>();

export async function getConfig(guildId: string): Promise<VanityRoleConfig | null> {
	const cached = cache.get(guildId);
	if (cached !== undefined) return cached;
	const cfg = await getPrisma()
		.vanityRoleConfig.findUnique({ where: { guildId } })
		.catch((err) => {
			log.error({ err, guildId }, "failed to load vanity config");
			return null;
		});
	cache.set(guildId, cfg);
	return cfg;
}

export async function upsertConfig(
	guildId: string,
	data: Partial<Omit<VanityRoleConfig, "guildId" | "createdAt" | "updatedAt">>,
): Promise<VanityRoleConfig> {
	const cfg = await getPrisma().vanityRoleConfig.upsert({
		where: { guildId },
		create: { guildId, ...data },
		update: data,
	});
	cache.set(guildId, cfg);
	return cfg;
}

export function invalidate(guildId: string): void {
	cache.delete(guildId);
}

/** True if any of the status/activity texts contains the keyword (case-insensitive). */
export function statusMatches(texts: (string | null | undefined)[], keyword: string): boolean {
	const needle = keyword.toLowerCase();
	return texts.some((value) => (value ?? "").toLowerCase().includes(needle));
}
