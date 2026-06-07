import assert from "node:assert/strict";
import { test } from "node:test";
import { extractYouTubeChannelId, parseYouTubeFeed } from "./service.ts";

test("parseYouTubeFeed extracts the newest video", () => {
	const xml = `<feed><entry><yt:videoId>abc123</yt:videoId><title>Cool Video</title></entry><entry><yt:videoId>old</yt:videoId><title>Old</title></entry></feed>`;
	assert.deepEqual(parseYouTubeFeed(xml), {
		videoId: "abc123",
		title: "Cool Video",
		url: "https://www.youtube.com/watch?v=abc123",
	});
});

test("parseYouTubeFeed returns null when there are no entries", () => {
	assert.equal(parseYouTubeFeed("<feed></feed>"), null);
});

test("extractYouTubeChannelId finds the UC id in ids and URLs", () => {
	assert.equal(extractYouTubeChannelId("UC1234567890abcdefghijkl"), "UC1234567890abcdefghijkl");
	assert.equal(
		extractYouTubeChannelId("https://youtube.com/channel/UC1234567890abcdefghijkl"),
		"UC1234567890abcdefghijkl",
	);
	assert.equal(extractYouTubeChannelId("https://youtube.com/@somehandle"), null);
});
