import { createCanvas, type Image, loadImage } from "@napi-rs/canvas";
import { CARD_FONT, cardText, ensureCardFonts } from "@/utils/cardFont.ts";

export interface WelcomeCardData {
	username: string;
	avatarUrl: string;
	serverName: string;
	memberCount: number;
	/** Heading verb, e.g. "Welcome" or "Goodbye". */
	heading?: string;
}

const WIDTH = 800;
const HEIGHT = 280;
const FONT = CARD_FONT;
const ACCENT = "#5865f2";

async function fetchImage(url: string): Promise<Image | null> {
	try {
		const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
		if (!res.ok) return null;
		return await loadImage(Buffer.from(await res.arrayBuffer()));
	} catch {
		return null;
	}
}

/** Render an 800x280 centered welcome banner to a PNG buffer. */
export async function renderWelcomeCard(data: WelcomeCardData): Promise<Buffer> {
	ensureCardFonts();
	const canvas = createCanvas(WIDTH, HEIGHT);
	const ctx = canvas.getContext("2d");

	// Gradient background.
	const grad = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
	grad.addColorStop(0, "#1e1f22");
	grad.addColorStop(1, "#2b2d31");
	ctx.fillStyle = grad;
	ctx.fillRect(0, 0, WIDTH, HEIGHT);
	ctx.fillStyle = ACCENT;
	ctx.fillRect(0, 0, WIDTH, 8);

	// Centered circular avatar with ring.
	const size = 128;
	const cx = WIDTH / 2;
	const ay = 36;
	const avatar = await fetchImage(data.avatarUrl);
	if (avatar) {
		ctx.save();
		ctx.beginPath();
		ctx.arc(cx, ay + size / 2, size / 2, 0, Math.PI * 2);
		ctx.clip();
		ctx.drawImage(avatar, cx - size / 2, ay, size, size);
		ctx.restore();
	}
	ctx.beginPath();
	ctx.arc(cx, ay + size / 2, size / 2, 0, Math.PI * 2);
	ctx.lineWidth = 6;
	ctx.strokeStyle = ACCENT;
	ctx.stroke();

	ctx.textAlign = "center";
	ctx.fillStyle = "#ffffff";
	ctx.font = `bold 36px ${FONT}`;
	ctx.fillText(`${data.heading ?? "Welcome"}, ${cardText(data.username)}!`.slice(0, 40), cx, 210);

	ctx.fillStyle = "#b9bbbe";
	ctx.font = `22px ${FONT}`;
	ctx.fillText(`${cardText(data.serverName).slice(0, 32)}  ·  member #${data.memberCount}`, cx, 246);
	ctx.textAlign = "left";

	return canvas.toBuffer("image/png");
}
