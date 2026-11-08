// Pine Tar Productions: the reel's graphics (title cards, name banner, corner bug), drawn
// on a canvas. Shared by the finished video (render.ts) and the live preview, so what the
// parent previews is what they get.
import { DEFAULT_ACCENT, DEFAULT_PRIMARY, inkFor, isHex } from "@/lib/branding/color";
import { replayWindow, type Play } from "./plays";

/** What the graphics say. */
export interface CardInfo {
  kidName: string;
  number: number | null;
  teamName: string;
  colors?: string[];
  play: Play;
  opponent?: string | null;
}

type Frame = HTMLVideoElement | HTMLCanvasElement | OffscreenCanvas | ImageBitmap;

/** Draws a video frame letterboxed into the canvas (the whole picture, nothing cropped). */
function drawContained(ctx: CanvasRenderingContext2D, frame: Frame, w: number, h: number) {
  const fw = frame instanceof HTMLVideoElement ? frame.videoWidth : frame.width;
  const fh = frame instanceof HTMLVideoElement ? frame.videoHeight : frame.height;
  if (!fw || !fh) return;
  const s = Math.min(w / fw, h / fh);
  const dw = fw * s;
  const dh = fh * s;
  ctx.drawImage(frame, (w - dw) / 2, (h - dh) / 2, dw, dh);
}

export const INTRO = 1.8;
export const OUTRO = 1.6;

const FONT = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
const ease = (x: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);

/** How long the finished reel runs. */
export function reelSeconds(spec: {
  start: number;
  end: number;
  replay: boolean;
  replayPick?: { from: number; to: number } | null;
}) {
  const r = replayWindow(spec.start, spec.end, spec.replayPick);
  return INTRO + (spec.end - spec.start) + (spec.replay ? (r.to - r.from) * 2 : 0) + OUTRO;
}

export function fit(
  ctx: CanvasRenderingContext2D,
  text: string,
  weight: number,
  size: number,
  max: number,
) {
  let s = size;
  ctx.font = `${weight} ${s}px ${FONT}`;
  while (s > 10 && ctx.measureText(text).width > max) {
    s -= 2;
    ctx.font = `${weight} ${s}px ${FONT}`;
  }
  return s;
}

export function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();
}

export interface Look {
  main: string;
  accent: string;
  onMain: string;
  onAccent: string;
  who: string;
  name: string;
  numberTag: string;
}

export function lookFor(spec: CardInfo): Look {
  const main = isHex(spec.colors?.[0]) ? spec.colors![0]! : DEFAULT_PRIMARY;
  const accent = isHex(spec.colors?.[1]) ? spec.colors![1]! : DEFAULT_ACCENT;
  const numberTag = spec.number === null ? "" : `#${spec.number}`;
  const name = spec.kidName.toUpperCase();
  return {
    main,
    accent,
    onMain: inkFor(main),
    onAccent: inkFor(accent),
    name,
    numberTag,
    who: numberTag ? `${numberTag} ${name}` : name,
  };
}

export function drawCard(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  look: Look,
  t: number,
  kind: "intro" | "outro",
  spec: CardInfo,
) {
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, look.main);
  g.addColorStop(1, "#05070d");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  // A diagonal stripe in the accent color sweeps in.
  ctx.save();
  ctx.globalAlpha = 0.9;
  ctx.fillStyle = look.accent;
  const sweep = ease(t / 0.5);
  ctx.translate(w * (sweep - 1), 0);
  ctx.beginPath();
  ctx.moveTo(w * 0.62, 0);
  ctx.lineTo(w * 0.78, 0);
  ctx.lineTo(w * 0.38, h);
  ctx.lineTo(w * 0.22, h);
  ctx.fill();
  ctx.restore();

  const unit = Math.min(w, h);
  const cx = w / 2;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#ffffff";
  const fade = ease(t / 0.4);
  ctx.globalAlpha = fade;
  // A soft shadow keeps white type readable over the stripe.
  ctx.shadowColor = "rgba(0,0,0,0.55)";
  ctx.shadowBlur = unit * 0.02;
  ctx.shadowOffsetY = unit * 0.006;
  if (kind === "intro") {
    fit(ctx, "PINE TAR PRODUCTIONS PRESENTS", 800, unit * 0.04, w * 0.9);
    ctx.fillText("PINE TAR PRODUCTIONS PRESENTS", cx, h * 0.22);
    const pop = 0.85 + 0.15 * ease((t - 0.2) / 0.4);
    ctx.save();
    ctx.translate(cx, h * 0.45);
    ctx.scale(pop, pop);
    if (look.numberTag) {
      ctx.fillStyle = "#ffffff";
      fit(ctx, look.numberTag, 900, unit * 0.22, w * 0.8);
      ctx.fillText(look.numberTag, 0, -unit * 0.12);
    }
    ctx.fillStyle = "#ffffff";
    fit(ctx, look.name, 900, unit * 0.12, w * 0.9);
    ctx.fillText(look.name, 0, look.numberTag ? unit * 0.06 : 0);
    ctx.restore();
    // The play, on an accent pill.
    const label = spec.play.banner;
    const size = fit(ctx, label, 900, unit * 0.06, w * 0.8);
    const pw = ctx.measureText(label).width + size * 1.4;
    ctx.fillStyle = look.accent;
    roundRect(ctx, cx - pw / 2, h * 0.68 - size * 0.8, pw, size * 1.6, size * 0.8);
    ctx.fillStyle = look.onAccent;
    ctx.fillText(label, cx, h * 0.68);
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    const sub = spec.opponent ? `${spec.teamName} vs ${spec.opponent}` : spec.teamName;
    fit(ctx, sub, 700, unit * 0.04, w * 0.9);
    ctx.fillText(sub, cx, h * 0.8);
  } else {
    fit(ctx, "PINE TAR", 900, unit * 0.13, w * 0.9);
    ctx.fillText("PINE TAR", cx, h * 0.4);
    fit(ctx, "PRODUCTIONS", 800, unit * 0.06, w * 0.9);
    ctx.fillText("PRODUCTIONS", cx, h * 0.52);
    ctx.fillStyle = "rgba(255,255,255,0.8)";
    fit(ctx, "Made with RallyCap · rallycap.team", 600, unit * 0.035, w * 0.9);
    ctx.fillText("Made with RallyCap · rallycap.team", cx, h * 0.68);
  }
  ctx.globalAlpha = 1;
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
}

/** The game frame, the name banner sliding in, the corner bug, and REPLAY when replaying. */
export function drawPlay(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  look: Look,
  frame: Frame | null,
  t: number,
  replay: boolean,
  spec: CardInfo,
) {
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, w, h);
  if (frame) drawContained(ctx, frame, w, h);
  const unit = Math.min(w, h);
  ctx.textBaseline = "middle";

  // Corner bug.
  ctx.textAlign = "left";
  const bug = "PINE TAR PRODUCTIONS";
  const bs = fit(ctx, bug, 800, unit * 0.028, w * 0.5);
  const bw = ctx.measureText(bug).width + bs * 1.2;
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  roundRect(ctx, w - bw - unit * 0.03, unit * 0.03, bw, bs * 1.8, bs * 0.5);
  ctx.fillStyle = "#ffffff";
  ctx.fillText(bug, w - bw - unit * 0.03 + bs * 0.6, unit * 0.03 + bs * 0.9);

  if (replay) {
    const rs = fit(ctx, "REPLAY", 900, unit * 0.045, w * 0.4);
    const rw = ctx.measureText("REPLAY").width + rs * 1.2;
    ctx.fillStyle = look.accent;
    roundRect(ctx, unit * 0.03, unit * 0.03, rw, rs * 1.7, rs * 0.4);
    ctx.fillStyle = look.onAccent;
    ctx.fillText("REPLAY", unit * 0.03 + rs * 0.6, unit * 0.03 + rs * 0.85);
  }

  // Name banner (lower third), sliding in from the left.
  const slide = replay ? 1 : ease((t - 0.3) / 0.45);
  if (slide <= 0) return;
  const bh = unit * 0.19;
  const y = h - bh - unit * 0.06;
  const x = -w + slide * (w + unit * 0.04);
  const maxW = w - unit * 0.08;
  const nameSize = fit(ctx, look.who, 900, bh * 0.42, maxW * 0.8);
  const lineW = Math.min(maxW, ctx.measureText(look.who).width + nameSize * 1.6);
  ctx.fillStyle = look.main;
  roundRect(ctx, x, y, lineW, bh * 0.6, unit * 0.012);
  ctx.fillStyle = look.accent;
  ctx.fillRect(x, y, unit * 0.012, bh * 0.6);
  ctx.fillStyle = look.onMain;
  ctx.font = `900 ${nameSize}px ${FONT}`;
  ctx.fillText(look.who, x + nameSize * 0.6, y + bh * 0.3);
  const sub = spec.opponent ? `${spec.play.banner} · vs ${spec.opponent}` : spec.play.banner;
  const subSize = fit(ctx, sub, 800, bh * 0.26, maxW * 0.8);
  const subW = Math.min(maxW, ctx.measureText(sub).width + subSize * 1.4);
  ctx.fillStyle = look.accent;
  roundRect(ctx, x, y + bh * 0.62, subW, bh * 0.4, unit * 0.01);
  ctx.fillStyle = look.onAccent;
  ctx.font = `800 ${subSize}px ${FONT}`;
  ctx.fillText(sub, x + subSize * 0.7, y + bh * 0.82);
}
