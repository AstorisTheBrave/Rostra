// Pure ticket primitives: priority levels, the state machine, category queues, and
// channel-naming helpers. No DB, no Discord client - just data and small transforms,
// so the lifecycle and the monitor can share one source of truth. Adapted and
// generalised from Anastasia's ticket queue (community-specific queues dropped).

export type TicketPriority = "LOW" | "NORMAL" | "HIGH" | "URGENT";
export type TicketState = "OPEN" | "CLAIMED" | "ESCALATED" | "RESOLVED" | "CLOSED";

export const PRIORITY_ORDER: TicketPriority[] = ["LOW", "NORMAL", "HIGH", "URGENT"];
export const PRIORITY_COLOR: Record<TicketPriority, number> = {
	LOW: 0x95a5a6,
	NORMAL: 0x5865f2,
	HIGH: 0xe67e22,
	URGENT: 0xe74c3c,
};
export const PRIORITY_EMOJI: Record<TicketPriority, string> = {
	LOW: "🔵",
	NORMAL: "⚪",
	HIGH: "🟠",
	URGENT: "🔴",
};
export const STATE_EMOJI: Record<TicketState, string> = {
	OPEN: "📬",
	CLAIMED: "👤",
	ESCALATED: "🚨",
	RESOLVED: "✅",
	CLOSED: "🔒",
};

// Allowed state transitions. A closed ticket is terminal here (reopen is a fresh row).
const TRANSITIONS: Record<TicketState, TicketState[]> = {
	OPEN: ["CLAIMED", "ESCALATED", "CLOSED"],
	CLAIMED: ["OPEN", "ESCALATED", "RESOLVED", "CLOSED"],
	ESCALATED: ["CLAIMED", "RESOLVED", "CLOSED"],
	RESOLVED: ["OPEN", "CLOSED"],
	CLOSED: [],
};

export function canTransition(from: TicketState, to: TicketState): boolean {
	return TRANSITIONS[from]?.includes(to) ?? false;
}

/** Bump a priority up one level, capped at URGENT. */
export function escalatePriority(p: TicketPriority): TicketPriority {
	const i = PRIORITY_ORDER.indexOf(p);
	if (i < 0) return "NORMAL";
	return PRIORITY_ORDER[Math.min(i + 1, PRIORITY_ORDER.length - 1)] ?? "URGENT";
}

export interface CategorySpec {
	key: string;
	label: string;
	emoji: string;
	/** Minutes before the ticket is considered SLA-breached. */
	slaMinutes: number;
}

const GENERAL: CategorySpec = {
	key: "general",
	label: "General Help",
	emoji: "❓",
	slaMinutes: 60,
};

export const DEFAULT_CATEGORIES: CategorySpec[] = [
	GENERAL,
	{ key: "support", label: "Support", emoji: "💬", slaMinutes: 60 },
	{ key: "appeal", label: "Appeal", emoji: "⚖️", slaMinutes: 120 },
	{ key: "bug", label: "Bug Report", emoji: "🐛", slaMinutes: 240 },
];

export function categoryByKey(key: string): CategorySpec {
	return DEFAULT_CATEGORIES.find((c) => c.key === key) ?? GENERAL;
}

/** Sanitise a raw stored category list into specs; empty/invalid falls back to defaults. */
export function parseCategories(raw: unknown): CategorySpec[] {
	if (!Array.isArray(raw) || raw.length === 0) return DEFAULT_CATEGORIES;
	const out: CategorySpec[] = [];
	for (const item of raw) {
		if (!item || typeof item !== "object") continue;
		const c = item as Record<string, unknown>;
		if (typeof c.key !== "string") continue;
		const key = c.key
			.toLowerCase()
			.replace(/[^a-z0-9]/g, "")
			.slice(0, 20);
		if (!key) continue;
		out.push({
			key,
			label: typeof c.label === "string" && c.label ? c.label.slice(0, 40) : key,
			emoji: typeof c.emoji === "string" && c.emoji ? c.emoji : "🎫",
			slaMinutes:
				typeof c.slaMinutes === "number" && c.slaMinutes > 0
					? Math.min(Math.floor(c.slaMinutes), 10_080)
					: 60,
		});
	}
	return out.length ? out.slice(0, 5) : DEFAULT_CATEGORIES; // panel button row caps at 5
}

/** Resolve a category key against a specific list, falling back to its first entry. */
export function resolveCategory(categories: CategorySpec[], key: string): CategorySpec {
	return categories.find((c) => c.key === key) ?? categories[0] ?? GENERAL;
}

export const PRIORITY_SUFFIX: Record<TicketPriority, string> = {
	LOW: "-l",
	NORMAL: "",
	HIGH: "-h",
	URGENT: "-u",
};

/**
 * Channel name for a ticket: `{slug}-{NNNN}{prioritySuffix}`, e.g. `jane-0007-h`.
 * The slug is the username folded to lowercase a-z0-9, capped so the whole name
 * stays under Discord's 100-char channel limit.
 */
export function ticketChannelName(
	username: string,
	number: number,
	priority: TicketPriority,
): string {
	const slug =
		username
			.toLowerCase()
			.replace(/[^a-z0-9]/g, "")
			.slice(0, 20) || "user";
	return `${slug}-${String(number).padStart(4, "0")}${PRIORITY_SUFFIX[priority]}`.slice(0, 95);
}

export const fmtPriority = (p: TicketPriority): string => p.charAt(0) + p.slice(1).toLowerCase();
export const fmtState = (s: TicketState): string => s.charAt(0) + s.slice(1).toLowerCase();

/** How long a closed ticket channel stays archived before deletion (reopen window). */
export const REOPEN_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
