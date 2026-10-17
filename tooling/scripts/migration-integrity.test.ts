import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

// Captured from Git and verified against working bytes at b4dc5b7 before extraction.
const baseline = {
	"0_init/migration.sql": "105db0a89835d0b15ced584178caa2b9292190afb4bc4eb70f5611729996cf61",
	"20260609000000_modmail_block_appeal/migration.sql":
		"4e8cc3905a3ec8a536cdffa5e0ae09d2f13cddfeca3d118e1de558da7dcb70a6",
	"20260609010000_automod_escalation/migration.sql":
		"8282c8d4873f21271ac5456c89ab53376a7499e215bb6cd523b42159fab71328",
	"20260609020000_tenant_channel_map/migration.sql":
		"7a36376a706ec6e26b38bbcc46a89e898045be5ad26e9c917de8b5f0b44e259c",
	"20260609030000_verification_min_account_age/migration.sql":
		"13e9e8241de02a8cc4866a7282ede1e686fc8e537c0443c1c45359f17f7639ed",
	"20260609040000_ticket_state_machine/migration.sql":
		"ee09144fb988198f4e301c873511d91fe3939a5fe01243237c35e17410bfd63e",
	"20260609050000_ticket_tags/migration.sql":
		"de10a532c835e4cf7afca0cfff4b59958c4bf61d288827dfede5fb6f10072f4f",
	"20260609060000_ticket_custom_categories/migration.sql":
		"b5a24181228ef6dada3956a8a6e57790c56c0ddcf98481fbcd09aca2da972e04",
	"20260609070000_ticket_watchers/migration.sql":
		"a585e89a4202dba2f8c4850437fde928a53ff7be62a29e35e9062287d009137d",
	"migration_lock.toml": "1db17a8d051aa136110736752c5e1f8b7ed92b6ea8e803112fbbe2497047c210",
};

test("database package preserves every migration path and byte", () => {
	const directory = new URL("../../packages/database/prisma/migrations/", import.meta.url);
	assert.ok(existsSync(directory), "Migration history must move to its database owner");
	for (const [path, hash] of Object.entries(baseline)) {
		assert.equal(
			createHash("sha256")
				.update(readFileSync(new URL(path, directory)))
				.digest("hex"),
			hash,
			path,
		);
	}
	assert.ok(!existsSync(new URL("../../prisma/", import.meta.url)), "No second schema owner");
});
