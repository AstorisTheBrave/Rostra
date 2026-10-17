const INVITE_RE = /(?:discord\.gg|discord(?:app)?\.com\/invite|discord\.me)\/\S+/i;
const URL_RE = /https?:\/\/([^\s/]+)/gi;

// Homoglyph folding for bypass-resistant matching: characters NFKD cannot resolve
// to ASCII (Cyrillic/Greek look-alikes, currency symbols used as letters).
const HOMOGLYPHS: Record<string, string> = {
	а: "a",
	е: "e",
	і: "i",
	о: "o",
	р: "r",
	с: "c",
	у: "y",
	х: "x",
	в: "b",
	м: "m",
	н: "n",
	т: "t",
	г: "g",
	к: "k",
	п: "p",
	з: "z",
	α: "a",
	ε: "e",
	ι: "i",
	ο: "o",
	"¥": "y",
	"€": "e",
	"£": "l",
	$: "s",
	"@": "a",
};

/**
 * Sledgehammer normaliser for slur matching: fold homoglyphs, strip every
 * non-letter, lowercase. "k,#y;;S" and "kуs" (Cyrillic) both collapse to "kys",
 * defeating spacing/punctuation/leet/look-alike bypasses.
 */
function slugify(text: string): string {
	return text
		.normalize("NFKD")
		.split("")
		.map((c) => HOMOGLYPHS[c] ?? c)
		.join("")
		.toLowerCase()
		.replace(/[^a-z]/g, "");
}

// Slur / hate roots, matched against both the raw lowercased text and the
// non-letter-stripped slug so padded variants are caught. Leet classes inline.
const HATE_PATTERNS: RegExp[] = [
	/f[a4@]gg?[o0]t/,
	/n[i1!]gg[ae3]r?/,
	/tr[a4@]nn[y1]/,
	/k[i1!]ke/,
	/r[e3]t[a4@]rd/,
	/ch[i1!]nk/,
	/sp[i1!]c\b/,
	/w[e3]tb[a4@]ck/,
	/s[a4@]ndn[i1!]gg/,
	/wh[i1!]t[e3]p[o0]w[e3]r/,
];

/** True if the content contains a slur / hate-speech root (bypass-resistant). */
export function hasHateSpeech(content: string): boolean {
	const lower = content.toLowerCase();
	const slug = slugify(content);
	return HATE_PATTERNS.some((re) => re.test(lower) || re.test(slug));
}

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
