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
import { replayWindow } from "./plays";
import { drawCard, drawPlay, INTRO, lookFor, OUTRO, type CardInfo } from "./draw";

export { reelSeconds } from "./draw";

export interface ReelSpec extends CardInfo {
  file: File;
  /** The part of the clip to use, in seconds. */
  start: number;
  end: number;
  /** The announcer's MP3, or null for game sound only. */
  voice: ArrayBuffer | null;
  replay: boolean;
  /** The stretch to slow down (seconds in the video); the last 3 seconds when missing. */
  replayPick?: { from: number; to: number } | null;
  onProgress?: (share: number) => void;
}

export class ReelError extends Error {}

const FPS = 30;
const RATE = 48000;

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
    let last: HTMLCanvasElement | OffscreenCanvas | null = null;
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
