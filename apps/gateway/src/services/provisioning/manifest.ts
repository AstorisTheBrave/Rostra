import { commitCoherentWrite } from "@rostra/cache";
import { getPrisma, type Prisma } from "@rostra/database";
import { updateTenant } from "@/services/tenant.ts";

// Declarative description of the channels and roles Rostra's systems need. The
// engine (runProvision.ts) creates what is missing, idempotently, and each spec's
// `wire` points the owning system's config at the resolved id. Rostra is generic
// and member-role-light, so the only role provisioned is "Verified" for the
// verification gate; everything else is channels.

export interface ChannelSpec {
	/** Stable logical key stored in the tenant channelMap. */
	key: string;
	name: string;
	topic: string;
	/** Deny @everyone view at creation (staff/log channels). */
	staffOnly?: boolean;
	/** Point the owning system's config at the resolved channel id. */
	wire?: (guildId: string, channelId: string) => Promise<void>;
}

export interface RoleSpec {
	key: string;
	name: string;
	color?: number;
	wire?: (guildId: string, roleId: string) => Promise<void>;
}

function wireCachedConfig<T>(
	owner: string,
	guildId: string,
	write: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<unknown> {
	return commitCoherentWrite({ owner, tenant: `guild:${guildId}`, key: guildId }, write, () => {});
}

export const CHANNELS: ChannelSpec[] = [
	{
		key: "audit-log",
		name: "rostra-audit-log",
		topic: "Server activity and audit feed (logging module).",
		staffOnly: true,
		wire: async (guildId, id) => {
			await wireCachedConfig("logging", guildId, (tx) =>
				tx.loggingConfig.upsert({
					where: { guildId },
					create: { guildId, logChannelId: id },
					update: { logChannelId: id },
				}),
			);
			await updateTenant(guildId, { logChannelId: id });
		},
	},
	{
		key: "mod-logs",
		name: "rostra-mod-logs",
		topic: "Moderation actions: bans, kicks, timeouts, warns.",
		staffOnly: true,
		wire: async (guildId, id) => {
			await updateTenant(guildId, { modLogChannelId: id });
		},
	},
	{
		key: "automod-logs",
		name: "rostra-automod-logs",
		topic: "Automod deletions and escalation actions.",
		staffOnly: true,
		wire: async (guildId, id) => {
			await wireCachedConfig("automod", guildId, (tx) =>
				tx.automodConfig.upsert({
					where: { guildId },
					create: { guildId, logChannelId: id },
					update: { logChannelId: id },
				}),
			);
		},
	},
	{
		key: "welcome",
		name: "welcome",
		topic: "New member welcomes.",
		wire: async (guildId, id) => {
			await wireCachedConfig("welcome", guildId, (tx) =>
				tx.welcomeConfig.upsert({
					where: { guildId },
					create: { guildId, welcomeChannelId: id },
					update: { welcomeChannelId: id },
				}),
			);
			await updateTenant(guildId, { welcomeChannelId: id });
		},
	},
	{
		key: "verify",
		name: "verify",
		topic: "Verify here to unlock the rest of the server.",
		// No dedicated config field; resolved via channelMap. After provisioning,
		// post the panel with /verification panel in this channel.
	},
	{
		key: "starboard",
		name: "starboard",
		topic: "The best messages, voted by the community.",
		wire: async (guildId, id) => {
			await wireCachedConfig("starboard", guildId, async (tx) => {
				const existing = await tx.starboard.findFirst({ where: { guildId, name: "main" } });
				return existing
					? tx.starboard.update({ where: { id: existing.id }, data: { channelId: id } })
					: tx.starboard.create({ data: { guildId, name: "main", channelId: id } });
			});
		},
	},
	{
		key: "modmail",
		name: "rostra-modmail",
		topic: "Staff side of modmail threads.",
		staffOnly: true,
		wire: async (guildId, id) => {
			await wireCachedConfig("modmail", guildId, (tx) =>
				tx.modmailConfig.upsert({
					where: { guildId },
					create: { guildId, channelId: id, enabled: true },
					update: { channelId: id },
				}),
			);
		},
	},
	{
		key: "feedback",
		name: "feedback",
		topic: "Share feedback with the staff team.",
		wire: async (guildId, id) => {
			await getPrisma().feedbackConfig.upsert({
				where: { guildId },
				create: { guildId, channelId: id },
				update: { channelId: id },
			});
		},
	},
];

export const ROLES: RoleSpec[] = [
	{
		key: "verified",
		name: "Verified",
		color: 0x57f287,
		wire: async (guildId, id) => {
			await wireCachedConfig("verification", guildId, (tx) =>
				tx.verificationConfig.upsert({
					where: { guildId },
					create: { guildId, roleId: id, enabled: true },
					update: { roleId: id, enabled: true },
				}),
			);
		},
	},
];
