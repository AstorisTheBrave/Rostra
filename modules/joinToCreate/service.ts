import { createCoherentCache } from "@rostra/cache";
import type { JoinToCreateConfig } from "@rostra/database";
import { getPrisma } from "@rostra/database";
import { getLogger } from "@rostra/logger";

const log = getLogger("j2c");

const cache = createCoherentCache<JoinToCreateConfig | null>("joinToCreate", "guild");

export async function getConfig(guildId: string): Promise<JoinToCreateConfig | null> {
	return cache.get(guildId, () =>
		getPrisma()
			.joinToCreateConfig.findUnique({ where: { guildId } })
			.catch((err) => {
				log.error({ err, guildId }, "failed to load j2c config");
				return null;
			}),
	);
}

export async function upsertConfig(
	guildId: string,
	data: Partial<Omit<JoinToCreateConfig, "guildId" | "createdAt" | "updatedAt">>,
): Promise<JoinToCreateConfig> {
	const { value: cfg } = await cache.write(guildId, (tx) =>
		tx.joinToCreateConfig.upsert({
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
