/**
 * Generate application-emoji PNGs from Lucide icons.
 *
 * Each semantic emoji is a Lucide icon (white stroke) on a rounded coloured
 * badge, rasterised to a 128x128 PNG with @resvg/resvg-js. Output lands in
 * `assets/emojis/<name>.png`; `upload-emojis.ts` then uploads them as the bot's
 * application emojis. Both scripts are build-time only (devDependencies).
 *
 * Run: `npm run emojis:generate`
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");
const iconDir = join(root, "node_modules", "lucide-static", "icons");
const outDir = join(root, "assets", "emojis");

const C = {
	green: "#2ecc71",
	red: "#e74c3c",
	amber: "#f1c40f",
	blurple: "#5865f2",
	blue: "#3498db",
	orange: "#e67e22",
	teal: "#1abc9c",
	slate: "#7a869a",
	purple: "#9b59b6",
	pink: "#e91e63",
	gold: "#f39c12",
	violet: "#8e44ad",
	gray: "#8e9297",
};

/** name -> [lucide icon file, badge colour] */
const SPEC: Record<string, [string, string]> = {
	success: ["circle-check", C.green],
	error: ["circle-x", C.red],
	warn: ["triangle-alert", C.amber],
	info: ["info", C.blurple],
	loading: ["loader", C.gray],
	security: ["shield", C.red],
	moderation: ["gavel", C.orange],
	automod: ["bot", C.teal],
	logging: ["scroll-text", C.slate],
	welcome: ["door-open", C.green],
	tickets: ["ticket", C.blue],
	economy: ["coins", C.gold],
	leveling: ["trending-up", C.green],
	giveaway: ["gift", C.pink],
	voice: ["mic", C.purple],
	reactionroles: ["smile-plus", C.amber],
	birthday: ["cake", C.pink],
	roleplay: ["heart", C.pink],
	reminders: ["alarm-clock", C.orange],
	profile: ["id-card", C.blurple],
	music: ["music", C.purple],
	trivia: ["brain", C.violet],
	games: ["gamepad-2", C.green],
	tags: ["bookmark", C.blue],
	vanity: ["sparkles", C.gold],
	feedback: ["message-square", C.blue],
	utility: ["wrench", C.slate],
	assistant: ["wand-sparkles", C.violet],
	steal: ["copy-plus", C.teal],
	stats: ["chart-column", C.blue],
	cpu: ["cpu", C.blue],
	ram: ["memory-stick", C.green],
	latency: ["gauge", C.amber],
	uptime: ["timer", C.green],
	servers: ["globe", C.blue],
	users: ["users", C.blue],
	channels: ["folder-tree", C.slate],
	shard: ["layers", C.purple],
	next: ["chevron-right", C.gray],
	prev: ["chevron-left", C.gray],
	trash: ["trash-2", C.red],
	settings: ["settings", C.slate],
	wizard: ["wand-sparkles", C.violet],
};

function innerSvg(icon: string): string | null {
	const file = join(iconDir, `${icon}.svg`);
	if (!existsSync(file)) return null;
	const raw = readFileSync(file, "utf8");
	const match = raw.match(/<svg[^>]*>([\s\S]*?)<\/svg>/);
	return match?.[1]?.trim() ?? null;
}

function badge(inner: string, color: string): string {
	// Lucide icons are 24x24. Scale 3x (72px) and centre on a 128px badge.
	return `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
  <rect x="4" y="4" width="120" height="120" rx="30" fill="${color}"/>
  <g transform="translate(28,28) scale(3)" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${inner}</g>
</svg>`;
}

mkdirSync(outDir, { recursive: true });
let made = 0;
const missing: string[] = [];
for (const [name, [icon, color]] of Object.entries(SPEC)) {
	const inner = innerSvg(icon);
	if (!inner) {
		missing.push(`${name} (${icon})`);
		continue;
	}
	const png = new Resvg(badge(inner, color), {
		fitTo: { mode: "width", value: 128 },
	})
		.render()
		.asPng();
	writeFileSync(join(outDir, `${name}.png`), png);
	made++;
}

console.log(`generated ${made} emoji PNGs in assets/emojis`);
if (missing.length > 0) console.warn(`missing lucide icons: ${missing.join(", ")}`);
