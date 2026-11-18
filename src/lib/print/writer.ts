// A small layer over jsPDF for Fungo's printouts: letter paper in inches, wrapped text
// that flows onto new pages, and characters the built-in PDF fonts can show.
import { jsPDF } from "jspdf";

export const PAGE_W = 8.5;
export const PAGE_H = 11;
export const PT = 1 / 72; // one point, in inches

/** An image ready for the PDF: a PNG or JPEG data URL and its size in pixels. */
export interface PdfImage {
  dataUrl: string;
  width: number;
  height: number;
}

/**
 * Text the PDF's built-in fonts can draw (Windows-1252). Arrows, checkmarks and other symbols
 * become plain-text stand-ins; emoji and anything else unknown are dropped.
 */
export function pdfSafe(s: string): string {
  const map: Record<string, string> = {
    "→": "->",
    "←": "<-",
    "↔": "<->",
    "⇒": "=>",
    "✓": "v",
    "✔": "v",
    "✗": "x",
    "×": "x",
    "≤": "<=",
    "≥": ">=",
    "−": "-",
    "‑": "-",
    "‒": "-",
    "―": "-",
    " ": " ",
    " ": " ",
    " ": " ",
  };
  let out = "";
  for (const ch of s) {
    if (map[ch] !== undefined) {
      out += map[ch];
      continue;
    }
    const code = ch.codePointAt(0)!;
    // ASCII, Latin-1, and the Windows-1252 extras (curly quotes, dashes, bullet, ellipsis…).
    if (code < 0x100 || "€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ".includes(ch)) out += ch;
  }
  // A dropped emoji can leave two spaces in a row.
  return out.replace(/[ \t]{2,}/g, " ");
}

export interface TextOptions {
  size?: number;
  bold?: boolean;
  /** Gray level 0 (black) to 255. */
  gray?: number;
  /** [r, g, b] 0-255; wins over gray. */
  color?: [number, number, number];
  indent?: number;
  /** Width to wrap at (inches); defaults to the rest of the line. */
  width?: number;
  /** Space after, in inches. */
  after?: number;
  /** Line height as a multiple of the font size. */
  leading?: number;
  align?: "left" | "right" | "center";
}

/** Writes top to bottom, adding pages as it goes. */
export class PdfWriter {
  readonly doc: jsPDF;
  y: number;
  readonly margin: number;

  constructor(margin = 0.5) {
    this.doc = new jsPDF({ unit: "in", format: "letter", orientation: "portrait" });
    this.margin = margin;
    this.y = margin;
  }

  get width(): number {
    return PAGE_W - this.margin * 2;
  }
  get bottom(): number {
    return PAGE_H - this.margin;
  }

  font(size: number, bold = false, gray = 0, color?: [number, number, number]): void {
    this.doc.setFont("helvetica", bold ? "bold" : "normal");
    this.doc.setFontSize(size);
    if (color) this.doc.setTextColor(color[0], color[1], color[2]);
    else this.doc.setTextColor(gray, gray, gray);
  }

  /** Lines a text wraps to at a width, with the given font. */
  lines(text: string, width: number, size: number, bold = false): string[] {
    this.font(size, bold);
    return this.doc.splitTextToSize(pdfSafe(text), width) as string[];
  }

  /** Height of a wrapped text block. */
  heightOf(text: string, o: TextOptions = {}): number {
    const size = o.size ?? 11;
    const width = o.width ?? this.width - (o.indent ?? 0);
    return this.lines(text, width, size, o.bold).length * size * PT * (o.leading ?? 1.25);
  }

  /** A new page when less than `h` inches are left. */
  ensure(h: number): void {
    if (this.y + h > this.bottom) this.newPage();
  }

  newPage(): void {
    this.doc.addPage("letter", "portrait");
    this.y = this.margin;
  }

  /** Wrapped text at the current line, flowing onto new pages; returns lines written. */
  text(text: string, o: TextOptions = {}): number {
    const size = o.size ?? 11;
    const lh = size * PT * (o.leading ?? 1.25);
    const x0 = this.margin + (o.indent ?? 0);
    const width = o.width ?? this.width - (o.indent ?? 0);
    const lines = this.lines(text, width, size, o.bold);
    this.font(size, o.bold, o.gray ?? 0, o.color);
    for (const line of lines) {
      this.ensure(lh);
      const x = o.align === "right" ? x0 + width : o.align === "center" ? x0 + width / 2 : x0;
      // jsPDF draws from the baseline; step down most of a line first.
      this.doc.text(line, x, this.y + size * PT * 0.85, { align: o.align ?? "left" });
      this.y += lh;
    }
    this.y += o.after ?? 0;
    return lines.length;
  }

  rule(weight = 0.5, gray = 200, color?: [number, number, number]): void {
    this.doc.setLineWidth(weight * PT);
    if (color) this.doc.setDrawColor(color[0], color[1], color[2]);
    else this.doc.setDrawColor(gray, gray, gray);
    this.doc.line(this.margin, this.y, PAGE_W - this.margin, this.y);
  }

  image(img: PdfImage, x: number, y: number, w: number, h: number): void {
    // Keep the picture's shape inside the box.
    const ratio = img.width / img.height;
    const bw = ratio >= w / h ? w : h * ratio;
    const bh = ratio >= w / h ? w / ratio : h;
    const format = img.dataUrl.startsWith("data:image/jpeg") ? "JPEG" : "PNG";
    // Compressed: an uncompressed logo can make the PDF megabytes.
    this.doc.addImage(
      img.dataUrl,
      format,
      x + (w - bw) / 2,
      y + (h - bh) / 2,
      bw,
      bh,
      undefined,
      "FAST",
    );
  }

  blob(): Blob {
    return this.doc.output("blob");
  }
}

/** "#1B2A4A" → [27, 42, 74] (navy when it can't be read). */
export function rgb(hex: string | null | undefined): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex ?? "");
  if (!m) return [27, 42, 74];
  const n = parseInt(m[1]!, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
