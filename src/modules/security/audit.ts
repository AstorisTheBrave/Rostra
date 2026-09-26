import type { AuditLogEvent, Guild } from "discord.js";
import { getLogger } from "@/services/logger.ts";

const log = getLogger("security:audit");

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * Resolve the executor of a destructive action from the audit log.
 * Matches the newest entry of one or more audit types whose target is `targetId`
 * (when given) within `ttlMs`. Retries once if the log is momentarily empty
 * because audit entries can lag the gateway event.
 */
export async function resolveAuditExecutor(
	guild: Guild,
	auditType: AuditLogEvent | readonly AuditLogEvent[],
	targetId: string | null,
	ttlMs = 8000,
): Promise<string | null> {
	const types = Array.isArray(auditType) ? auditType : [auditType];
	const find = async (): Promise<string | null> => {
		const cutoff = Date.now() - ttlMs;
		const candidates: { executorId: string; createdTimestamp: number }[] = [];

		await Promise.all(
			types.map(async (type) => {
				const logs = await guild.fetchAuditLogs({ limit: 5, type }).catch((err) => {
					log.warn({ err: err?.message, guild: guild.id, type }, "fetchAuditLogs failed");
					return null;
				});
				if (!logs) return;
				for (const entry of logs.entries.values()) {
					if (targetId !== null) {
						const entryTargetId = (entry.target as { id?: string } | null)?.id;
						if (entryTargetId !== targetId) continue;
					}
					if (entry.createdTimestamp < cutoff || !entry.executorId) continue;
					candidates.push({
						executorId: entry.executorId,
						createdTimestamp: entry.createdTimestamp,
					});
				}
			}),
		);

		candidates.sort((a, b) => b.createdTimestamp - a.createdTimestamp);
		return candidates[0]?.executorId ?? null;
	};

	const first = await find();
	if (first) return first;
	await sleep(500);
	return find();
}
