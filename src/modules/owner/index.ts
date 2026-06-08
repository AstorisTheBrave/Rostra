import { type ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import type { BotClient } from "@/client/BotClient.ts";
import { config } from "@/config.ts";
import { t } from "@/i18n/index.ts";
import { isDeclared, listFeatures, setFeatureLive } from "@/services/featureFlags.ts";
import type { BotModule, SlashCommand } from "@/types/module.ts";
import { Accent, container, reply, text } from "@/ui";

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

async function execute({
	interaction,
}: {
	interaction: ChatInputCommandInteraction;
	client: BotClient;
}): Promise<void> {
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
	await setFeatureLive(name, enabled);
	return void reply.success(
		interaction,
		t(enabled ? "owner:feature.on" : "owner:feature.off", { name }),
		true,
	);
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
		"feature.on": "🟢 **{name}** is now **on** fleet-wide.",
		"feature.off": "🔴 **{name}** is now **off** fleet-wide (kill-switch active).",
	},
};

export default owner;
