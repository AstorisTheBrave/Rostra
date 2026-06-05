import { getPrisma } from "@/services/database.ts";
import type { ReactionRolePanel } from "@prisma/client";

export interface PanelRole {
	roleId: string;
	label: string;
	emoji?: string;
}

/** Parse the JSON roles column into a typed array. */
export function parseRoles(panel: ReactionRolePanel): PanelRole[] {
	const raw = panel.roles;
	if (!Array.isArray(raw)) return [];
	const out: PanelRole[] = [];
	for (const entry of raw) {
		if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
		const obj = entry as Record<string, unknown>;
		if (typeof obj.roleId === "string" && typeof obj.label === "string") {
			out.push({
				roleId: obj.roleId,
				label: obj.label,
				emoji: typeof obj.emoji === "string" ? obj.emoji : undefined,
			});
		}
	}
	return out;
}

export async function createPanel(
	guildId: string,
	title: string,
	mode: string,
): Promise<ReactionRolePanel> {
	return getPrisma().reactionRolePanel.create({ data: { guildId, title, mode } });
}

export async function getPanel(id: string): Promise<ReactionRolePanel | null> {
	return getPrisma().reactionRolePanel.findUnique({ where: { id } });
}

export async function listPanels(guildId: string): Promise<ReactionRolePanel[]> {
	return getPrisma().reactionRolePanel.findMany({ where: { guildId } });
}

export async function addRole(id: string, role: PanelRole): Promise<PanelRole[] | null> {
	const panel = await getPanel(id);
	if (!panel) return null;
	const roles = parseRoles(panel).filter((r) => r.roleId !== role.roleId);
	roles.push(role);
	const updated = await getPrisma().reactionRolePanel.update({
		where: { id },
		data: { roles: roles as unknown as object[] },
	});
	return parseRoles(updated);
}

export async function removeRole(id: string, roleId: string): Promise<PanelRole[] | null> {
	const panel = await getPanel(id);
	if (!panel) return null;
	const roles = parseRoles(panel).filter((r) => r.roleId !== roleId);
	const updated = await getPrisma().reactionRolePanel.update({
		where: { id },
		data: { roles: roles as unknown as object[] },
	});
	return parseRoles(updated);
}

export async function setMessage(id: string, channelId: string, messageId: string): Promise<void> {
	await getPrisma().reactionRolePanel.update({ where: { id }, data: { channelId, messageId } });
}

export async function deletePanel(id: string): Promise<void> {
	await getPrisma().reactionRolePanel.deleteMany({ where: { id } });
}
