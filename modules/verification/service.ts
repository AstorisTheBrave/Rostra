import { createCoherentCache } from "@rostra/cache";
import type { VerificationConfig } from "@rostra/database";
import { getPrisma } from "@rostra/database";

const cache = createCoherentCache<VerificationConfig | null>("verification", "guild");

export async function getConfig(guildId: string): Promise<VerificationConfig | null> {
	return cache.get(guildId, () =>
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
	const { value: row } = await cache.write(guildId, (tx) =>
		tx.verificationConfig.upsert({
			where: { guildId },
			create: { guildId, ...data },
			update: data,
		}),
	);
	return row;
}
