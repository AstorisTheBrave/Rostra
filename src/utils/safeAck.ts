import {
	type InteractionEditReplyOptions,
	MessageFlags,
	type RepliableInteraction,
} from "discord.js";
import { getLogger } from "@/services/logger.ts";
import { Accent, buildResponse, container, text } from "@/utils/components.ts";

const log = getLogger("safeAck");

/**
 * How long to wait before auto-deferring. Discord invalidates an un-acknowledged
 * interaction after 3000ms, so we defer with a safety margin.
 */
export const DEFAULT_DEFER_AFTER_MS = 2300;

/** Default gap between "still working…" heartbeat edits. */
export const DEFAULT_HEARTBEAT_MS = 8000;

/** An interaction token lives ~15 min; we stop promising progress shortly before that. */
const TOKEN_SOFT_LIMIT_MS = 14 * 60 * 1000;

function isAcknowledged(interaction: RepliableInteraction): boolean {
	return interaction.replied || interaction.deferred;
}

export interface SafeAckOptions {
	/** Defer (and any heartbeat) ephemerally. */
	ephemeral?: boolean;
	/** Override the auto-defer delay (mainly for tests). */
	deferAfterMs?: number;
	/** Emit periodic "still working…" edits for genuinely long-running handlers. */
	heartbeat?: boolean;
	/** Override the heartbeat interval. */
	heartbeatMs?: number;
}

/**
 * Run `fn`, guaranteeing the interaction is acknowledged before Discord's 3s deadline.
 *
 * If `fn` hasn't replied or deferred within `deferAfterMs`, the interaction is deferred
 * automatically - Discord shows the native "thinking…" state and the handler's eventual reply
 * edits it. Fast handlers reply first and are unaffected. Handlers that defer themselves are
 * detected and never double-acknowledged.
 *
 * With `heartbeat: true`, long-running handlers also get periodic "Rostra is still working…"
 * updates so the user knows it's alive, and a graceful note as the ~15-minute token nears expiry.
 */
export async function withSafeAck(
	interaction: RepliableInteraction,
	fn: () => Promise<void>,
	opts: SafeAckOptions = {},
): Promise<void> {
	const startedAt = Date.now();
	let finished = false;

	const ensureDeferred = async (): Promise<void> => {
		if (isAcknowledged(interaction)) return;
		const deferOptions: { flags?: MessageFlags.Ephemeral } = opts.ephemeral
			? { flags: MessageFlags.Ephemeral }
			: {};
		await interaction
			.deferReply(deferOptions)
			.catch((err) => log.debug({ err }, "auto-defer skipped"));
	};

	const deferTimer = setTimeout(
		() => void ensureDeferred(),
		opts.deferAfterMs ?? DEFAULT_DEFER_AFTER_MS,
	);

	let heartbeatTimer: NodeJS.Timeout | undefined;
	if (opts.heartbeat) {
		heartbeatTimer = setInterval(() => {
			if (finished) return;
			void (async () => {
				await ensureDeferred();
				if (finished) return;
				const elapsedMs = Date.now() - startedAt;
				const message =
					elapsedMs >= TOKEN_SOFT_LIMIT_MS
						? "⌛ This is taking unusually long - still working on it…"
						: `⏳ Rostra is still working on it… (${Math.round(elapsedMs / 1000)}s)`;
				const payload = buildResponse([container(Accent.info, [text(message)])], {
					ephemeral: opts.ephemeral,
				});
				await interaction
					.editReply(payload as unknown as InteractionEditReplyOptions)
					.catch(() => {});
			})();
		}, opts.heartbeatMs ?? DEFAULT_HEARTBEAT_MS);
	}

	try {
		await fn();
	} finally {
		finished = true;
		clearTimeout(deferTimer);
		if (heartbeatTimer) clearInterval(heartbeatTimer);
	}
}
