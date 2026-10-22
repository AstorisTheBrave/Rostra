import { config } from "@rostra/config";
import { disconnectPrisma } from "@rostra/database";
import { PrismaScheduledTaskRepository } from "@rostra/operations";
import { ScheduledTaskPublisher, SchedulerPoller } from "./runtime.ts";

const [mode, id] = process.argv.slice(2);
const repository = new PrismaScheduledTaskRepository();

if (mode === "hold" && id) {
	const claims = await repository.claimDue(new Date(), 20, 1_500);
	if (!claims.some((claim) => claim.id === id)) throw new Error("task_not_claimed");
	process.stdout.write("HELD\n");
	setInterval(() => {}, 1_000);
} else if (mode === "replace") {
	if (!config.redis.url) throw new Error("redis_url_required");
	const publisher = new ScheduledTaskPublisher(config.redis.url);
	const poller = new SchedulerPoller(repository, (channel, payload) =>
		publisher.publish(channel, payload),
	);
	await poller.runOnce();
	process.stdout.write("PUBLISHED\n");
	await publisher.close();
	await disconnectPrisma();
} else {
	throw new Error("invalid_test_mode");
}
