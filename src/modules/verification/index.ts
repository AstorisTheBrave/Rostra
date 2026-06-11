import {
	type ButtonInteraction,
	ButtonStyle,
	type ChatInputCommandInteraction,
	GuildMember,
	MessageFlags,
	PermissionFlagsBits,
	SlashCommandBuilder,
} from "discord.js";
import type { BotClient } from "@/client/BotClient.ts";
import { t } from "@/i18n/index.ts";
import { registerTaskHandler } from "@/services/scheduler.ts";
import { isFeatureBlocked } from "@/services/tenant.ts";
import type { BotModule, ComponentHandler, SlashCommand } from "@/types/module.ts";
import { Accent, actionRow, button, container, reply, text } from "@/ui";
import { makeCaptcha } from "./captcha.ts";
import { VERIFY_KICK, verificationEvents, verifyKickTask } from "./events.ts";
import { getConfig, upsertConfig } from "./service.ts";

// Register the durable auto-kick handler at module load (before boot recovery).
registerTaskHandler(VERIFY_KICK, verifyKickTask);

function verifyPanel() {
	return [
		container(Accent.success, [
			text(t("verification:panel.title")),
			text(t("verification:panel.body")),
		]),
		actionRow(
			button({
				id: "verify:go",
				label: t("verification:panel.button"),
				emoji: "✅",
				style: ButtonStyle.Success,
			}),
		),
	];
}

function buildData(): SlashCommandBuilder {
	const cmd = new SlashCommandBuilder()
		.setName("verification")
		.setDescription("Gate your server behind a verify button")
		.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);
	cmd.addSubcommand((s) =>
		s
			.setName("setup")
			.setDescription("Set the role members get when they verify")
			.addRoleOption((o) => o.setName("role").setDescription("Verified role").setRequired(true)),
	);
	cmd.addSubcommand((s) =>
		s.setName("panel").setDescription("Post the verification panel in this channel"),
	);
	cmd.addSubcommand((s) =>
		s
			.setName("captcha")
			.setDescription("Require a simple math captcha before verifying")
			.addBooleanOption((o) => o.setName("enabled").setDescription("On or off").setRequired(true)),
	);
	cmd.addSubcommand((s) =>
		s
			.setName("autokick")
			.setDescription("Kick members who do not verify within N minutes (0 to disable)")
			.addIntegerOption((o) =>
				o
					.setName("minutes")
					.setDescription("Minutes before kicking unverified members (0 = off)")
					.setRequired(true)
					.setMinValue(0)
					.setMaxValue(1440),
			),
	);
	cmd.addSubcommand((s) =>
		s
			.setName("minage")
			.setDescription("Kick accounts younger than N days on join (0 to disable)")
			.addIntegerOption((o) =>
				o
					.setName("days")
					.setDescription("Minimum account age in days (0 = off)")
					.setRequired(true)
					.setMinValue(0)
					.setMaxValue(365),
			),
	);
	cmd.addSubcommand((s) => s.setName("disable").setDescription("Turn verification off"));
	cmd.addSubcommand((s) => s.setName("status").setDescription("Show verification settings"));
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
	const sub = interaction.options.getSubcommand();

	switch (sub) {
		case "setup": {
			const role = interaction.options.getRole("role", true);
			await upsertConfig(guild.id, { roleId: role.id, enabled: true });
			return void reply.success(
				interaction,
				t("verification:setupDone", { role: `<@&${role.id}>` }),
				true,
			);
		}
		case "panel": {
			const config = await getConfig(guild.id);
			if (!config?.enabled || !config.roleId) {
				return void reply.error(interaction, t("verification:notConfigured"));
			}
			await interaction.reply({ components: verifyPanel(), flags: MessageFlags.IsComponentsV2 });
			return;
		}
		case "captcha": {
			const enabled = interaction.options.getBoolean("enabled", true);
			await upsertConfig(guild.id, { captcha: enabled });
			return void reply.success(
				interaction,
				enabled ? t("verification:captcha.on") : t("verification:captcha.off"),
				true,
			);
		}
		case "autokick": {
			const minutes = interaction.options.getInteger("minutes", true);
			await upsertConfig(guild.id, { kickAfterMin: minutes === 0 ? null : minutes });
			return void reply.success(
				interaction,
				minutes === 0 ? t("verification:autokick.off") : t("verification:autokick.on", { minutes }),
				true,
			);
		}
		case "minage": {
			const days = interaction.options.getInteger("days", true);
			await upsertConfig(guild.id, { minAccountAgeDays: days === 0 ? null : days });
			return void reply.success(
				interaction,
				days === 0 ? t("verification:minage.off") : t("verification:minage.on", { days }),
				true,
			);
		}
		case "disable": {
			await upsertConfig(guild.id, { enabled: false });
			return void reply.success(interaction, t("verification:disabled"), true);
		}
		case "status": {
			const config = await getConfig(guild.id);
			return void reply.components(interaction, [
				container(Accent.info, [
					text(t("verification:status.title")),
					text(
						t("verification:status.body", {
							state: config?.enabled ? "on" : "off",
							role: config?.roleId ? `<@&${config.roleId}>` : "—",
							captcha: config?.captcha ? "on" : "off",
							autokick: config?.kickAfterMin ? `${config.kickAfterMin} min` : "off",
							minage: config?.minAccountAgeDays ? `${config.minAccountAgeDays} days` : "off",
						}),
					),
				]),
			]);
		}
		default:
			await reply.error(interaction, t("common:error.generic"));
	}
}

async function grantVerified(
	interaction: ButtonInteraction,
	member: GuildMember,
	roleId: string,
): Promise<void> {
	try {
		await member.roles.add(roleId, "Verified");
	} catch {
		return void reply.error(interaction, t("verification:failed"));
	}
	return void reply.success(interaction, t("verification:welcome"), true);
}

function captchaPanel() {
	const cap = makeCaptcha();
	const row = actionRow(
		...cap.options.map((o, i) =>
			button({
				id: `verify:cap:${o.correct ? "ok" : "no"}:${i}`,
				label: o.label,
				style: ButtonStyle.Secondary,
			}),
		),
	);
	return [
		container(Accent.info, [
			text(t("verification:captcha.title")),
			text(t("verification:captcha.q", { q: cap.question })),
		]),
		row,
	];
}

const verifyComponent: ComponentHandler = {
	prefix: "verify",
	deferEphemeral: true,
	execute: async (interaction, args) => {
		if (!interaction.isButton() || !interaction.inGuild()) return;
		const guildId = interaction.guildId;
		if (await isFeatureBlocked(guildId, "verification")) {
			return void reply.error(interaction, t("verification:off"));
		}
		const config = await getConfig(guildId);
		if (!config?.enabled || !config.roleId) {
			return void reply.error(interaction, t("verification:off"));
		}
		const member = interaction.member;
		if (!(member instanceof GuildMember)) return;
		if (member.roles.cache.has(config.roleId)) {
			return void reply.success(interaction, t("verification:already"), true);
		}

		if (args[0] === "go") {
			if (config.captcha) {
				return void reply.components(interaction, captchaPanel(), true);
			}
			return void grantVerified(interaction, member, config.roleId);
		}
		if (args[0] === "cap") {
			if (args[1] === "ok") return void grantVerified(interaction, member, config.roleId);
			return void reply.error(interaction, t("verification:captcha.wrong"));
		}
	},
};

const verification: BotModule = {
	name: "verification",
	commands: [{ data: buildData(), guildOnly: true, execute } satisfies SlashCommand],
	events: verificationEvents,
	components: [verifyComponent],
	i18n: {
		setupDone:
			"🔓 Verification on. Members who verify get {role}. Post the panel with `/verification panel`.",
		disabled: "🔒 Verification turned off.",
		notConfigured: "Set a role first with `/verification setup`.",
		off: "Verification is not available right now.",
		already: "✅ You're already verified.",
		welcome: "🎉 You're verified - welcome in!",
		failed: "I couldn't assign the role - check my Manage Roles permission and role position.",
		"captcha.on": "🧩 Captcha **enabled**. Members solve a quick sum before they verify.",
		"captcha.off": "🧩 Captcha **disabled**.",
		"captcha.title": "# 🧩 Quick check",
		"captcha.q": "What is **{q}**? Tap the right answer.",
		"captcha.wrong": "❌ Not quite. Tap **Verify** to try again.",
		"autokick.on": "⏳ Members who do not verify within **{minutes} min** will be kicked.",
		"autokick.off": "⏳ Auto-kick disabled.",
		"minage.on":
			"🛡️ Accounts younger than **{days} days** will be kicked on join. A cheap ban-evasion gate.",
		"minage.off": "🛡️ Account-age gate disabled.",
		"ageKick.dm":
			"🛡️ Your account is too new to join **{server}**. Accounts must be at least **{days} days** old. Try again after {eligible}.",
		"panel.title": "# 🔓 Verification",
		"panel.body": "Click the button below to verify and unlock the server.",
		"panel.button": "Verify",
		"status.title": "# 🔓 Verification settings",
		"status.body":
			"Status: **{state}**\nVerified role: {role}\nCaptcha: **{captcha}**\nAuto-kick: **{autokick}**\nMin account age: **{minage}**",
	},
};

export default verification;
