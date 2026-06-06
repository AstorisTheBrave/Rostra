import assert from "node:assert/strict";
import { test } from "node:test";
import { ButtonStyle } from "discord.js";
import { button, buttonGrid, linkButton } from "./interactive.ts";
import { confirmRow, paginatorRow, toggleButton } from "./patterns.ts";

test("button builds an action button with id, label, style", () => {
	const b = button({ id: "mod:ban", label: "Ban", style: ButtonStyle.Danger });
	assert.equal((b.data as { label?: string }).label, "Ban");
	assert.equal(b.data.style, ButtonStyle.Danger);
	assert.equal((b.data as { custom_id?: string }).custom_id, "mod:ban");
});

test("linkButton sets a url and no custom id", () => {
	const b = linkButton("Docs", "https://example.com");
	assert.equal(b.data.style, ButtonStyle.Link);
	assert.equal((b.data as { url?: string }).url, "https://example.com");
	assert.equal((b.data as { custom_id?: string }).custom_id, undefined);
});

test("buttonGrid chunks into rows of 5", () => {
	const buttons = Array.from({ length: 12 }, (_, i) => button({ id: `x:${i}`, label: `${i}` }));
	const rows = buttonGrid(buttons);
	assert.equal(rows.length, 3);
	assert.equal(rows[0]?.components.length, 5);
	assert.equal(rows[2]?.components.length, 2);
});

test("toggleButton reflects enabled state", () => {
	const on = toggleButton("automod", "antiSpam", true, "Anti-spam");
	const off = toggleButton("automod", "antiSpam", false, "Anti-spam");
	assert.equal(on.data.style, ButtonStyle.Success);
	assert.equal(off.data.style, ButtonStyle.Secondary);
	assert.equal((on.data as { custom_id?: string }).custom_id, "automod:toggle:antiSpam");
});

test("paginatorRow disables edges correctly", () => {
	const first = paginatorRow("trivia", 0, 3);
	assert.equal(first.components[0]?.data.disabled, true); // prev disabled on first page
	assert.equal(first.components[2]?.data.disabled, false); // next enabled
	const last = paginatorRow("trivia", 2, 3);
	assert.equal(last.components[2]?.data.disabled, true); // next disabled on last page

	const confirm = confirmRow("tickets");
	assert.equal(
		(confirm.components[0]?.data as { custom_id?: string }).custom_id,
		"tickets:confirm",
	);
});
