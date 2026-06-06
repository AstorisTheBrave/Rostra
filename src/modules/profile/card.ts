import { createCanvas, type Image, loadImage, type SKRSContext2D } from "@napi-rs/canvas";

export interface ProfileCardData {
	username: string;
	displayName: string;
	avatarUrl: string;
	bio: string | null;
	accent: string;
	backgroundUrl: string | null;
	memberSince: string;
}

const WIDTH = 800;
const HEIGHT = 300;
const FONT = "sans-serif";

type Ctx = SKRSContext2D;

/** Fetch a remote image into a canvas Image, or null on any failure. */
async function fetchImage(url: string): Promise<Image | null> {
	try {
		const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
		if (!res.ok) return null;
		const buf = Buffer.from(await res.arrayBuffer());
		return await loadImage(buf);
	} catch {
		return null;
	}
}

/** Draw an image scaled to cover the whole card (object-fit: cover). */
function drawCover(ctx: Ctx, img: Image, w: number, h: number): void {
	const scale = Math.max(w / img.width, h / img.height);
	const dw = img.width * scale;
	const dh = img.height * scale;
	ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
}

function wrapText(
	ctx: Ctx,
	str: string,
	x: number,
	y: number,
	maxWidth: number,
	lineHeight: number,
) {
	const words = str.split(/\s+/);
	let line = "";
	let yy = y;
	let lines = 0;
	for (const word of words) {
		const test = line ? `${line} ${word}` : word;
		if (ctx.measureText(test).width > maxWidth && line) {
			ctx.fillText(line, x, yy);
			line = word;
			yy += lineHeight;
			if (++lines >= 2) {
				ctx.fillText(`${line.slice(0, 40)}…`, x, yy);
				return;
			}
		} else {
			line = test;
		}
	}
	if (line) ctx.fillText(line, x, yy);
}

/** Render a 800x300 profile card to a PNG buffer. */
export async function renderProfileCard(data: ProfileCardData): Promise<Buffer> {
	const canvas = createCanvas(WIDTH, HEIGHT);
	const ctx = canvas.getContext("2d");

	const bg = data.backgroundUrl ? await fetchImage(data.backgroundUrl) : null;
	if (bg) {
		drawCover(ctx, bg, WIDTH, HEIGHT);
	} else {
		ctx.fillStyle = "#1e1f22";
		ctx.fillRect(0, 0, WIDTH, HEIGHT);
	}

	// Darkening overlay for legibility, plus an accent side bar.
	ctx.fillStyle = "rgba(0,0,0,0.55)";
	ctx.fillRect(0, 0, WIDTH, HEIGHT);
	ctx.fillStyle = data.accent;
	ctx.fillRect(0, 0, 12, HEIGHT);

	// Avatar (circular) with an accent ring.
	const avatar = await fetchImage(data.avatarUrl);
	const size = 160;
	const ax = 48;
	const ay = 70;
	if (avatar) {
		ctx.save();
		ctx.beginPath();
		ctx.arc(ax + size / 2, ay + size / 2, size / 2, 0, Math.PI * 2);
		ctx.closePath();
		ctx.clip();
		ctx.drawImage(avatar, ax, ay, size, size);
		ctx.restore();
	}
	ctx.beginPath();
	ctx.arc(ax + size / 2, ay + size / 2, size / 2, 0, Math.PI * 2);
	ctx.lineWidth = 6;
	ctx.strokeStyle = data.accent;
	ctx.stroke();

	const textX = 250;
	ctx.fillStyle = "#ffffff";
	ctx.font = `bold 42px ${FONT}`;
	ctx.fillText(data.displayName.slice(0, 24), textX, 112);

	ctx.fillStyle = "#b9bbbe";
	ctx.font = `24px ${FONT}`;
	ctx.fillText(`@${data.username}`.slice(0, 32), textX, 146);

	if (data.bio) {
		ctx.fillStyle = "#e3e5e8";
		ctx.font = `22px ${FONT}`;
		wrapText(ctx, data.bio, textX, 192, WIDTH - textX - 40, 30);
	}

	ctx.fillStyle = "#8e9297";
	ctx.font = `18px ${FONT}`;
	ctx.fillText(`Member since ${data.memberSince}`, textX, 272);

	return canvas.toBuffer("image/png");
}
