import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createCanvas, type Image, loadImage, type SKRSContext2D } from "@napi-rs/canvas";
import { CARD_FONT, cardText, ensureCardFonts } from "@/utils/cardFont.ts";

const BG_PATH = join(
	dirname(fileURLToPath(import.meta.url)),
	"..",
	"..",
	"..",
	"assets",
	"ship-bg.jpg",
);

export interface ShipCardData {
	avatarA: string;
	avatarB: string;
	nameA: string;
	nameB: string;
	score: number;
}

async function fetchImage(url: string): Promise<Image | null> {
	try {
		const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
		if (!res.ok) return null;
		return await loadImage(Buffer.from(await res.arrayBuffer()));
	} catch {
		return null;
	}
}

function circle(ctx: SKRSContext2D, img: Image, cx: number, cy: number, size: number): void {
	ctx.save();
	ctx.beginPath();
	ctx.arc(cx, cy, size / 2, 0, Math.PI * 2);
	ctx.closePath();
	ctx.clip();
	ctx.drawImage(img, cx - size / 2, cy - size / 2, size, size);
	ctx.restore();
	ctx.beginPath();
	ctx.arc(cx, cy, size / 2, 0, Math.PI * 2);
	ctx.lineWidth = 4;
	ctx.strokeStyle = "#ffffff";
	ctx.stroke();
}

function heart(ctx: SKRSContext2D, cx: number, cy: number, s: number, color: string): void {
	ctx.beginPath();
	ctx.moveTo(cx, cy + s * 0.35);
	ctx.bezierCurveTo(cx + s, cy - s * 0.5, cx + s * 0.5, cy - s, cx, cy - s * 0.3);
	ctx.bezierCurveTo(cx - s * 0.5, cy - s, cx - s, cy - s * 0.5, cx, cy + s * 0.35);
	ctx.closePath();
	ctx.fillStyle = color;
	ctx.fill();
}

/** Render the ship card (607x202) using the zyn ship background. */
export async function renderShipCard(data: ShipCardData): Promise<Buffer> {
	ensureCardFonts();
	const bg = await loadImage(BG_PATH).catch(() => null);
	const W = bg?.width ?? 607;
	const H = bg?.height ?? 202;
	const canvas = createCanvas(W, H);
	const ctx = canvas.getContext("2d");

	if (bg) ctx.drawImage(bg, 0, 0, W, H);
	else {
		ctx.fillStyle = "#2b1a2b";
		ctx.fillRect(0, 0, W, H);
	}
	ctx.fillStyle = "rgba(0,0,0,0.35)";
	ctx.fillRect(0, 0, W, H);

	const cy = Math.round(H * 0.42);
	const size = Math.round(H * 0.55);
	const [a, b] = await Promise.all([fetchImage(data.avatarA), fetchImage(data.avatarB)]);
	if (a) circle(ctx, a, Math.round(W * 0.22), cy, size);
	if (b) circle(ctx, b, Math.round(W * 0.78), cy, size);

	heart(ctx, W / 2, cy, 42, "#e0245e");
	heart(ctx, W / 2 - 4, cy - 6, 16, "rgba(255,150,170,0.7)");

	ctx.fillStyle = "#ffffff";
	ctx.textAlign = "center";
	ctx.font = `bold 26px ${CARD_FONT}`;
	ctx.fillText(`${data.score}%`, W / 2, cy + 9);

	ctx.font = `bold 20px ${CARD_FONT}`;
	ctx.fillStyle = "#ffd9e2";
	ctx.fillText(
		`${cardText(data.nameA).slice(0, 14)}  +  ${cardText(data.nameB).slice(0, 14)}`,
		W / 2,
		Math.round(H * 0.9),
	);
	ctx.textAlign = "left";

	return canvas.toBuffer("image/png");
}
