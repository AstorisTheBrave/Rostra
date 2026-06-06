import {
	AttachmentBuilder,
	type ChatInputCommandInteraction,
	type InteractionEditReplyOptions,
	type InteractionReplyOptions,
	MessageFlags,
	SlashCommandBuilder,
} from "discord.js";
import type { BotClient } from "@/client/BotClient.ts";
import { t } from "@/i18n/index.ts";
import type { BotModule, SlashCommand } from "@/types/module.ts";
import { Accent, container, gallery, reply } from "@/ui";
import { renderProfileCard } from "./card.ts";
import {
	clampBio,
	DEFAULT_ACCENT,
	getProfile,
	isValidHex,
	isValidImageUrl,
	normalizeHex,
	resetProfile,
	upsertProfile,
} from "./service.ts";

function buildData(): SlashCommandBuilder {
	const cmd = new SlashCommandBuilder().setName("profile").setDescription("Custom profile cards");
	cmd.addSubcommand((s) =>
		s
			.setName("view")
			.setDescription("View a profile card")
			.addUserOption((o) => o.setName("user").setDescription("Whose profile (defaults to you)")),
	);
	cmd.addSubcommand((s) =>
		s
			.setName("bio")
			.setDescription("Set your bio")
			.addStringOption((o) => o.setName("text").setDescription("Your bio").setRequired(true)),
	);
	cmd.addSubcommand((s) =>
		s
			.setName("background")
			.setDescription("Set your background image")
			.addStringOption((o) =>
				o.setName("url").setDescription("https image URL (png/jpg/webp/gif)").setRequired(true),
			),
	);
	cmd.addSubcommand((s) =>
		s
			.setName("color")
			.setDescription("Set your accent colour")
			.addStringOption((o) => o.setName("hex").setDescription("e.g. #5865f2").setRequired(true)),
	);
	cmd.addSubcommand((s) => s.setName("reset").setDescription("Reset your profile to defaults"));
	return cmd;
}

async function showCard(interaction: ChatInputCommandInteraction): Promise<void> {
	const target = interaction.options.getUser("user") ?? interaction.user;
	const profile = await getProfile(target.id);
	const buffer = await renderProfileCard({
		username: target.username,
		displayName: target.displayName,
		avatarUrl: target.displayAvatarURL({ extension: "png", size: 256 }),
		bio: profile?.bio ?? null,
		accent: profile?.accent ?? DEFAULT_ACCENT,
		backgroundUrl: profile?.background ?? null,
		memberSince: target.createdAt.toLocaleDateString("en-US", {
			year: "numeric",
			month: "short",
			day: "numeric",
		}),
	});
	const file = new AttachmentBuilder(buffer, { name: "profile.png" });
	const payload = {
		components: [container(Accent.info, [gallery(["attachment://profile.png"])])],
		files: [file],
		flags: MessageFlags.IsComponentsV2,
	};
	if (interaction.deferred || interaction.replied) {
		await interaction.editReply(payload as unknown as InteractionEditReplyOptions);
	} else {
		await interaction.reply(payload as unknown as InteractionReplyOptions);
	}
}

async function execute({
	interaction,
}: {
	interaction: ChatInputCommandInteraction;
	client: BotClient;
}): Promise<void> {
	const sub = interaction.options.getSubcommand();

	switch (sub) {
		case "view":
			return void (await showCard(interaction));
		case "bio": {
			const bio = clampBio(interaction.options.getString("text", true));
			await upsertProfile(interaction.user.id, { bio });
			return void reply.success(interaction, t("profile:bioSet"), true);
		}
		case "background": {
			const url = interaction.options.getString("url", true);
			if (!isValidImageUrl(url)) return void reply.error(interaction, t("profile:error.badUrl"));
			await upsertProfile(interaction.user.id, { background: url });
			return void reply.success(interaction, t("profile:backgroundSet"), true);
		}
		case "color": {
			const hex = interaction.options.getString("hex", true);
			if (!isValidHex(hex)) return void reply.error(interaction, t("profile:error.badHex"));
			await upsertProfile(interaction.user.id, { accent: normalizeHex(hex) });
			return void reply.success(interaction, t("profile:colorSet"), true);
		}
		case "reset": {
			await resetProfile(interaction.user.id);
			return void reply.success(interaction, t("profile:reset"), true);
		}
		default:
			await reply.error(interaction, t("common:error.generic"));
	}
}

const profileCommand: SlashCommand = {
	data: buildData(),
	execute,
};

const profile: BotModule = {
	name: "profile",
	commands: [profileCommand],
	i18n: {
		bioSet: "✅ Bio updated.",
		backgroundSet: "✅ Background updated.",
		colorSet: "✅ Accent colour updated.",
		reset: "✅ Profile reset to defaults.",
		"error.badUrl": "Give an https image URL ending in .png, .jpg, .webp, or .gif.",
		"error.badHex": "Give a hex colour like `#5865f2`.",
	},
};

export default profile;
