"use client";

import { useSyncExternalStore } from "react";
import { nowPlaying, onPlayingChange } from "./engine";

/** The id of whatever the PA is playing right now (null when quiet). */
export function usePlaying(): string | null {
  return useSyncExternalStore(onPlayingChange, nowPlaying, () => null);
}
