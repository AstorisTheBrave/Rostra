import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const names = [
	"config",
	"contracts",
	"database",
	"cache",
	"logger",
	"i18n",
	"discord-ui",
	"testing",
	"auth",
	"operations",
];

for (const name of names) {
	test(`@rostra/${name} exposes working public exports and hides source paths`, async () => {
		const manifest = `${root}/packages/${name}/package.json`;
		assert.ok(existsSync(manifest), `Missing @rostra/${name}`);
		const pkg = JSON.parse(readFileSync(manifest, "utf8"));
		assert.equal(pkg.type, "module");
		assert.ok(pkg.exports["."]);
		for (const key of Object.keys(pkg.exports)) {
			assert.ok(!key.includes("*"), "Exports must be explicit");
			await import(`@rostra/${name}${key.slice(1)}`);
		}
		await assert.rejects(import(`@rostra/${name}/src/index.ts`), {
			code: "ERR_PACKAGE_PATH_NOT_EXPORTED",
		});
	});
}
