import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { temporaryDirectory } from "@rostra/testing";

test("package boundary guard rejects private imports and duplicate shared authorities", async () => {
	assert.ok(existsSync(new URL("./check-package-boundaries.mjs", import.meta.url)));
	const { sourceViolations } = await import("./check-package-boundaries.mjs");
	const packages = new Map([
		["@rostra/config", { directory: "packages/config", exports: { ".": "./src/index.ts" } }],
		["@rostra/database", { directory: "packages/database", exports: { ".": "./src/index.ts" } }],
	]);
	for (const source of [
		'import x from "@rostra/config/src/index.ts";',
		'export * from "../../packages/config/src/index.ts";',
		'const x = import("@rostra/database/private");',
		"const x = process.env.SECRET;",
		"const x = new PrismaClient();",
	]) {
		assert.ok(sourceViolations("modules/example/index.ts", source, packages).length, source);
	}
	assert.deepEqual(
		sourceViolations(
			"modules/example/index.ts",
			'import { config } from "@rostra/config";',
			packages,
		),
		[],
	);
	assert.ok(
		sourceViolations(
			"packages/config/src/other.ts",
			'import x from "@/services/tenant.ts";',
			packages,
		).length,
	);
	assert.ok(
		sourceViolations("packages/config/src/other.ts", 'import x from "@rostra/database";', packages)
			.length,
	);
	assert.deepEqual(
		sourceViolations("packages/config/src/index.ts", "const x = process.env;", packages),
		[],
	);
	assert.deepEqual(
		sourceViolations("packages/database/src/index.ts", "const x = new PrismaClient();", packages),
		[],
	);
});

test("package guard rejects cycles and ignores private fixture directories", (t) => {
	const directory = temporaryDirectory(t);
	mkdirSync(join(directory, "games"), { recursive: true });
	for (const name of ["first", "second"]) {
		const pkg = join(directory, "packages", name);
		mkdirSync(join(pkg, "src"), { recursive: true });
		writeFileSync(join(pkg, "src/index.ts"), "export {};\n");
		writeFileSync(
			join(pkg, "package.json"),
			JSON.stringify({
				name: `@rostra/${name}`,
				type: "module",
				exports: { ".": "./src/index.ts" },
				dependencies: { [`@rostra/${name === "first" ? "second" : "first"}`]: "workspace:*" },
			}),
		);
	}
	const checker = fileURLToPath(new URL("./check-package-boundaries.mjs", import.meta.url));
	const check = () => spawnSync(process.execPath, [checker], { cwd: directory, encoding: "utf8" });
	assert.match(check().stderr, /dependency cycle/);
	writeFileSync(
		join(directory, "packages/second/package.json"),
		JSON.stringify({ name: "@rostra/second", type: "module", exports: { ".": "./src/index.ts" } }),
	);
	for (const excluded of ["archive", ".superpowers", "node_modules"]) {
		mkdirSync(join(directory, "packages/first", excluded), { recursive: true });
		writeFileSync(
			join(directory, "packages/first", excluded, "bad.ts"),
			"const x = process.env.SECRET;",
		);
	}
	assert.equal(check().status, 0);
});
