import {
	type ChatInputCommandInteraction,
	PermissionFlagsBits,
	SlashCommandBuilder,
} from "discord.js";
import type { BotClient } from "@/client/BotClient.ts";
import { t } from "@/i18n/index.ts";
import { isFeatureBlocked } from "@/services/tenant.ts";
import type { BotModule, SlashCommand } from "@/types/module.ts";
import { Accent, container, reply, text } from "@/utils/components.ts";
import {
	COOLDOWNS,
	cooldownRemaining,
	formatCoins,
	getAccount,
	leaderboard,
	updateBalance,
} from "./service.ts";
import {
	buyItem,
	consumeItem,
	getInventory,
	listShop,
	refundPurchase,
	removeItem,
	upsertItem,
} from "./shop.ts";

const rand = (min: number, max: number): number =>
	Math.floor(Math.random() * (max - min + 1)) + min;

function readyAt(remainingMs: number): string {
	return `<t:${Math.floor((Date.now() + remainingMs) / 1000)}:R>`;
}

function buildData(): SlashCommandBuilder {
	const cmd = new SlashCommandBuilder().setName("economy").setDescription("Server economy");
	cmd.addSubcommand((s) =>
		s
			.setName("balance")
			.setDescription("Check a balance")
			.addUserOption((o) => o.setName("user").setDescription("User (defaults to you)")),
	);
	cmd.addSubcommand((s) => s.setName("daily").setDescription("Claim your daily reward"));
	cmd.addSubcommand((s) => s.setName("work").setDescription("Work for coins"));
	cmd.addSubcommand((s) => s.setName("beg").setDescription("Beg for spare coins"));
	cmd.addSubcommand((s) => s.setName("crime").setDescription("Commit a crime for a risky payout"));
	cmd.addSubcommand((s) =>
		s
			.setName("rob")
			.setDescription("Attempt to rob a user")
			.addUserOption((o) => o.setName("user").setDescription("Target").setRequired(true)),
	);
	cmd.addSubcommand((s) =>
		s
			.setName("pay")
			.setDescription("Pay another user")
			.addUserOption((o) => o.setName("user").setDescription("Recipient").setRequired(true))
			.addIntegerOption((o) =>
				o.setName("amount").setDescription("Amount").setRequired(true).setMinValue(1),
			),
	);
	cmd.addSubcommand((s) =>
		s
			.setName("deposit")
			.setDescription("Deposit coins into the bank")
			.addIntegerOption((o) =>
				o.setName("amount").setDescription("Amount").setRequired(true).setMinValue(1),
			),
	);
	cmd.addSubcommand((s) =>
		s
			.setName("withdraw")
			.setDescription("Withdraw coins from the bank")
			.addIntegerOption((o) =>
				o.setName("amount").setDescription("Amount").setRequired(true).setMinValue(1),
			),
	);
	cmd.addSubcommand((s) =>
		s
			.setName("gamble")
			.setDescription("Gamble coins on a coin flip")
			.addIntegerOption((o) =>
				o.setName("amount").setDescription("Bet").setRequired(true).setMinValue(1),
			),
	);
	cmd.addSubcommand((s) => s.setName("leaderboard").setDescription("Richest members"));
	cmd.addSubcommand((s) => s.setName("shop").setDescription("Browse the server shop"));
	cmd.addSubcommand((s) =>
		s
			.setName("buy")
			.setDescription("Buy an item from the shop")
			.addStringOption((o) => o.setName("item").setDescription("Item name").setRequired(true))
			.addIntegerOption((o) =>
				o.setName("quantity").setDescription("How many (non-role items)").setMinValue(1),
			),
	);
	cmd.addSubcommand((s) =>
		s
			.setName("inventory")
			.setDescription("Show owned items")
			.addUserOption((o) => o.setName("user").setDescription("User (defaults to you)")),
	);
	cmd.addSubcommand((s) =>
		s
			.setName("use")
			.setDescription("Use an item from your inventory")
			.addStringOption((o) => o.setName("item").setDescription("Item name").setRequired(true)),
	);
	cmd.addSubcommand((s) =>
		s
			.setName("additem")
			.setDescription("Add or update a shop item (Manage Server)")
			.addStringOption((o) => o.setName("name").setDescription("Item name").setRequired(true))
			.addIntegerOption((o) =>
				o.setName("price").setDescription("Price in coins").setRequired(true).setMinValue(1),
			)
			.addStringOption((o) => o.setName("description").setDescription("Short description"))
			.addRoleOption((o) =>
				o.setName("role").setDescription("Make it a buyable role (granted on purchase)"),
			)
			.addIntegerOption((o) =>
				o.setName("stock").setDescription("Limited stock (omit for unlimited)").setMinValue(1),
			),
	);
	cmd.addSubcommand((s) =>
		s
			.setName("removeitem")
			.setDescription("Remove a shop item (Manage Server)")
			.addStringOption((o) => o.setName("name").setDescription("Item name").setRequired(true)),
	);
	return cmd;
}

async function ok(
	interaction: ChatInputCommandInteraction,
	message: string,
	accent: number = Accent.success,
): Promise<void> {
	await reply.components(interaction, [container(accent, [text(message)])]);
}

async function execute({
	interaction,
}: {
	interaction: ChatInputCommandInteraction;
	client: BotClient;
}): Promise<void> {
	const guild = interaction.guild;
	if (!guild) return void reply.error(interaction, t("common:error.guildOnly"));
	if (await isFeatureBlocked(guild.id, "economy")) {
		return void reply.error(interaction, t("economy:disabled"));
	}
	const gid = guild.id;
	const uid = interaction.user.id;
	const sub = interaction.options.getSubcommand();

	switch (sub) {
		case "balance": {
			const user = interaction.options.getUser("user") ?? interaction.user;
			const acc = await getAccount(gid, user.id);
			return ok(
				interaction,
				t("economy:balance", {
					user: user.username,
					wallet: formatCoins(acc.wallet),
					bank: formatCoins(acc.bank),
					total: formatCoins(acc.wallet + acc.bank),
				}),
				Accent.info,
			);
		}
		case "daily": {
			const acc = await getAccount(gid, uid);
			const rem = cooldownRemaining(acc.lastDaily, COOLDOWNS.daily);
			if (rem > 0)
				return void reply.error(interaction, t("economy:cooldown", { when: readyAt(rem) }));
			const continued = acc.lastDaily && Date.now() - acc.lastDaily.getTime() < COOLDOWNS.daily * 2;
			const streak = continued ? acc.streak + 1 : 1;
			const amount = 500 + Math.min(streak, 30) * 50;
			await updateBalance(gid, uid, { wallet: amount, extra: { lastDaily: new Date(), streak } });
			return ok(interaction, t("economy:daily", { amount: formatCoins(amount), streak }));
		}
		case "work": {
			const acc = await getAccount(gid, uid);
			const rem = cooldownRemaining(acc.lastWork, COOLDOWNS.work);
			if (rem > 0)
				return void reply.error(interaction, t("economy:cooldown", { when: readyAt(rem) }));
			const amount = rand(50, 250);
			await updateBalance(gid, uid, { wallet: amount, extra: { lastWork: new Date() } });
			return ok(interaction, t("economy:work", { amount: formatCoins(amount) }));
		}
		case "beg": {
			const amount = rand(1, 50);
			await updateBalance(gid, uid, { wallet: amount });
			return ok(interaction, t("economy:beg", { amount: formatCoins(amount) }));
		}
		case "crime": {
			const acc = await getAccount(gid, uid);
			const rem = cooldownRemaining(acc.lastCrime, COOLDOWNS.crime);
			if (rem > 0)
				return void reply.error(interaction, t("economy:cooldown", { when: readyAt(rem) }));
			const success = Math.random() < 0.6;
			const delta = success ? rand(150, 500) : -rand(50, 200);
			await updateBalance(gid, uid, { wallet: delta, extra: { lastCrime: new Date() } });
			return ok(
				interaction,
				success
					? t("economy:crime.success", { amount: formatCoins(delta) })
					: t("economy:crime.fail", { amount: formatCoins(-delta) }),
				success ? Accent.success : Accent.error,
			);
		}
		case "rob": {
			const target = interaction.options.getUser("user", true);
			if (target.id === uid || target.bot) {
				return void reply.error(interaction, t("economy:rob.invalid"));
			}
			const acc = await getAccount(gid, uid);
			const rem = cooldownRemaining(acc.lastRob, COOLDOWNS.rob);
			if (rem > 0)
				return void reply.error(interaction, t("economy:cooldown", { when: readyAt(rem) }));
			const victim = await getAccount(gid, target.id);
			if (victim.wallet < 100) return void reply.error(interaction, t("economy:rob.poor"));
			if (Math.random() < 0.5) {
				const stolen = Math.floor(victim.wallet * (rand(10, 30) / 100));
				await updateBalance(gid, target.id, { wallet: -stolen });
				await updateBalance(gid, uid, { wallet: stolen, extra: { lastRob: new Date() } });
				return ok(
					interaction,
					t("economy:rob.success", { amount: formatCoins(stolen), user: target.username }),
				);
			}
			const fine = rand(50, 150);
			await updateBalance(gid, uid, { wallet: -fine, extra: { lastRob: new Date() } });
			return ok(interaction, t("economy:rob.fail", { amount: formatCoins(fine) }), Accent.error);
		}
		case "pay": {
			const target = interaction.options.getUser("user", true);
			const amount = interaction.options.getInteger("amount", true);
			if (target.id === uid || target.bot)
				return void reply.error(interaction, t("economy:pay.invalid"));
			const acc = await getAccount(gid, uid);
			if (acc.wallet < amount) return void reply.error(interaction, t("economy:insufficient"));
			await updateBalance(gid, uid, { wallet: -amount });
			await updateBalance(gid, target.id, { wallet: amount });
			return ok(
				interaction,
				t("economy:pay", { amount: formatCoins(amount), user: target.username }),
			);
		}
		case "deposit": {
			const amount = interaction.options.getInteger("amount", true);
			const acc = await getAccount(gid, uid);
			if (acc.wallet < amount) return void reply.error(interaction, t("economy:insufficient"));
			await updateBalance(gid, uid, { wallet: -amount, bank: amount });
			return ok(interaction, t("economy:deposit", { amount: formatCoins(amount) }));
		}
		case "withdraw": {
			const amount = interaction.options.getInteger("amount", true);
			const acc = await getAccount(gid, uid);
			if (acc.bank < amount) return void reply.error(interaction, t("economy:insufficient"));
			await updateBalance(gid, uid, { wallet: amount, bank: -amount });
			return ok(interaction, t("economy:withdraw", { amount: formatCoins(amount) }));
		}
		case "gamble": {
			const bet = interaction.options.getInteger("amount", true);
			const acc = await getAccount(gid, uid);
			if (acc.wallet < bet) return void reply.error(interaction, t("economy:insufficient"));
			if (Math.random() < 0.45) {
				await updateBalance(gid, uid, { wallet: bet });
				return ok(interaction, t("economy:gamble.win", { amount: formatCoins(bet) }));
			}
			await updateBalance(gid, uid, { wallet: -bet });
			return ok(interaction, t("economy:gamble.lose", { amount: formatCoins(bet) }), Accent.error);
		}
		case "leaderboard": {
			const top = await leaderboard(gid, 10);
			if (top.length === 0) return ok(interaction, t("economy:leaderboard.empty"), Accent.info);
			const medals = ["🥇", "🥈", "🥉"];
			const lines = top.map(
				(e, i) => `${medals[i] ?? `\`#${i + 1}\``} <@${e.userId}> - ${formatCoins(e.total)}`,
			);
			return void reply.components(interaction, [
				container(Accent.info, [text(t("economy:leaderboard.title")), text(lines.join("\n"))]),
			]);
		}
		case "shop": {
			const items = await listShop(gid);
			if (items.length === 0) return ok(interaction, t("economy:shop.empty"), Accent.info);
			const lines = items.map((i) => {
				const tag = i.roleId ? ` <@&${i.roleId}>` : "";
				const stock = i.stock !== null ? ` _(stock: ${i.stock})_` : "";
				const desc = i.description ? ` - ${i.description}` : "";
				return `**${i.name}** - ${formatCoins(i.price)}${tag}${stock}${desc}`;
			});
			return void reply.components(interaction, [
				container(Accent.info, [text(t("economy:shop.title")), text(lines.join("\n"))]),
			]);
		}
		case "buy": {
			const name = interaction.options.getString("item", true);
			const quantity = interaction.options.getInteger("quantity") ?? 1;
			const result = await buyItem(gid, uid, name, quantity);
			if (!result.ok) {
				const key =
					result.reason === "notFound"
						? "economy:shop.notFound"
						: result.reason === "outOfStock"
							? "economy:shop.outOfStock"
							: "economy:insufficient";
				return void reply.error(interaction, t(key));
			}
			if (result.isRole && result.item.roleId) {
				const member = await guild.members.fetch(uid).catch(() => null);
				const granted = await member?.roles
					.add(result.item.roleId, "Shop purchase")
					.then(() => true)
					.catch(() => false);
				if (!granted) {
					await refundPurchase(gid, uid, result.item.id, result.spent);
					return void reply.error(interaction, t("economy:shop.roleFailed"));
				}
				return ok(
					interaction,
					t("economy:shop.boughtRole", {
						role: `<@&${result.item.roleId}>`,
						spent: formatCoins(result.spent),
					}),
				);
			}
			return ok(
				interaction,
				t("economy:shop.bought", { item: result.item.name, spent: formatCoins(result.spent) }),
			);
		}
		case "inventory": {
			const user = interaction.options.getUser("user") ?? interaction.user;
			const items = await getInventory(gid, user.id);
			if (items.length === 0)
				return ok(interaction, t("economy:inv.empty", { user: user.username }), Accent.info);
			const lines = items.map((i) => `**${i.itemName}** x${i.quantity}`);
			return void reply.components(interaction, [
				container(Accent.info, [
					text(t("economy:inv.title", { user: user.username })),
					text(lines.join("\n")),
				]),
			]);
		}
		case "use": {
			const name = interaction.options.getString("item", true);
			const used = await consumeItem(gid, uid, name);
			if (!used) return void reply.error(interaction, t("economy:inv.dontOwn"));
			return ok(interaction, t("economy:inv.used", { item: name }));
		}
		case "additem": {
			if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
				return void reply.error(interaction, t("common:error.missingPermissions"));
			}
			const name = interaction.options.getString("name", true).slice(0, 60);
			const price = interaction.options.getInteger("price", true);
			const description = interaction.options.getString("description");
			const role = interaction.options.getRole("role");
			const stock = interaction.options.getInteger("stock");
			await upsertItem({ guildId: gid, name, price, description, roleId: role?.id, stock });
			return ok(interaction, t("economy:shop.added", { name, price: formatCoins(price) }));
		}
		case "removeitem": {
			if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
				return void reply.error(interaction, t("common:error.missingPermissions"));
			}
			const name = interaction.options.getString("name", true);
			const removed = await removeItem(gid, name);
			return removed
				? ok(interaction, t("economy:shop.removed", { name }))
				: void reply.error(interaction, t("economy:shop.notFound"));
		}
		default:
			await reply.error(interaction, t("common:error.generic"));
	}
}

const economyCommand: SlashCommand = {
	data: buildData(),
	guildOnly: true,
	cooldownMs: 1500,
	execute,
};

const economy: BotModule = {
	name: "economy",
	commands: [economyCommand],
	i18n: {
		disabled: "💤 The economy is turned off in this server.",
		balance: "**{user}**\nWallet: {wallet}\nBank: {bank}\nNet worth: {total}",
		cooldown: "⏳ You can do that again {when}.",
		daily: "💰 You claimed {amount}! Streak: **{streak}** days.",
		work: "🛠️ You worked and earned {amount}.",
		beg: "🥺 Someone gave you {amount}.",
		"crime.success": "🦹 Crime paid off - you gained {amount}.",
		"crime.fail": "🚔 You got caught and lost {amount}.",
		"rob.invalid": "You can't rob that user.",
		"rob.poor": "They don't have enough to rob.",
		"rob.success": "💸 You robbed {amount} from **{user}**.",
		"rob.fail": "🚨 You were caught and fined {amount}.",
		pay: "✅ You paid {amount} to **{user}**.",
		"pay.invalid": "You can't pay that user.",
		deposit: "🏦 Deposited {amount} into your bank.",
		withdraw: "🏦 Withdrew {amount} from your bank.",
		"gamble.win": "🎉 You won {amount}!",
		"gamble.lose": "💥 You lost {amount}.",
		insufficient: "You don't have enough coins for that.",
		"leaderboard.title": "# 🏆 Richest members",
		"leaderboard.empty": "No one has any coins yet.",
		"shop.title": "# 🛒 Shop",
		"shop.empty": "The shop is empty. Staff can add items with `/economy additem`.",
		"shop.notFound": "No shop item with that name.",
		"shop.outOfStock": "That item is out of stock.",
		"shop.bought": "🛍️ You bought **{item}** for {spent}.",
		"shop.boughtRole": "🎉 You bought the {role} role for {spent}.",
		"shop.roleFailed":
			"I took the coins back - I could not assign that role (check my permissions).",
		"shop.added": "✅ Shop item **{name}** set at {price}.",
		"shop.removed": "🗑️ Removed **{name}** from the shop.",
		"inv.title": "# 🎒 {user}'s inventory",
		"inv.empty": "**{user}** has no items.",
		"inv.dontOwn": "You don't own that item.",
		"inv.used": "✨ You used **{item}**.",
	},
};

export default economy;
