import { syncCommands } from "@/services/commandSync.ts";
import { getLogger } from "@/services/logger.ts";

const log = getLogger("deploy");

// Manual deploy: force re-registration regardless of the stored hash. The bot
// also auto-syncs on boot (only when commands changed), so this is just an
// escape hatch for forcing an update.
syncCommands(true)
	.then((r) => {
		log.info({ count: r.count }, "force-registered global application commands");
		process.exit(0);
	})
	.catch((err) => {
		log.error({ err }, "command deployment failed");
		process.exit(1);
	});
