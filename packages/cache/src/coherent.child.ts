import { createCoherentCache, disconnectCache } from "@rostra/cache";
import { closeBus } from "@rostra/cache/bus";
import { disconnectPrisma, type GuildTenant, getPrisma } from "@rostra/database";

const guildId = process.argv[2] ?? "";
if (!guildId) throw new Error("Missing guild id");
const cache = createCoherentCache<GuildTenant>("testTenant", "guild");
const ready = await cache.ready;
if (ready.status !== "published") throw new Error("Redis subscription unavailable");

async function read(): Promise<string> {
	const row = await cache.get(guildId, () =>
		getPrisma().guildTenant.findUniqueOrThrow({ where: { guildId } }),
	);
	return row.locale;
}

process.send?.({ type: "ready", locale: await read() });
process.on("message", async (message: unknown) => {
	if (message === "read") process.send?.({ type: "read", locale: await read() });
	if (message === "stop") {
		cache.dispose();
		closeBus();
		await disconnectCache();
		await disconnectPrisma();
		process.exit(0);
	}
});
