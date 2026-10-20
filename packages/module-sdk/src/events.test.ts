import assert from "node:assert/strict";
import { test } from "node:test";
import { validateModuleEvent } from "./events.ts";

test("versioned module event validates owner, tenant and payload", () => {
	const descriptor = {
		name: "changed",
		once: false,
		owner: "welcome",
		validatePayload: (value: unknown) => typeof value === "string",
	};
	const event = {
		schemaVersion: 1,
		owner: "welcome",
		tenant: "guild:g1",
		name: "changed",
		payload: "ready",
	};
	assert.deepEqual(validateModuleEvent(descriptor, event, "guild:g1"), event);
	for (const bad of [
		{ ...event, schemaVersion: 2 },
		{ ...event, owner: "other" },
		{ ...event, tenant: "guild:g2" },
		{ ...event, tenant: "" },
		{ ...event, payload: 1 },
	])
		assert.throws(() => validateModuleEvent(descriptor, bad, "guild:g1"));
});
