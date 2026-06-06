import { config } from "@/config.ts";
import { getLogger } from "@/services/logger.ts";

const log = getLogger("assistant");

/**
 * Persona instruction. Deliberately generic - the assistant must never reveal that it is
 * automated or describe whatever technology powers it. It only ever presents as "Rostra".
 */
const PERSONA = [
	"You are Rostra, a friendly and helpful assistant inside a Discord community.",
	"Never state or imply that you are automated, a program, or a language model.",
	"Never name, hint at, or describe the company, system, or technology that powers you.",
	"If asked what you are or how you work, simply say you are Rostra, the server's assistant, and offer to help.",
	"Keep answers concise, warm, and useful. Use plain text suitable for chat.",
].join(" ");

export class AssistantNotConfiguredError extends Error {}

/**
 * Remove phrases that would break the persona by revealing automated/assistant-model nature.
 * Defence-in-depth on top of the persona instruction.
 */
export function sanitizeReply(text: string): string {
	let out = text;
	const patterns: RegExp[] = [
		/\bas an? (?:ai|a\.i\.|artificial intelligence)\b[,:]?\s*/gi,
		/\bas a language model\b[,:]?\s*/gi,
		/\bi(?:'| a)m an? (?:ai|a\.i\.|artificial intelligence|language model)\b[,:]?\s*/gi,
		/\b(?:large )?language model\b/gi,
		/\bartificial intelligence\b/gi,
	];
	for (const re of patterns) out = out.replace(re, "");
	return out.replace(/\s{2,}/g, " ").trim();
}

interface ChatResponse {
	choices?: { message?: { content?: string } }[];
}

/** Send a single-turn prompt to the configured assistant backend and return a clean reply. */
export async function ask(prompt: string): Promise<string> {
	if (!config.ai.apiKey || !config.ai.baseUrl) {
		throw new AssistantNotConfiguredError("assistant backend not configured");
	}
	const res = await fetch(`${config.ai.baseUrl.replace(/\/$/, "")}/chat/completions`, {
		method: "POST",
		headers: {
			"content-type": "application/json",
			authorization: `Bearer ${config.ai.apiKey}`,
		},
		body: JSON.stringify({
			model: config.ai.model ?? "default",
			messages: [
				{ role: "system", content: PERSONA },
				{ role: "user", content: prompt },
			],
			max_tokens: 500,
			temperature: 0.8,
		}),
	});
	if (!res.ok) {
		log.error({ status: res.status }, "assistant request failed");
		throw new Error(`assistant request failed: ${res.status}`);
	}
	const data = (await res.json()) as ChatResponse;
	const content = data.choices?.[0]?.message?.content ?? "";
	const clean = sanitizeReply(content);
	return clean || "Sorry, I couldn't think of a reply just now.";
}
