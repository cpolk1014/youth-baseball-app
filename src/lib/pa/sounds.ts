// The built-in soundboard. Tunes are written here as notes and played by an organ voice in
// the browser; effects are made in the browser too. Nothing to download, nothing to
// license, and all of it works with no signal.
import type { SoundCategory } from "./types";

export interface Tune {
  /** Quarter notes per minute. */
  bpm: number;
  /** "C5:2 E5:1 -:1 clap:0.5" — note and length in beats; "-" rests; "clap" is a hand clap. */
  notes: string;
  /** Hold a chord at the end (notes played together). */
  endChord?: string[];
}

export interface BuiltInSound {
  id: string;
  label: string;
  icon: string;
  category: SoundCategory;
  /** Tunes are notes; effects are built by name in the browser. */
  tune?: Tune;
}

export const BUILT_IN_SOUNDS: BuiltInSound[] = [
  {
    id: "take-me-out",
    label: "Take Me Out to the Ball Game",
    icon: "🎹",
    category: "pregame",
    tune: {
      bpm: 168,
      notes:
        "C5:2 C6:1 A5:1 G5:1 E5:1 G5:3 D5:3 C5:2 C6:1 A5:1 G5:1 E5:1 G5:6 " +
        "A5:1 G#5:1 A5:1 E5:1 F5:1 G5:1 A5:2 F5:1 D5:3 -:1 " +
        "C5:2 C6:1 A5:1 G5:1 E5:1 G5:3 D5:3 C5:5",
      endChord: ["C4", "E4", "G4", "C5"],
    },
  },
  {
    id: "fanfare",
    label: "Play ball! fanfare",
    icon: "🎺",
    category: "pregame",
    tune: {
      bpm: 132,
      notes: "C5:0.5 C5:0.5 C5:0.5 E5:1 C5:0.5 E5:0.5 G5:2 -:0.5 G5:0.5 A5:0.5 G5:0.5 C6:3",
      endChord: ["C4", "G4", "C5", "E5"],
    },
  },
  {
    id: "seventh-stretch",
    label: "Between innings shuffle",
    icon: "🎶",
    category: "pregame",
    tune: {
      bpm: 150,
      notes:
        "C5:0.5 E5:0.5 G5:0.5 A5:1 G5:0.5 E5:1 C5:0.5 D5:0.5 E5:0.5 G5:1 E5:0.5 D5:1.5 " +
        "C5:0.5 E5:0.5 G5:0.5 A5:1 G5:0.5 E5:1 D5:0.5 E5:0.5 D5:0.5 C5:2.5",
      endChord: ["F4", "A4", "C5"],
    },
  },
  {
    id: "charge",
    label: "Charge!",
    icon: "📯",
    category: "organ",
    tune: {
      bpm: 140,
      notes: "G4:0.5 C5:0.5 E5:0.5 G5:1.5 E5:0.5 G5:3",
      endChord: ["C4", "E4", "G4"],
    },
  },
  {
    id: "lets-go",
    label: "Let's go! (clap clap)",
    icon: "👏",
    category: "organ",
    tune: {
      bpm: 120,
      notes:
        "G4:0.5 C5:1 clap:0.5 clap:1 G4:0.5 C5:1 clap:0.5 clap:1 " +
        "G4:0.5 C5:1 clap:0.5 clap:1 G4:0.5 C5:1 clap:0.5 clap:1",
    },
  },
  {
    id: "climb",
    label: "Chromatic climb",
    icon: "📈",
    category: "organ",
    tune: {
      bpm: 150,
      notes:
        "C4:0.5 C#4:0.5 D4:0.5 D#4:0.5 E4:0.5 F4:0.5 F#4:0.5 G4:0.5 " +
        "G#4:0.5 A4:0.5 A#4:0.5 B4:0.5 C5:0.5 -:0.5 C5:0.5 C6:2",
      endChord: ["C4", "G4", "C5"],
    },
  },
  {
    id: "gallop",
    label: "Gallop (William Tell)",
    icon: "🐎",
    category: "organ",
    tune: {
      bpm: 152,
      notes:
        "E5:0.25 E5:0.25 E5:0.5 E5:0.25 E5:0.25 E5:0.5 E5:0.25 E5:0.25 A5:0.5 B5:0.5 C#6:1 " +
        "E5:0.25 E5:0.25 E5:0.5 E5:0.25 E5:0.25 E5:0.5 E5:0.25 E5:0.25 C#6:0.5 B5:0.5 A5:1.5",
      endChord: ["A3", "E4", "A4", "C#5"],
    },
  },
  {
    id: "stomp",
    label: "Stomp, stomp, clap",
    icon: "🥁",
    category: "organ",
    tune: {
      bpm: 92,
      notes: "C3:0.5 C3:0.5 clap:1 C3:0.5 C3:0.5 clap:1 C3:0.5 C3:0.5 clap:1 C3:0.5 C3:0.5 clap:1",
    },
  },
  {
    id: "thinking",
    label: "Thinking music",
    icon: "🤔",
    category: "mound",
    tune: {
      bpm: 112,
      notes:
        "E5:1 A5:1 E5:1 A4:1 E5:1 A5:1 E5:2 E5:1 A5:1 E5:1 A5:1 D6:1.5 C6:0.5 B5:1 A5:1 G#5:1 " +
        "E5:1 A5:1 E5:1 A4:1 E5:1 A5:1 E5:2 C6:1.5 B5:0.5 A5:1 G#5:1 F#5:1 E5:3",
      endChord: ["A3", "C4", "E4"],
    },
  },
  { id: "clock", label: "Ticking clock", icon: "⏱️", category: "mound" },
  { id: "glass", label: "Breaking glass", icon: "💥", category: "quick" },
  { id: "cheer", label: "Crowd cheer", icon: "🙌", category: "quick" },
  { id: "applause", label: "Applause", icon: "👏", category: "quick" },
  { id: "groan", label: "Ohhh!", icon: "😮", category: "quick" },
  { id: "airhorn", label: "Air horn", icon: "📣", category: "quick" },
  { id: "chaching", label: "Cha-ching (walk)", icon: "💰", category: "quick" },
  { id: "slide-down", label: "Strikeout whistle", icon: "📉", category: "quick" },
  { id: "slide-up", label: "Stolen base whistle", icon: "🚀", category: "quick" },
  { id: "quack", label: "Duck quack", icon: "🦆", category: "quick" },
  { id: "boing", label: "Boing", icon: "🌀", category: "quick" },
  { id: "rimshot", label: "Ba-dum-tss", icon: "🥁", category: "quick" },
  { id: "scratch", label: "Record scratch", icon: "💿", category: "quick" },
  { id: "buzzer", label: "Buzzer", icon: "🚫", category: "quick" },
];

export interface NoteEvent {
  /** Seconds from the start. */
  at: number;
  seconds: number;
  /** Frequency in Hz, or "clap". */
  sound: number | "clap";
}

const NAMES: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** "C#5" → Hz (A4 = 440), or null if it isn't a note. */
export function noteFrequency(name: string): number | null {
  const m = /^([A-G])(#|b)?(-?\d)$/.exec(name);
  if (!m) return null;
  const semis = NAMES[m[1]!]! + (m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0);
  const midi = (Number(m[3]) + 1) * 12 + semis;
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/** A tune's notes, timed in seconds. Throws on a typo so the tests catch it. */
export function tuneEvents(tune: Tune): { events: NoteEvent[]; chordAt: number; seconds: number } {
  const beat = 60 / tune.bpm;
  const events: NoteEvent[] = [];
  let t = 0;
  for (const token of tune.notes.trim().split(/\s+/)) {
    const [name, len] = token.split(":");
    const beats = Number(len);
    if (!name || !(beats > 0)) throw new Error(`Bad note "${token}"`);
    const seconds = beats * beat;
    if (name === "clap") events.push({ at: t, seconds, sound: "clap" });
    else if (name !== "-") {
      const f = noteFrequency(name);
      if (f === null) throw new Error(`Bad note "${token}"`);
      events.push({ at: t, seconds, sound: f });
    }
    t += seconds;
  }
  for (const n of tune.endChord ?? []) {
    if (noteFrequency(n) === null) throw new Error(`Bad chord note "${n}"`);
  }
  const chordSeconds = tune.endChord ? 2 * beat : 0;
  return { events, chordAt: t, seconds: t + chordSeconds };
}
