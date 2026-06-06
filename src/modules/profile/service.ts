import type { Profile } from "@prisma/client";
import { getPrisma } from "@/services/database.ts";

export const MAX_BIO = 200;
/** Default accent (Discord blurple) when a profile has none set. */
export const DEFAULT_ACCENT = "#5865f2";

export async function getProfile(userId: string): Promise<Profile | null> {
	return getPrisma().profile.findUnique({ where: { userId } });
}

export async function upsertProfile(
	userId: string,
	data: Partial<Pick<Profile, "bio" | "background" | "accent">>,
): Promise<Profile> {
	return getPrisma().profile.upsert({
		where: { userId },
		create: { userId, ...data },
		update: data,
	});
}

export async function resetProfile(userId: string): Promise<void> {
	await getPrisma().profile.upsert({
		where: { userId },
		create: { userId },
		update: { bio: null, background: null, accent: null },
	});
}

export function clampBio(input: string): string {
	return input.slice(0, MAX_BIO);
}

/** Accept "#RRGGBB" or "RRGGBB". */
export function isValidHex(input: string): boolean {
	return /^#?[0-9a-f]{6}$/i.test(input.trim());
}

/** Normalise any accepted hex to lowercase "#rrggbb". */
export function normalizeHex(input: string): string {
	return `#${input.trim().replace(/^#/, "").toLowerCase()}`;
}

/** Only allow https image URLs with a known image extension. */
export function isValidImageUrl(input: string): boolean {
	try {
		const url = new URL(input);
		return url.protocol === "https:" && /\.(png|jpe?g|webp|gif)$/i.test(url.pathname);
	} catch {
		return false;
	}
}
