import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
	chmodSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

const shell = process.platform === "win32" ? "C:/Program Files/Git/bin/bash.exe" : "sh";

test("exhausted migrations fail startup before the application command runs", () => {
	const directory = mkdtempSync(join(tmpdir(), "rostra-startup-"));
	try {
		const bin = join(directory, "bin");
		const marker = join(directory, "app-started");
		const attempts = join(directory, "attempts");
		const pnpm = join(bin, "pnpm");
		mkdirSync(bin);
		writeFileSync(pnpm, '#!/bin/sh\nprintf x >> "$MIGRATION_COUNTER"\nexit 23\n');
		chmodSync(pnpm, 0o755);
		const result = spawnSync(shell, ["infra/start-app.sh", "sh", "-c", `touch '${marker}'`], {
			encoding: "utf8",
			env: {
				...process.env,
				PATH: `${bin}:${process.env.PATH ?? ""}`,
				MIGRATION_ATTEMPTS: "3",
				MIGRATION_RETRY_SECONDS: "0",
				MIGRATION_COUNTER: attempts,
			},
		});
		assert.equal(result.status, 23, result.stderr);
		assert.equal(readFileSync(attempts, "utf8").length, 3);
		assert.equal(existsSync(marker), false);
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
});

test("successful migration starts the requested application command", () => {
	const directory = mkdtempSync(join(tmpdir(), "rostra-startup-"));
	try {
		const bin = join(directory, "bin");
		const marker = join(directory, "app-started");
		const pnpm = join(bin, "pnpm");
		mkdirSync(bin);
		writeFileSync(pnpm, "#!/bin/sh\nexit 0\n");
		chmodSync(pnpm, 0o755);
		const result = spawnSync(shell, ["infra/start-app.sh", "sh", "-c", `touch '${marker}'`], {
			encoding: "utf8",
			env: {
				...process.env,
				PATH: `${bin}:${process.env.PATH ?? ""}`,
				MIGRATION_ATTEMPTS: "1",
				MIGRATION_RETRY_SECONDS: "0",
			},
		});
		assert.equal(result.status, 0, result.stderr);
		assert.equal(existsSync(marker), true);
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
});
