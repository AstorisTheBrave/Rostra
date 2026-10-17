import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import net from "node:net";
import tls from "node:tls";
import { fileURLToPath } from "node:url";
import { GatewayIntentBits, Partials } from "discord.js";

let networkAttempts = 0;
const blocked = () => {
	networkAttempts++;
	throw new Error("Network access is blocked during module snapshot verification");
};
net.Socket.prototype.connect = blocked;
net.connect = blocked;
net.createConnection = blocked;
tls.connect = blocked;
globalThis.fetch = blocked;
syncBuiltinESMExports();

const fixture = fileURLToPath(new URL("../fixtures/gateway-modules.json", import.meta.url));
const { GATEWAY_INTENTS, GATEWAY_PARTIALS } = await import(
	"../../apps/gateway/src/client/BotClient.ts"
);
const { loadModules } = await import("../../apps/gateway/src/client/loaders/modules.ts");
const { listFeatures } = await import("../../apps/gateway/src/services/featureFlags.ts");
const modules = await loadModules();
const snapshot = {
	intents: GATEWAY_INTENTS.map((intent) => GatewayIntentBits[intent]).sort(),
	partials: GATEWAY_PARTIALS.map((partial) => Partials[partial]).sort(),
	featureFlags: listFeatures(),
	modules: modules
		.map((module) => ({
			name: module.name,
			commands: (module.commands ?? []).map((command) => command.data.name).sort(),
			events: (module.events ?? [])
				.map((event) => ({ name: event.name, once: event.once }))
				.sort((a, b) => a.name.localeCompare(b.name)),
			components: (module.components ?? []).map((component) => component.prefix).sort(),
			jobs: (module.jobs ?? [])
				.map((job) => ({ name: job.name, cron: job.cron ?? null }))
				.sort((a, b) => a.name.localeCompare(b.name)),
		}))
		.sort((a, b) => a.name.localeCompare(b.name)),
};
const json = `${JSON.stringify(snapshot, null, "\t")}\n`;

if (process.argv.includes("--write")) writeFileSync(fixture, json);
else assert.deepEqual(snapshot, JSON.parse(readFileSync(fixture, "utf8")));
assert.equal(networkAttempts, 0);
console.log(
	`Module snapshot passed: ${snapshot.modules.length} modules, ${snapshot.modules.reduce((count, module) => count + module.events.length, 0)} events, zero network attempts.`,
);
