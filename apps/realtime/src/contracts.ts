export interface RealtimeConnectionRequest {
	guildId: string;
}

export interface RealtimeConnectionAuthorization {
	status: "authorized";
	guildId: string;
}
