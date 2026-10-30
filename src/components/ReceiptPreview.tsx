"use client";

import { useEffect, useState } from "react";
import { receiptUrl } from "@/lib/data/store";
import { isPdf } from "@/lib/finance/receipt";

/** Shows a receipt (photo or PDF) from its private storage path. */
export function ReceiptPreview({ path }: { path: string }) {
  // The short-lived link for this path, or why it couldn't be made.
  const [result, setResult] = useState<{ path: string; url?: string; failed?: boolean } | null>(
    null,
  );

  useEffect(() => {
    let current = true;
    receiptUrl(path).then(
      (url) => current && setResult({ path, url }),
      () => current && setResult({ path, failed: true }),
    );
    return () => {
      current = false;
    };
  }, [path]);

  const ready = result?.path === path ? result : null;
  if (!ready) return <p className="p-6 text-center text-base text-slate-600">Loading receipt…</p>;
  if (ready.failed || !ready.url) {
    return (
      <p role="alert" className="rounded-xl bg-red-50 p-3 text-base font-semibold text-red-800">
        Couldn&apos;t load the receipt. Check your connection and try again.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      {isPdf(path) ? (
        <iframe
          src={ready.url}
          title="Receipt"
          className="h-[65dvh] w-full rounded-xl border-2 border-slate-200 bg-white"
        />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element -- private, short-lived link
        <img
          src={ready.url}
          alt="Receipt"
          className="max-h-[70dvh] w-full rounded-xl border-2 border-slate-200 bg-white object-contain"
        />
      )}
      <a
        href={ready.url}
        target="_blank"
        rel="noreferrer"
        className="text-center text-base font-semibold text-[var(--team)] underline"
      >
        Open full size
      </a>
    </div>
  );
}
