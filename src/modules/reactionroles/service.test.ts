import assert from "node:assert/strict";
import { test } from "node:test";
import type { ReactionRolePanel } from "@prisma/client";
import { parseRoles, reconcileRoles } from "./service.ts";

function panel(roles: unknown): ReactionRolePanel {
	return {
		id: "p",
		guildId: "g",
		channelId: null,
		messageId: null,
		title: "t",
		mode: "multiple",
		roles,
		createdAt: new Date(),
	} as ReactionRolePanel;
}

test("parseRoles returns valid role objects", () => {
	const roles = parseRoles(
		panel([
			{ roleId: "1", label: "Red" },
			{ roleId: "2", label: "Blue", emoji: "🔵" },
		]),
	);
	assert.equal(roles.length, 2);
	assert.equal(roles[1]?.emoji, "🔵");
});

test("parseRoles ignores malformed entries", () => {
	assert.deepEqual(parseRoles(panel("nope")), []);
	assert.deepEqual(parseRoles(panel([{ bad: true }, 5, null])), []);
});

test("reconcileRoles adds selected and removes deselected within the panel", () => {
	const panelRoles = ["a", "b", "c"];
	// member has a + c, selects a + b -> add b, remove c
	const res = reconcileRoles(panelRoles, ["a", "c", "x"], ["a", "b"]);
	assert.deepEqual(res, { add: ["b"], remove: ["c"] });
});

test("reconcileRoles never touches roles outside the panel", () => {
	// "x" is selected but not in the panel; "z" is held but not in the panel
	const res = reconcileRoles(["a"], ["z"], ["a", "x"]);
	assert.deepEqual(res, { add: ["a"], remove: [] });
});

test("reconcileRoles removes everything when selection is empty", () => {
	const res = reconcileRoles(["a", "b"], ["a", "b"], []);
	assert.deepEqual(res, { add: [], remove: ["a", "b"] });
});
