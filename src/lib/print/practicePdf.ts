// The practice plan and practice schedule as PDFs (for phones, which can't print a page
// from a home-screen app): the same content as the printable pages.
import { placeLabel } from "@/lib/data/game";
import type { Practice } from "@/lib/data/types";
import { playsFor } from "@/lib/plays/library";
import { ACTOR_NAMES, type Actor } from "@/lib/plays/types";
import { formatPracticeWhen } from "@/lib/practice/format";
import { drillTimes, practiceMonths, type PrintRange } from "@/lib/practice/print";
import { planMinutes } from "@/lib/practice/schedule";
import { PAGE_W, PT, PdfWriter, rgb, type PdfImage } from "./writer";

export interface PdfBrand {
  teamName: string;
  /** The team's main color (as the app shows it), for headings. */
  teamColor?: string | null;
  teamLogo?: PdfImage | null;
  rallyLogo?: PdfImage | null;
  /** "Nov 17", for "Printed …". */
  printed: string;
}

/** Team logo, a title block and a team-colored rule. */
function header(w: PdfWriter, brand: PdfBrand, kicker: string, title: string, sub?: string) {
  const color = rgb(brand.teamColor);
  const logo = brand.teamLogo ? 0.7 : 0;
  const x = w.margin + (logo ? logo + 0.15 : 0);
  const top = w.y;
  if (brand.teamLogo) w.image(brand.teamLogo, w.margin, top, logo, logo);
  const width = w.width - (x - w.margin);
  const indent = x - w.margin;
  w.text(kicker.toUpperCase(), { size: 9, bold: true, gray: 110, indent, width });
  w.text(title, { size: 18, bold: true, indent, width, leading: 1.15 });
  if (sub) w.text(sub, { size: 11, gray: 60, indent, width });
  w.y = Math.max(w.y, top + logo) + 0.08;
  w.rule(3, 0, color);
  w.y += 0.2;
}

function footer(w: PdfWriter, brand: PdfBrand, left: string) {
  const pages = w.doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    w.doc.setPage(i);
    const y = w.bottom + 0.15;
    w.font(8, false, 120);
    w.doc.text(
      `${left}${pages > 1 ? ` · Page ${i} of ${pages}` : ""}`,
      w.margin,
      y + 8 * PT * 0.85,
    );
    if (brand.rallyLogo) w.image(brand.rallyLogo, PAGE_W - w.margin - 1.1, y - 0.04, 1.1, 0.2);
  }
}

function sectionTitle(w: PdfWriter, brand: PdfBrand, title: string) {
  w.ensure(0.6);
  w.y += 0.08;
  w.text(title.toUpperCase(), { size: 9, bold: true, color: rgb(brand.teamColor), after: 0.04 });
}

/** One practice for the clipboard: drills with clock times and how-to, plays, notes. */
export function practicePlanPdf(practice: Practice, brand: PdfBrand, withJobs: boolean): PdfWriter {
  const w = new PdfWriter(0.5);
  const where = placeLabel(practice);
  header(
    w,
    brand,
    `${brand.teamName} · Practice`,
    formatPracticeWhen(practice),
    [where, practice.locationAddress].filter(Boolean).join(" · ") || undefined,
  );
  if (practice.canceled)
    w.text("CANCELED", { size: 14, bold: true, color: [185, 28, 28], after: 0.1 });

  const total = planMinutes(practice.plan);
  w.text(
    `Focus: ${practice.focus ?? "Not set"}${total ? `      Drills: ${practice.plan.length} · ${total} min` : ""}`,
    { size: 11, bold: true, after: 0.1 },
  );

  sectionTitle(w, brand, "Practice plan");
  if (practice.plan.length === 0) w.text("No drills yet.", { gray: 100 });
  const times = drillTimes(practice.startTime, practice.plan);
  practice.plan.forEach((d, i) => {
    const when = `${times ? `${times[i]!.from}-${times[i]!.to} · ` : ""}${d.minutes} min`;
    const titleH = w.heightOf(`${i + 1}. ${d.title}`, { size: 12, bold: true, width: w.width - 2 });
    const notesH = d.notes ? Math.min(w.heightOf(d.notes, { size: 10.5, indent: 0.3 }), 1.2) : 0;
    w.ensure(titleH + notesH + 0.15);
    w.y += 0.06;
    const top = w.y;
    // A box to tick off.
    w.doc.setDrawColor(120, 120, 120);
    w.doc.setLineWidth(1 * PT);
    w.doc.rect(w.margin, top + 0.03, 0.16, 0.16);
    w.font(11, true, 60);
    w.doc.text(when, PAGE_W - w.margin, top + 11 * PT * 0.85, { align: "right" });
    w.text(`${i + 1}. ${d.title}`, { size: 12, bold: true, indent: 0.3, width: w.width - 2.2 });
    if (d.notes) w.text(d.notes, { size: 10.5, indent: 0.3, gray: 30, leading: 1.3 });
    w.y += 0.06;
    w.rule(0.5, 215);
  });

  const plays = playsFor(practice.plays);
  if (plays.length) {
    w.y += 0.1;
    sectionTitle(w, brand, "Plays to walk through");
    for (const p of plays) {
      w.ensure(0.5);
      w.text(`${p.name} · ${p.situation}`, { size: 11, bold: true, after: 0.02 });
      if (withJobs) {
        for (const a of Object.keys(ACTOR_NAMES) as Actor[]) {
          if (p.jobs[a])
            w.text(`${ACTOR_NAMES[a]}: ${p.jobs[a]}`, { size: 9.5, indent: 0.2, gray: 40 });
        }
      }
      w.y += 0.08;
    }
  }

  if (practice.notes) {
    w.y += 0.05;
    sectionTitle(w, brand, "Notes");
    w.text(practice.notes, { size: 10.5, leading: 1.3 });
  }

  footer(w, brand, `Printed ${brand.printed}`);
  return w;
}

/** The schedule: upcoming or the whole season, by month, with drills and plays if wanted. */
export function practiceSchedulePdf(
  practices: Practice[],
  brand: PdfBrand,
  o: { seasonName: string; range: PrintRange; today: string; withPlans: boolean },
): PdfWriter {
  const w = new PdfWriter(0.5);
  header(
    w,
    brand,
    `Practice schedule · ${o.range === "upcoming" ? "Upcoming" : "Whole season"}`,
    brand.teamName,
    o.seasonName,
  );
  const months = practiceMonths(practices, o.range, o.today);
  const count = months.reduce((n, m) => n + m.practices.length, 0);
  if (count === 0) w.text("No practices to show.", { gray: 100 });
  // Columns: date, time, where, focus.
  const cols = [0, 1.55, 2.85, 5.0];
  const colW = [1.5, 1.25, 2.1, w.width - 5.0];
  for (const m of months) {
    sectionTitle(w, brand, m.label);
    w.font(8, true, 110);
    ["DATE", "TIME", "WHERE", "FOCUS"].forEach((h, i) =>
      w.doc.text(h, w.margin + cols[i]!, w.y + 8 * PT * 0.85),
    );
    w.y += 0.18;
    w.rule(1, 170);
    w.y += 0.04;
    for (const p of m.practices) {
      const [day, time] = formatPracticeWhen(p).split(" · ");
      const cells = [
        day ?? "",
        time ?? "-",
        [placeLabel(p), p.canceled ? null : p.locationAddress].filter(Boolean).join("\n") || "-",
        p.canceled ? "Canceled" : (p.focus ?? ""),
      ];
      const wrapped = cells.map((c, i) => w.lines(c, colW[i]!, 10, i === 0));
      const plays = playsFor(p.plays);
      const extra =
        o.withPlans && !p.canceled
          ? [
              ...p.plan.map((d, i) => `${i + 1}. ${d.title} · ${d.minutes} min`),
              ...(plays.length ? [`Plays: ${plays.map((x) => x.name).join(", ")}`] : []),
            ]
          : [];
      const lh = 10 * PT * 1.25;
      const rowH = Math.max(...wrapped.map((l) => l.length)) * lh;
      w.ensure(rowH + extra.length * 9 * PT * 1.25 + 0.1);
      const top = w.y;
      wrapped.forEach((lines, i) => {
        w.font(
          10,
          i === 0,
          p.canceled ? 150 : 0,
          i === 3 && p.canceled ? [185, 28, 28] : undefined,
        );
        lines.forEach((line, j) =>
          w.doc.text(line, w.margin + cols[i]!, top + j * lh + 10 * PT * 0.85),
        );
      });
      w.y = top + rowH;
      for (const line of extra) w.text(line, { size: 9, indent: 0.2, gray: 50 });
      w.y += 0.05;
      w.rule(0.5, 220);
      w.y += 0.05;
    }
  }
  footer(
    w,
    brand,
    `${count} practice${count === 1 ? "" : "s"} · Printed ${brand.printed} · Check RallyCap for changes`,
  );
  return w;
}
