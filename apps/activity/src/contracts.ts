export interface ActivitySessionRequest {
	guildId: string;
}

export interface ActivitySessionAuthorization {
	status: "authorized";
	guildId: string;
}
