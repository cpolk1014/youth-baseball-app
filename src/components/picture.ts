"use client";

import { extractPalette } from "@/lib/branding/color";

/** Draw a picture into a square canvas, the whole picture showing (letterboxed). */
async function drawSquare(file: Blob, size: number): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const scale = Math.min(size / bitmap.width, size / bitmap.height);
  const w = bitmap.width * scale;
  const h = bitmap.height * scale;
  canvas.getContext("2d")!.drawImage(bitmap, (size - w) / 2, (size - h) / 2, w, h);
  bitmap.close();
  return canvas;
}

/** The main colors in a picture (a logo, a jersey, a team photo), most prominent first. */
export async function paletteFromPicture(file: Blob): Promise<string[]> {
  const canvas = await drawSquare(file, 120);
  const { data } = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height);
  return extractPalette(data, 6);
}

/** A logo ready to upload: square, 512px, transparent background kept (PNG). */
export async function squareLogo(file: Blob): Promise<Blob> {
  const canvas = await drawSquare(file, 512);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("Couldn't read that picture.");
  return blob;
}
