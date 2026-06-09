import assert from "node:assert/strict";
import { test } from "node:test";
import { MessageFlags } from "discord.js";

test("text() builds a TextDisplay with content", async () => {
	const { text } = await import("./components.ts");
	const td = text("# Hello");
	assert.equal(td.data.content, "# Hello");
});

test("buildResponse always sets IsComponentsV2 flag", async () => {
	const { buildResponse, text } = await import("./components.ts");
	const res = buildResponse([text("hi")]);
	assert.equal((res.flags & MessageFlags.IsComponentsV2) === MessageFlags.IsComponentsV2, true);
	assert.equal(res.components.length, 1);
});

test("errorContainer sets an accent color", async () => {
	const { errorContainer } = await import("./components.ts");
	const c = errorContainer("nope");
	assert.equal(typeof c.data.accent_color, "number");
});

test("gallery builds a media gallery from urls", async () => {
	const { gallery } = await import("./components.ts");
	const g = gallery(["https://example.com/a.png", "https://example.com/b.png"]);
	assert.equal(g.items.length, 2);
});

test("container nests an action row inside the box", async () => {
	const { container, Accent, text } = await import("./components.ts");
	const { actionRow, button } = await import("../ui/interactive.ts");
	const c = container(Accent.info, [text("hi"), actionRow(button({ id: "x", label: "X" }))]);
	const json = c.toJSON();
	// Component type 1 is an action row; it must appear among the container's children.
	const types = json.components.map((child) => child.type);
	assert.ok(types.includes(1), "expected an action row inside the container");
});

test("container accepts mixed children including a gallery", async () => {
	const { container, text, gallery, Accent } = await import("./components.ts");
	const c = container(Accent.info, [text("hi"), gallery(["https://example.com/a.png"])]);
	assert.equal(typeof c.data.accent_color, "number");
	assert.ok(Array.isArray(c.components));
	assert.equal(c.components.length, 2);
});
