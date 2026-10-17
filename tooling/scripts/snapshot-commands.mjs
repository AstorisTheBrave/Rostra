import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import net from "node:net";
import tls from "node:tls";
import { fileURLToPath } from "node:url";
import { Collection } from "discord.js";

let networkAttempts = 0;
const blocked = () => {
	networkAttempts++;
	throw new Error("Network access is blocked during command snapshot verification");
};
net.Socket.prototype.connect = blocked;
net.connect = blocked;
net.createConnection = blocked;
tls.connect = blocked;
globalThis.fetch = blocked;
syncBuiltinESMExports();

const fixture = fileURLToPath(new URL("../fixtures/gateway-commands.json", import.meta.url));
const { loadModules } = await import("../../apps/gateway/src/client/loaders/modules.ts");
const { collectCommandJSON, registerCommands } = await import(
	"../../apps/gateway/src/client/loaders/commands.ts"
);
const client = { commands: new Collection() };
registerCommands(client, await loadModules());
const snapshot = JSON.parse(
	JSON.stringify(collectCommandJSON(client).sort((a, b) => a.name.localeCompare(b.name))),
);
const json = `${JSON.stringify(snapshot, null, "\t")}\n`;

if (process.argv.includes("--write")) writeFileSync(fixture, json);
else assert.deepEqual(snapshot, JSON.parse(readFileSync(fixture, "utf8")));
assert.equal(networkAttempts, 0);
console.log(`Command snapshot passed: ${snapshot.length} commands, zero network attempts.`);
