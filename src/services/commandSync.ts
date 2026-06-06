import { createHash } from "node:crypto";
import { REST, type RESTPostAPIApplicationCommandsJSONBody, Routes } from "discord.js";
import { BotClient } from "@/client/BotClient.ts";
import { collectCommandJSON, registerCommands } from "@/client/loaders/commands.ts";
import { loadModules } from "@/client/loaders/modules.ts";
import { config } from "@/config.ts";
import { getPrisma } from "@/services/database.ts";
import { getLogger } from "@/services/logger.ts";

const log = getLogger("commands");
const STATE_KEY = "commandHash";

/**
 * Stable hash of the command payload. Commands are sorted by name first so a
 * change in load order alone does not trigger a re-registration.
 */
export function hashCommands(body: RESTPostAPIApplicationCommandsJSONBody[]): string {
	const sorted = [...body].sort((a, b) => a.name.localeCompare(b.name));
	return createHash("sha256").update(JSON.stringify(sorted)).digest("hex");
}

async function getStoredHash(): Promise<string | null> {
	const row = await getPrisma().botState.findUnique({ where: { key: STATE_KEY } });
	return row?.value ?? null;
}

async function storeHash(hash: string): Promise<void> {
	await getPrisma().botState.upsert({
		where: { key: STATE_KEY },
		create: { key: STATE_KEY, value: hash },
		update: { value: hash },
	});
}

/**
 * Register global application commands with Discord only when their definitions
 * changed since the last run. The previous payload hash is stored in the shared
 * `BotState` table, so this is automatic and idempotent across restarts, Docker
 * redeploys, and custom hosts (no manual deploy step, no needless API calls).
 *
 * Pass `force` to always re-register (used by `npm run deploy:commands`).
 */
export async function syncCommands(force = false): Promise<{ registered: boolean; count: number }> {
	const client = new BotClient();
	const modules = await loadModules();
	registerCommands(client, modules);
	const body = collectCommandJSON(client);
	const hash = hashCommands(body);

	if (!force) {
		const stored = await getStoredHash().catch((err) => {
			log.warn({ err }, "could not read stored command hash - will register");
			return null;
		});
		if (stored === hash) {
			log.info({ count: body.length }, "commands unchanged - skipping registration");
			return { registered: false, count: body.length };
		}
	}

	const rest = new REST().setToken(config.discord.token);
	await rest.put(Routes.applicationCommands(config.discord.clientId), { body });
	await storeHash(hash).catch((err) => log.warn({ err }, "failed to persist command hash"));
	log.info({ count: body.length, forced: force }, "registered global application commands");
	return { registered: true, count: body.length };
}
