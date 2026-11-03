"use client";

import { useState, type ReactNode } from "react";

export interface Column<T> {
  key: string;
  label: string;
  align?: "left" | "right" | "center";
  /** Makes the column sortable (ascending order). */
  sort?: (a: T, b: T) => number;
  /** Which way the first click sorts: numbers usually read best biggest first. */
  firstDir?: "asc" | "desc";
  render: (row: T) => ReactNode;
  className?: string;
}

type Sort = { key: string; dir: "asc" | "desc" } | null;

/** A light, sortable table for wide screens; click a header to sort, a row to open it. */
export function DataTable<T>({
  rows,
  columns,
  rowKey,
  onRowClick,
  rowLabel,
  initialSort = null,
  dimRow,
  canClick = () => true,
}: {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  /** What a click on the row does, for screen readers ("Edit Mason R."). */
  rowLabel?: (row: T) => string;
  initialSort?: Sort;
  dimRow?: (row: T) => boolean;
  /** Only these rows open on click (e.g. a parent's own kids). Default: every row. */
  canClick?: (row: T) => boolean;
}) {
  const [sort, setSort] = useState<Sort>(initialSort);
  const col = columns.find((c) => c.key === sort?.key);
  const sorted =
    col?.sort && sort
      ? [...rows].sort((a, b) => (sort.dir === "asc" ? 1 : -1) * col.sort!(a, b))
      : rows;
  const align = (c: Column<T>) =>
    c.align === "right" ? "text-right" : c.align === "center" ? "text-center" : "text-left";
  const toggle = (c: Column<T>) =>
    setSort(
      sort?.key === c.key
        ? { key: c.key, dir: sort.dir === "asc" ? "desc" : "asc" }
        : { key: c.key, dir: c.firstDir ?? "asc" },
    );

  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
      <table className="w-full text-[15px]">
        <thead className="border-b border-slate-200 bg-slate-50">
          <tr>
            {columns.map((c) => {
              const on = sort?.key === c.key;
              return (
                <th
                  key={c.key}
                  scope="col"
                  aria-sort={on ? (sort!.dir === "asc" ? "ascending" : "descending") : undefined}
                  className={`px-4 py-2.5 text-xs font-bold tracking-wide whitespace-nowrap text-slate-500 uppercase ${align(c)} ${c.className ?? ""}`}
                >
                  {c.sort ? (
                    <button
                      onClick={() => toggle(c)}
                      className={`inline-flex items-center gap-1 uppercase hover:text-slate-900 ${on ? "text-slate-900" : ""}`}
                    >
                      {c.label}
                      <span aria-hidden="true" className={on ? "" : "opacity-30"}>
                        {on && sort!.dir === "desc" ? "↓" : "↑"}
                      </span>
                    </button>
                  ) : (
                    c.label
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {sorted.map((row) => {
            const open = onRowClick && canClick(row) ? onRowClick : undefined;
            return (
              <tr
                key={rowKey(row)}
                onClick={open ? () => open(row) : undefined}
                onKeyDown={
                  open
                    ? (e) => {
                        if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
                          e.preventDefault();
                          open(row);
                        }
                      }
                    : undefined
                }
                tabIndex={open ? 0 : undefined}
                aria-label={open && rowLabel ? rowLabel(row) : undefined}
                className={`${open ? "cursor-pointer hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline-2 focus-visible:outline-[var(--team)]" : ""} ${dimRow?.(row) ? "text-slate-400" : ""}`}
              >
                {columns.map((c) => (
                  <td key={c.key} className={`px-4 py-2.5 ${align(c)} ${c.className ?? ""}`}>
                    {c.render(row)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** A click inside a row's own button or toggle shouldn't also open the row. */
export const stopRow = (e: React.SyntheticEvent) => e.stopPropagation();
