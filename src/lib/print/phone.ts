// Printing on phones: a home-screen app on an iPhone can't open the print dialog, so phones
// get a PDF to share instead (the share sheet has Print, Save to Files, AirDrop, Messages).
import type { PdfImage } from "./writer";

/** Phones and tablets (touch, no mouse) get a PDF; computers print the page. */
export function wantsPdf(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(hover: none) and (pointer: coarse)").matches
  );
}

/** A picture as a PNG for the PDF (null if it can't be loaded, e.g. offline). */
export async function loadPdfImage(
  url: string | null | undefined,
  maxPx = 600,
): Promise<PdfImage | null> {
  if (!url) return null;
  try {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = url;
    await img.decode();
    const w0 = img.naturalWidth || 600;
    const h0 = img.naturalHeight || 120;
    // Sharp enough for paper (an SVG is drawn at full size), never bigger than maxPx.
    const scale = url.endsWith(".svg")
      ? maxPx / Math.max(w0, h0)
      : Math.min(1, maxPx / Math.max(w0, h0));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(w0 * scale);
    canvas.height = Math.round(h0 * scale);
    canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
    return { dataUrl: canvas.toDataURL("image/png"), width: canvas.width, height: canvas.height };
  } catch {
    return null;
  }
}

/** The team's main color as the app shows it (readable on white). */
export function teamColor(): string | null {
  if (typeof window === "undefined") return null;
  return getComputedStyle(document.documentElement).getPropertyValue("--team").trim() || null;
}

export const RALLY_LOGO = "/brand/rallycap-horizontal-color.svg";

/** Hand a PDF to the share sheet, or download it where sharing files isn't possible. */
export async function sharePdf(file: File): Promise<"shared" | "downloaded" | "canceled"> {
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: file.name.replace(/\.pdf$/, "") });
      return "shared";
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") return "canceled";
      // Fall through to a download.
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
  return "downloaded";
}

/** "Traction Canes 7U lineup vs Gators.pdf" */
export function pdfFileName(name: string): string {
  return `${
    name
      .replace(/[^\w .,()-]+/g, "")
      .replace(/\s+/g, " ")
      .trim() || "RallyCap"
  }.pdf`;
}
