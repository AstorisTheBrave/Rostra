import type { FeedbackConfig } from "@rostra/database";
import { getPrisma } from "@rostra/database";

export async function getConfig(guildId: string): Promise<FeedbackConfig | null> {
	return getPrisma().feedbackConfig.findUnique({ where: { guildId } });
}

export async function upsertConfig(
	guildId: string,
	data: Partial<Omit<FeedbackConfig, "guildId" | "createdAt" | "updatedAt">>,
): Promise<FeedbackConfig> {
	return getPrisma().feedbackConfig.upsert({
		where: { guildId },
		create: { guildId, ...data },
		update: data,
	});
}
