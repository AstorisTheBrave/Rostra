const UNIT_MS: Record<string, number> = {
	s: 1000,
	m: 60_000,
	h: 3_600_000,
	d: 86_400_000,
	w: 604_800_000,
};

/** Discord's maximum communication timeout (28 days). */
export const MAX_TIMEOUT_MS = 28 * 86_400_000;

/**
 * Parse a duration string like "10m", "1h30m", "2d" into milliseconds.
 * Returns null when no valid unit token is found.
 */
export function parseDuration(input: string): number | null {
	const matches = input.toLowerCase().matchAll(/(\d+)\s*(s|m|h|d|w)/g);
	let total = 0;
	let found = false;
	for (const match of matches) {
		const value = Number(match[1]);
		const unit = match[2];
		if (unit && unit in UNIT_MS) {
			total += value * (UNIT_MS[unit] ?? 0);
			found = true;
		}
	}
	return found ? total : null;
}

/** Format milliseconds as a compact human string like "1d 2h 3m". */
export function formatDuration(ms: number): string {
	if (ms <= 0) return "0s";
	const parts: string[] = [];
	let remaining = ms;
	for (const unit of ["w", "d", "h", "m", "s"] as const) {
		const size = UNIT_MS[unit] ?? 0;
		const count = Math.floor(remaining / size);
		if (count > 0) {
			parts.push(`${count}${unit}`);
			remaining -= count * size;
		}
	}
	return parts.join(" ");
}
