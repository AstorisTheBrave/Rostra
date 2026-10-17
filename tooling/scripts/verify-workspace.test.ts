import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const checker = join(root, "tooling/scripts/verify-workspace.mjs");
const controls = ["package.json", "pnpm-workspace.yaml", "pnpm-lock.yaml", "turbo.json"];

function check(directory: string) {
	return spawnSync(process.execPath, [checker], { cwd: directory, encoding: "utf8" });
}

function fixture(t: test.TestContext) {
	const directory = mkdtempSync(join(tmpdir(), "rostra-workspace-"));
	t.after(() => rmSync(directory, { recursive: true, force: true }));
	for (const name of controls) copyFileSync(join(root, name), join(directory, name));
	return directory;
}

test("workspace control plane accepts all six roots, frozen lock and dependency-ordered tasks", () => {
	const result = check(root);
	assert.equal(result.status, 0, result.stderr);
	assert.match(result.stdout, /Workspace control plane passed/);
});

test("verifier rejects a missing workspace root or private input exclusion", (t) => {
	for (const pattern of [
		"apps/*",
		"packages/*",
		"modules/*",
		"integrations/*",
		"games/*",
		"tooling/*",
		"!**/archive/**",
		"!**/.superpowers/**",
	]) {
		const directory = fixture(t);
		const path = join(directory, "pnpm-workspace.yaml");
		writeFileSync(path, readFileSync(path, "utf8").replace(pattern, "not-the-required-pattern"));
		const result = check(directory);
		assert.equal(result.status, 1);
		assert.ok(result.stderr.includes(pattern), result.stderr);
	}
});

test("verifier rejects a competing npm lockfile and unpinned package manager", (t) => {
	const directory = fixture(t);
	writeFileSync(join(directory, "package-lock.json"), "{}");
	assert.match(check(directory).stderr, /package-lock.json/);
	rmSync(join(directory, "package-lock.json"));
	const path = join(directory, "package.json");
	const pkg = JSON.parse(readFileSync(path, "utf8"));
	pkg.packageManager = "pnpm@latest";
	writeFileSync(path, JSON.stringify(pkg));
	assert.match(check(directory).stderr, /stable pnpm version/);
});

test("verifier rejects install side effects in root task aliases", (t) => {
	const directory = fixture(t);
	const path = join(directory, "package.json");
	const pkg = JSON.parse(readFileSync(path, "utf8"));
	pkg.scripts.build = "pnpm install && turbo run build";
	writeFileSync(path, JSON.stringify(pkg));
	assert.match(check(directory).stderr, /build/);
});

test("verifier rejects missing generation dependencies, outputs and Turbo private exclusions", (t) => {
	for (const property of ["dependsOn", "outputs", "inputs"]) {
		const directory = fixture(t);
		const path = join(directory, "turbo.json");
		const turbo = JSON.parse(readFileSync(path, "utf8"));
		delete turbo.tasks.build[property];
		writeFileSync(path, JSON.stringify(turbo));
		const result = check(directory);
		assert.equal(result.status, 1);
		assert.match(result.stderr, new RegExp(`build.*${property}`));
	}
});

test("verifier never traverses ignored archive packages", (t) => {
	const directory = fixture(t);
	mkdirSync(join(directory, "archive", "private"), { recursive: true });
	writeFileSync(join(directory, "archive", "private", "package.json"), "invalid private metadata");
	assert.equal(check(directory).status, 0);
});
