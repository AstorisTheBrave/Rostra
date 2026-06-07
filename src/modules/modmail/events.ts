import type { Client, Message, ThreadChannel } from "discord.js";
import { defineEvent } from "@/client/defineEvent.ts";
import { getLogger } from "@/services/logger.ts";
import { isFeatureBlocked } from "@/services/tenant.ts";
import type { RegisteredEvent } from "@/types/module.ts";
import {
	closeThread,
	createThread,
	findModmailGuild,
	getConfig,
	getOpenThreadByUser,
	getThreadByChannel,
	isStaffNote,
	relayBody,
} from "./service.ts";

const log = getLogger("modmail");

const attachmentUrls = (message: Message): string[] =>
	[...message.attachments.values()].map((a) => a.url);

/** A user DMing the bot opens (or continues) a modmail thread in a mutual guild. */
async function handleUserDm(client: Client, message: Message): Promise<void> {
	const user = message.author;
	const guild = await findModmailGuild(client, user);
	if (!guild) return; // no mutual guild with modmail enabled (on this shard)
	const config = await getConfig(guild.id);
	if (!config?.channelId) return;

	const record = await getOpenThreadByUser(guild.id, user.id);
	let thread: ThreadChannel | null = null;
	if (record) {
		const existing = await guild.channels.fetch(record.channelId).catch(() => null);
		thread = existing?.isThread() ? existing : null;
		if (!thread || thread.archived) {
			await closeThread(record.channelId).catch(() => {});
			thread = null;
		}
	}
	if (!thread) {
		thread = await createThread(guild, config, user);
		if (!thread) return void message.react("⚠️").catch(() => {});
		await thread
			.send(
				`# 📬 New modmail\n**From:** ${user.tag} (\`${user.id}\`)\nReply here to message them. Lines starting with \`//\` stay internal.`,
			)
			.catch(() => {});
	}
	await thread
		.send(relayBody(user.username, message.content ?? "", attachmentUrls(message)))
		.catch(() => {});
	await message.react("✅").catch(() => {});
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
