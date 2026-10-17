import { existsSync, readdirSync, readFileSync } from "node:fs";
import { posix, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const excluded = new Set([
	"archive",
	"Archive",
	".superpowers",
	"node_modules",
	"dist",
	"build",
	"coverage",
	"secrets",
	".git",
	".turbo",
]);

function files(directory) {
	if (!existsSync(directory)) return [];
	return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		if (excluded.has(entry.name)) return [];
		const path = `${directory}/${entry.name}`;
		return entry.isDirectory() ? files(path) : [path];
	});
}

export function sourceViolations(path, source, packages) {
	const errors = [];
	const owner = [...packages.values()].find((pkg) => path.startsWith(`${pkg.directory}/`));
	// Ignore comments, while preserving quoted import specifiers and literal URLs.
	const code = source.replace(
		/("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')|\/\*[\s\S]*?\*\/|\/\/[^\r\n]*/g,
		(_match, quoted) => quoted ?? " ",
	);
	if (
		path !== "packages/config/src/index.ts" &&
		/\bprocess\s*(?:\.\s*env|\[\s*["']env["']\s*\])/.test(code)
	)
		errors.push(`${path}: environment belongs to config`);
	if (path !== "packages/database/src/index.ts" && /\bnew\s+PrismaClient\s*\(/.test(code))
		errors.push(`${path}: client construction belongs to database`);
	for (const match of code.matchAll(/\b(?:from\s*|import\s*(?:\(\s*)?)["']([^"']+)["']/g)) {
		const specifier = match[1];
		if (specifier.startsWith("@rostra/")) {
			const parts = specifier.split("/");
			const name = parts.slice(0, 2).join("/");
			const pkg = packages.get(name);
			const subpath = parts.length === 2 ? "." : `./${parts.slice(2).join("/")}`;
			if (!pkg || !Object.hasOwn(pkg.exports, subpath))
				errors.push(`${path}: non-public import ${specifier}`);
			if (owner && pkg !== owner && !owner.dependencies?.[name])
				errors.push(`${path}: undeclared package dependency ${name}`);
		} else if (specifier.startsWith(".")) {
			const target = posix.normalize(posix.join(posix.dirname(path), specifier));
			const targetOwner = [...packages.values()].find((pkg) =>
				target.startsWith(`${pkg.directory}/`),
			);
			if (
				(targetOwner && targetOwner !== owner) ||
				(owner && !target.startsWith(`${owner.directory}/`))
			)
				errors.push(`${path}: cross-owner relative import ${specifier}`);
		} else if (owner && specifier.startsWith("@/"))
			errors.push(`${path}: package depends on legacy alias ${specifier}`);
		if (specifier === "@prisma/client" && !path.startsWith("packages/database/"))
			errors.push(`${path}: use the database public types`);
	}
	return errors;
}

export function checkPackages() {
	const packages = new Map();
	const errors = [];
	for (const entry of readdirSync("packages", { withFileTypes: true })) {
		if (!entry.isDirectory() || excluded.has(entry.name)) continue;
		const directory = `packages/${entry.name}`;
		const pkg = JSON.parse(readFileSync(`${directory}/package.json`, "utf8"));
		if (pkg.type !== "module" || !pkg.exports?.["."])
			errors.push(`${directory}: missing ESM public export`);
		for (const [key, target] of Object.entries(pkg.exports ?? {})) {
			if (
				key.includes("*") ||
				typeof target !== "string" ||
				!target.startsWith("./src/") ||
				target.includes("..") ||
				!existsSync(`${directory}/${target}`)
			)
				errors.push(`${directory}: invalid export ${key}`);
		}
		packages.set(pkg.name, { ...pkg, directory });
	}
	const visiting = new Set();
	const visited = new Set();
	function visit(name) {
		if (visiting.has(name)) {
			errors.push(`Package dependency cycle: ${name}`);
			return;
		}
		if (visited.has(name)) return;
		visiting.add(name);
		for (const dependency of Object.keys(packages.get(name)?.dependencies ?? {})) {
			if (packages.has(dependency)) visit(dependency);
		}
		visiting.delete(name);
		visited.add(name);
	}
	for (const name of packages.keys()) visit(name);
	for (const directory of ["src", "apps", "modules", "packages", "integrations", "games"]) {
		for (const path of files(directory)) {
			if (/\.[cm]?[jt]sx?$/.test(path))
				errors.push(...sourceViolations(path, readFileSync(path, "utf8"), packages));
		}
	}
	return errors;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
	const errors = checkPackages();
	if (errors.length) {
		console.error(errors.join("\n"));
		process.exitCode = 1;
	} else console.log("Shared package boundaries passed.");
}
