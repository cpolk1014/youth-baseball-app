// Walk-up clip math: trimming, timing the announcer against the song, and WAV files.

/** Long enough for a walk to the plate; short enough not to slow the game. */
export const MAX_CLIP_SECONDS = 20;
export const MIN_CLIP_SECONDS = 3;
export const DEFAULT_CLIP_SECONDS = 15;
/** Saved clips are mono at this rate: plenty for a ballpark speaker, about 1 MB per clip. */
export const CLIP_SAMPLE_RATE = 32000;
/** Music volume while the announcer talks over it. */
export const DUCK_LEVEL = 0.3;

export interface ClipRange {
  start: number;
  end: number;
}

const round = (s: number) => Math.round(s * 10) / 10;

/** Keep a chosen slice inside the song and between the min and max lengths. */
export function clampClip(range: ClipRange, songSeconds: number): ClipRange {
  const total = Math.max(0, songSeconds);
  const minLen = Math.min(MIN_CLIP_SECONDS, total);
  let start = Math.min(Math.max(0, range.start), Math.max(0, total - minLen));
  let end = Math.min(Math.max(range.end, start + minLen), total);
  if (end - start > MAX_CLIP_SECONDS) end = start + MAX_CLIP_SECONDS;
  start = round(start);
  end = round(Math.min(end, total));
  return { start, end };
}

/** The first slice to offer for a new song. */
export function defaultClip(songSeconds: number): ClipRange {
  return clampClip({ start: 0, end: DEFAULT_CLIP_SECONDS }, songSeconds);
}

/** "1:05.5" for a slider label. */
export function formatTime(seconds: number): string {
  const tenths = Math.round(Math.max(0, seconds) * 10);
  const m = Math.floor(tenths / 600);
  const sec = Math.floor((tenths % 600) / 10);
  const tenth = tenths % 10;
  return `${m}:${String(sec).padStart(2, "0")}${tenth ? `.${tenth}` : ""}`;
}

/** Read "1:05", "65" or "1:05.5" back into seconds (null if it isn't a time). */
export function parseTime(text: string): number | null {
  const t = text.trim();
  const m = /^(?:(\d+):)?(\d+(?:\.\d+)?)$/.exec(t);
  if (!m) return null;
  return Number(m[1] ?? 0) * 60 + Number(m[2]);
}

export interface Timeline {
  /** When each part starts, in seconds from the tap. */
  songAt: number;
  announceAt: number | null;
  /** The music dips while the announcer talks over it. */
  duck: { from: number; to: number } | null;
  total: number;
}

/**
 * When the song and the announcer play. "over": the song starts right away and the
 * announcer comes in over the intro while the music dips. "before": the announcer, then
 * the song.
 */
export function walkupTimeline(
  mode: "over" | "before",
  clipSeconds: number,
  announceSeconds: number | null,
): Timeline {
  if (announceSeconds === null) {
    return { songAt: 0, announceAt: null, duck: null, total: clipSeconds };
  }
  if (mode === "before") {
    const songAt = announceSeconds + 0.3;
    return { songAt, announceAt: 0, duck: null, total: songAt + clipSeconds };
  }
  const announceAt = 0.8;
  const end = announceAt + announceSeconds;
  return {
    songAt: 0,
    announceAt,
    duck: { from: announceAt - 0.3, to: end + 0.2 },
    total: Math.max(clipSeconds, end),
  };
}

/** Scale so the loudest point sits just under full volume (quiet uploads get louder). */
export function normalizeGain(peak: number, target = 0.89): number {
  if (!(peak > 0)) return 1;
  return Math.min(8, target / peak);
}

/** A 16-bit mono WAV file from samples in -1…1. */
export function encodeWav(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const bytes = samples.length * 2;
  const buffer = new ArrayBuffer(44 + bytes);
  const v = new DataView(buffer);
  const text = (at: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(at + i, s.charCodeAt(i));
  };
  text(0, "RIFF");
  v.setUint32(4, 36 + bytes, true);
  text(8, "WAVE");
  text(12, "fmt ");
  v.setUint32(16, 16, true); // fmt chunk size
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // mono
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * 2, true); // bytes per second
  v.setUint16(32, 2, true); // bytes per sample frame
  v.setUint16(34, 16, true); // bits per sample
  text(36, "data");
  v.setUint32(40, bytes, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]!));
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return buffer;
}
