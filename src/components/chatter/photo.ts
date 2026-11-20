"use client";

// Chatter photos are redrawn on the phone before upload: smaller files, and redrawing drops
// everything else in the file, including the GPS location phones record (which could show
// where a kid lives). Unlike receipts, a photo that can't be redrawn is never uploaded as is.
import { fitWithin } from "@/lib/finance/receipt";

export const FULL_SIDE = 1600;
export const THUMB_SIDE = 480;

export interface PreparedPhoto {
  full: Blob;
  thumb: Blob;
  w: number;
  h: number;
}

async function draw(bitmap: ImageBitmap, maxSide: number, quality: number) {
  const { w, h } = fitWithin(bitmap.width, bitmap.height, maxSide);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, w, h);
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", quality),
  );
  if (!blob) throw new Error("Couldn't shrink that photo.");
  return { blob, w, h };
}

export async function preparePhoto(file: File): Promise<PreparedPhoto> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("Fungo can't open that file. Pick a photo or a screenshot.");
  }
  try {
    const full = await draw(bitmap, FULL_SIDE, 0.82);
    const thumb = await draw(bitmap, THUMB_SIDE, 0.75);
    return { full: full.blob, thumb: thumb.blob, w: full.w, h: full.h };
  } finally {
    bitmap.close();
  }
}
