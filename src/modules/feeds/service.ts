import type { FeedSubscription } from "@prisma/client";
import { REST, Routes } from "discord.js";
import { config } from "@/config.ts";
import { getPrisma } from "@/services/database.ts";
import { getLogger } from "@/services/logger.ts";

const log = getLogger("feeds");

// ── DB ───────────────────────────────────────────────────────────────────────

export async function createSub(data: {
	guildId: string;
	channelId: string;
	type: "youtube" | "twitch";
	sourceId: string;
	sourceName?: string;
	mention?: string | null;
	lastItemId?: string | null;
}): Promise<FeedSubscription> {
	return getPrisma().feedSubscription.upsert({
		where: {
			guildId_type_sourceId: { guildId: data.guildId, type: data.type, sourceId: data.sourceId },
		},
		create: data,
		update: {
			channelId: data.channelId,
			sourceName: data.sourceName,
			mention: data.mention ?? null,
		},
	});
}

export async function listSubs(guildId: string): Promise<FeedSubscription[]> {
	return getPrisma().feedSubscription.findMany({
		where: { guildId },
		orderBy: { createdAt: "asc" },
	});
}

export async function removeSub(id: string, guildId: string): Promise<boolean> {
	const res = await getPrisma().feedSubscription.deleteMany({ where: { id, guildId } });
	return res.count > 0;
}

async function allSubs(): Promise<FeedSubscription[]> {
	return getPrisma().feedSubscription.findMany();
}

async function setLastItem(id: string, lastItemId: string | null): Promise<void> {
	await getPrisma().feedSubscription.updateMany({ where: { id }, data: { lastItemId } });
}

// ── YouTube (keyless RSS) ────────────────────────────────────────────────────

export interface YouTubeVideo {
	videoId: string;
	title: string;
	url: string;
}

/** Parse the newest video out of a YouTube channel RSS feed. */
export function parseYouTubeFeed(xml: string): YouTubeVideo | null {
	const entry = xml.match(/<entry>([\s\S]*?)<\/entry>/)?.[1];
	if (!entry) return null;
	const videoId = entry.match(/<yt:videoId>([^<]+)<\/yt:videoId>/)?.[1];
	const title = entry.match(/<title>([^<]*)<\/title>/)?.[1];
	if (!videoId) return null;
	return {
		videoId,
		title: (title ?? "New video").trim(),
		url: `https://www.youtube.com/watch?v=${videoId}`,
	};
}

/** Pull a YouTube channel id (UC...) from a raw id or a channel URL. */
export function extractYouTubeChannelId(input: string): string | null {
	return input.match(/(UC[\w-]{20,})/)?.[1] ?? null;
}

/** Resolve a YouTube channel id from an id, /channel/ URL, or @handle (best effort). */
export async function resolveYouTubeChannelId(input: string): Promise<string | null> {
	const direct = extractYouTubeChannelId(input.trim());
	if (direct) return direct;
	const handle = input.trim().replace(/^@/, "");
	const url = input.startsWith("http") ? input : `https://www.youtube.com/@${handle}`;
	try {
		const html = await (await fetch(url, { signal: AbortSignal.timeout(5000) })).text();
		return html.match(/"channelId":"(UC[\w-]+)"/)?.[1] ?? extractYouTubeChannelId(html);
	} catch {
		return null;
	}
}

/** Validate a channel and get its name + latest video id (to seed without spamming). */
export async function youtubePreview(
	channelId: string,
): Promise<{ name: string; latestVideoId: string | null } | null> {
	try {
		const res = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`, {
			signal: AbortSignal.timeout(5000),
		});
		if (!res.ok) return null;
		const xml = await res.text();
		const name = xml.match(/<author>[\s\S]*?<name>([^<]+)<\/name>/)?.[1]?.trim();
		return { name: name ?? channelId, latestVideoId: parseYouTubeFeed(xml)?.videoId ?? null };
	} catch {
		return null;
	}
}

async function fetchLatestYouTube(channelId: string): Promise<YouTubeVideo | null> {
	try {
		const res = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`, {
			signal: AbortSignal.timeout(5000),
		});
		if (!res.ok) return null;
		return parseYouTubeFeed(await res.text());
	} catch {
		return null;
	}
}

// ── Twitch (Helix, needs app credentials) ────────────────────────────────────

export function twitchConfigured(): boolean {
	return Boolean(config.twitch.clientId && config.twitch.clientSecret);
}

let twitchToken: { value: string; expires: number } | null = null;

async function getTwitchToken(): Promise<string | null> {
	if (!twitchConfigured()) return null;
	if (twitchToken && twitchToken.expires > Date.now()) return twitchToken.value;
	try {
		const res = await fetch(
			`https://id.twitch.tv/oauth2/token?client_id=${config.twitch.clientId}&client_secret=${config.twitch.clientSecret}&grant_type=client_credentials`,
			{ method: "POST", signal: AbortSignal.timeout(5000) },
		);
		if (!res.ok) return null;
		const data = (await res.json()) as { access_token: string; expires_in: number };
		twitchToken = { value: data.access_token, expires: Date.now() + (data.expires_in - 60) * 1000 };
		return twitchToken.value;
	} catch {
		return null;
	}
}

export interface TwitchStream {
	id: string;
	title: string;
	login: string;
}

async function fetchTwitchStream(login: string): Promise<TwitchStream | null> {
	const token = await getTwitchToken();
	if (!token || !config.twitch.clientId) return null;
	try {
		const res = await fetch(`https://api.twitch.tv/helix/streams?user_login=${login}`, {
			headers: { "Client-ID": config.twitch.clientId, Authorization: `Bearer ${token}` },
			signal: AbortSignal.timeout(5000),
		});
		if (!res.ok) return null;
		const data = (await res.json()) as {
			data?: Array<{ id: string; title: string; user_login: string }>;
		};
		const stream = data.data?.[0];
		return stream ? { id: stream.id, title: stream.title, login: stream.user_login } : null;
	} catch {
		return null;
	}
}

// ── Polling (runs in the manager cron; posts via REST, no gateway client) ─────

function mentionText(mention: string | null): string {
	if (!mention) return "";
	if (mention === "everyone") return "@everyone ";
	return `<@&${mention}> `;
}

let rest: REST | undefined;
function getRest(): REST {
	if (!rest) rest = new REST().setToken(config.discord.token);
	return rest;
}

async function post(channelId: string, content: string): Promise<void> {
	await getRest()
		.post(Routes.channelMessages(channelId), { body: { content } })
		.catch(() => {});
}

/** Poll every subscription once and post anything new. Called by the cron. */
export async function pollAllFeeds(): Promise<void> {
	const subs = await allSubs();
	for (const sub of subs) {
		try {
			if (sub.type === "youtube") {
				const latest = await fetchLatestYouTube(sub.sourceId);
				if (!latest) continue;
				if (sub.lastItemId === null) {
					await setLastItem(sub.id, latest.videoId); // seed without spamming history
				} else if (latest.videoId !== sub.lastItemId) {
					await post(
						sub.channelId,
						`${mentionText(sub.mention)}**${sub.sourceName ?? "A channel"}** posted a new video: ${latest.title}\n${latest.url}`,
					);
					await setLastItem(sub.id, latest.videoId);
				}
			} else if (sub.type === "twitch") {
				const stream = await fetchTwitchStream(sub.sourceId);
				if (stream) {
					if (stream.id !== sub.lastItemId) {
						await post(
							sub.channelId,
							`${mentionText(sub.mention)}**${sub.sourceName ?? sub.sourceId}** is now live: ${stream.title}\nhttps://twitch.tv/${sub.sourceId}`,
						);
						await setLastItem(sub.id, stream.id);
					}
				} else if (sub.lastItemId !== null) {
					await setLastItem(sub.id, null); // went offline; next stream will notify
				}
			}
		} catch (err) {
			log.error({ err, sub: sub.id }, "feed poll failed");
		}
	}
}
