import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");
const roots = ["apps", "packages", "modules", "integrations", "games", "tooling"];
const privateDirectories = [
	"archive",
	"Archive",
	".superpowers",
	"node_modules",
	"dist",
	"build",
	"coverage",
	"secrets",
];

try {
	const pkg = JSON.parse(read("package.json"));
	assert.match(pkg.packageManager, /^pnpm@\d+\.\d+\.\d+$/, "Pin a stable pnpm version");
	assert.ok(existsSync("pnpm-lock.yaml"), "Missing pnpm-lock.yaml");
	for (const name of ["package-lock.json", "npm-shrinkwrap.json", "yarn.lock"]) {
		assert.ok(!existsSync(name), `Remove competing ${name}`);
	}
	// Keep package globs in the explicit block-list form checked here, without a YAML parser.
	const workspace = read("pnpm-workspace.yaml");
	const packages = workspace.split(/\r?\n(?=\S)/)[0];
	const patterns = [...packages.matchAll(/^ {2}- ["']([^"']+)["']\s*$/gm)].map((match) => match[1]);
	const expected = [
		...roots.map((name) => `${name}/*`),
		...privateDirectories.map((name) => `!**/${name}/**`),
	];
	for (const pattern of expected)
		assert.ok(patterns.includes(pattern), `Workspace missing ${pattern}`);
	assert.equal(patterns.length, expected.length, "Workspace package roots must stay explicit");
	assert.match(
		workspace,
		/^verifyDepsBeforeRun: error$/m,
		"Task aliases must not implicitly install",
	);
	for (const name of ["build", "typecheck", "lint", "test", "test:integration", "clean"]) {
		assert.match(
			pkg.scripts[name],
			new RegExp(`^turbo run ${name}(?: |$)`),
			`${name}: use the local Turbo graph`,
		);
		assert.doesNotMatch(
			pkg.scripts[name],
			/\b(?:install|dlx|npx|npm)\b/,
			`${name}: no task-time installs`,
		);
	}
	assert.match(pkg.scripts["check:boundaries"], /verify-workspace\.mjs/);
	assert.match(
		pkg.scripts.test,
		/--concurrency=1/,
		"Serialize test tasks to cap total active test files at two",
	);
	assert.match(pkg.scripts.test, /--test-concurrency=2/);
	assert.match(pkg.scripts.test, /tooling\/\*\*\/\*\.test\.ts/);
	const gateway = JSON.parse(read("apps/gateway/package.json"));
	assert.match(gateway.scripts.test, /--test-concurrency=2/);
	assert.match(gateway.scripts.test, /\.\.\/\.\.\/modules\/\*\*\/\*\.test\.ts/);
	const { tasks } = JSON.parse(read("turbo.json"));
	for (const name of ["build", "typecheck", "lint", "test", "test:integration", "clean"]) {
		assert.ok(Array.isArray(tasks[name]?.outputs), `${name}: declare outputs`);
		if (name !== "clean")
			assert.ok(Array.isArray(tasks[name]?.dependsOn), `${name}: declare dependsOn`);
	}
	for (const name of ["build", "typecheck", "test", "test:integration"]) {
		assert.ok(
			tasks[name].dependsOn.includes("//#prisma:generate"),
			`${name}: dependsOn must generate the client`,
		);
	}
	assert.ok(tasks.build.dependsOn.includes("^build"), "build: dependsOn must build dependencies");
	assert.ok(
		tasks.typecheck.dependsOn.includes("^typecheck"),
		"typecheck: dependsOn must check dependencies",
	);
	assert.equal(
		tasks["//#prisma:generate"].cache,
		false,
		"Client generation cannot restore platform-specific artifacts",
	);
	assert.ok(
		tasks.build.inputs?.includes("$TURBO_DEFAULT$"),
		"build: inputs must preserve Git exclusions",
	);
	for (const name of privateDirectories) {
		assert.ok(tasks.build.inputs.includes(`!**/${name}/**`), `build: inputs expose ${name}`);
	}
	console.log("Workspace control plane passed.");
} catch (error) {
	console.error(error instanceof Error ? error.message : String(error));
	process.exitCode = 1;
}
