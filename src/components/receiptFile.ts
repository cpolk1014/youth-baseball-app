"use client";

import { receiptUrl } from "@/lib/data/store";
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

/**
 * Open a receipt in a new tab. The tab opens right away (inside the tap) so phones don't
 * block it, then goes to a short-lived private link. Returns false if that failed.
 */
export async function openReceipt(path: string): Promise<boolean> {
  const tab = window.open("", "_blank");
  try {
    const url = await receiptUrl(path);
    if (tab) tab.location.href = url;
    else window.location.assign(url);
    return true;
  } catch {
    tab?.close();
    return false;
  }
}
