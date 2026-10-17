import { cachedConfig, invalidateConfig } from "@rostra/cache";
import type { VerificationConfig } from "@rostra/database";
import { getPrisma } from "@rostra/database";

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
