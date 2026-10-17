import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { temporaryDirectory } from "@rostra/testing";

const root = fileURLToPath(new URL("../../", import.meta.url));
const checker = join(root, "tooling/scripts/verify-workspace.mjs");
const controls = ["package.json", "pnpm-workspace.yaml", "pnpm-lock.yaml", "turbo.json"];

test("active installation guides never bypass the frozen workspace lock with npm", () => {
	const guides = ["README.md", "CONTRIBUTING.md"];
	for (const directory of ["docs/wiki", "docs/infrastructure"]) {
		for (const entry of readdirSync(join(root, directory), { withFileTypes: true })) {
			if (entry.isFile() && /\.mdx?$/.test(entry.name)) guides.push(`${directory}/${entry.name}`);
		}
	}
	const stale = guides.filter((path) =>
		/\bnpm\s+(?:install|ci)\b/.test(readFileSync(join(root, path), "utf8")),
	);
	assert.deepEqual(stale, [], "Active install guides must use pnpm install --frozen-lockfile");
});

function check(directory: string) {
	return spawnSync(process.execPath, [checker], { cwd: directory, encoding: "utf8" });
}

function fixture(t: test.TestContext) {
	const directory = temporaryDirectory(t);
	for (const name of controls) copyFileSync(join(root, name), join(directory, name));
	return directory;
}

test("workspace control plane accepts all six roots, frozen lock and dependency-ordered tasks", () => {
	const result = check(root);
	assert.equal(result.status, 0, result.stderr);
	assert.match(result.stdout, /Workspace control plane passed/);
});

test("source-package build overrides retain generation and dependency ordering", () => {
	const { tasks } = JSON.parse(readFileSync(join(root, "turbo.json"), "utf8"));
	for (const [name, task] of Object.entries(tasks)) {
		if (!name.startsWith("@rostra/") || !name.endsWith("#build")) continue;
		assert.ok(task && typeof task === "object" && "dependsOn" in task, name);
		const dependencies = task.dependsOn;
		assert.ok(Array.isArray(dependencies) && dependencies.includes("//#prisma:generate"), name);
		assert.ok(dependencies.includes("^build"), name);
	}
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
