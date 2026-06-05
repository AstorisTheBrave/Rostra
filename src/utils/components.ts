import {
	ContainerBuilder,
	type InteractionEditReplyOptions,
	type InteractionReplyOptions,
	MessageFlags,
	type RepliableInteraction,
	SeparatorBuilder,
	SeparatorSpacingSize,
	TextDisplayBuilder,
} from "discord.js";

export const Accent = {
	success: 0x2ecc71,
	error: 0xe74c3c,
	info: 0x5865f2,
	warn: 0xf1c40f,
} as const;

export function text(markdown: string): TextDisplayBuilder {
	return new TextDisplayBuilder().setContent(markdown);
}

export function divider(large = false): SeparatorBuilder {
	return new SeparatorBuilder()
		.setDivider(true)
		.setSpacing(large ? SeparatorSpacingSize.Large : SeparatorSpacingSize.Small);
}

type ContainerChild = TextDisplayBuilder | SeparatorBuilder;

export function container(accent: number, children: ContainerChild[]): ContainerBuilder {
	const c = new ContainerBuilder().setAccentColor(accent);
	for (const child of children) {
		if (child instanceof TextDisplayBuilder) c.addTextDisplayComponents(child);
		else c.addSeparatorComponents(child);
	}
	return c;
}

export function successContainer(message: string): ContainerBuilder {
	return container(Accent.success, [text(message)]);
}

export function errorContainer(message: string): ContainerBuilder {
	return container(Accent.error, [text(`⚠️ ${message}`)]);
}

type TopLevel = ContainerBuilder | TextDisplayBuilder | SeparatorBuilder;

export type V2Response = { flags: number; components: TopLevel[] };

/** Wraps components into a V2 reply payload — always sets IsComponentsV2. */
export function buildResponse(
	components: TopLevel[],
	opts: { ephemeral?: boolean } = {},
): V2Response {
	let flags = MessageFlags.IsComponentsV2 as number;
	if (opts.ephemeral) flags |= MessageFlags.Ephemeral;
	return { flags, components };
}

async function send(
	i: RepliableInteraction,
	components: TopLevel[],
	ephemeral: boolean,
): Promise<void> {
	const payload = buildResponse(components, { ephemeral });
	if (i.deferred || i.replied) {
		await i.editReply(payload as unknown as InteractionEditReplyOptions);
	} else {
		await i.reply(payload as unknown as InteractionReplyOptions);
	}
}

export const reply = {
	async success(i: RepliableInteraction, message: string, ephemeral = false): Promise<void> {
		await send(i, [successContainer(message)], ephemeral);
	},
	async error(i: RepliableInteraction, message: string, ephemeral = true): Promise<void> {
		await send(i, [errorContainer(message)], ephemeral);
	},
	async components(
		i: RepliableInteraction,
		components: TopLevel[],
		ephemeral = false,
	): Promise<void> {
		await send(i, components, ephemeral);
	},
};
