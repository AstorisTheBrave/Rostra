import assert from "node:assert/strict";
import { test } from "node:test";
import type { GuildMember } from "discord.js";
import { removeTimeout } from "./service.ts";

test("untimeout rejects targets with equal or higher moderator roles before calling Discord", async () => {
	let calls = 0;
	const guild = { ownerId: "owner", members: { me: { roles: { highest: { position: 10 } } } } };
	const target = {
		guild,
		roles: { highest: { position: 5 } },
		moderatable: true,
		isCommunicationDisabled: () => true,
		timeout: async () => {
			calls++;
		},
	} as unknown as GuildMember;
	const moderator = {
		id: "moderator",
		guild,
		roles: { highest: { position: 5 } },
	} as unknown as GuildMember;
	const result = await removeTimeout({ target, moderator, reason: "test" });
	assert.deepEqual(result, { ok: false, messageKey: "moderation:error.targetHigher" });
	assert.equal(calls, 0);
});
