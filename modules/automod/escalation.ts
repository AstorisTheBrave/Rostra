// Severity-weighted automod escalation. Each prior automod offense carries points
// by severity; the cumulative total (including the current offense) decides the
// action. Weights are chosen so KICK lands at exactly 3 HIGH / 5 MEDIUM / 7 LOW.
// Hard rule: a first offense never escalates past TIMEOUT, no matter the points.

export type Severity = "LOW" | "MEDIUM" | "HIGH";
export type AutomodAction = "WARN" | "TIMEOUT" | "KICK" | "BAN";

export interface EscalationConfig {
	/** Points each severity contributes to the running total. */
	points: Record<Severity, number>;
	/** Cumulative-point thresholds for each escalating action. */
	timeoutPoints: number;
	kickPoints: number;
	banPoints: number;
	/** Timeout length applied (by the current offense's severity) when the action is TIMEOUT. */
	timeoutMsBySeverity: Record<Severity, number>;
}

const HOUR = 60 * 60 * 1000;

export const DEFAULT_ESCALATION: EscalationConfig = {
	points: { LOW: 15, MEDIUM: 21, HIGH: 35 },
	timeoutPoints: 35, // 1 HIGH, 2 MEDIUM, or 3 LOW
	kickPoints: 105, // 3 HIGH, 5 MEDIUM, or 7 LOW
	banPoints: 175, // 5 HIGH (~9 MEDIUM, ~12 LOW)
	timeoutMsBySeverity: { LOW: 1 * HOUR, MEDIUM: 6 * HOUR, HIGH: 24 * HOUR },
};

export interface EscalationResult {
	action: AutomodAction;
	totalPoints: number;
	offenseCount: number;
	/** Timeout length in ms when action is TIMEOUT, else null. */
	timeoutMs: number | null;
}

/**
 * Decide the automod action for the current offense given the user's prior active
 * automod offenses (their severities). Severity-weighted, and never KICK/BAN on a
 * first offense.
 */
export function resolveEscalation(
	priorSeverities: Severity[],
	current: Severity,
	cfg: EscalationConfig = DEFAULT_ESCALATION,
): EscalationResult {
	const offenseCount = priorSeverities.length + 1;
	const totalPoints =
		priorSeverities.reduce((sum, s) => sum + cfg.points[s], 0) + cfg.points[current];

	let action: AutomodAction;
	if (totalPoints >= cfg.banPoints) action = "BAN";
	else if (totalPoints >= cfg.kickPoints) action = "KICK";
	else if (totalPoints >= cfg.timeoutPoints) action = "TIMEOUT";
	else action = "WARN";

	// Hard rule: never kick or ban on the first offense, no matter the points.
	if (offenseCount <= 1 && (action === "KICK" || action === "BAN")) {
		action = "TIMEOUT";
	}

	return {
		action,
		totalPoints,
		offenseCount,
		timeoutMs: action === "TIMEOUT" ? cfg.timeoutMsBySeverity[current] : null,
	};
}
