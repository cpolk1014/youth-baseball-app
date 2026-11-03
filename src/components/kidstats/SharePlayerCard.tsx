"use client";

import { useEffect, useState } from "react";
import { logoUrl } from "@/lib/branding/logo";
import { teamColors } from "@/lib/branding/theme";
import { playerCardFileName, type PlayerCardModel } from "@/lib/boxscore/trends";
import type { AppData } from "@/lib/data/types";
import { renderPlayerCard } from "./playerCardImage";

/** Makes the kid's player card picture on the phone, then offers Share and Save. */
export function SharePlayerCard({ data, model }: { data: AppData; model: PlayerCardModel }) {
  const [file, setFile] = useState<{ blob: Blob; url: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const name = playerCardFileName(model.name, model.season);

  useEffect(() => {
    let current = true;
    let url: string | null = null;
    const { main, accent } = teamColors(data.team.colors);
    const initials = data.team.name
      .split(/\s+/)
      .filter((w) => /^[A-Za-z]/.test(w))
      .slice(0, 2)
      .map((w) => w[0]!.toUpperCase())
      .join("");
    renderPlayerCard(model, { main, accent, logoUrl: logoUrl(data.team.logoPath), initials }).then(
      (blob) => {
        if (!current) return;
        url = URL.createObjectURL(blob);
        setFile({ blob, url });
      },
      () => current && setError("Couldn't make the picture. Try again."),
    );
    return () => {
      current = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [data.team.colors, data.team.name, data.team.logoPath, model]);

  const share = async () => {
    if (!file) return;
    const asFile = new File([file.blob], name, { type: "image/png" });
    try {
      if (navigator.canShare?.({ files: [asFile] })) {
        await navigator.share({ files: [asFile], title: `${model.name}'s season` });
        return;
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
    }
    const a = document.createElement("a");
    a.href = file.url;
    a.download = name;
    a.click();
  };

  if (error) {
    return (
      <p role="alert" className="rounded-xl bg-red-50 p-3 text-base font-semibold text-red-800">
        {error}
      </p>
    );
  }
  if (!file) return <p className="p-6 text-center text-base text-slate-600">Making the card…</p>;
  return (
    <div className="flex flex-col gap-3">
      {/* eslint-disable-next-line @next/next/no-img-element -- generated on the device */}
      <img
        src={file.url}
        alt={`${model.name}'s player card`}
        className="w-full rounded-xl border-2 border-slate-200"
      />
      <button
        onClick={() => void share()}
        className="h-14 rounded-xl bg-[var(--team)] text-lg font-bold text-white active:bg-[var(--team-press)]"
      >
        Share card
      </button>
      <a
        href={file.url}
        download={name}
        className="flex h-12 items-center justify-center rounded-xl border-2 border-slate-400 text-base font-bold active:bg-slate-100"
      >
        Save to device
      </a>
      <p className="text-sm text-slate-600">
        Only your player&apos;s own numbers are on it. It&apos;s yours to share (family, Messages,
        Photos); RallyCap doesn&apos;t post it anywhere.
      </p>
    </div>
  );
}
