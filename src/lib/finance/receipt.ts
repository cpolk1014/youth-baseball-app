// Receipts: phone photos are shrunk before upload so they're quick on a ballpark
// connection; PDFs go up as they are.

export const RECEIPT_MAX_BYTES = 10 * 1024 * 1024;
export const RECEIPT_ACCEPT = "image/*,application/pdf";
/** Longest side of an uploaded photo, in pixels: plenty to read a receipt. */
export const RECEIPT_MAX_SIDE = 1600;

/** Scale (w, h) down to fit within `max` on its longest side; never scales up. */
export function fitWithin(w: number, h: number, max: number): { w: number; h: number } {
  const scale = Math.min(1, max / Math.max(w, h));
  return { w: Math.round(w * scale), h: Math.round(h * scale) };
}

/** Storage path for a receipt: <team>/<entry>/<random>.<ext>. */
export function receiptPath(teamId: string, entryId: string, fileId: string, mime: string): string {
  const ext = mime === "application/pdf" ? "pdf" : "jpg";
  return `${teamId}/${entryId}/${fileId}.${ext}`;
}

export const isPdf = (path: string) => path.toLowerCase().endsWith(".pdf");
