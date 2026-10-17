import { type ActionRowBuilder, type ButtonBuilder, ButtonStyle } from "discord.js";
import { actionRow, button, buttonGrid } from "./interactive.ts";

/**
 * A Confirm / Cancel button row. Buttons use customIds `${prefix}:confirm` and `${prefix}:cancel`
 * so the owning module's ComponentHandler (prefix = module name) routes them.
 */
export function confirmRow(
	prefix: string,
	opts: { confirmLabel?: string; cancelLabel?: string } = {},
): ActionRowBuilder<ButtonBuilder> {
	return actionRow(
		button({
			id: `${prefix}:confirm`,
			label: opts.confirmLabel ?? "Confirm",
			emoji: "✅",
			style: ButtonStyle.Success,
		}),
		button({
			id: `${prefix}:cancel`,
			label: opts.cancelLabel ?? "Cancel",
			emoji: "✖️",
			style: ButtonStyle.Secondary,
		}),
	);
}

/** A single on/off toggle button: customId `${prefix}:toggle:${key}`. */
export function toggleButton(
	prefix: string,
	key: string,
	enabled: boolean,
	label: string,
): ButtonBuilder {
	return button({
		id: `${prefix}:toggle:${key}`,
		label,
		emoji: enabled ? "✅" : "❌",
		style: enabled ? ButtonStyle.Success : ButtonStyle.Secondary,
	});
}

export interface SettingItem {
	key: string;
	label: string;
	enabled: boolean;
}

/** A grid of toggle buttons for a settings panel (auto-chunked into rows). */
export function settingsPanel(
	prefix: string,
	items: SettingItem[],
): ActionRowBuilder<ButtonBuilder>[] {
	return buttonGrid(items.map((it) => toggleButton(prefix, it.key, it.enabled, it.label)));
}

/**
 * Prev / page-indicator / next row. customIds `${prefix}:page:${n}`; edges auto-disable.
 * `page` is zero-based.
 */
export function paginatorRow(
	prefix: string,
	page: number,
	totalPages: number,
): ActionRowBuilder<ButtonBuilder> {
	return actionRow(
		button({
			id: `${prefix}:page:${page - 1}`,
			emoji: "⬅️",
			style: ButtonStyle.Secondary,
			disabled: page <= 0,
		}),
		button({
			id: `${prefix}:page:current`,
			label: `${page + 1} / ${Math.max(totalPages, 1)}`,
			style: ButtonStyle.Secondary,
			disabled: true,
		}),
		button({
			id: `${prefix}:page:${page + 1}`,
			emoji: "➡️",
			style: ButtonStyle.Secondary,
			disabled: page >= totalPages - 1,
		}),
	);
}
