/**
 * Upload the generated PNGs in `assets/emojis/` as the bot's application emojis
 * and write their ids to `src/ui/emoji-ids.json` (consumed by `@/ui` `emoji()`).
 * Idempotent: emojis that already exist by name are reused, not recreated.
 *
 * Run after `npm run emojis:generate`: `npm run emojis:upload` (needs a valid
 * DISCORD_TOKEN + DISCORD_CLIENT_ID in the environment).
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "@/config.ts";

const API = "https://discord.com/api/v10";
const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");
const emojiDir = join(root, "assets", "emojis");
const idsFile = join(root, "src", "ui", "emoji-ids.json");

const appId = config.discord.clientId;
const authHeaders = { Authorization: `Bot ${config.discord.token}` };

async function listExisting(): Promise<Record<string, string>> {
	const res = await fetch(`${API}/applications/${appId}/emojis`, { headers: authHeaders });
	if (!res.ok) throw new Error(`list failed: ${res.status} ${await res.text()}`);
	const data = (await res.json()) as { items?: Array<{ id: string; name: string }> };
	const map: Record<string, string> = {};
	for (const item of data.items ?? []) map[item.name] = item.id;
	return map;
}

async function createEmoji(name: string, png: Buffer): Promise<string | null> {
	const res = await fetch(`${API}/applications/${appId}/emojis`, {
		method: "POST",
		headers: { ...authHeaders, "Content-Type": "application/json" },
		body: JSON.stringify({ name, image: `data:image/png;base64,${png.toString("base64")}` }),
	});
	if (!res.ok) {
		console.warn(`  ! ${name}: ${res.status} ${await res.text()}`);
		return null;
	}
	const data = (await res.json()) as { id: string };
	return data.id;
}

const existing = await listExisting();
const ids: Record<string, string> = { ...existing };
for (const file of readdirSync(emojiDir).filter((f) => f.endsWith(".png"))) {
	const name = file.replace(/\.png$/, "");
	if (ids[name]) {
		console.log(`  = ${name} (exists)`);
		continue;
	}
	const id = await createEmoji(name, readFileSync(join(emojiDir, file)));
	if (id) {
		ids[name] = id;
		console.log(`  + ${name} -> ${id}`);
	}
}

const sorted = Object.fromEntries(Object.entries(ids).sort(([a], [b]) => a.localeCompare(b)));
writeFileSync(idsFile, `${JSON.stringify(sorted, null, 2)}\n`);
console.log(`wrote ${Object.keys(sorted).length} ids to src/ui/emoji-ids.json`);
