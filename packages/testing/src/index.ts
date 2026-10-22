import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** A fresh fixture directory removed after the test, including on failure. */
export function temporaryDirectory(context: { after(fn: () => void): void }): string {
	const directory = mkdtempSync(join(tmpdir(), "rostra-test-"));
	context.after(() => rmSync(directory, { recursive: true, force: true }));
	return directory;
}
