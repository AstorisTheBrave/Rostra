import type { Client, Message } from "discord.js";
import { defineEvent } from "@/client/defineEvent.ts";
import { getLogger } from "@/services/logger.ts";
import { isFeatureBlocked } from "@/services/tenant.ts";
import type { RegisteredEvent } from "@/types/module.ts";
import {
	findModmailTarget,
	getThreadByChannel,
	isStaffNote,
	type ModmailUser,
	relayBody,
	relayUserMessage,
} from "./service.ts";

const log = getLogger("modmail");

interface RelayPayload {
	guildId: string;
	user: ModmailUser;
	content: string;
	attachments: string[];
}

/** Cross-shard entrypoint: registered on every shard's process so a DM received
 * on shard 0 can be relayed by whichever shard actually owns the target guild. */
interface ModmailGlobal {
	relay: (client: Client, payload: RelayPayload) => Promise<boolean>;
}
const g = globalThis as unknown as { __rostraModmail?: ModmailGlobal };
g.__rostraModmail = {
	relay: (client, p) => relayUserMessage(client, p.guildId, p.user, p.content, p.attachments),
};

const attachmentUrls = (message: Message): string[] =>
	[...message.attachments.values()].map((a) => a.url);

/** A user DMing the bot opens (or continues) a modmail thread in a mutual guild. */
async function handleUserDm(client: Client, message: Message): Promise<void> {
	const user = message.author;
	const target = await findModmailTarget(client, user.id);
	if (!target) return; // no mutual guild with modmail enabled, on any shard

	const payload: RelayPayload = {
		guildId: target.guildId,
		user: { id: user.id, tag: user.tag, username: user.username },
		content: message.content ?? "",
		attachments: attachmentUrls(message),
	};

	let ok: boolean;
	const localShard = client.shard?.ids[0] ?? 0;
	if (!client.shard || target.shardId === localShard) {
		// This shard owns the guild; relay directly.
		ok = await relayUserMessage(
			client,
			payload.guildId,
			payload.user,
			payload.content,
			payload.attachments,
		);
	} else {
		// Hand off to the owning shard's registered relay (single-shard eval => single result).
		const result = (await client.shard.broadcastEval(
			(c, p) =>
				(globalThis as unknown as { __rostraModmail: ModmailGlobal }).__rostraModmail.relay(c, p),
			{ shard: target.shardId, context: payload },
		)) as unknown as boolean;
		ok = result === true;
	}
	await message.react(ok ? "✅" : "⚠️").catch(() => {});
}

/** Staff replying in a modmail thread relays back to the user's DMs. */
async function handleStaffReply(message: Message): Promise<void> {
	if (!message.inGuild() || !message.channel.isThread()) return;
	const record = await getThreadByChannel(message.channelId);
	if (!record?.open) return;
	if (await isFeatureBlocked(message.guildId, "modmail")) return;
	if (isStaffNote(message.content)) return; // internal note, not relayed
	const user = await message.client.users.fetch(record.userId).catch(() => null);
	if (!user) return;
	const label = `${message.guild.name} staff`;
	try {
		await user.send(relayBody(label, message.content ?? "", attachmentUrls(message)));
		await message.react("📨").catch(() => {});
	} catch {
		await message.react("⚠️").catch(() => {}); // user has DMs closed or left
	}
}

export const modmailEvents: RegisteredEvent[] = [
	defineEvent("messageCreate", {
		execute: async (client, message) => {
			try {
				if (message.partial) message = await message.fetch();
				if (message.author.bot) return;
				if (message.inGuild()) await handleStaffReply(message);
				else await handleUserDm(client, message);
			} catch (err) {
				log.error({ err }, "modmail message handling failed");
			}
		},
	}),
];
