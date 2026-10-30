"use client";

import { contrast, hexToRgb, inkFor, readableOnWhite } from "@/lib/branding/color";
import { CARD_HEIGHT, CARD_WIDTH, type BattingCardModel } from "@/lib/share/battingCard";

const FONT = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

async function loadImage(url: string | null): Promise<HTMLImageElement | null> {
  if (!url) return null;
  const img = new Image();
  // Logos come from public storage; anonymous CORS keeps the canvas exportable.
  img.crossOrigin = "anonymous";
  img.src = url;
  try {
    await img.decode();
    return img;
  } catch {
    return null;
  }
}

/** Shrink a font until the text fits the width. */
function fit(
  ctx: CanvasRenderingContext2D,
  text: string,
  weight: number,
  size: number,
  width: number,
) {
  let s = size;
  ctx.font = `${weight} ${s}px ${FONT}`;
  while (s > 18 && ctx.measureText(text).width > width) {
    s -= 2;
    ctx.font = `${weight} ${s}px ${FONT}`;
  }
  return s;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

/** Draw the batting order picture (1080×1350) in the team's colors; returns a PNG. */
export async function renderBattingCard(
  model: BattingCardModel,
  look: { main: string; accent: string; logoUrl: string | null; initials: string },
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = CARD_WIDTH;
  canvas.height = CARD_HEIGHT;
  const ctx = canvas.getContext("2d")!;
  const bg = readableOnWhite(look.main);
  // The accent only stands out if it contrasts with the background; otherwise use white.
  const accent = contrast(hexToRgb(look.accent)!, hexToRgb(bg)!) >= 2.2 ? look.accent : "#ffffff";
  const accentInk = inkFor(accent);

  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
  ctx.fillStyle = accent;
  ctx.fillRect(0, 0, CARD_WIDTH, 22);
  ctx.fillRect(0, CARD_HEIGHT - 22, CARD_WIDTH, 22);

  // Logo (or initials) in a white rounded square.
  const logo = await loadImage(look.logoUrl);
  ctx.fillStyle = "#ffffff";
  roundRect(ctx, 60, 70, 190, 190, 28);
  ctx.fill();
  if (logo) {
    ctx.drawImage(logo, 70, 80, 170, 170);
  } else {
    ctx.fillStyle = bg;
    ctx.font = `900 84px ${FONT}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(look.initials || "⚾", 155, 168);
  }

  // Team name and label.
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = accent;
  ctx.font = `800 34px ${FONT}`;
  ctx.fillText("BATTING ORDER", 285, 120);
  ctx.fillStyle = "#ffffff";
  fit(ctx, model.teamName, 900, 66, CARD_WIDTH - 285 - 60);
  ctx.fillText(model.teamName, 285, 195);
  ctx.globalAlpha = 0.9;
  fit(ctx, model.details, 600, 32, CARD_WIDTH - 285 - 60);
  ctx.fillText(model.details, 285, 245);
  ctx.globalAlpha = 1;

  // Matchup.
  fit(ctx, model.matchup, 900, 72, CARD_WIDTH - 120);
  ctx.fillText(model.matchup, 60, 360);
  ctx.fillStyle = accent;
  ctx.fillRect(60, 390, 140, 8);

  // The order.
  const top = 430;
  const colWidth = model.columns === 2 ? (CARD_WIDTH - 120 - 40) / 2 : CARD_WIDTH - 120;
  const perColumn = Math.ceil(model.batters.length / model.columns);
  const r = Math.min(30, model.rowHeight * 0.38);
  model.batters.forEach((b, i) => {
    const col = Math.floor(i / perColumn);
    const row = i % perColumn;
    const x = 60 + col * (colWidth + 40);
    const y = top + row * model.rowHeight + model.rowHeight / 2;
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.arc(x + r, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = accentInk;
    ctx.font = `900 ${Math.round(r * 1.05)}px ${FONT}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(b.order), x + r, y + 1);

    ctx.textAlign = "left";
    ctx.fillStyle = "#ffffff";
    const nameX = x + r * 2 + 22;
    const jerseyW = b.jersey ? 90 : 0;
    fit(ctx, b.name, 800, model.fontSize, colWidth - (nameX - x) - jerseyW);
    ctx.fillText(b.name, nameX, y + 2);
    if (b.jersey) {
      ctx.globalAlpha = 0.75;
      ctx.textAlign = "right";
      ctx.font = `700 ${Math.round(model.fontSize * 0.8)}px ${FONT}`;
      ctx.fillText(`#${b.jersey}`, x + colWidth, y + 2);
      ctx.globalAlpha = 1;
    }
  });

  // Notes and footer.
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#ffffff";
  ctx.globalAlpha = 0.9;
  model.notes.forEach((note, i) => {
    fit(ctx, note, 600, 28, CARD_WIDTH - 120);
    ctx.fillText(note, 60, 1240 + i * 38);
  });
  ctx.globalAlpha = 0.7;
  ctx.textAlign = "right";
  ctx.font = `700 24px ${FONT}`;
  ctx.fillText("RallyCap · rallycap.team", CARD_WIDTH - 60, CARD_HEIGHT - 44);
  ctx.globalAlpha = 1;

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("Couldn't make the picture.");
  return blob;
}
