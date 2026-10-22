import { createCoherentCache } from "@rostra/cache";
import type { WelcomeConfig } from "@rostra/database";
import { getPrisma } from "@rostra/database";
import { getLogger } from "@rostra/logger";

const log = getLogger("welcome");

const cache = createCoherentCache<WelcomeConfig | null>("welcome", "guild");

export async function getConfig(guildId: string): Promise<WelcomeConfig | null> {
	return cache.get(guildId, () =>
		getPrisma()
			.welcomeConfig.findUnique({ where: { guildId } })
			.catch((err) => {
				log.error({ err, guildId }, "failed to load welcome config");
				return null;
			}),
	);
}

export async function upsertConfig(
	guildId: string,
	data: Partial<Omit<WelcomeConfig, "guildId" | "createdAt" | "updatedAt">>,
): Promise<WelcomeConfig> {
	const { value: cfg } = await cache.write(guildId, (tx) =>
		tx.welcomeConfig.upsert({
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

export interface MessageContext {
	user: string; // mention
	username: string;
	server: string;
	memberCount: number;
}

/** Replace {user}, {username}, {server}, {membercount} placeholders in a template. */
export function formatMessage(template: string, ctx: MessageContext): string {
	return template
		.replaceAll("{user}", ctx.user)
		.replaceAll("{username}", ctx.username)
		.replaceAll("{server}", ctx.server)
		.replaceAll("{membercount}", String(ctx.memberCount));
}
