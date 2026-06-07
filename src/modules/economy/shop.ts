import type { InventoryItem, ShopItem } from "@prisma/client";
import { getPrisma } from "@/services/database.ts";
import { getAccount, updateBalance } from "./service.ts";

// ── Shop catalog ─────────────────────────────────────────────────────────────

export function listShop(guildId: string): Promise<ShopItem[]> {
	return getPrisma().shopItem.findMany({ where: { guildId }, orderBy: { price: "asc" } });
}

export function getItem(guildId: string, name: string): Promise<ShopItem | null> {
	return getPrisma().shopItem.findUnique({ where: { guildId_name: { guildId, name } } });
}

export async function upsertItem(data: {
	guildId: string;
	name: string;
	price: number;
	description?: string | null;
	roleId?: string | null;
	stock?: number | null;
}): Promise<ShopItem> {
	return getPrisma().shopItem.upsert({
		where: { guildId_name: { guildId: data.guildId, name: data.name } },
		create: data,
		update: {
			price: data.price,
			description: data.description ?? null,
			roleId: data.roleId ?? null,
			stock: data.stock ?? null,
		},
	});
}

export async function removeItem(guildId: string, name: string): Promise<boolean> {
	const res = await getPrisma().shopItem.deleteMany({ where: { guildId, name } });
	return res.count > 0;
}

// ── Inventory ────────────────────────────────────────────────────────────────

export function getInventory(guildId: string, userId: string): Promise<InventoryItem[]> {
	return getPrisma().inventoryItem.findMany({
		where: { guildId, userId },
		orderBy: { itemName: "asc" },
	});
}

async function addToInventory(
	guildId: string,
	userId: string,
	itemName: string,
	qty: number,
): Promise<void> {
	await getPrisma().inventoryItem.upsert({
		where: { guildId_userId_itemName: { guildId, userId, itemName } },
		create: { guildId, userId, itemName, quantity: qty },
		update: { quantity: { increment: qty } },
	});
}

/** Remove one unit of an item; returns false if the user does not own it. */
export async function consumeItem(
	guildId: string,
	userId: string,
	itemName: string,
): Promise<boolean> {
	const row = await getPrisma().inventoryItem.findUnique({
		where: { guildId_userId_itemName: { guildId, userId, itemName } },
	});
	if (!row || row.quantity < 1) return false;
	if (row.quantity === 1) {
		await getPrisma().inventoryItem.delete({ where: { id: row.id } });
	} else {
		await getPrisma().inventoryItem.update({
			where: { id: row.id },
			data: { quantity: { decrement: 1 } },
		});
	}
	return true;
}

// ── Purchase flow ────────────────────────────────────────────────────────────

/**
 * Pure pre-flight for a purchase: role items force quantity 1, then check stock
 * and wallet. Returns the effective quantity + cost, or the failure reason. The
 * DB-touching `buyItem` mirrors this so the rules live in one tested place.
 */
export function evaluatePurchase(
	item: { price: number; roleId: string | null; stock: number | null },
	wallet: number,
	requestedQty: number,
): { ok: true; qty: number; cost: number } | { ok: false; reason: "poor" | "outOfStock" } {
	const qty = item.roleId ? 1 : Math.max(1, requestedQty);
	if (item.stock !== null && item.stock < qty) return { ok: false, reason: "outOfStock" };
	const cost = item.price * qty;
	if (wallet < cost) return { ok: false, reason: "poor" };
	return { ok: true, qty, cost };
}

export type BuyResult =
	| { ok: true; item: ShopItem; isRole: boolean; spent: number }
	| { ok: false; reason: "notFound" | "poor" | "outOfStock" };

/**
 * Buy `quantity` of an item: validates stock and wallet, deducts coins, then
 * either grants a buyable role (roleId set, quantity forced to 1) or adds the
 * item to the buyer's inventory. The role itself is granted by the caller, which
 * has the guild member; here we only move coins, stock, and inventory.
 */
export async function buyItem(
	guildId: string,
	userId: string,
	name: string,
	quantity: number,
): Promise<BuyResult> {
	const item = await getItem(guildId, name);
	if (!item) return { ok: false, reason: "notFound" };

	const account = await getAccount(guildId, userId);
	const check = evaluatePurchase(item, account.wallet, quantity);
	if (!check.ok) return check;

	await updateBalance(guildId, userId, { wallet: -check.cost });
	if (item.stock !== null) {
		await getPrisma().shopItem.update({
			where: { id: item.id },
			data: { stock: { decrement: check.qty } },
		});
	}
	if (!item.roleId) await addToInventory(guildId, userId, item.name, check.qty);
	return { ok: true, item, isRole: Boolean(item.roleId), spent: check.cost };
}

/** Undo a role purchase whose role grant failed: refund coins and restore one stock unit. */
export async function refundPurchase(
	guildId: string,
	userId: string,
	itemId: string,
	amount: number,
): Promise<void> {
	await updateBalance(guildId, userId, { wallet: amount });
	await getPrisma().shopItem.updateMany({
		where: { id: itemId, stock: { not: null } },
		data: { stock: { increment: 1 } },
	});
}
