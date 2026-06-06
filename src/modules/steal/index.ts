import {
	type ChatInputCommandInteraction,
	PermissionFlagsBits,
	SlashCommandBuilder,
} from "discord.js";
import type { BotClient } from "@/client/BotClient.ts";
import { t } from "@/i18n/index.ts";
import type { BotModule, SlashCommand } from "@/types/module.ts";
import { Accent, container, reply, text } from "@/ui";
import { emojiCdnUrl, parseCustomEmojis, sanitizeEmojiName } from "./service.ts";

const MAX_PER_CALL = 10;

function buildData(): SlashCommandBuilder {
	const cmd = new SlashCommandBuilder()
		.setName("steal")
		.setDescription("Add custom emojis from a message to this server");
	cmd.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuildExpressions);
	cmd.addStringOption((o) =>
		o.setName("emoji").setDescription("Paste one or more custom emojis").setRequired(true),
	);
	cmd.addStringOption((o) =>
		o.setName("name").setDescription("Name for the emoji (only when stealing one)"),
	);
	return cmd;
}

async function execute({
	interaction,
}: {
	interaction: ChatInputCommandInteraction;
	client: BotClient;
}): Promise<void> {
	const guild = interaction.guild;
	if (!guild) return void reply.error(interaction, t("common:error.guildOnly"));

	const parsed = parseCustomEmojis(interaction.options.getString("emoji", true));
	if (parsed.length === 0) return void reply.error(interaction, t("steal:error.none"));

	const customName = interaction.options.getString("name");
	const targets =
		customName && parsed.length === 1 && parsed[0]
			? [{ ...parsed[0], name: customName }]
			: parsed.slice(0, MAX_PER_CALL);

	const created: string[] = [];
	const failed: string[] = [];
	for (const emoji of targets) {
		try {
			const made = await guild.emojis.create({
				attachment: emojiCdnUrl(emoji.id, emoji.animated),
				name: sanitizeEmojiName(emoji.name),
			});
			created.push(made.toString());
		} catch {
			failed.push(emoji.name);
		}
	}

	if (created.length === 0) return void reply.error(interaction, t("steal:error.failed"));
	const lines = [t("steal:added", { emojis: created.join(" ") })];
	if (failed.length > 0) lines.push(t("steal:failedSome", { names: failed.join(", ") }));
	await reply.components(interaction, [container(Accent.success, [text(lines.join("\n"))])]);
}

const stealCommand: SlashCommand = {
	data: buildData(),
	guildOnly: true,
	userPermissions: [PermissionFlagsBits.ManageGuildExpressions],
	botPermissions: [PermissionFlagsBits.ManageGuildExpressions],
	execute,
};

const steal: BotModule = {
	name: "steal",
	commands: [stealCommand],
	i18n: {
		added: "✅ Added: {emojis}",
		failedSome: "⚠️ Could not add: {names}",
		"error.none": "No custom emojis found in that input. Paste a custom emoji like `<:name:id>`.",
		"error.failed":
			"Could not add any of those (maybe the emoji slots are full or I lack permission).",
	},
};

export default steal;
