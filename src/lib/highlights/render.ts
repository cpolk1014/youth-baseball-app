// Pine Tar Productions: makes the highlight video on the phone (browser only).
// Intro card → the clip with a name banner → a half-speed replay → outro card, with the
// announcer over the game sound. The finished MP4 never leaves the phone.
import {
  ALL_FORMATS,
  AudioBufferSink,
  AudioBufferSource,
  BlobSource,
  BufferTarget,
  CanvasSink,
  CanvasSource,
  canEncodeAudio,
  getFirstEncodableVideoCodec,
  Input,
  Mp4OutputFormat,
  Output,
  QUALITY_HIGH,
} from "mediabunny";
import { DEFAULT_ACCENT, DEFAULT_PRIMARY, inkFor, isHex } from "@/lib/branding/color";
import { replayWindow, type Play } from "./plays";

export interface ReelSpec {
  file: File;
  /** The part of the clip to use, in seconds. */
  start: number;
  end: number;
  kidName: string;
  number: number | null;
  teamName: string;
  colors?: string[];
  play: Play;
  opponent?: string | null;
  /** The announcer's MP3, or null for game sound only. */
  voice: ArrayBuffer | null;
  replay: boolean;
  /** The stretch to slow down (seconds in the video); the last 3 seconds when missing. */
  replayPick?: { from: number; to: number } | null;
  onProgress?: (share: number) => void;
}

export class ReelError extends Error {}

const FPS = 30;
const INTRO = 1.8;
const OUTRO = 1.6;
const RATE = 48000;

const FONT = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
const ease = (x: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);

/** How long the finished reel runs. */
export function reelSeconds(spec: Pick<ReelSpec, "start" | "end" | "replay" | "replayPick">) {
  const r = replayWindow(spec.start, spec.end, spec.replayPick);
  return INTRO + (spec.end - spec.start) + (spec.replay ? (r.to - r.from) * 2 : 0) + OUTRO;
}

function fit(
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
  ctx.fill();
}

interface Look {
  main: string;
  accent: string;
  onMain: string;
  onAccent: string;
  who: string;
  name: string;
  numberTag: string;
}

function lookFor(spec: ReelSpec): Look {
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

function drawCard(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  look: Look,
  t: number,
  kind: "intro" | "outro",
  spec: ReelSpec,
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
function drawPlay(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  look: Look,
  frame: CanvasImageSource | null,
  t: number,
  replay: boolean,
  spec: ReelSpec,
) {
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, w, h);
  if (frame) ctx.drawImage(frame, 0, 0, w, h);
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

/** Three quick rising notes for the intro, and one for the outro. */
function sting(ctx: OfflineAudioContext, at: number, notes: number[]) {
  notes.forEach((freq, i) => {
    const start = at + i * 0.13;
    const long = i === notes.length - 1;
    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.value = freq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(0.22, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, start + (long ? 0.9 : 0.12));
    osc.connect(gain).connect(ctx.destination);
    osc.start(start);
    osc.stop(start + (long ? 1 : 0.14));
  });
}

async function mixAudio(
  spec: ReelSpec,
  audioTrack: Awaited<ReturnType<Input["getPrimaryAudioTrack"]>>,
  clip: number,
  replay: { from: number; to: number } | null,
  total: number,
): Promise<AudioBuffer> {
  const ctx = new OfflineAudioContext(2, Math.ceil(total * RATE), RATE);
  const voice = spec.voice ? await ctx.decodeAudioData(spec.voice.slice(0)) : null;
  const gameGain = voice ? 0.4 : 1;

  if (audioTrack && (await audioTrack.canDecode())) {
    const sink = new AudioBufferSink(audioTrack);
    const place = async (from: number, to: number, at: number, rate: number, gain: number) => {
      for await (const wb of sink.buffers(from, to)) {
        const src = ctx.createBufferSource();
        src.buffer = wb.buffer;
        src.playbackRate.value = rate;
        const g = ctx.createGain();
        g.gain.value = gain;
        src.connect(g).connect(ctx.destination);
        const offset = Math.max(0, from - wb.timestamp);
        const when = at + Math.max(0, wb.timestamp - from) / rate;
        const room = (to - Math.max(from, wb.timestamp)) / rate;
        if (room <= 0) continue;
        src.start(when, offset, Math.min(wb.duration - offset, room * rate));
      }
    };
    await place(spec.start, spec.end, INTRO, 1, gameGain);
    if (replay) await place(replay.from, replay.to, INTRO + clip, 0.5, 0.35);
  }
  sting(ctx, 0.05, [392, 523.25, 659.25, 783.99]);
  sting(ctx, total - OUTRO + 0.1, [523.25, 783.99]);
  if (voice) {
    const src = ctx.createBufferSource();
    src.buffer = voice;
    src.connect(ctx.destination);
    src.start(INTRO + 0.25);
  }
  return ctx.startRendering();
}

/** Make the reel. Resolves to an MP4 the parent saves; nothing is uploaded. */
export async function renderReel(spec: ReelSpec): Promise<Blob> {
  const input = new Input({ source: new BlobSource(spec.file), formats: ALL_FORMATS });
  try {
    const videoTrack = await input.getPrimaryVideoTrack();
    if (!videoTrack) throw new ReelError("That file doesn't have any video in it.");
    if (!(await videoTrack.canDecode())) {
      throw new ReelError(
        "This phone can't read that video. Try a clip recorded on this phone's camera.",
      );
    }
    const landscape = videoTrack.displayWidth >= videoTrack.displayHeight;
    const w = landscape ? 1280 : 720;
    const h = landscape ? 720 : 1280;

    const videoCodec = await getFirstEncodableVideoCodec(["avc", "hevc"], { width: w, height: h });
    if (!videoCodec) {
      throw new ReelError(
        "This browser can't make videos yet. Try Safari or Chrome, updated to the latest version.",
      );
    }
    if (!(await canEncodeAudio("aac"))) {
      // Older Safari: an AAC encoder that runs in the page (downloaded only when needed).
      const { registerAacEncoder } = await import("@mediabunny/aac-encoder");
      registerAacEncoder();
    }

    const clip = spec.end - spec.start;
    const replay = spec.replay ? replayWindow(spec.start, spec.end, spec.replayPick) : null;
    const replayLen = replay ? (replay.to - replay.from) * 2 : 0;
    const total = INTRO + clip + replayLen + OUTRO;
    const look = lookFor(spec);

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new ReelError("Couldn't start drawing. Reload and try again.");

    const output = new Output({
      format: new Mp4OutputFormat({ fastStart: "in-memory" }),
      target: new BufferTarget(),
    });
    const video = new CanvasSource(canvas, { codec: videoCodec, bitrate: QUALITY_HIGH });
    const audio = new AudioBufferSource({ codec: "aac", bitrate: 128_000 });
    output.addVideoTrack(video, { frameRate: FPS });
    output.addAudioTrack(audio);
    await output.start();

    // Sound first (quick), then the pictures frame by frame.
    const mixed = await mixAudio(spec, await input.getPrimaryAudioTrack(), clip, replay, total);
    await audio.add(mixed);
    audio.close();

    const totalFrames = Math.round(total * FPS);
    let n = 0;
    const step = 1 / FPS;
    const push = async () => {
      await video.add(n * step, step);
      n++;
      spec.onProgress?.(Math.min(1, n / totalFrames));
    };

    for (let i = 0; i < Math.round(INTRO * FPS); i++) {
      drawCard(ctx, w, h, look, i / FPS, "intro", spec);
      await push();
    }

    const sink = new CanvasSink(videoTrack, { width: w, height: h, fit: "contain", poolSize: 2 });
    const clipTimes = Array.from(
      { length: Math.round(clip * FPS) },
      (_, i) => spec.start + i * step,
    );
    let last: CanvasImageSource | null = null;
    let i = 0;
    for await (const wc of sink.canvasesAtTimestamps(clipTimes)) {
      if (wc) last = wc.canvas;
      drawPlay(ctx, w, h, look, last, i * step, false, spec);
      await push();
      i++;
    }

    if (replay) {
      const from = replay.from;
      const replayTimes = Array.from(
        { length: Math.round(replayLen * FPS) },
        (_, k) => from + (k * step) / 2,
      );
      for await (const wc of sink.canvasesAtTimestamps(replayTimes)) {
        if (wc) last = wc.canvas;
        drawPlay(ctx, w, h, look, last, 0, true, spec);
        await push();
      }
    }

    for (let k = 0; k < Math.round(OUTRO * FPS); k++) {
      drawCard(ctx, w, h, look, k / FPS, "outro", spec);
      await push();
    }
    video.close();
    await output.finalize();
    const buffer = (output.target as BufferTarget).buffer;
    if (!buffer) throw new ReelError("The video didn't finish. Try again.");
    return new Blob([buffer], { type: "video/mp4" });
  } finally {
    input.dispose();
  }
}

/**
 * How long a clip runs, read from the file itself (iPhone Safari often won't load a video
 * element's details until it plays). Throws a ReelError when the phone can't use it.
 */
export async function readClip(file: File): Promise<number> {
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  try {
    const track = await input.getPrimaryVideoTrack().catch(() => null);
    if (!track) throw new ReelError("That file doesn't look like a video. Pick a different clip.");
    if (!(await track.canDecode())) {
      throw new ReelError(
        "This phone can't read that video. Try a clip recorded on this phone's camera.",
      );
    }
    const seconds = await input.computeDuration();
    if (!(seconds > 0)) throw new ReelError("That clip looks empty. Pick a different one.");
    return seconds;
  } catch (e) {
    if (e instanceof ReelError) throw e;
    console.error("reading clip failed", e);
    throw new ReelError("Couldn't read that clip. Try a different one, or a shorter one.");
  } finally {
    input.dispose();
  }
}
