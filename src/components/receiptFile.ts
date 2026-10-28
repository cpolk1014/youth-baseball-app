"use client";

import { RECEIPT_MAX_SIDE, fitWithin } from "@/lib/finance/receipt";

/**
 * Shrink a receipt photo to a JPEG no bigger than RECEIPT_MAX_SIDE on its longest side.
 * PDFs, and images the browser can't decode, are returned unchanged.
 */
export async function shrinkReceipt(file: File): Promise<Blob> {
  if (!file.type.startsWith("image/")) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const { w, h } = fitWithin(bitmap.width, bitmap.height, RECEIPT_MAX_SIDE);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.82),
    );
    return blob ?? file;
  } catch {
    return file;
  }
}
