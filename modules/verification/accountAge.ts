// Derive a Discord account's age from its snowflake id - the cheapest ban-evasion
// signal there is. The creation timestamp is encoded in the id, so no API call is
// needed. A freshly created account joining moments after a ban is almost always
// an evader.

// First millisecond of 2015, the epoch all Discord snowflakes are offset from.
const DISCORD_EPOCH = 1420070400000n;

/** Account creation Date from a snowflake id, or null if the id is malformed. */
export function accountCreatedAt(userId: string): Date | null {
	if (!/^\d{17,20}$/.test(userId)) return null;
	const ms = (BigInt(userId) >> 22n) + DISCORD_EPOCH;
	return new Date(Number(ms));
}

/**
 * Account age in days (fractional). Returns Infinity for an unparseable id so a
 * malformed snowflake can never trip a "too new" gate.
 */
export function accountAgeDays(userId: string, now = Date.now()): number {
	const created = accountCreatedAt(userId);
	if (!created) return Number.POSITIVE_INFINITY;
	return (now - created.getTime()) / 86_400_000;
}

/** The date an account becomes old enough to pass a `minDays` gate, or null. */
export function eligibleAt(userId: string, minDays: number): Date | null {
	const created = accountCreatedAt(userId);
	if (!created) return null;
	return new Date(created.getTime() + minDays * 86_400_000);
}
