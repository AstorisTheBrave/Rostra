import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const checker = join(root, "tooling/scripts/check-repository-boundaries.mjs");
const privateDirectories = [
	"archive",
	".superpowers",
	"node_modules",
	"dist",
	"build",
	"coverage",
	"secrets",
];

test("Git excludes private inputs using repository rules on case-sensitive hosts", () => {
	const rules = readFileSync(join(root, ".gitignore"), "utf8").split(/\r?\n/);
	for (const directory of privateDirectories) {
		assert.ok(rules.includes(`${directory}/`), `missing ${directory}/ in .gitignore`);
	}
	for (const pattern of [".env", ".env.*", "*.pem", "*.key"]) {
		assert.ok(rules.includes(pattern), `missing ${pattern} in .gitignore`);
	}
});

test("Docker excludes archive, credentials and phase scratch without env exceptions", () => {
	const rules = readFileSync(join(root, ".dockerignore"), "utf8").split(/\r?\n/);
	for (const directory of [...privateDirectories, ".git"]) {
		assert.ok(rules.includes(`**/${directory}`), `missing **/${directory} in .dockerignore`);
	}
	for (const pattern of ["**/.env*", "**/*.pem", "**/*.key"]) assert.ok(rules.includes(pattern));
	assert.ok(
		!rules.some((rule) => rule.startsWith("!")),
		"Docker must not re-include private inputs",
	);
});

test("Biome excludes private inputs before descending into them", () => {
	const config = JSON.parse(readFileSync(join(root, "biome.json"), "utf8"));
	for (const directory of privateDirectories) {
		assert.ok(config.files.includes.includes(`!**/${directory}`), `Biome exposes ${directory}`);
	}
	for (const pattern of ["!**/.env*", "!**/*.pem", "!**/*.key"]) {
		assert.ok(config.files.includes.includes(pattern), `Biome exposes ${pattern}`);
	}
});

function fixture(t: test.TestContext): string {
	const directory = mkdtempSync(join(tmpdir(), "rostra-boundaries-"));
	t.after(() => rmSync(directory, { recursive: true, force: true }));
	execFileSync("git", ["init", "--quiet", directory]);
	for (const name of [".gitignore", ".dockerignore", "biome.json"]) {
		copyFileSync(join(root, name), join(directory, name));
	}
	return directory;
}

function check(directory: string) {
	return spawnSync(process.execPath, [checker], { cwd: directory, encoding: "utf8" });
}

test("checker accepts a clean checkout containing an ignored archive", (t) => {
	const directory = fixture(t);
	mkdirSync(join(directory, "archive"));
	writeFileSync(join(directory, "archive", "private.ts"), "private content");
	const result = check(directory);
	assert.equal(result.status, 0, result.stderr);
});

test("checker accepts tracked source deleted by the current change", (t) => {
	const directory = fixture(t);
	writeFileSync(join(directory, "removed.ts"), "export {};\n");
	execFileSync("git", ["add", "removed.ts"], { cwd: directory });
	rmSync(join(directory, "removed.ts"));
	const result = check(directory);
	assert.equal(result.status, 0, result.stderr);
});

test("checker rejects force-tracked archive content", (t) => {
	const directory = fixture(t);
	mkdirSync(join(directory, "archive"));
	writeFileSync(join(directory, "archive", "private.ts"), "private content");
	execFileSync("git", ["add", "--force", "archive/private.ts"], { cwd: directory });
	const result = check(directory);
	assert.equal(result.status, 1);
	assert.match(result.stderr, /Tracked private input: archive\/private.ts/);
});

test("checker rejects all tracked local environment variants except example templates", (t) => {
	const directory = fixture(t);
	writeFileSync(join(directory, ".env.example"), "EXAMPLE=placeholder");
	execFileSync("git", ["add", "--force", ".env.example"], { cwd: directory });
	assert.equal(check(directory).status, 0);
	const blob = execFileSync("git", ["hash-object", "-w", ".env.example"], {
		cwd: directory,
		encoding: "utf8",
	}).trim();
	// Populate the index directly: Windows filesystems strip a trailing dot.
	execFileSync(
		"git",
		[
			"-c",
			"core.protectNTFS=false",
			"update-index",
			"--add",
			"--cacheinfo",
			`100644,${blob},.env.`,
		],
		{
			cwd: directory,
		},
	);
	const result = check(directory);
	assert.equal(result.status, 1);
	assert.match(result.stderr, /Tracked private input: \.env\./);
});

test("checker rejects a missing exclusion for every input tool", (t) => {
	for (const name of [".gitignore", ".dockerignore", "biome.json"]) {
		const directory = fixture(t);
		const content = readFileSync(join(directory, name), "utf8");
		writeFileSync(join(directory, name), content.replaceAll("archive", "not-the-archive"));
		const result = check(directory);
		assert.equal(result.status, 1);
		assert.ok(result.stderr.includes(name), result.stderr);
	}
});

test("checker rejects implementation identifiers in tracked and new workspace source", (t) => {
	const directory = fixture(t);
	mkdirSync(join(directory, "apps", "api", "src"), { recursive: true });
	const forbidden = Buffer.from("6f70656e6169", "hex").toString().toUpperCase();
	writeFileSync(join(directory, "apps/api/src/index.ts"), `// ${forbidden}\n`);
	for (const tracked of [false, true]) {
		if (tracked) execFileSync("git", ["add", "apps"], { cwd: directory });
		const result = check(directory);
		assert.equal(result.status, 1);
		assert.match(result.stderr, /Forbidden implementation identifier: apps\/api\/src\/index.ts/);
	}
});

test("checker also covers root boot scripts, infrastructure source and package metadata", (t) => {
	for (const path of ["boot.mjs", "infra/smoke.ts", "package.json"]) {
		const directory = fixture(t);
		mkdirSync(join(directory, "infra"));
		const forbidden = Buffer.from("6f70656e6169", "hex").toString();
		writeFileSync(join(directory, path), JSON.stringify({ implementation: forbidden }));
		const result = check(directory);
		assert.equal(result.status, 1, `${path}: ${result.stdout}`);
		assert.ok(
			result.stderr.includes(`Forbidden implementation identifier: ${path}`),
			result.stderr,
		);
	}
});

test("checker scans tracked and new shell scripts while excluding private and binary inputs", (t) => {
	const directory = fixture(t);
	const forbidden = Buffer.from("6f70656e6169", "hex").toString();
	mkdirSync(join(directory, "archive"));
	mkdirSync(join(directory, "dist"));
	writeFileSync(join(directory, "archive/private.sh"), `# ${forbidden}\n`);
	writeFileSync(join(directory, "dist/generated.sh"), `# ${forbidden}\n`);
	writeFileSync(join(directory, "asset.png"), Buffer.from(`\0${forbidden}`));
	assert.equal(check(directory).status, 0);
	writeFileSync(join(directory, "probe.sh"), `#!/bin/sh\n# ${forbidden}\n`);
	for (const tracked of [false, true]) {
		if (tracked) execFileSync("git", ["add", "probe.sh"], { cwd: directory });
		const result = check(directory);
		assert.equal(result.status, 1, result.stdout);
		assert.equal(result.stderr.trim(), "Forbidden implementation identifier: probe.sh");
	}
});
