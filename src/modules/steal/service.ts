/** A custom emoji parsed out of message text. */
export interface ParsedEmoji {
	name: string;
	id: string;
	animated: boolean;
}

/**
 * Extract custom emojis from a string. Matches both static `<:name:id>` and
 * animated `<a:name:id>` forms. De-duplicates by id, preserving order.
 */
export function parseCustomEmojis(input: string): ParsedEmoji[] {
	const seen = new Set<string>();
	const out: ParsedEmoji[] = [];
	for (const m of input.matchAll(/<(a?):(\w+):(\d+)>/g)) {
		const id = m[3];
		const name = m[2];
		if (!id || !name || seen.has(id)) continue;
		seen.add(id);
		out.push({ name, id, animated: m[1] === "a" });
	}
	return out;
}

/** The Discord CDN URL for a custom emoji. */
export function emojiCdnUrl(id: string, animated: boolean): string {
	return `https://cdn.discordapp.com/emojis/${id}.${animated ? "gif" : "png"}`;
}

/** Normalise a requested emoji name to Discord's rules (2-32 chars, word chars). */
export function sanitizeEmojiName(name: string): string {
	const cleaned = name.replace(/[^\w]/g, "").slice(0, 32);
	return cleaned.length >= 2 ? cleaned : `${cleaned}emoji`.slice(0, 32);
}
