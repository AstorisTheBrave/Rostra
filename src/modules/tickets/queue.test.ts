import assert from "node:assert/strict";
import { test } from "node:test";
import { canTransition, categoryByKey, escalatePriority, ticketChannelName } from "./queue.ts";

test("canTransition enforces the state machine", () => {
	assert.equal(canTransition("OPEN", "CLAIMED"), true);
	assert.equal(canTransition("CLAIMED", "CLOSED"), true);
	assert.equal(canTransition("CLOSED", "OPEN"), false); // closed is terminal
	assert.equal(canTransition("OPEN", "RESOLVED"), false); // must be claimed/escalated first
});

test("escalatePriority bumps one level and caps at URGENT", () => {
	assert.equal(escalatePriority("LOW"), "NORMAL");
	assert.equal(escalatePriority("NORMAL"), "HIGH");
	assert.equal(escalatePriority("HIGH"), "URGENT");
	assert.equal(escalatePriority("URGENT"), "URGENT");
});

test("categoryByKey falls back to general for unknown keys", () => {
	assert.equal(categoryByKey("appeal").label, "Appeal");
	assert.equal(categoryByKey("nope").key, "general");
});

test("ticketChannelName slugs the user and applies the priority suffix", () => {
	assert.equal(ticketChannelName("Jane", 7, "NORMAL"), "jane-0007");
	assert.equal(ticketChannelName("Jane", 7, "HIGH"), "jane-0007-h");
	assert.equal(ticketChannelName("𝐬𝐲.𝐧𝐢𝐜", 12, "URGENT").endsWith("-0012-u"), true);
});
