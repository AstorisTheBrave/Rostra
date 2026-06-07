import type { EmojiName } from "@/ui";

export interface HelpCategory {
	id: string;
	label: string;
	description: string;
	emoji: EmojiName;
	/** Top-level command names in this category. */
	commands: string[];
}

/** Curated command groupings for the `/help` menu. */
export const HELP_CATEGORIES: HelpCategory[] = [
	{
		id: "moderation",
		label: "Moderation & Security",
		description: "Keep the server safe",
		emoji: "security",
		commands: ["mod", "security", "automod", "verification", "logging"],
	},
	{
		id: "management",
		label: "Server Management",
		description: "Onboarding, roles, and voice",
		emoji: "settings",
		commands: [
			"setup",
			"welcome",
			"voicehub",
			"reactionrole",
			"vanityrole",
			"autoresponder",
			"ticket",
		],
	},
	{
		id: "community",
		label: "Economy & Levels",
		description: "Currency, XP, and events",
		emoji: "economy",
		commands: ["economy", "level", "giveaway", "birthday", "starboard"],
	},
	{
		id: "fun",
		label: "Fun & Social",
		description: "Games and social cards",
		emoji: "games",
		commands: ["game", "trivia", "roleplay", "profile"],
	},
	{
		id: "utility",
		label: "Utility",
		description: "Everyday helpers",
		emoji: "utility",
		commands: [
			"util",
			"afk",
			"snipe",
			"steal",
			"reminder",
			"feeds",
			"highlight",
			"tag",
			"feedback",
			"ask",
			"ping",
			"help",
		],
	},
	{
		id: "music",
		label: "Music",
		description: "Play audio in voice",
		emoji: "music",
		commands: ["music"],
	},
];

export function findCategory(id: string): HelpCategory | undefined {
	return HELP_CATEGORIES.find((c) => c.id === id);
}
