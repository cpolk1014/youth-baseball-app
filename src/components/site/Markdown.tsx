// A small Markdown renderer for the legal pages (headings, paragraphs, lists, tables,
// quotes, rules, bold, italics, links, code). No dependency; the files are ours.
import Link from "next/link";
import type { ReactNode } from "react";

function inline(text: string, key = 0): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`|\[([^\]]+)\]\(([^)]+)\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const k = `${key}-${i++}`;
    if (m[2])
      out.push(
        <strong key={k} className="font-bold text-slate-900">
          {inline(m[2], i)}
        </strong>,
      );
    else if (m[3]) out.push(<em key={k}>{inline(m[3], i)}</em>);
    else if (m[4])
      out.push(
        <code key={k} className="rounded bg-slate-100 px-1 text-[0.95em]">
          {m[4]}
        </code>,
      );
    else if (m[5]) {
      const href = m[6] ?? "";
      const cls = "font-semibold text-[#DC143C] underline underline-offset-2";
      out.push(
        href.startsWith("/") ? (
          <Link key={k} href={href} className={cls}>
            {m[5]}
          </Link>
        ) : (
          <a key={k} href={href} className={cls}>
            {m[5]}
          </a>
        ),
      );
    }
    last = re.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

const cells = (row: string) =>
  row
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());

export function Markdown({ source }: { source: string }) {
  const lines = source.replace(/\r/g, "").split("\n");
  const at = (j: number) => lines[j] ?? "";
  const blocks: ReactNode[] = [];
  let i = 0;
  let n = 0;
  while (i < lines.length) {
    const line = at(i);
    const key = n++;
    if (!line.trim()) {
      i++;
      continue;
    }
    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    if (h) {
      const level = (h[1] ?? "").length;
      const text = inline(h[2] ?? "", key);
      if (level === 1)
        blocks.push(
          <h1 key={key} className="text-4xl font-black tracking-tight text-[#1B2A4A] md:text-5xl">
            {text}
          </h1>,
        );
      else if (level === 2)
        blocks.push(
          <h2 key={key} className="mt-6 scroll-mt-20 text-2xl font-black text-[#1B2A4A]">
            {text}
          </h2>,
        );
      else
        blocks.push(
          <h3 key={key} className="mt-2 text-lg font-bold text-[#1B2A4A]">
            {text}
          </h3>,
        );
      i++;
      continue;
    }
    if (/^---+\s*$/.test(line)) {
      blocks.push(<hr key={key} className="my-2 border-slate-200" />);
      i++;
      continue;
    }
    if (line.startsWith(">")) {
      const quote: string[] = [];
      while (i < lines.length && at(i).startsWith(">")) quote.push(at(i++).replace(/^>\s?/, ""));
      blocks.push(
        <blockquote
          key={key}
          className="rounded-xl border-l-4 border-amber-400 bg-amber-50 px-4 py-3 text-amber-900"
        >
          {inline(quote.join(" "), key)}
        </blockquote>,
      );
      continue;
    }
    if (line.trim().startsWith("|")) {
      const rows: string[] = [];
      while (i < lines.length && at(i).trim().startsWith("|")) rows.push(at(i++));
      const [head, , ...body] = rows;
      blocks.push(
        <div key={key} className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full min-w-[32rem] text-left text-[15px]">
            <thead className="bg-slate-50">
              <tr>
                {cells(head ?? "").map((c, j) => (
                  <th key={j} className="px-3 py-2 font-bold text-[#1B2A4A]">
                    {inline(c, j)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {body.map((r, ri) => (
                <tr key={ri} className="border-t border-slate-200 align-top">
                  {cells(r).map((c, j) => (
                    <td key={j} className="px-3 py-2">
                      {inline(c, j)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }
    const list = /^(\s*)([-*]|\d+\.)\s+/;
    if (list.test(line)) {
      const ordered = /^\s*\d+\./.test(line);
      const items: string[] = [];
      while (i < lines.length && list.test(at(i))) {
        let item = at(i++).replace(list, "");
        while (i < lines.length && at(i).trim() && !list.test(at(i)) && /^\s{2,}/.test(at(i)))
          item += " " + at(i++).trim();
        items.push(item);
      }
      const cls = `flex flex-col gap-2 pl-6 ${ordered ? "list-decimal" : "list-disc"} marker:text-[#DC143C]`;
      const children = items.map((it, j) => <li key={j}>{inline(it, j)}</li>);
      blocks.push(
        ordered ? (
          <ol key={key} className={cls}>
            {children}
          </ol>
        ) : (
          <ul key={key} className={cls}>
            {children}
          </ul>
        ),
      );
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && at(i).trim() && !/^(#|>|\||---|\s*([-*]|\d+\.)\s)/.test(at(i)))
      para.push(at(i++).trim());
    blocks.push(
      <p key={key}>
        {para.map((p, j) => (
          <span key={j}>
            {j > 0 && <br />}
            {inline(p, j)}
          </span>
        ))}
      </p>,
    );
  }
  return (
    <div className="flex flex-col gap-4 text-[17px] leading-relaxed text-slate-700">{blocks}</div>
  );
}
