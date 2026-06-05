import { getLogger } from "@/services/logger.ts";
import { MessageFlags, type RepliableInteraction } from "discord.js";

const log = getLogger("safeAck");

/**
 * How long to wait before auto-deferring. Discord invalidates an un-acknowledged
 * interaction after 3000ms, so we defer with a safety margin.
 */
export const DEFAULT_DEFER_AFTER_MS = 2300;

function isAcknowledged(interaction: RepliableInteraction): boolean {
	return interaction.replied || interaction.deferred;
}

/**
 * Run `fn`, guaranteeing the interaction is acknowledged before Discord's 3s deadline.
 *
 * If `fn` hasn't replied or deferred within `deferAfterMs`, the interaction is deferred
 * automatically — Discord then shows the native "thinking…" state ("Rostra is working on it")
 * and the handler's eventual reply edits that. Fast handlers reply before the timer and are
 * unaffected. Handlers that defer themselves are detected and not double-acknowledged.
 */
export async function withSafeAck(
	interaction: RepliableInteraction,
	fn: () => Promise<void>,
	opts: { ephemeral?: boolean; deferAfterMs?: number } = {},
): Promise<void> {
	const timer = setTimeout(() => {
		if (isAcknowledged(interaction)) return;
		const deferOptions: { flags?: MessageFlags.Ephemeral } = opts.ephemeral
			? { flags: MessageFlags.Ephemeral }
			: {};
		void interaction.deferReply(deferOptions).catch((err) => {
			// The interaction may have been acknowledged in the same tick, or already expired.
			log.debug({ err }, "auto-defer skipped");
		});
	}, opts.deferAfterMs ?? DEFAULT_DEFER_AFTER_MS);

	try {
		await fn();
	} finally {
		clearTimeout(timer);
	}
}
