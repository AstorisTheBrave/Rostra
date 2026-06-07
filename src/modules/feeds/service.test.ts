import assert from "node:assert/strict";
import { test } from "node:test";
import { extractYouTubeChannelId, parseGenericFeed, parseYouTubeFeed } from "./service.ts";

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

test("parseGenericFeed reads the newest Atom entry (Reddit style)", () => {
	const xml = `<feed><entry><id>t3_newpost</id><title>Hello &amp; welcome</title><link href="https://reddit.com/r/x/abc"/></entry><entry><id>t3_old</id><title>Old</title><link href="https://reddit.com/r/x/old"/></entry></feed>`;
	assert.deepEqual(parseGenericFeed(xml), {
		id: "t3_newpost",
		title: "Hello & welcome",
		url: "https://reddit.com/r/x/abc",
	});
});

test("parseGenericFeed reads the newest RSS 2.0 item with CDATA title", () => {
	const xml = `<rss><channel><item><guid>g1</guid><title><![CDATA[Big News]]></title><link>https://e.com/1</link></item></channel></rss>`;
	assert.deepEqual(parseGenericFeed(xml), {
		id: "g1",
		title: "Big News",
		url: "https://e.com/1",
	});
});

test("parseGenericFeed returns null with no items", () => {
	assert.equal(parseGenericFeed("<rss><channel></channel></rss>"), null);
});

test("extractYouTubeChannelId finds the UC id in ids and URLs", () => {
	assert.equal(extractYouTubeChannelId("UC1234567890abcdefghijkl"), "UC1234567890abcdefghijkl");
	assert.equal(
		extractYouTubeChannelId("https://youtube.com/channel/UC1234567890abcdefghijkl"),
		"UC1234567890abcdefghijkl",
	);
	assert.equal(extractYouTubeChannelId("https://youtube.com/@somehandle"), null);
});
