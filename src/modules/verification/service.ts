import type { VerificationConfig } from "@prisma/client";
import { cachedConfig, invalidateConfig } from "@/services/cache.ts";
import { getPrisma } from "@/services/database.ts";

const cfgKey = (guildId: string) => `verify:cfg:${guildId}`;

export async function getConfig(guildId: string): Promise<VerificationConfig | null> {
	return cachedConfig(cfgKey(guildId), () =>
		getPrisma().verificationConfig.findUnique({ where: { guildId } }),
	);
}

export async function upsertConfig(
	guildId: string,
	data: Partial<
		Pick<
			VerificationConfig,
			"roleId" | "enabled" | "captcha" | "kickAfterMin" | "minAccountAgeDays"
		>
	>,
): Promise<VerificationConfig> {
	const row = await getPrisma().verificationConfig.upsert({
		where: { guildId },
		create: { guildId, ...data },
		update: data,
	});
	await invalidateConfig(cfgKey(guildId));
	return row;
}
