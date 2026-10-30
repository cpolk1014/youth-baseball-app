"use client";

import { useEffect, useState } from "react";
import { logoUrl } from "@/lib/branding/logo";
import { teamColors } from "@/lib/branding/theme";
import { formatGameDate } from "@/lib/data/game";
import type { AppData, Game } from "@/lib/data/types";
import type { Lineup } from "@/lib/rules/types";
import { battingCardModel, cardFileName } from "@/lib/share/battingCard";
import { renderBattingCard } from "./battingCardImage";

/** Builds the batting order picture, then offers Share (phones) and Save. */
export function ShareBattingCard({
  data,
  game,
  lineup,
}: {
  data: AppData;
  game: Game;
  lineup: Lineup;
}) {
  const [file, setFile] = useState<{ blob: Blob; url: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [shared, setShared] = useState(false);
  const name = cardFileName(data.team.name, game.opponent);

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
    renderBattingCard(
      battingCardModel({
        teamName: data.team.name,
        opponent: game.opponent,
        when: formatGameDate(game),
        location: game.location,
        players: data.players,
        lineup,
      }),
      { main, accent, logoUrl: logoUrl(data.team.logoPath), initials },
    ).then(
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
  }, [data.team.name, data.team.colors, data.team.logoPath, data.players, game, lineup]);

  const share = async () => {
    if (!file) return;
    const asFile = new File([file.blob], name, { type: "image/png" });
    try {
      if (navigator.canShare?.({ files: [asFile] })) {
        await navigator.share({ files: [asFile], title: `Batting order vs ${game.opponent}` });
        setShared(true);
        return;
      }
    } catch (e) {
      // Closing the share sheet isn't an error.
      if (e instanceof DOMException && e.name === "AbortError") return;
    }
    // No share sheet (most computers): save it instead.
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
  if (!file) return <p className="p-6 text-center text-base text-slate-600">Making the picture…</p>;
  return (
    <div className="flex flex-col gap-3">
      {/* eslint-disable-next-line @next/next/no-img-element -- generated on the device */}
      <img
        src={file.url}
        alt={`Batting order vs ${game.opponent}`}
        className="w-full rounded-xl border-2 border-slate-200"
      />
      <button
        onClick={() => void share()}
        className="h-14 rounded-xl bg-[var(--team)] text-lg font-bold text-white active:bg-[var(--team-press)]"
      >
        Share picture
      </button>
      <a
        href={file.url}
        download={name}
        className="flex h-12 items-center justify-center rounded-xl border-2 border-slate-400 text-base font-bold active:bg-slate-100"
      >
        Save to device
      </a>
      {shared && <p className="text-center text-base text-green-800">Shared.</p>}
      <p className="text-sm text-slate-600">
        Share opens your phone&apos;s share sheet: GroupMe, Messages, Photos and more. On a computer
        it saves the picture.
      </p>
    </div>
  );
}
