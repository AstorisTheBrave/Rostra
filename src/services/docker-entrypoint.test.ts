import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

function runEntrypoint(migrationSucceeds: boolean) {
	const directory = mkdtempSync(join(tmpdir(), "rostra-entrypoint-"));
	const script = fileURLToPath(new URL("../../docker-entrypoint.sh", import.meta.url));
	try {
		for (const [name, body] of [
			[
				"npx",
				`#!/bin/sh\necho attempt >> "$ENTRYPOINT_TEST_LOG"\nexit ${migrationSucceeds ? 0 : 1}\n`,
			],
			["sleep", "#!/bin/sh\nexit 0\n"],
			["npm", '#!/bin/sh\necho started >> "$ENTRYPOINT_TEST_LOG"\nexit 0\n'],
		] as const) {
			const path = join(directory, name);
			writeFileSync(path, body);
			chmodSync(path, 0o755);
		}
		const log = join(directory, "commands.log");
		const result = spawnSync("sh", [script], {
			encoding: "utf8",
			env: { ...process.env, ENTRYPOINT_TEST_LOG: log, PATH: `${directory}:${process.env.PATH}` },
		});
		return { result, commands: readFileSync(log, "utf8").trim().split("\n") };
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
}

test("container starts only after a successful migration", () => {
	const { result, commands } = runEntrypoint(true);
	assert.equal(result.status, 0);
	assert.deepEqual(commands, ["attempt", "started"]);
});

test("failed migrations exhaust retries and prevent bot startup", () => {
	const { result, commands } = runEntrypoint(false);
	assert.equal(result.status, 1);
	assert.equal(commands.filter((command) => command === "attempt").length, 12);
	assert.equal(commands.includes("started"), false);
	assert.match(result.stderr, /migrations failed after 12 attempts/);
});
