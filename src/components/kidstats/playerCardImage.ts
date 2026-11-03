"use client";

import { contrast, hexToRgb, inkFor, readableOnWhite } from "@/lib/branding/color";
import type { PlayerCardModel } from "@/lib/boxscore/trends";
import { FONT, fit, loadImage, roundRect } from "../battingCardImage";

export const PLAYER_CARD_WIDTH = 1080;
export const PLAYER_CARD_HEIGHT = 1350;

/** Draw a kid's season player card (1080×1350) in the team's colors; returns a PNG. */
export async function renderPlayerCard(
  model: PlayerCardModel,
  look: { main: string; accent: string; logoUrl: string | null; initials: string },
): Promise<Blob> {
  const W = PLAYER_CARD_WIDTH;
  const H = PLAYER_CARD_HEIGHT;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  const bg = readableOnWhite(look.main);
  const accent = contrast(hexToRgb(look.accent)!, hexToRgb(bg)!) >= 2.2 ? look.accent : "#ffffff";
  const accentInk = inkFor(accent);

  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = accent;
  ctx.fillRect(0, 0, W, 22);
  ctx.fillRect(0, H - 22, W, 22);

  // Team logo (or initials), team and season.
  const logo = await loadImage(look.logoUrl);
  ctx.fillStyle = "#ffffff";
  roundRect(ctx, 60, 70, 150, 150, 24);
  ctx.fill();
  if (logo) ctx.drawImage(logo, 68, 78, 134, 134);
  else {
    ctx.fillStyle = bg;
    ctx.font = `900 66px ${FONT}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(look.initials || "⚾", 135, 147);
  }
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = accent;
  ctx.font = `800 32px ${FONT}`;
  ctx.fillText("PLAYER CARD", 245, 118);
  ctx.fillStyle = "#ffffff";
  fit(ctx, model.teamName, 800, 50, W - 245 - 60);
  ctx.fillText(model.teamName, 245, 178);
  ctx.globalAlpha = 0.85;
  const sub = `${model.season} · ${model.games} game${model.games === 1 ? "" : "s"}`;
  fit(ctx, sub, 600, 30, W - 245 - 60);
  ctx.fillText(sub, 245, 220);
  ctx.globalAlpha = 1;

  // The player.
  const nameSize = fit(ctx, model.name, 900, 104, W - 120 - (model.jersey ? 200 : 0));
  ctx.fillText(model.name, 60, 380);
  if (model.jersey) {
    ctx.textAlign = "right";
    ctx.fillStyle = accent;
    ctx.font = `900 ${Math.min(110, nameSize + 10)}px ${FONT}`;
    ctx.fillText(model.jersey, W - 60, 380);
    ctx.textAlign = "left";
  }
  ctx.fillStyle = accent;
  ctx.fillRect(60, 410, 160, 10);

  // Four big rates in white tiles.
  const tileW = (W - 120 - 3 * 24) / 4;
  model.rates.forEach((r, i) => {
    const x = 60 + i * (tileW + 24);
    ctx.fillStyle = "#ffffff";
    roundRect(ctx, x, 470, tileW, 230, 26);
    ctx.fill();
    ctx.fillStyle = bg;
    ctx.textAlign = "center";
    fit(ctx, r.value, 900, 74, tileW - 24);
    ctx.fillText(r.value, x + tileW / 2, 600);
    ctx.font = `800 32px ${FONT}`;
    ctx.globalAlpha = 0.7;
    ctx.fillText(r.label, x + tileW / 2, 660);
    ctx.globalAlpha = 1;
  });

  // Counting stats.
  if (model.counts.length) {
    const cw = (W - 120) / model.counts.length;
    model.counts.forEach((c, i) => {
      const cx = 60 + i * cw + cw / 2;
      ctx.fillStyle = "#ffffff";
      ctx.textAlign = "center";
      ctx.font = `900 72px ${FONT}`;
      ctx.fillText(c.value, cx, 840);
      ctx.fillStyle = accent;
      ctx.font = `800 30px ${FONT}`;
      ctx.fillText(c.label, cx, 885);
    });
  }

  // Pitching line.
  if (model.pitching) {
    ctx.fillStyle = accent;
    roundRect(ctx, 60, 960, W - 120, 120, 24);
    ctx.fill();
    ctx.fillStyle = accentInk;
    ctx.textAlign = "left";
    ctx.font = `800 28px ${FONT}`;
    ctx.fillText("PITCHING", 96, 1005);
    fit(ctx, model.pitching, 800, 40, W - 120 - 72);
    ctx.fillText(model.pitching, 96, 1056);
  }

  // Footer: the RallyCap logo and web address.
  const brand = await loadImage("/brand/rallycap-horizontal-white.svg");
  const logoH = 52;
  const logoW = brand ? (logoH * 710) / 266 : 0;
  ctx.globalAlpha = 0.85;
  if (brand) ctx.drawImage(brand, W - 52 - logoW, H - 30 - logoH, logoW, logoH);
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "right";
  ctx.font = `700 24px ${FONT}`;
  ctx.fillText(
    brand ? "rallycap.team" : "RallyCap · rallycap.team",
    W - 60 - logoW - (brand ? 12 : 0),
    H - 44,
  );
  ctx.globalAlpha = 1;

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("Couldn't make the picture.");
  return blob;
}
