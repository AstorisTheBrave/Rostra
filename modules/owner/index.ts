import { config } from "@rostra/config";
import { Accent, container, reply, text } from "@rostra/discord-ui";
import { t } from "@rostra/i18n";
import { type ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import type { BotClient } from "@/client/BotClient.ts";
import { isDeclared, listFeatures, setFeatureLive } from "@/services/featureFlags.ts";
import type { BotModule, SlashCommand } from "@/types/module.ts";

function buildData(): SlashCommandBuilder {
	const cmd = new SlashCommandBuilder()
		.setName("owner")
		.setDescription("Bot-owner controls")
		.setDMPermission(true);
	cmd.addSubcommandGroup((g) =>
		g
			.setName("feature")
			.setDescription("Global feature flags (live, no restart)")
			.addSubcommand((s) => s.setName("list").setDescription("List all feature flags"))
			.addSubcommand((s) =>
				s
					.setName("set")
					.setDescription("Flip a feature on or off fleet-wide")
					.addStringOption((o) =>
						o
							.setName("name")
							.setDescription("Feature name")
							.setRequired(true)
							.setAutocomplete(true),
					)
					.addBooleanOption((o) =>
						o.setName("enabled").setDescription("On or off").setRequired(true),
					),
			),
	);
	return cmd;
}

const isOwner = (userId: string): boolean => config.discord.ownerIds.includes(userId);

export async function execute(
	{
		interaction,
	}: {
		interaction: ChatInputCommandInteraction;
		client: BotClient;
	},
	write = setFeatureLive,
): Promise<void> {
	if (!isOwner(interaction.user.id)) return void reply.error(interaction, t("owner:notOwner"));
	const sub = interaction.options.getSubcommand();

	if (sub === "list") {
		const features = listFeatures();
		if (features.length === 0)
			return void reply.success(interaction, t("owner:feature.none"), true);
		const lines = features.map(
			(f) => `${f.live ? "🟢" : "🔴"} **${f.name}** (default: ${f.default ? "on" : "off"})`,
		);
		return void reply.components(
			interaction,
			[container(Accent.info, [text(t("owner:feature.title")), text(lines.join("\n"))])],
			true,
		);
	}

	// set
	const name = interaction.options.getString("name", true);
	const enabled = interaction.options.getBoolean("enabled", true);
	if (!isDeclared(name)) return void reply.error(interaction, t("owner:feature.unknown", { name }));
	try {
		const outcome = await write(name, enabled);
		if (outcome.status === "ttl-fallback")
			return void reply.error(interaction, t("owner:feature.degraded", { name }), true);
		return void reply.success(
			interaction,
			t(enabled ? "owner:feature.on" : "owner:feature.off", { name }),
			true,
		);
	} catch {
		return void reply.error(interaction, t("owner:feature.failed", { name }), true);
	}
}

const ownerCommand: SlashCommand = {
	data: buildData(),
	guildOnly: false,
	execute,
	autocomplete: async (interaction) => {
		if (!isOwner(interaction.user.id)) return void interaction.respond([]);
		const focused = interaction.options.getFocused().toLowerCase();
		const choices = listFeatures()
			.map((f) => f.name)
			.filter((n) => n.toLowerCase().includes(focused))
			.slice(0, 25)
			.map((n) => ({ name: n, value: n }));
		await interaction.respond(choices);
	},
};

const owner: BotModule = {
	name: "owner",
	commands: [ownerCommand],
	i18n: {
		notOwner: "This command is for the bot owner only.",
		"feature.title": "# 🎚️ Feature flags",
		"feature.none": "No features registered yet.",
		"feature.unknown": "No feature named **{name}**.",
		"feature.on": "🟢 **{name}** is on here. The fleet update was accepted for delivery.",
		"feature.off": "🔴 **{name}** is off here. The fleet update was accepted for delivery.",
		"feature.degraded":
			"**{name}** was saved and changed here, but delivery to other shards is delayed. Check their state before relying on this switch.",
		"feature.failed": "I couldn't save **{name}**. Its state was not changed.",
	},
};

export default owner;
