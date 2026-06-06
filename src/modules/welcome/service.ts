import type { WelcomeConfig } from "@prisma/client";
import { getPrisma } from "@/services/database.ts";
import { getLogger } from "@/services/logger.ts";

const log = getLogger("welcome");

const cache = new Map<string, WelcomeConfig | null>();

export async function getConfig(guildId: string): Promise<WelcomeConfig | null> {
	const cached = cache.get(guildId);
	if (cached !== undefined) return cached;
	const cfg = await getPrisma()
		.welcomeConfig.findUnique({ where: { guildId } })
		.catch((err) => {
			log.error({ err, guildId }, "failed to load welcome config");
			return null;
		});
	cache.set(guildId, cfg);
	return cfg;
}

export async function upsertConfig(
	guildId: string,
	data: Partial<Omit<WelcomeConfig, "guildId" | "createdAt" | "updatedAt">>,
): Promise<WelcomeConfig> {
	const cfg = await getPrisma().welcomeConfig.upsert({
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
