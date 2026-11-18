// The lineup card as a PDF (for phones, which can't print a page from a home-screen app):
// half sheet ×2 with a cut line, or a full letter page with defense by inning. Same layout
// as the printable card.
import type { LineupCardData } from "@/lib/lineup/card";
import { PAGE_H, PAGE_W, PT, PdfWriter, pdfSafe, type PdfImage } from "./writer";

export interface LineupPdfHeader {
  team: string;
  ageGroup: string;
  opponent: string;
  when: string;
  location: string | null;
  teamLogo?: PdfImage | null;
  rallyLogo?: PdfImage | null;
}

/** Text cut to fit a width, with "…" when it doesn't. */
function fit(w: PdfWriter, text: string, width: number): string {
  const s = pdfSafe(text);
  if (w.doc.getTextWidth(s) <= width) return s;
  let out = s;
  while (out.length > 1 && w.doc.getTextWidth(`${out}…`) > width) out = out.slice(0, -1);
  return `${out}…`;
}

/** One card in a box: x, y, width, height (inches). */
function card(
  w: PdfWriter,
  box: { x: number; y: number; w: number; h: number },
  h: LineupPdfHeader,
  data: LineupCardData,
  compact: boolean,
) {
  const doc = w.doc;
  const base = compact ? 10.5 : 12;
  const rowH = compact ? 0.26 : 0.3;
  let y = box.y;

  // Header: logo, team and opponent on the left; when and where on the right.
  const logo = h.teamLogo ? (compact ? 0.45 : 0.65) : 0;
  if (h.teamLogo) w.image(h.teamLogo, box.x, y, logo, logo);
  const tx = box.x + (logo ? logo + 0.1 : 0);
  const headH = Math.max(logo, compact ? 0.45 : 0.6);
  w.font(compact ? 13 : 18, true);
  doc.text(
    fit(w, `${h.team} ${h.ageGroup}`, box.w * 0.6 - (tx - box.x)),
    tx,
    y + (compact ? 0.2 : 0.28),
  );
  w.font(base, true);
  doc.text(fit(w, `vs ${h.opponent}`, box.w * 0.6 - (tx - box.x)), tx, y + headH - 0.06);
  w.font(base, false);
  doc.text(fit(w, h.when, box.w * 0.4), box.x + box.w, y + (compact ? 0.2 : 0.28), {
    align: "right",
  });
  if (h.location) {
    doc.text(fit(w, h.location, box.w * 0.4), box.x + box.w, y + headH - 0.06, { align: "right" });
  }
  y += headH + 0.05;
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(2 * PT);
  doc.line(box.x, y, box.x + box.w, y);
  y += 0.12;

  // The batting / position grid.
  const innW = compact ? 0.42 : 0.5;
  const fixed = 0.35 + 0.45 + innW * data.innings;
  const nameW = Math.max(1, box.w - fixed);
  const cols = [0.35, 0.45, nameW, ...Array.from({ length: data.innings }, () => innW)];
  const grid = (
    rows: string[][],
    header: boolean[],
    bold: (r: number, c: number) => boolean,
    gray: (r: number, c: number) => boolean,
    widths: number[],
    height: number,
    size: number,
    leftCols: number[],
  ) => {
    doc.setLineWidth(0.75 * PT);
    rows.forEach((row, r) => {
      let x = box.x;
      if (header[r]) {
        doc.setFillColor(229, 231, 235);
        doc.rect(
          box.x,
          y,
          widths.reduce((a, b) => a + b, 0),
          height,
          "F",
        );
      }
      row.forEach((cell, c) => {
        const cw = widths[c]!;
        doc.setDrawColor(0, 0, 0);
        doc.rect(x, y, cw, height);
        w.font(size, header[r] || bold(r, c), gray(r, c) ? 110 : 0);
        const text = fit(w, cell, cw - 0.08);
        const ty = y + height / 2 + size * PT * 0.35;
        if (leftCols.includes(c)) doc.text(text, x + 0.05, ty);
        else doc.text(text, x + cw / 2, ty, { align: "center" });
        x += cw;
      });
      y += height;
    });
  };
  const innings = Array.from({ length: data.innings }, (_, i) => String(i + 1));
  grid(
    [
      ["Bat", "No.", "Player", ...innings],
      ...data.rows.map((r) => [String(r.order ?? "–"), r.jersey, r.name, ...r.positions]),
    ],
    [true, ...data.rows.map(() => false)],
    (r, c) => r > 0 && (c <= 2 || data.rows[r - 1]!.positions[c - 3] !== "BN"),
    (r, c) => r > 0 && c > 2 && data.rows[r - 1]!.positions[c - 3] === "BN",
    cols,
    rowH,
    base,
    [2],
  );

  if (!compact) {
    y += 0.4;
    w.font(base, true);
    doc.text("Defense by inning", box.x, y);
    y += 0.1;
    const posW = 0.45;
    const each = (box.w - posW) / data.innings;
    grid(
      [["Pos", ...innings], ...data.defense.map((d) => [d.position, ...d.players])],
      [true, ...data.defense.map(() => false)],
      (r, c) => r > 0 && c === 0,
      () => false,
      [posW, ...innings.map(() => each)],
      0.26,
      10,
      [],
    );
  }

  // Signatures at the bottom of the box, with the Fungo logo.
  const sy = box.y + box.h - 0.12;
  doc.setLineWidth(0.75 * PT);
  doc.setDrawColor(0, 0, 0);
  const logoW = h.rallyLogo ? 1.1 : 0;
  const lineW = box.w - logoW - 0.3;
  doc.line(box.x, sy, box.x + lineW * 0.62, sy);
  doc.line(box.x + lineW * 0.68, sy, box.x + lineW, sy);
  w.font(base * 0.9, false);
  doc.text("Coach", box.x, sy + 0.16);
  doc.text("Umpire", box.x + lineW * 0.68, sy + 0.16);
  if (h.rallyLogo) w.image(h.rallyLogo, box.x + box.w - logoW, sy - 0.12, logoW, 0.22);
}

export function lineupCardPdf(
  size: "half" | "letter",
  header: LineupPdfHeader,
  data: LineupCardData,
): PdfWriter {
  const w = new PdfWriter(0.5);
  if (size === "letter") {
    card(w, { x: 0.5, y: 0.5, w: PAGE_W - 1, h: PAGE_H - 1.2 }, header, data, false);
  } else {
    const half = PAGE_H / 2;
    for (const top of [0, half]) {
      card(w, { x: 0.45, y: top + 0.35, w: PAGE_W - 0.9, h: half - 0.85 }, header, data, true);
    }
    // The cut line.
    w.doc.setLineDashPattern([0.08, 0.06], 0);
    w.doc.setDrawColor(150, 150, 150);
    w.doc.setLineWidth(1.5 * PT);
    w.doc.line(0, half, PAGE_W, half);
    w.doc.setLineDashPattern([], 0);
  }
  return w;
}
