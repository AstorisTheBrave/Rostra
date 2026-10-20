export interface ModuleEventDescriptor<Name extends string = string> {
	name: Name;
	once: boolean;
}

export interface ModuleEventV1<Payload = unknown> {
	schemaVersion: 1;
	owner: string;
	tenant: string;
	name: string;
	payload: Payload;
}

export interface VersionedModuleEventDescriptor<Name extends string = string>
	extends ModuleEventDescriptor<Name> {
	owner: string;
	validatePayload(value: unknown): boolean;
}

/** Validate a module event at its transport boundary for an exact tenant. */
export function validateModuleEvent<Payload>(
	descriptor: VersionedModuleEventDescriptor,
	value: unknown,
	tenant: string,
): ModuleEventV1<Payload> {
	if (!value || typeof value !== "object" || Array.isArray(value))
		throw new Error("Invalid module event");
	const event = value as Record<string, unknown>;
	if (
		event.schemaVersion !== 1 ||
		event.owner !== descriptor.owner ||
		event.name !== descriptor.name ||
		typeof event.tenant !== "string" ||
		!/^(guild|user):[A-Za-z0-9_-]{1,128}$/.test(event.tenant) ||
		event.tenant !== tenant ||
		!descriptor.validatePayload(event.payload)
	)
		throw new Error("Invalid module event");
	return value as ModuleEventV1<Payload>;
}

export interface DisposableEventRegistration<Client, Name extends string = string>
	extends ModuleEventDescriptor<Name> {
	register(client: Client): () => void;
}
