import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { sourceViolations } from "./check-package-boundaries.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const environment = {
	DISCORD_TOKEN: "task-4-placeholder",
	DISCORD_CLIENT_ID: "0",
	DATABASE_URL: "postgresql://user:pass@localhost:5432/rostra",
	NODE_ENV: "test",
	LOG_LEVEL: "fatal",
};

for (const name of ["commands", "modules"]) {
	test(`${name} registry matches the pre-move fixture without network access`, () => {
		const result = spawnSync(
			process.execPath,
			["--import", "tsx", `tooling/scripts/snapshot-${name}.mjs`],
			{ cwd: root, encoding: "utf8", env: environment, timeout: 30_000 },
		);
		assert.equal(result.status, 0, result.stderr || result.stdout);
		assert.match(result.stdout, /zero network attempts/);
	});
}

test("every current module id is represented once in the compatibility snapshot", () => {
	const snapshot = JSON.parse(
		readFileSync(join(root, "tooling/fixtures/gateway-modules.json"), "utf8"),
	) as { modules: Array<{ name: string }> };
	assert.equal(snapshot.modules.length, 42);
	assert.equal(new Set(snapshot.modules.map((module) => module.name)).size, 42);
});

test("modules cannot import package-private source", () => {
	const packages = new Map([
		[
			"@rostra/module-sdk",
			{
				directory: "packages/module-sdk",
				exports: { ".": "./src/index.ts" },
			},
		],
	]);
	assert.match(
		sourceViolations(
			"modules/example/index.ts",
			'import x from "@rostra/module-sdk/src/manifest.ts";',
			packages,
		).join("\n"),
		/non-public import/,
	);
});
