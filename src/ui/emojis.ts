import emojiIds from "./emoji-ids.json" with { type: "json" };

/**
 * Semantic emoji registry. Each name has a unicode fallback so the UI looks fine
 * out of the box; once custom application emojis are uploaded (see
 * `src/scripts/{generate,upload}-emojis.ts`), their ids land in `emoji-ids.json`
 * and `emoji(name)` returns the custom `<:name:id>` form instead.
 */
export const EMOJI_FALLBACK = {
	// status
	success: "✅",
	error: "❌",
	warn: "⚠️",
	info: "ℹ️",
	loading: "⏳",
	// modules
	security: "🛡️",
	moderation: "🔨",
	automod: "🤖",
	logging: "📜",
	welcome: "👋",
	tickets: "🎫",
	economy: "🪙",
	leveling: "📈",
	giveaway: "🎉",
	voice: "🎙️",
	reactionroles: "🏷️",
	birthday: "🎂",
	roleplay: "💞",
	reminders: "⏰",
	profile: "🪪",
	music: "🎵",
	trivia: "🧠",
	games: "🎮",
	tags: "🔖",
	vanity: "✨",
	feedback: "💬",
	utility: "🧰",
	assistant: "💡",
	steal: "😼",
	starboard: "⭐",
	verification: "🔓",
	feeds: "📡",
	highlight: "🔔",
	sticky: "📌",
	reputation: "⭐",
	// stats / system
	stats: "📊",
	cpu: "🖥️",
	ram: "💾",
	latency: "📶",
	uptime: "⏱️",
	servers: "🌐",
	users: "👥",
	channels: "🗂️",
	shard: "🧩",
	// controls
	next: "▶️",
	prev: "◀️",
	trash: "🗑️",
	settings: "⚙️",
	wizard: "🪄",
} as const;

export type EmojiName = keyof typeof EMOJI_FALLBACK;

const IDS = emojiIds as Record<string, string>;

/** The application-emoji form if uploaded, otherwise the unicode fallback. */
export function emoji(name: EmojiName): string {
	const id = IDS[name];
	return id ? `<:${name}:${id}>` : EMOJI_FALLBACK[name];
}

/** Every registry name (handy for the upload/generate scripts and tests). */
export const EMOJI_NAMES = Object.keys(EMOJI_FALLBACK) as EmojiName[];
