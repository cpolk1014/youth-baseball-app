"use client";

// The PA's sound engine (Web Audio): one master volume, a Stop-all, the organ voice, the
// built-in effects, saved clips and walk-ups.
import {
  CLIP_SAMPLE_RATE,
  DUCK_LEVEL,
  encodeWav,
  normalizeGain,
  walkupTimeline,
  type ClipRange,
} from "@/lib/pa/clip";
import { tuneEvents, type BuiltInSound, type Tune } from "@/lib/pa/sounds";
import type { AnnounceMode } from "@/lib/pa/types";

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
/** Everything playing right now goes through this bus, so Stop all can cut it at once. */
let bus: GainNode | null = null;
let volume = 0.9;
const listeners = new Set<() => void>();
let playing: { id: string; until: number } | null = null;

function build(): AudioContext {
  // iPhones mute web audio with the ring/silent switch unless the page says it's playback.
  const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
  if (session) session.type = "playback";
  else keepAwakeTrack();
  const c = new AudioContext();
  const comp = c.createDynamicsCompressor();
  comp.threshold.value = -10;
  comp.ratio.value = 4;
  master = c.createGain();
  master.gain.value = volume;
  master.connect(comp).connect(c.destination);
  bus = null;
  return c;
}

/** Throw away a stuck context and start a new one (must happen during a tap). */
function rebuild(): AudioContext {
  const old = ctx;
  ctx = build();
  if (old && old.state !== "closed") void old.close().catch(() => undefined);
  return ctx;
}

/**
 * Call from a tap: phones only allow sound after the person touches the screen.
 * iPhones also stop a page's sound after a call, Siri, the lock screen, another app
 * playing, or a Bluetooth speaker coming or going ("interrupted"). The page can't always
 * wake it, so a stuck one is replaced with a fresh one.
 */
export function audio(): AudioContext {
  if (!ctx || ctx.state === "closed" || (ctx.state as string) === "interrupted") return rebuild();
  if (ctx.state === "suspended") {
    const c = ctx;
    void c.resume().catch(() => undefined);
    // Still not running a moment later: replace it so the next tap works.
    setTimeout(() => {
      if (ctx === c && c.state !== "running" && document.visibilityState === "visible") {
        rebuild();
      }
    }, 600);
  }
  return ctx;
}

/** Wake the sound when the page comes back (unlocking the phone, switching back). */
if (typeof document !== "undefined") {
  const wake = () => {
    if (ctx && ctx.state !== "running" && document.visibilityState === "visible") {
      void ctx.resume().catch(() => undefined);
    }
  };
  document.addEventListener("visibilitychange", wake);
  window.addEventListener("pageshow", wake);
}

let silentTrack: HTMLAudioElement | null = null;
/**
 * Older iPhones (before iOS 17) have no way to say "this page plays media", so web audio
 * follows the silent switch. A silent looping <audio> track switches the phone into
 * media playback, which plays out loud even on silent.
 */
function keepAwakeTrack() {
  if (silentTrack) {
    void silentTrack.play().catch(() => undefined);
    return;
  }
  const wav = encodeWav(new Float32Array(4000), 8000);
  silentTrack = new Audio(URL.createObjectURL(new Blob([wav], { type: "audio/wav" })));
  silentTrack.loop = true;
  silentTrack.setAttribute("playsinline", "");
  void silentTrack.play().catch(() => undefined);
}

function freshBus(): GainNode {
  const c = audio();
  bus = c.createGain();
  bus.connect(master!);
  return bus;
}

function currentBus(): GainNode {
  return bus ?? freshBus();
}

export function setVolume(v: number) {
  volume = Math.max(0, Math.min(1, v));
  if (master && ctx) master.gain.setTargetAtTime(volume, ctx.currentTime, 0.05);
}

export function getVolume() {
  return volume;
}

/** Stop everything now (with a quick fade so it doesn't pop). */
export function stopAll() {
  if (!ctx || !bus) return;
  const old = bus;
  old.gain.setTargetAtTime(0, ctx.currentTime, 0.03);
  setTimeout(() => old.disconnect(), 200);
  bus = null;
  setPlaying(null);
}

/** What's playing (for highlighting its button). */
export function nowPlaying(): string | null {
  if (playing && ctx && ctx.currentTime > playing.until) playing = null;
  return playing?.id ?? null;
}

export function onPlayingChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

let clearTimer: ReturnType<typeof setTimeout> | null = null;
function setPlaying(p: { id: string; seconds: number } | null) {
  if (clearTimer) clearTimeout(clearTimer);
  playing = p && ctx ? { id: p.id, until: ctx.currentTime + p.seconds } : null;
  if (p) clearTimer = setTimeout(() => setPlaying(null), p.seconds * 1000 + 100);
  listeners.forEach((fn) => fn());
}

// ── Organ ──

/** A drawbar organ note: stacked sine partials with a little rotary-speaker wobble. */
function organNote(out: AudioNode, freq: number, at: number, seconds: number, level = 0.16) {
  const c = audio();
  const env = c.createGain();
  env.gain.setValueAtTime(0, at);
  env.gain.linearRampToValueAtTime(level, at + 0.012);
  env.gain.setValueAtTime(level, at + Math.max(0.02, seconds - 0.04));
  env.gain.linearRampToValueAtTime(0, at + seconds);
  const trem = c.createOscillator();
  const tremDepth = c.createGain();
  trem.frequency.value = 6.2;
  tremDepth.gain.value = level * 0.18;
  trem.connect(tremDepth).connect(env.gain);
  env.connect(out);
  for (const [mult, gain] of [
    [0.5, 0.5],
    [1, 1],
    [1.5, 0.35],
    [2, 0.6],
    [3, 0.25],
    [4, 0.18],
  ] as const) {
    const o = c.createOscillator();
    o.type = "sine";
    o.frequency.value = freq * mult;
    const g = c.createGain();
    g.gain.value = gain / 2.9;
    o.connect(g).connect(env);
    o.start(at);
    o.stop(at + seconds + 0.05);
  }
  trem.start(at);
  trem.stop(at + seconds + 0.05);
}

function noiseBuffer(seconds: number): AudioBuffer {
  const c = audio();
  const b = c.createBuffer(1, Math.ceil(c.sampleRate * seconds), c.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return b;
}

/** A burst of filtered noise: the base of claps, crashes and crowds. */
function noise(
  out: AudioNode,
  at: number,
  seconds: number,
  opts: {
    type?: BiquadFilterType;
    freq?: number;
    q?: number;
    level?: number;
    attack?: number;
  } = {},
) {
  const c = audio();
  const src = c.createBufferSource();
  src.buffer = noiseBuffer(seconds);
  const f = c.createBiquadFilter();
  f.type = opts.type ?? "bandpass";
  f.frequency.value = opts.freq ?? 1500;
  f.Q.value = opts.q ?? 1;
  const g = c.createGain();
  const level = opts.level ?? 0.5;
  g.gain.setValueAtTime(0, at);
  g.gain.linearRampToValueAtTime(level, at + (opts.attack ?? 0.003));
  g.gain.exponentialRampToValueAtTime(0.001, at + seconds);
  src.connect(f).connect(g).connect(out);
  src.start(at);
  src.stop(at + seconds);
  return { filter: f, gain: g };
}

function clap(out: AudioNode, at: number) {
  for (const d of [0, 0.012, 0.024]) noise(out, at + d, 0.12, { freq: 1200, q: 0.8, level: 0.6 });
}

function tone(
  out: AudioNode,
  type: OscillatorType,
  at: number,
  seconds: number,
  from: number,
  to: number = from,
  level = 0.3,
) {
  const c = audio();
  const o = c.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(from, at);
  if (to !== from) o.frequency.exponentialRampToValueAtTime(to, at + seconds);
  const g = c.createGain();
  g.gain.setValueAtTime(0, at);
  g.gain.linearRampToValueAtTime(level, at + 0.01);
  g.gain.setValueAtTime(level, at + seconds * 0.8);
  g.gain.linearRampToValueAtTime(0, at + seconds);
  o.connect(g).connect(out);
  o.start(at);
  o.stop(at + seconds + 0.02);
  return o;
}

function playTune(out: AudioNode, tune: Tune, at: number): number {
  const { events, chordAt, seconds } = tuneEvents(tune);
  for (const e of events) {
    if (e.sound === "clap") clap(out, at + e.at);
    else organNote(out, e.sound, at + e.at, e.seconds * 0.92);
  }
  for (const n of tune.endChord ?? []) {
    const f = tuneEvents({ bpm: 60, notes: `${n}:1` }).events[0]!.sound as number;
    organNote(out, f, at + chordAt, seconds - chordAt, 0.12);
  }
  return seconds;
}

/** Built-in effects, made from oscillators and noise. Returns how long each lasts. */
function playEffect(out: AudioNode, id: string, at: number): number {
  switch (id) {
    case "glass": {
      noise(out, at, 0.5, { type: "highpass", freq: 3000, level: 0.7 });
      for (let i = 0; i < 14; i++) {
        const t = at + 0.02 + Math.random() * 0.6;
        tone(
          out,
          "sine",
          t,
          0.25 + Math.random() * 0.3,
          2500 + Math.random() * 4500,
          undefined,
          0.12,
        );
      }
      noise(out, at + 0.15, 0.8, { type: "highpass", freq: 5000, level: 0.25 });
      return 1.1;
    }
    case "cheer": {
      const n = noise(out, at, 3.2, { freq: 1100, q: 0.6, level: 0.5, attack: 0.6 });
      n.filter.frequency.linearRampToValueAtTime(1500, at + 1.5);
      for (let i = 0; i < 6; i++) {
        const f = 300 + Math.random() * 300;
        tone(out, "sawtooth", at + Math.random() * 0.4, 2 + Math.random(), f, f * 1.15, 0.025);
      }
      return 3.2;
    }
    case "applause": {
      for (let i = 0; i < 90; i++) {
        noise(out, at + Math.random() * 3, 0.06, {
          freq: 900 + Math.random() * 1800,
          q: 1.2,
          level: 0.25 + Math.random() * 0.25,
        });
      }
      return 3.2;
    }
    case "groan": {
      for (let i = 0; i < 8; i++) {
        const f = 170 + Math.random() * 120;
        const o = tone(out, "sawtooth", at + Math.random() * 0.1, 1.6, f, f * 0.7, 0.04);
        o.detune.value = Math.random() * 30;
      }
      noise(out, at, 1.6, { type: "lowpass", freq: 700, level: 0.2, attack: 0.2 });
      return 1.7;
    }
    case "airhorn": {
      for (const [start, len] of [
        [0, 0.35],
        [0.45, 0.35],
        [0.9, 1.1],
      ] as const) {
        for (const f of [466, 470, 587, 698]) tone(out, "sawtooth", at + start, len, f, f, 0.07);
      }
      return 2.1;
    }
    case "chaching": {
      noise(out, at, 0.12, { type: "highpass", freq: 4000, level: 0.5 });
      noise(out, at + 0.14, 0.18, { type: "highpass", freq: 3000, level: 0.5 });
      for (const f of [2093, 2637, 3136]) tone(out, "sine", at + 0.3, 0.9, f, f, 0.12);
      return 1.3;
    }
    case "slide-down":
      tone(out, "sine", at, 1, 1800, 280, 0.3);
      return 1.05;
    case "slide-up":
      tone(out, "sine", at, 0.8, 300, 1900, 0.3);
      return 0.85;
    case "quack": {
      for (const t of [0, 0.3]) {
        const c = audio();
        const f = c.createBiquadFilter();
        f.type = "bandpass";
        f.frequency.value = 1100;
        f.Q.value = 3;
        f.connect(out);
        tone(f, "sawtooth", at + t, 0.22, 420, 280, 0.9);
      }
      return 0.6;
    }
    case "boing": {
      const o = tone(out, "sine", at, 0.7, 180, 500, 0.35);
      const c = audio();
      const lfo = c.createOscillator();
      const depth = c.createGain();
      lfo.frequency.value = 14;
      depth.gain.value = 60;
      lfo.connect(depth).connect(o.frequency);
      lfo.start(at);
      lfo.stop(at + 0.75);
      return 0.75;
    }
    case "rimshot": {
      tone(out, "sine", at, 0.15, 180, 90, 0.6);
      noise(out, at + 0.25, 0.12, { freq: 1800, level: 0.5 });
      tone(out, "sine", at + 0.45, 0.2, 160, 80, 0.6);
      noise(out, at + 0.62, 0.9, { type: "highpass", freq: 6000, level: 0.35 });
      return 1.5;
    }
    case "scratch": {
      const n = noise(out, at, 0.5, { freq: 800, q: 4, level: 0.8 });
      n.filter.frequency.setValueAtTime(400, at);
      n.filter.frequency.linearRampToValueAtTime(2500, at + 0.18);
      n.filter.frequency.linearRampToValueAtTime(300, at + 0.45);
      return 0.55;
    }
    case "buzzer":
      tone(out, "square", at, 0.9, 110, 110, 0.18);
      tone(out, "square", at, 0.9, 116, 116, 0.18);
      return 0.95;
    case "clock": {
      for (let i = 0; i < 16; i++) {
        noise(out, at + i * 0.5, 0.04, { type: "highpass", freq: i % 2 ? 3500 : 2500, level: 0.6 });
      }
      return 8;
    }
    default:
      return 0;
  }
}

/** Play a built-in tune or effect. */
export function playBuiltIn(sound: BuiltInSound) {
  stopAll();
  const c = audio();
  const out = currentBus();
  const at = c.currentTime + 0.03;
  const seconds = sound.tune ? playTune(out, sound.tune, at) : playEffect(out, sound.id, at);
  setPlaying({ id: sound.id, seconds });
}

// ── Saved clips ──

let decoder: OfflineAudioContext | null = null;
/** Decode a file. Uses its own context, so replacing a stuck playback one can't break it. */
export async function decode(data: ArrayBuffer): Promise<AudioBuffer> {
  decoder ??= new OfflineAudioContext(1, 1, 44100);
  return await decoder.decodeAudioData(data.slice(0));
}

/** Play a decoded clip (a team sound, a preview). */
export function playBuffer(id: string, buffer: AudioBuffer, gain = 1) {
  stopAll();
  const c = audio();
  const src = c.createBufferSource();
  src.buffer = buffer;
  const g = c.createGain();
  g.gain.value = gain;
  src.connect(g).connect(currentBus());
  src.start(c.currentTime + 0.02);
  setPlaying({ id, seconds: buffer.duration });
}

/** Song plus announcer, timed and with the music dipped under the call. */
export function playWalkup(
  id: string,
  song: AudioBuffer,
  call: AudioBuffer | null,
  opts: { mode: AnnounceMode; volume: number },
) {
  stopAll();
  const c = audio();
  const out = currentBus();
  const t0 = c.currentTime + 0.05;
  const plan = walkupTimeline(opts.mode, song.duration, call?.duration ?? null);
  const music = c.createGain();
  const level = Math.max(0.2, Math.min(2, opts.volume));
  music.gain.setValueAtTime(level, t0);
  if (plan.duck) {
    music.gain.setValueAtTime(level, t0 + plan.duck.from);
    music.gain.linearRampToValueAtTime(level * DUCK_LEVEL, t0 + plan.duck.from + 0.25);
    music.gain.setValueAtTime(level * DUCK_LEVEL, t0 + plan.duck.to);
    music.gain.linearRampToValueAtTime(level, t0 + plan.duck.to + 0.4);
  }
  music.connect(out);
  const s = c.createBufferSource();
  s.buffer = song;
  s.connect(music);
  s.start(t0 + plan.songAt);
  if (call && plan.announceAt !== null) {
    const a = c.createBufferSource();
    a.buffer = call;
    const g = c.createGain();
    g.gain.value = 1.3;
    a.connect(g).connect(out);
    a.start(t0 + plan.announceAt);
  }
  setPlaying({ id, seconds: plan.total + 0.1 });
}

/**
 * Cut a song down to the chosen slice: mono, faded in and out, evened out in volume, as a
 * WAV file. All on the phone.
 */
export async function renderClip(
  song: AudioBuffer,
  range: ClipRange,
  fades: { fadeIn: boolean; fadeOut: boolean },
): Promise<{ wav: Blob; buffer: AudioBuffer }> {
  const seconds = range.end - range.start;
  const off = new OfflineAudioContext(1, Math.ceil(seconds * CLIP_SAMPLE_RATE), CLIP_SAMPLE_RATE);
  const src = off.createBufferSource();
  src.buffer = song;
  const g = off.createGain();
  const fadeIn = fades.fadeIn ? Math.min(0.6, seconds / 4) : 0.01;
  const fadeOut = fades.fadeOut ? Math.min(2, seconds / 3) : 0.03;
  g.gain.setValueAtTime(0, 0);
  g.gain.linearRampToValueAtTime(1, fadeIn);
  g.gain.setValueAtTime(1, seconds - fadeOut);
  g.gain.linearRampToValueAtTime(0, seconds);
  src.connect(g).connect(off.destination);
  src.start(0, range.start, seconds);
  const rendered = await off.startRendering();
  const samples = rendered.getChannelData(0);
  let peak = 0;
  for (let i = 0; i < samples.length; i++) peak = Math.max(peak, Math.abs(samples[i]!));
  const k = normalizeGain(peak);
  for (let i = 0; i < samples.length; i++) samples[i]! *= k;
  const wav = new Blob([encodeWav(samples, CLIP_SAMPLE_RATE)], { type: "audio/wav" });
  return { wav, buffer: rendered };
}
