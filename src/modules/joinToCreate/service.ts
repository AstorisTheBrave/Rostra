import type { JoinToCreateConfig } from "@prisma/client";
import { getPrisma } from "@/services/database.ts";
import { getLogger } from "@/services/logger.ts";

const log = getLogger("j2c");

const cache = new Map<string, JoinToCreateConfig | null>();

export async function getConfig(guildId: string): Promise<JoinToCreateConfig | null> {
	const cached = cache.get(guildId);
	if (cached !== undefined) return cached;
	const cfg = await getPrisma()
		.joinToCreateConfig.findUnique({ where: { guildId } })
		.catch((err) => {
			log.error({ err, guildId }, "failed to load j2c config");
			return null;
		});
	cache.set(guildId, cfg);
	return cfg;
}

export async function upsertConfig(
	guildId: string,
	data: Partial<Omit<JoinToCreateConfig, "guildId" | "createdAt" | "updatedAt">>,
): Promise<JoinToCreateConfig> {
	const cfg = await getPrisma().joinToCreateConfig.upsert({
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

export async function recordTemp(
	channelId: string,
	guildId: string,
	ownerId: string,
): Promise<void> {
	await getPrisma().j2CChannel.create({ data: { channelId, guildId, ownerId } });
}

export async function isTemp(channelId: string): Promise<boolean> {
	const row = await getPrisma().j2CChannel.findUnique({ where: { channelId } });
	return row !== null;
}

export async function removeTemp(channelId: string): Promise<void> {
	await getPrisma().j2CChannel.deleteMany({ where: { channelId } });
}

/** Replace {user} in the channel name template. */
export function formatName(template: string, username: string): string {
	return template.replaceAll("{user}", username).slice(0, 100);
}
