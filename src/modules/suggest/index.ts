import {
	ButtonStyle,
	type ChatInputCommandInteraction,
	MessageFlags,
	PermissionFlagsBits,
	SlashCommandBuilder,
} from "discord.js";
import type { BotClient } from "@/client/BotClient.ts";
import { t } from "@/i18n/index.ts";
import { isFeatureBlocked, setFeatures } from "@/services/tenant.ts";
import type { BotModule, ComponentHandler, SlashCommand } from "@/types/module.ts";
import { Accent, actionRow, button, container, reply, text } from "@/ui";
import {
	castVote,
	createSuggestion,
	decide,
	getConfig,
	getSuggestion,
	setMessageId,
	tally,
	upsertConfig,
	type VoteTally,
} from "./service.ts";

interface RenderData {
	id: string;
	number: number;
	userId: string;
	text: string;
	status: string;
	reason: string | null;
}

const STATUS_ACCENT: Record<string, number> = {
	open: Accent.warn,
	approved: Accent.success,
	denied: Accent.error,
};

function renderSuggestion(s: RenderData, votes: VoteTally) {
	const statusLine =
		s.status === "open" ? "🕓 Open" : s.status === "approved" ? "✅ Approved" : "❌ Denied";
	const body = [
		text(`# 💡 Suggestion #${s.number}`),
		text(s.text),
		text(`Suggested by <@${s.userId}>  ·  ${statusLine}`),
	];
	if (s.reason) body.push(text(`**Staff note:** ${s.reason}`));
	body.push(text(`👍 ${votes.up}  ·  👎 ${votes.down}`));

	const components: ReturnType<typeof container>[] = [
		container(STATUS_ACCENT[s.status] ?? Accent.warn, body),
	];
	if (s.status !== "open") return components;
	return [
		...components,
		actionRow(
			button({
				id: `sug:up:${s.id}`,
				label: String(votes.up),
				emoji: "👍",
				style: ButtonStyle.Success,
			}),
			button({
				id: `sug:down:${s.id}`,
				label: String(votes.down),
				emoji: "👎",
				style: ButtonStyle.Danger,
			}),
		),
	];
}

function buildData(): SlashCommandBuilder {
	const cmd = new SlashCommandBuilder()
		.setName("suggest")
		.setDescription("Submit and manage server suggestions");
	cmd.addSubcommand((s) =>
		s
			.setName("add")
			.setDescription("Submit a suggestion")
			.addStringOption((o) =>
				o.setName("text").setDescription("Your suggestion").setRequired(true),
			),
	);
	cmd.addSubcommand((s) =>
		s
			.setName("setup")
			.setDescription("Set the suggestions channel (Manage Server)")
			.addChannelOption((o) => o.setName("channel").setDescription("Channel").setRequired(true)),
	);
	cmd.addSubcommand((s) =>
		s
			.setName("approve")
			.setDescription("Approve a suggestion (Manage Server)")
			.addIntegerOption((o) => o.setName("number").setDescription("Suggestion #").setRequired(true))
			.addStringOption((o) => o.setName("reason").setDescription("Staff note")),
	);
	cmd.addSubcommand((s) =>
		s
			.setName("deny")
			.setDescription("Deny a suggestion (Manage Server)")
			.addIntegerOption((o) => o.setName("number").setDescription("Suggestion #").setRequired(true))
			.addStringOption((o) => o.setName("reason").setDescription("Staff note")),
	);
	return cmd;
}

const isManager = (i: ChatInputCommandInteraction): boolean =>
	i.memberPermissions?.has(PermissionFlagsBits.ManageGuild) ?? false;

async function editSuggestionMessage(
	client: BotClient,
	channelId: string,
	messageId: string | null,
	data: RenderData,
): Promise<void> {
	if (!messageId) return;
	const channel = await client.channels.fetch(channelId).catch(() => null);
	if (!channel?.isTextBased() || channel.isDMBased()) return;
	const message = await channel.messages.fetch(messageId).catch(() => null);
	await message
		?.edit({
			components: renderSuggestion(data, await tally(data.id)),
			flags: MessageFlags.IsComponentsV2,
		})
		.catch(() => {});
}

async function execute({
	interaction,
	client,
}: {
	interaction: ChatInputCommandInteraction;
	client: BotClient;
}): Promise<void> {
	const guild = interaction.guild;
	if (!guild) return void reply.error(interaction, t("common:error.guildOnly"));
	const sub = interaction.options.getSubcommand();

	if (sub === "setup") {
		if (!isManager(interaction))
			return void reply.error(interaction, t("common:error.missingPermissions"));
		const channel = interaction.options.getChannel("channel", true);
		await upsertConfig(guild.id, { channelId: channel.id, enabled: true });
		await setFeatures(guild.id, { suggestions: true });
		return void reply.success(
			interaction,
			t("suggest:setupDone", { channel: `<#${channel.id}>` }),
			true,
		);
	}

	if (sub === "add") {
		if (await isFeatureBlocked(guild.id, "suggestions"))
			return void reply.error(interaction, t("suggest:off"));
		const config = await getConfig(guild.id);
		if (!config?.enabled || !config.channelId)
			return void reply.error(interaction, t("suggest:notSetup"));
		const channel = await client.channels.fetch(config.channelId).catch(() => null);
		if (!channel?.isTextBased() || channel.isDMBased())
			return void reply.error(interaction, t("suggest:notSetup"));
		const body = interaction.options.getString("text", true).slice(0, 1500);
		const suggestion = await createSuggestion({
			guildId: guild.id,
			channelId: config.channelId,
			userId: interaction.user.id,
			text: body,
		});
		const message = await channel
			.send({
				components: renderSuggestion({ ...suggestion, reason: null }, { up: 0, down: 0 }),
				flags: MessageFlags.IsComponentsV2,
			})
			.catch(() => null);
		if (message) await setMessageId(suggestion.id, message.id);
		return void reply.success(
			interaction,
			t("suggest:submitted", { number: suggestion.number }),
			true,
		);
	}

	// approve / deny
	if (!isManager(interaction))
		return void reply.error(interaction, t("common:error.missingPermissions"));
	const number = interaction.options.getInteger("number", true);
	const reason = interaction.options.getString("reason");
	const status = sub === "approve" ? "approved" : "denied";
	const updated = await decide(guild.id, number, status, reason);
	if (!updated) return void reply.error(interaction, t("suggest:notFound"));
	await editSuggestionMessage(client, updated.channelId, updated.messageId, updated);
	return void reply.success(
		interaction,
		t(sub === "approve" ? "suggest:approved" : "suggest:denied", { number }),
		true,
	);
}

const suggestComponent: ComponentHandler = {
	prefix: "sug",
	execute: async (interaction, args) => {
		if (!interaction.isButton()) return;
		const [dir, id] = args;
		if (!id) return;
		const ok = await castVote(id, interaction.user.id, dir === "up" ? 1 : -1);
		if (!ok) {
			await interaction.reply({ content: t("suggest:voteFailed"), flags: MessageFlags.Ephemeral });
			return;
		}
		const suggestion = await getSuggestion(id);
		if (!suggestion) return;
		await interaction.update({
			components: renderSuggestion(suggestion, await tally(id)),
			flags: MessageFlags.IsComponentsV2,
		});
	},
};

const suggest: BotModule = {
	name: "suggest",
	commands: [{ data: buildData(), guildOnly: true, execute } satisfies SlashCommand],
	components: [suggestComponent],
	i18n: {
		setupDone: "💡 Suggestions will be posted to {channel}. Members can use `/suggest add`.",
		submitted: "✅ Suggestion **#{number}** submitted.",
		approved: "✅ Approved suggestion **#{number}**.",
		denied: "❌ Denied suggestion **#{number}**.",
		notSetup: "Suggestions are not set up. An admin must run `/suggest setup` first.",
		notFound: "No suggestion with that number.",
		off: "Suggestions are turned off in this server.",
		voteFailed: "That suggestion is closed or no longer available.",
	},
};

export default suggest;
