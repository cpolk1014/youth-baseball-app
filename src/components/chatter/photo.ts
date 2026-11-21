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

const isPdf = (f: File) => f.type === "application/pdf" || /\.pdf$/i.test(f.name);
/** Bigger PDFs are refused before opening (a flyer is well under this). */
const PDF_MAX_BYTES = 25 * 1024 * 1024;

/**
 * Turn picked files into pictures: photos pass through; each PDF page becomes a PNG picture
 * (drawn on the phone with pdf.js, loaded only when a PDF is picked), up to `room` in all.
 * Returns the pictures and how many PDF pages didn't fit.
 */
export async function picturesFrom(
  files: File[],
  room: number,
): Promise<{ pictures: File[]; leftOut: number }> {
  const pictures: File[] = [];
  let leftOut = 0;
  for (const file of files) {
    if (!isPdf(file)) {
      if (pictures.length < room) pictures.push(file);
      continue;
    }
    if (file.size > PDF_MAX_BYTES) throw new Error("That PDF is too big. Try one under 25 MB.");
    const pages = await pdfPages(file, room - pictures.length);
    pictures.push(...pages.pictures);
    leftOut += pages.leftOut;
  }
  return { pictures, leftOut };
}

async function pdfPages(file: File, max: number): Promise<{ pictures: File[]; leftOut: number }> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url,
  ).toString();
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  let doc: Awaited<typeof task.promise>;
  try {
    doc = await task.promise;
  } catch (e) {
    throw new Error(
      /password/i.test(String(e))
        ? "That PDF is locked with a password. Save it without one, or post a screenshot."
        : "Fungo can't open that PDF. Try a screenshot of it instead.",
    );
  }
  try {
    const count = Math.min(doc.numPages, Math.max(0, max));
    const base = file.name.replace(/\.pdf$/i, "") || "flyer";
    const pictures: File[] = [];
    for (let n = 1; n <= count; n++) {
      const page = await doc.getPage(n);
      const unscaled = page.getViewport({ scale: 1 });
      // Draw the long side at the full photo size, so text on a flyer stays readable.
      const scale = FULL_SIDE / Math.max(unscaled.width, unscaled.height);
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvas, canvasContext: ctx, viewport }).promise;
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
      if (!blob) throw new Error("Couldn't turn that PDF into a picture.");
      pictures.push(
        new File([blob], count > 1 ? `${base}-${n}.png` : `${base}.png`, { type: "image/png" }),
      );
      page.cleanup();
    }
    return { pictures, leftOut: doc.numPages - count };
  } finally {
    void task.destroy();
  }
}
