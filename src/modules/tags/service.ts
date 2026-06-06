import { getPrisma } from "@/services/database.ts";
import type { Tag } from "@prisma/client";

export async function getTag(guildId: string, name: string): Promise<Tag | null> {
	return getPrisma().tag.findUnique({
		where: { guildId_name: { guildId, name: name.toLowerCase() } },
	});
}

export async function addTag(
	guildId: string,
	name: string,
	content: string,
	createdBy: string,
): Promise<void> {
	await getPrisma().tag.upsert({
		where: { guildId_name: { guildId, name: name.toLowerCase() } },
		create: { guildId, name: name.toLowerCase(), content, createdBy },
		update: { content },
	});
}

export async function removeTag(guildId: string, name: string): Promise<boolean> {
	const result = await getPrisma().tag.deleteMany({
		where: { guildId, name: name.toLowerCase() },
	});
	return result.count > 0;
}

export async function listTags(guildId: string): Promise<Tag[]> {
	return getPrisma().tag.findMany({ where: { guildId }, orderBy: { name: "asc" }, take: 50 });
}

export async function bumpUses(guildId: string, name: string): Promise<void> {
	await getPrisma()
		.tag.update({
			where: { guildId_name: { guildId, name: name.toLowerCase() } },
			data: { uses: { increment: 1 } },
		})
		.catch(() => {});
}
