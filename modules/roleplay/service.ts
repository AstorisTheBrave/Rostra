/**
 * Roleplay action catalogue + helpers. Gifs come from the free nekos.best API
 * (no key, anime reaction gifs). All logic here is pure and unit-tested; the
 * network fetch is the only side effect and degrades gracefully.
 */

export interface RoleplayAction {
	/** nekos.best gif category. */
	category: string;
	/** Whether the action is aimed at another member. */
	targeted: boolean;
	/** Short label for the slash-command choice. */
	label: string;
}

/**
 * Ordered action catalogue. The i18n message for each lives under
 * `roleplay:act.<name>` and may reference `{user}` and (for targeted actions)
 * `{target}`. Max 25 entries including `ship` (Discord's choice limit).
 */
export const ROLEPLAY_ACTIONS = {
	hug: { category: "hug", targeted: true, label: "Hug" },
	kiss: { category: "kiss", targeted: true, label: "Kiss" },
	cuddle: { category: "cuddle", targeted: true, label: "Cuddle" },
	pat: { category: "pat", targeted: true, label: "Pat" },
	poke: { category: "poke", targeted: true, label: "Poke" },
	tickle: { category: "tickle", targeted: true, label: "Tickle" },
	feed: { category: "feed", targeted: true, label: "Feed" },
	highfive: { category: "highfive", targeted: true, label: "High-five" },
	handhold: { category: "handhold", targeted: true, label: "Hold hands" },
	peck: { category: "peck", targeted: true, label: "Peck" },
	slap: { category: "slap", targeted: true, label: "Slap" },
	punch: { category: "punch", targeted: true, label: "Punch" },
	bite: { category: "bite", targeted: true, label: "Bite" },
	kick: { category: "kick", targeted: true, label: "Kick" },
	yeet: { category: "yeet", targeted: true, label: "Yeet" },
	stare: { category: "stare", targeted: true, label: "Stare" },
	nom: { category: "nom", targeted: true, label: "Nom" },
	shoot: { category: "shoot", targeted: true, label: "Shoot" },
	dance: { category: "dance", targeted: false, label: "Dance" },
	cry: { category: "cry", targeted: false, label: "Cry" },
	blush: { category: "blush", targeted: false, label: "Blush" },
	smile: { category: "smile", targeted: false, label: "Smile" },
	wave: { category: "wave", targeted: false, label: "Wave" },
	wink: { category: "wink", targeted: false, label: "Wink" },
} satisfies Record<string, RoleplayAction>;

export type RoleplayActionName = keyof typeof ROLEPLAY_ACTIONS;

export function isRoleplayAction(name: string): name is RoleplayActionName {
	return Object.hasOwn(ROLEPLAY_ACTIONS, name);
}

export function isTargeted(name: RoleplayActionName): boolean {
	return ROLEPLAY_ACTIONS[name].targeted;
}

interface NekosResponse {
	results?: Array<{ url?: string }>;
}

/**
 * Fetch a reaction gif URL for a category. Returns undefined on any failure so
 * the command can still send the flavour text without an image.
 */
export async function fetchRoleplayGif(
	category: string,
	fetchImpl: typeof fetch = fetch,
): Promise<string | undefined> {
	try {
		const res = await fetchImpl(`https://nekos.best/api/v2/${category}`, {
			signal: AbortSignal.timeout(5000),
		});
		if (!res.ok) return undefined;
		const data = (await res.json()) as NekosResponse;
		return data.results?.[0]?.url;
	} catch {
		return undefined;
	}
}

/**
 * Deterministic, symmetric compatibility score (0-100) for two user IDs.
 * Same pair always yields the same number regardless of argument order.
 */
export function shipScore(idA: string, idB: string): number {
	const [a, b] = idA <= idB ? [idA, idB] : [idB, idA];
	let hash = 0;
	const seed = `${a}:${b}`;
	for (let i = 0; i < seed.length; i++) {
		hash = (hash * 31 + seed.charCodeAt(i)) % 1_000_000_007;
	}
	return hash % 101;
}

/** A 10-segment heart bar visualising a 0-100 score. */
export function shipBar(score: number): string {
	const filled = Math.round(score / 10);
	return "❤️".repeat(filled) + "🤍".repeat(10 - filled);
}
