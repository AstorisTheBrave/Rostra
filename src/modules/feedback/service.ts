import { getPrisma } from "@/services/database.ts";
import type { FeedbackConfig } from "@prisma/client";

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
