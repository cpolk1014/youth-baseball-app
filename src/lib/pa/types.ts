// Gameday PA: walk-up songs, the announcer, and the team's soundboard.

/** Announcer talks over the song's intro (stadium style) or before the song starts. */
export type AnnounceMode = "over" | "before";

export interface Walkup {
  playerId: string;
  /** The saved clip (already trimmed, faded and evened out). */
  songPath: string;
  songSource: "ai" | "upload";
  /** What the song was made from (AI songs), so it can be made again. */
  songPrompt: string | null;
  /** 0.2–2; 1 is as saved. */
  volume: number;
  announce: boolean;
  announceMode: AnnounceMode;
  /** How to say the name and number; blank uses the roster. */
  nameSpoken: string;
  numberSpoken: string;
  script: string;
  /** The announcer's call, made when the walk-up is saved. */
  announcePath: string | null;
  /** Walk-ups saved by anyone but a coach wait for a coach's OK before they play. */
  status: "pending" | "approved";
  updatedAt: string;
}

export type SoundCategory = "pregame" | "organ" | "mound" | "quick";

/** A sound the team added to its soundboard (AI-made or uploaded). */
export interface TeamSound {
  id: string;
  category: SoundCategory;
  label: string;
  path: string;
  source: "ai" | "upload";
}

export const CATEGORY_LABEL: Record<SoundCategory, string> = {
  pregame: "Pregame & between innings",
  organ: "Organ",
  mound: "Mound visit",
  quick: "Quick hits",
};
