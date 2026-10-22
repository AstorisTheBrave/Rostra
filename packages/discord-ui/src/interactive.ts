import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	ModalBuilder,
	StringSelectMenuBuilder,
	StringSelectMenuOptionBuilder,
	TextInputBuilder,
	TextInputStyle,
} from "discord.js";

export interface ButtonSpec {
	/** customId for action buttons (omit for link buttons). */
	id?: string;
	/** URL for a link button (mutually exclusive with `id`). */
	url?: string;
	label?: string;
	emoji?: string;
	style?: ButtonStyle;
	disabled?: boolean;
}

/** A single button. Provide `url` for a link button, otherwise `id` for an action button. */
export function button(spec: ButtonSpec): ButtonBuilder {
	const b = new ButtonBuilder();
	if (spec.url) b.setStyle(ButtonStyle.Link).setURL(spec.url);
	else {
		b.setStyle(spec.style ?? ButtonStyle.Secondary);
		if (spec.id) b.setCustomId(spec.id);
	}
	if (spec.label) b.setLabel(spec.label);
	if (spec.emoji) b.setEmoji(spec.emoji);
	b.setDisabled(spec.disabled ?? false);
	return b;
}

/** Shorthand for a link button. */
export function linkButton(label: string, url: string, emoji?: string): ButtonBuilder {
	return button({ url, label, ...(emoji ? { emoji } : {}) });
}

/** One action row of buttons (max 5). */
export function actionRow(...buttons: ButtonBuilder[]): ActionRowBuilder<ButtonBuilder> {
	return new ActionRowBuilder<ButtonBuilder>().addComponents(...buttons);
}

/** Chunk buttons into rows of 5 (Discord's max), capped at 5 rows. */
export function buttonGrid(buttons: ButtonBuilder[]): ActionRowBuilder<ButtonBuilder>[] {
	const rows: ActionRowBuilder<ButtonBuilder>[] = [];
	for (let i = 0; i < buttons.length && rows.length < 5; i += 5) {
		rows.push(actionRow(...buttons.slice(i, i + 5)));
	}
	return rows;
}

export interface SelectOption {
	label: string;
	value: string;
	description?: string;
	emoji?: string;
	default?: boolean;
}

/** A string select menu wrapped in its action row. */
export function stringSelect(
	id: string,
	options: SelectOption[],
	opts: { placeholder?: string; min?: number; max?: number } = {},
): ActionRowBuilder<StringSelectMenuBuilder> {
	const menu = new StringSelectMenuBuilder().setCustomId(id).addOptions(
		options.map((o) => {
			const builder = new StringSelectMenuOptionBuilder().setLabel(o.label).setValue(o.value);
			if (o.description) builder.setDescription(o.description);
			if (o.emoji) builder.setEmoji(o.emoji);
			if (o.default) builder.setDefault(true);
			return builder;
		}),
	);
	if (opts.placeholder) menu.setPlaceholder(opts.placeholder);
	if (opts.min !== undefined) menu.setMinValues(opts.min);
	if (opts.max !== undefined) menu.setMaxValues(opts.max);
	return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu);
}

export interface TextInputSpec {
	id: string;
	label: string;
	style?: "short" | "paragraph";
	placeholder?: string;
	required?: boolean;
	value?: string;
	min?: number;
	max?: number;
}

/** A modal text input wrapped in its action row. */
export function textInput(spec: TextInputSpec): ActionRowBuilder<TextInputBuilder> {
	const input = new TextInputBuilder()
		.setCustomId(spec.id)
		.setLabel(spec.label)
		.setStyle(spec.style === "paragraph" ? TextInputStyle.Paragraph : TextInputStyle.Short)
		.setRequired(spec.required ?? true);
	if (spec.placeholder) input.setPlaceholder(spec.placeholder);
	if (spec.value) input.setValue(spec.value);
	if (spec.min !== undefined) input.setMinLength(spec.min);
	if (spec.max !== undefined) input.setMaxLength(spec.max);
	return new ActionRowBuilder<TextInputBuilder>().addComponents(input);
}

/** A modal dialog from text-input rows. */
export function modal(
	id: string,
	title: string,
	inputs: ActionRowBuilder<TextInputBuilder>[],
): ModalBuilder {
	return new ModalBuilder()
		.setCustomId(id)
		.setTitle(title)
		.addComponents(...inputs);
}
