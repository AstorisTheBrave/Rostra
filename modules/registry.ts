import { gatewayManifest, type ModuleManifestV1, validateModuleManifest } from "@rostra/module-sdk";
import type { BotModule } from "@/types/module.ts";

export interface CheckedInModule {
	manifest: ModuleManifestV1;
	load: () => Promise<{ default: BotModule }>;
}

function entry(
	id: string,
	load: CheckedInModule["load"],
	metadata?: Partial<Omit<ModuleManifestV1, "id" | "schemaVersion">>,
): CheckedInModule {
	const manifest = gatewayManifest(id);
	return {
		manifest: metadata ? validateModuleManifest({ ...manifest, ...metadata }) : manifest,
		load,
	};
}

export const moduleRegistry: readonly CheckedInModule[] = [
	entry("ai", () => import("./ai/index.ts")),
	entry("automod", () => import("./automod/index.ts")),
	entry("birthday", () => import("./birthday/index.ts")),
	entry("bulkrole", () => import("./bulkrole/index.ts")),
	entry("core", () => import("./core/index.ts")),
	entry("counting", () => import("./counting/index.ts")),
	entry("economy", () => import("./economy/index.ts")),
	entry("extras", () => import("./extras/index.ts")),
	entry("feedback", () => import("./feedback/index.ts")),
	entry("feeds", () => import("./feeds/index.ts")),
	entry("games", () => import("./games/index.ts")),
	entry("giveaways", () => import("./giveaways/index.ts")),
	entry("highlight", () => import("./highlight/index.ts")),
	entry("joinToCreate", () => import("./joinToCreate/index.ts")),
	entry("leveling", () => import("./leveling/index.ts")),
	entry("logging", () => import("./logging/index.ts")),
	entry("moderation", () => import("./moderation/index.ts")),
	entry("modmail", () => import("./modmail/index.ts")),
	entry("music", () => import("./music/index.ts")),
	entry("owner", () => import("./owner/index.ts")),
	entry("poll", () => import("./poll/index.ts")),
	entry("preferences", () => import("./preferences/index.ts")),
	entry("profile", () => import("./profile/index.ts")),
	entry("reactionroles", () => import("./reactionroles/index.ts")),
	entry("reminders", () => import("./reminders/index.ts")),
	entry("reputation", () => import("./reputation/index.ts")),
	entry("roleplay", () => import("./roleplay/index.ts")),
	entry("security", () => import("./security/index.ts")),
	entry("serverstats", () => import("./serverstats/index.ts")),
	entry("setup", () => import("./setup/index.ts")),
	entry("starboard", () => import("./starboard/index.ts")),
	entry("steal", () => import("./steal/index.ts")),
	entry("sticky", () => import("./sticky/index.ts")),
	entry("suggest", () => import("./suggest/index.ts")),
	entry("tags", () => import("./tags/index.ts")),
	entry("tickets", () => import("./tickets/index.ts")),
	entry("trivia", () => import("./trivia/index.ts")),
	entry("utility", () => import("./utility/index.ts")),
	entry("vanityroles", () => import("./vanityroles/index.ts")),
	entry("verification", () => import("./verification/index.ts")),
	entry("voicerole", () => import("./voicerole/index.ts")),
	entry("welcome", () => import("./welcome/index.ts")),
];
