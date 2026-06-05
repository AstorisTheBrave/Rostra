import { getLogger } from "@/services/logger.ts";
import type { AuditLogEvent, Guild } from "discord.js";

const log = getLogger("security:audit");

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * Resolve the executor of a destructive action from the audit log.
 * Matches an entry of `auditType` whose target is `targetId` (when given) within `ttlMs`.
 * Retries once if the log is momentarily empty (audit entries can lag the gateway event).
 * Returns the executor's user id, or null if it can't be attributed.
 */
export async function resolveAuditExecutor(
	guild: Guild,
	auditType: AuditLogEvent,
	targetId: string | null,
	ttlMs = 8000,
): Promise<string | null> {
	const find = async (): Promise<string | null> => {
		const logs = await guild.fetchAuditLogs({ limit: 5, type: auditType }).catch((err) => {
			log.warn({ err: err?.message, guild: guild.id }, "fetchAuditLogs failed");
			return null;
		});
		if (!logs) return null;
		const cutoff = Date.now() - ttlMs;
		for (const entry of logs.entries.values()) {
			if (targetId !== null) {
				const entryTargetId = (entry.target as { id?: string } | null)?.id;
				if (entryTargetId !== targetId) continue;
			}
			if (entry.createdTimestamp < cutoff) continue;
			return entry.executorId ?? null;
		}
		return null;
	};

	const first = await find();
	if (first) return first;
	await sleep(500);
	return find();
}
