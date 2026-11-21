// A GIF on a Chatter post: GIPHY's own links (the video the feed plays and a still frame for
// reduced motion), its size and title. Pure: no I/O. The database accepts only GIPHY links.

export interface ChatterGif {
  id: string;
  mp4: string;
  still: string;
  w: number;
  h: number;
  title: string;
}

const GIPHY_MEDIA = /^https:\/\/media[0-9]*\.giphy\.com\/[A-Za-z0-9/._-]+$/;

/** A link without GIPHY's tracking query, or null when it isn't a GIPHY media link. */
export function giphyLink(url: unknown): string | null {
  if (typeof url !== "string") return null;
  const clean = url.split("?")[0]!;
  return GIPHY_MEDIA.test(clean) && clean.length <= 400 ? clean : null;
}

/** One GIPHY search result as a post's GIF (the 200-wide rendition), or null. */
export function gifFromGiphy(item: unknown): ChatterGif | null {
  if (!item || typeof item !== "object") return null;
  const g = item as {
    id?: unknown;
    title?: unknown;
    images?: Record<string, Record<string, unknown> | undefined>;
  };
  const fixed = g.images?.fixed_width;
  const still = g.images?.fixed_width_still;
  const mp4 = giphyLink(fixed?.mp4);
  const stillUrl = giphyLink(still?.url);
  const w = Number(fixed?.width);
  const h = Number(fixed?.height);
  if (typeof g.id !== "string" || !/^[A-Za-z0-9]{1,40}$/.test(g.id)) return null;
  if (!mp4 || !stillUrl || !(w > 0) || !(h > 0)) return null;
  const title = typeof g.title === "string" ? g.title.trim().slice(0, 140) : "";
  return { id: g.id, mp4, still: stillUrl, w, h, title };
}

/** A GIF read back from a post (or null when it's missing or not from GIPHY). */
export function gifFrom(value: unknown): ChatterGif | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  const mp4 = giphyLink(v.mp4);
  const still = giphyLink(v.still);
  if (!mp4 || !still || typeof v.id !== "string") return null;
  return {
    id: v.id,
    mp4,
    still,
    w: Number(v.w) || 200,
    h: Number(v.h) || 150,
    title: typeof v.title === "string" ? v.title : "",
  };
}
