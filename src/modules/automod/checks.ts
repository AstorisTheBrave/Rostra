const INVITE_RE = /(?:discord\.gg|discord(?:app)?\.com\/invite|discord\.me)\/\S+/i;
const URL_RE = /https?:\/\/([^\s/]+)/gi;

/** True if the content contains a Discord invite link. */
export function hasInvite(content: string): boolean {
	return INVITE_RE.test(content);
}

/** True if the content contains a URL whose host isn't in the allow-list. */
export function hasDisallowedLink(content: string, allowed: string[]): boolean {
	const hosts = [...content.matchAll(URL_RE)].map((m) => (m[1] ?? "").toLowerCase());
	if (hosts.length === 0) return false;
	if (allowed.length === 0) return true;
	const allowList = allowed.map((a) => a.toLowerCase());
	return hosts.some((host) => !allowList.some((a) => host === a || host.endsWith(`.${a}`)));
}

/**
 * True if the content is mostly uppercase. Only considers messages of at least
 * `minLength` letters, comparing uppercase letters against total letters.
 */
export function isCapsAbuse(content: string, percent: number, minLength: number): boolean {
	const letters = content.replace(/[^a-z]/gi, "");
	if (letters.length < minLength) return false;
	const upper = content.replace(/[^A-Z]/g, "").length;
	return (upper / letters.length) * 100 >= percent;
}
