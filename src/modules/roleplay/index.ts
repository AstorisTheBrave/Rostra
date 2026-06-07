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
import { Accent, container, gallery, reply, text } from "@/ui";
import {
	fetchRoleplayGif,
	isRoleplayAction,
	isTargeted,
	ROLEPLAY_ACTIONS,
	shipBar,
	shipScore,
} from "./service.ts";
import { renderShipCard } from "./shipCard.ts";

function buildData(): SlashCommandBuilder {
	const cmd = new SlashCommandBuilder()
		.setName("roleplay")
		.setDescription("React with anime gifs or ship two members");
	cmd.addStringOption((o) => {
		o.setName("action").setDescription("What to do").setRequired(true);
		o.addChoices(
			...Object.entries(ROLEPLAY_ACTIONS).map(([value, a]) => ({ name: a.label, value })),
			{ name: "Ship", value: "ship" },
		);
		return o;
	});
	cmd.addUserOption((o) =>
		o.setName("target").setDescription("Who to involve (required for most actions)"),
	);
	return cmd;
}

async function execute({
	interaction,
}: {
	interaction: ChatInputCommandInteraction;
	client: BotClient;
}): Promise<void> {
	const action = interaction.options.getString("action", true);
	const target = interaction.options.getUser("target");
	const userMention = `<@${interaction.user.id}>`;

	if (action === "ship") {
		if (!target) return void reply.error(interaction, t("roleplay:error.shipNeedsTarget"));
		const score = shipScore(interaction.user.id, target.id);
		const buffer = await renderShipCard({
			avatarA: interaction.user.displayAvatarURL({ extension: "png", size: 128 }),
			avatarB: target.displayAvatarURL({ extension: "png", size: 128 }),
			nameA: interaction.user.displayName,
			nameB: target.displayName,
			score,
		});
		const file = new AttachmentBuilder(buffer, { name: "ship.png" });
		const payload = {
			components: [
				container(Accent.info, [
					text(
						t("roleplay:ship.result", {
							user: userMention,
							target: `<@${target.id}>`,
							bar: shipBar(score),
							score: String(score),
						}),
					),
					gallery(["attachment://ship.png"]),
				]),
			],
			files: [file],
			flags: MessageFlags.IsComponentsV2,
		};
		if (interaction.deferred || interaction.replied) {
			await interaction.editReply(payload as unknown as InteractionEditReplyOptions);
		} else {
			await interaction.reply(payload as unknown as InteractionReplyOptions);
		}
		return;
	}

	if (!isRoleplayAction(action)) {
		return void reply.error(interaction, t("roleplay:error.unknown"));
	}

	if (isTargeted(action) && !target) {
		return void reply.error(interaction, t("roleplay:error.targetNeeded"));
	}

	const gif = await fetchRoleplayGif(ROLEPLAY_ACTIONS[action].category);
	const line = t(`roleplay:act.${action}`, {
		user: userMention,
		target: target ? `<@${target.id}>` : userMention,
	});
	const children = gif ? [text(line), gallery([gif])] : [text(line)];
	await reply.components(interaction, [container(Accent.info, children)]);
}

const roleplayCommand: SlashCommand = {
	data: buildData(),
	guildOnly: true,
	execute,
};

const roleplay: BotModule = {
	name: "roleplay",
	commands: [roleplayCommand],
	i18n: {
		"error.unknown": "That action is not available.",
		"error.targetNeeded": "Pick someone with the **target** option for that action.",
		"error.shipNeedsTarget": "Ship needs a **target** to ship you with.",
		"ship.result": "💘 **Shipping** {user} + {target}\n\n{bar}\n**{score}%** compatible!",
		"act.hug": "🤗 {user} gives {target} a big hug!",
		"act.kiss": "😘 {user} kisses {target}!",
		"act.cuddle": "🥰 {user} cuddles up with {target}!",
		"act.pat": "✋ {user} pats {target} on the head.",
		"act.poke": "👉 {user} pokes {target}.",
		"act.tickle": "🤭 {user} tickles {target}!",
		"act.feed": "🍴 {user} feeds {target}.",
		"act.highfive": "🙌 {user} high-fives {target}!",
		"act.handhold": "🤝 {user} holds {target}'s hand.",
		"act.peck": "💋 {user} gives {target} a little peck.",
		"act.slap": "👋 {user} slaps {target}!",
		"act.punch": "👊 {user} punches {target}!",
		"act.bite": "😬 {user} bites {target}!",
		"act.kick": "🦵 {user} kicks {target}!",
		"act.yeet": "🚀 {user} yeets {target} into orbit!",
		"act.stare": "👀 {user} stares at {target}...",
		"act.nom": "😋 {user} noms on {target}.",
		"act.shoot": "🔫 {user} shoots {target}! Bang!",
		"act.dance": "💃 {user} hits the dance floor!",
		"act.cry": "😢 {user} is crying...",
		"act.blush": "😳 {user} blushes.",
		"act.smile": "😊 {user} smiles brightly!",
		"act.wave": "👋 {user} waves hello!",
		"act.wink": "😉 {user} winks.",
	},
};

export default roleplay;
