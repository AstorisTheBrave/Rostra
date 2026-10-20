export interface ModuleEventDescriptor<Name extends string = string> {
	name: Name;
	once: boolean;
}

export interface DisposableEventRegistration<Client, Name extends string = string>
	extends ModuleEventDescriptor<Name> {
	register(client: Client): () => void;
}
