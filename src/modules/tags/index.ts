import type { BotClient } from "@/client/BotClient.ts";
import { t } from "@/i18n/index.ts";
import type { BotModule, SlashCommand } from "@/types/module.ts";
import { Accent, container, reply, text } from "@/ui";
import {
	type ChatInputCommandInteraction,
	PermissionFlagsBits,
	SlashCommandBuilder,
} from "discord.js";
import { addTag, bumpUses, getTag, listTags, removeTag } from "./service.ts";

function buildData(): SlashCommandBuilder {
	const cmd = new SlashCommandBuilder().setName("tag").setDescription("Saved text snippets");
	cmd.addSubcommand((s) =>
		s
			.setName("get")
			.setDescription("Show a tag")
			.addStringOption((o) => o.setName("name").setDescription("Tag name").setRequired(true)),
	);
	cmd.addSubcommand((s) =>
		s
			.setName("add")
			.setDescription("Create or update a tag (Manage Messages)")
			.addStringOption((o) => o.setName("name").setDescription("Tag name").setRequired(true))
			.addStringOption((o) => o.setName("content").setDescription("Tag content").setRequired(true)),
	);
	cmd.addSubcommand((s) =>
		s
			.setName("remove")
			.setDescription("Delete a tag (Manage Messages)")
			.addStringOption((o) => o.setName("name").setDescription("Tag name").setRequired(true)),
	);
	cmd.addSubcommand((s) => s.setName("list").setDescription("List all tags"));
	return cmd;
}

function canManage(interaction: ChatInputCommandInteraction): boolean {
	return interaction.memberPermissions?.has(PermissionFlagsBits.ManageMessages) ?? false;
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
		case "get": {
			const name = interaction.options.getString("name", true);
			const tag = await getTag(guild.id, name);
			if (!tag) return void reply.error(interaction, t("tags:notFound", { name }));
			await bumpUses(guild.id, name);
			return void reply.components(interaction, [container(Accent.info, [text(tag.content)])]);
		}
		case "add": {
			if (!canManage(interaction))
				return void reply.error(interaction, t("common:error.missingPermissions"));
			const name = interaction.options.getString("name", true);
			const content = interaction.options.getString("content", true);
			await addTag(guild.id, name, content, interaction.user.id);
			return void reply.components(interaction, [
				container(Accent.success, [text(t("tags:saved", { name: name.toLowerCase() }))]),
			]);
		}
		case "remove": {
			if (!canManage(interaction))
				return void reply.error(interaction, t("common:error.missingPermissions"));
			const name = interaction.options.getString("name", true);
			const removed = await removeTag(guild.id, name);
			return removed
				? void reply.components(interaction, [
						container(Accent.success, [text(t("tags:removed", { name: name.toLowerCase() }))]),
					])
				: void reply.error(interaction, t("tags:notFound", { name }));
		}
		case "list": {
			const tags = await listTags(guild.id);
			if (tags.length === 0)
				return void reply.components(interaction, [
					container(Accent.info, [text(t("tags:empty"))]),
				]);
			const names = tags.map((tag) => `\`${tag.name}\``).join(", ");
			return void reply.components(interaction, [
				container(Accent.info, [text(t("tags:title")), text(names)]),
			]);
		}
		default:
			await reply.error(interaction, t("common:error.generic"));
	}
}

const tagCommand: SlashCommand = {
	data: buildData(),
	guildOnly: true,
	execute,
};

const tags: BotModule = {
	name: "tags",
	commands: [tagCommand],
	i18n: {
		notFound: "No tag named **{name}**.",
		saved: "✅ Saved tag **{name}**.",
		removed: "🗑️ Deleted tag **{name}**.",
		title: "# 🏷️ Tags",
		empty: "No tags yet. Add one with `/tag add`.",
	},
};

export default tags;
