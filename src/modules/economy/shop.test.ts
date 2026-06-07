import assert from "node:assert/strict";
import { test } from "node:test";
import { evaluatePurchase } from "./shop.ts";

const item = (
	over: Partial<{ price: number; roleId: string | null; stock: number | null }> = {},
) => ({
	price: 100,
	roleId: null,
	stock: null,
	...over,
});

test("evaluatePurchase multiplies cost by quantity for stackable items", () => {
	const r = evaluatePurchase(item(), 1000, 3);
	assert.deepEqual(r, { ok: true, qty: 3, cost: 300 });
});

test("evaluatePurchase forces quantity 1 for role items", () => {
	const r = evaluatePurchase(item({ roleId: "r1" }), 1000, 5);
	assert.deepEqual(r, { ok: true, qty: 1, cost: 100 });
});

test("evaluatePurchase rejects when the wallet is too small", () => {
	assert.deepEqual(evaluatePurchase(item(), 99, 1), { ok: false, reason: "poor" });
	assert.deepEqual(evaluatePurchase(item(), 250, 3), { ok: false, reason: "poor" });
});

test("evaluatePurchase respects limited stock", () => {
	assert.deepEqual(evaluatePurchase(item({ stock: 2 }), 9999, 3), {
		ok: false,
		reason: "outOfStock",
	});
	assert.deepEqual(evaluatePurchase(item({ stock: 2 }), 9999, 2), { ok: true, qty: 2, cost: 200 });
});

test("evaluatePurchase treats a sub-1 quantity as 1", () => {
	assert.deepEqual(evaluatePurchase(item(), 1000, 0), { ok: true, qty: 1, cost: 100 });
});
