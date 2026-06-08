import { type ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import type { BotClient } from "@/client/BotClient.ts";
import { t } from "@/i18n/index.ts";
import { SUPPORTED_LOCALES } from "@/i18n/locales.ts";
import {
	getUserPreference,
	setUserFeature,
	setUserLocale,
	type UserFeature,
} from "@/services/localization.ts";
import type { BotModule, SlashCommand } from "@/types/module.ts";
import { Accent, container, reply, text } from "@/ui";

// Language choices: "auto" (follow server / Discord) plus every supported locale.
const LANG_CHOICES = [
	{ name: "Auto (follow server)", value: "auto" },
	...Object.values(SUPPORTED_LOCALES).map((l) => ({
		name: `${l.native} (${l.name})`.slice(0, 100),
		value: l.code,
	})),
];

const FEATURES: { name: string; value: UserFeature }[] = [
	{ name: "Fun & social (ship, fight, roleplay)", value: "fun" },
	{ name: "Bot DM notifications", value: "dmNotifications" },
	{ name: "Public profile", value: "profilePublic" },
	{ name: "Public reputation", value: "reputationPublic" },
	{ name: "Matchmaking / social", value: "matchmaking" },
	{ name: "Achievement notifications", value: "achievementNotifications" },
];

function buildData(): SlashCommandBuilder {
	const cmd = new SlashCommandBuilder()
		.setName("preferences")
		.setDescription("Your personal Rostra settings (language and features)")
		.setDMPermission(true);
	cmd.addSubcommand((s) =>
		s
			.setName("language")
			.setDescription("Set your preferred language for bot messages")
			.addStringOption((o) =>
				o
					.setName("language")
					.setDescription("Language (Auto = follow the server)")
					.setRequired(true)
					.addChoices(...LANG_CHOICES),
			),
	);
	cmd.addSubcommand((s) =>
		s
			.setName("feature")
			.setDescription("Opt in or out of a personal feature")
			.addStringOption((o) =>
				o
					.setName("feature")
					.setDescription("Which feature")
					.setRequired(true)
					.addChoices(...FEATURES.map((f) => ({ name: f.name, value: f.value }))),
			)
			.addBooleanOption((o) =>
				o.setName("enabled").setDescription("On (opt in) or off (opt out)").setRequired(true),
			),
	);
	cmd.addSubcommand((s) => s.setName("view").setDescription("Show your current preferences"));
	return cmd;
}

async function execute({
	interaction,
}: {
	interaction: ChatInputCommandInteraction;
	client: BotClient;
}): Promise<void> {
	const sub = interaction.options.getSubcommand();
	const uid = interaction.user.id;

	switch (sub) {
		case "language": {
			const value = interaction.options.getString("language", true);
			await setUserLocale(uid, value === "auto" ? null : value);
			const label =
				value === "auto" ? t("preferences:auto") : (SUPPORTED_LOCALES[value]?.native ?? value);
			return void reply.success(
				interaction,
				t("preferences:languageSet", { language: label }),
				true,
			);
		}
		case "feature": {
			const feature = interaction.options.getString("feature", true) as UserFeature;
			const enabled = interaction.options.getBoolean("enabled", true);
			await setUserFeature(uid, feature, enabled);
			const name = FEATURES.find((f) => f.value === feature)?.name ?? feature;
			return void reply.success(
				interaction,
				t(enabled ? "preferences:featureOn" : "preferences:featureOff", { feature: name }),
				true,
			);
		}
		default: {
			const pref = await getUserPreference(uid);
			const features = (pref.features as Record<string, boolean> | null) ?? {};
			const lang = pref.locale
				? (SUPPORTED_LOCALES[pref.locale]?.native ?? pref.locale)
				: t("preferences:auto");
			const lines = FEATURES.map((f) => `${features[f.value] === false ? "❌" : "✅"} ${f.name}`);
			return void reply.components(
				interaction,
				[
					container(Accent.info, [
						text(t("preferences:view.title")),
						text(t("preferences:view.language", { language: lang })),
						text(lines.join("\n")),
					]),
				],
				true,
			);
		}
	}
}

const preferences: BotModule = {
	name: "preferences",
	commands: [{ data: buildData(), guildOnly: false, execute } satisfies SlashCommand],
	i18n: {
		auto: "Auto (follow the server)",
		languageSet: "🌐 Your language is now **{language}**.",
		featureOn: "✅ Enabled **{feature}** for your account.",
		featureOff: "🚫 Disabled **{feature}** for your account.",
		"view.title": "# ⚙️ Your preferences",
		"view.language": "**Language:** {language}",
	},
};

export default preferences;
