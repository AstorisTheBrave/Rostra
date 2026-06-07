import { createCanvas, type Image, loadImage, type SKRSContext2D } from "@napi-rs/canvas";

export interface RankCardData {
	username: string;
	displayName: string;
	avatarUrl: string;
	accent: string;
	level: number;
	rank: number; // 0 = unranked
	xp: number;
	into: number; // xp into the current level
	needed: number; // xp needed for the next level
}

const WIDTH = 800;
const HEIGHT = 240;
const FONT = "sans-serif";

type Ctx = SKRSContext2D;

async function fetchImage(url: string): Promise<Image | null> {
	try {
		const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
		if (!res.ok) return null;
		return await loadImage(Buffer.from(await res.arrayBuffer()));
	} catch {
		return null;
	}
}

/** Rounded-rectangle path helper. */
function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number): void {
	ctx.beginPath();
	ctx.moveTo(x + r, y);
	ctx.arcTo(x + w, y, x + w, y + h, r);
	ctx.arcTo(x + w, y + h, x, y + h, r);
	ctx.arcTo(x, y + h, x, y, r);
	ctx.arcTo(x, y, x + w, y, r);
	ctx.closePath();
}

const abbreviate = (n: number): string =>
	n >= 1000 ? `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}k` : String(n);

/** Render an 800x240 leveling rank card to a PNG buffer. */
export async function renderRankCard(data: RankCardData): Promise<Buffer> {
	const canvas = createCanvas(WIDTH, HEIGHT);
	const ctx = canvas.getContext("2d");

	// Background + accent bar.
	ctx.fillStyle = "#1e1f22";
	ctx.fillRect(0, 0, WIDTH, HEIGHT);
	ctx.fillStyle = data.accent;
	ctx.fillRect(0, 0, 12, HEIGHT);

	// Avatar (circular) with accent ring.
	const avatar = await fetchImage(data.avatarUrl);
	const size = 150;
	const ax = 50;
	const ay = (HEIGHT - size) / 2;
	if (avatar) {
		ctx.save();
		ctx.beginPath();
		ctx.arc(ax + size / 2, ay + size / 2, size / 2, 0, Math.PI * 2);
		ctx.clip();
		ctx.drawImage(avatar, ax, ay, size, size);
		ctx.restore();
	}
	ctx.beginPath();
	ctx.arc(ax + size / 2, ay + size / 2, size / 2, 0, Math.PI * 2);
	ctx.lineWidth = 6;
	ctx.strokeStyle = data.accent;
	ctx.stroke();

	const textX = 240;

	// Name + handle.
	ctx.fillStyle = "#ffffff";
	ctx.font = `bold 38px ${FONT}`;
	ctx.fillText(data.displayName.slice(0, 22), textX, 70);
	ctx.fillStyle = "#b9bbbe";
	ctx.font = `22px ${FONT}`;
	ctx.fillText(`@${data.username}`.slice(0, 30), textX, 102);

	// Rank + level (right aligned).
	ctx.textAlign = "right";
	ctx.fillStyle = data.accent;
	ctx.font = `bold 34px ${FONT}`;
	ctx.fillText(`LEVEL ${data.level}`, WIDTH - 40, 70);
	if (data.rank > 0) {
		ctx.fillStyle = "#b9bbbe";
		ctx.font = `24px ${FONT}`;
		ctx.fillText(`RANK #${data.rank}`, WIDTH - 40, 102);
	}
	ctx.textAlign = "left";

	// Progress bar.
	const barX = textX;
	const barY = 150;
	const barW = WIDTH - textX - 40;
	const barH = 34;
	const ratio = data.needed > 0 ? Math.min(1, Math.max(0, data.into / data.needed)) : 0;
	ctx.fillStyle = "#2b2d31";
	roundRect(ctx, barX, barY, barW, barH, barH / 2);
	ctx.fill();
	if (ratio > 0) {
		ctx.fillStyle = data.accent;
		roundRect(ctx, barX, barY, Math.max(barH, barW * ratio), barH, barH / 2);
		ctx.fill();
	}

	// XP label under the bar.
	ctx.fillStyle = "#e3e5e8";
	ctx.font = `20px ${FONT}`;
	ctx.fillText(
		`${abbreviate(data.into)} / ${abbreviate(data.needed)} XP to next level`,
		barX,
		barY + barH + 26,
	);
	ctx.textAlign = "right";
	ctx.fillStyle = "#8e9297";
	ctx.fillText(`${data.xp.toLocaleString("en-US")} XP total`, WIDTH - 40, barY + barH + 26);
	ctx.textAlign = "left";

	return canvas.toBuffer("image/png");
}
