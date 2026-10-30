"use client";

import { decode } from "./engine";
import { getAudio } from "./paData";

const decoded = new Map<string, Promise<AudioBuffer>>();

/** A saved file, decoded once and kept ready to play. */
export function loadBuffer(path: string): Promise<AudioBuffer> {
  let p = decoded.get(path);
  if (!p) {
    p = getAudio(path).then(decode);
    p.catch(() => decoded.delete(path));
    decoded.set(path, p);
  }
  return p;
}
