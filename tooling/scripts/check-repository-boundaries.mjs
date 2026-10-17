import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const directories = [
	"archive",
	"Archive",
	".superpowers",
	"node_modules",
	"dist",
	"build",
	"coverage",
	"secrets",
];
const errors = [];
const git = (...args) =>
	execFileSync("git", args, { encoding: "utf8" }).split("\0").filter(Boolean);
const read = (path) => readFileSync(path, "utf8");
const requireRules = (name, rules, required) => {
	for (const rule of required) {
		if (!rules.includes(rule)) errors.push(`${name}: missing exclusion ${rule}`);
	}
};

try {
	const gitRules = read(".gitignore").split(/\r?\n/);
	requireRules(".gitignore", gitRules, [
		...directories.map((name) => `${name}/`),
		".env",
		".env.*",
		"*.pem",
		"*.key",
	]);
	const dockerRules = read(".dockerignore").split(/\r?\n/);
	requireRules(".dockerignore", dockerRules, [
		...directories.map((name) => `**/${name}`),
		"**/.git",
		"**/.env*",
		"**/*.pem",
		"**/*.key",
	]);
	if (dockerRules.some((rule) => rule.trim().startsWith("!"))) {
		errors.push(".dockerignore: re-inclusion rules can expose private inputs");
	}
	const biomeRules = JSON.parse(read("biome.json")).files.includes;
	requireRules("biome.json", biomeRules, [
		...directories.map((name) => `!**/${name}`),
		"!**/.env*",
		"!**/*.pem",
		"!**/*.key",
	]);
	if (biomeRules.some((rule, index) => index > 0 && !rule.startsWith("!"))) {
		errors.push("biome.json: later inclusion rules can expose private inputs");
	}
	const privatePath = (path) =>
		path.split("/").some((part) => directories.includes(part)) ||
		(/(^|\/)\.env(?:\..*)?$/.test(path) && !/(^|\/)\.env\.example$/.test(path)) ||
		/\.(pem|key)$/.test(path);
	const tracked = git("ls-files", "-z", "--cached");
	const visible = git("ls-files", "-z", "--others", "--exclude-standard");
	for (const path of tracked) {
		if (privatePath(path)) errors.push(`Tracked private input: ${path}`);
	}
	for (const path of visible) {
		if (privatePath(path)) errors.push(`Tool-visible private input: ${path}`);
	}
	// Encode deny-list entries so the guard itself respects source neutrality.
	const identifiers = [
		"6f70656e6169",
		"616e7468726f706963",
		"636c61756465",
		"67726f71",
		"67656d696e69",
		"6d69737472616c",
	].map((value) => Buffer.from(value, "hex").toString());
	const wholeWords = ["677074", "6c6c616d61"].map((value) => Buffer.from(value, "hex").toString());
	const forbidden = new RegExp(`${identifiers.join("|")}|\\b(${wholeWords.join("|")})\\b`, "i");
	for (const path of [...new Set([...tracked, ...visible])].sort()) {
		if (privatePath(path)) continue;
		if (!/\.(?:[cm]?[jt]sx?|json)$/.test(path)) continue;
		if (forbidden.test(read(path))) errors.push(`Forbidden implementation identifier: ${path}`);
	}
} catch (error) {
	errors.push(
		`Repository boundary check failed: ${error instanceof Error ? error.message : String(error)}`,
	);
}

if (errors.length) {
	console.error([...new Set(errors)].sort().join("\n"));
	process.exitCode = 1;
} else {
	console.log("Repository boundaries passed.");
}
