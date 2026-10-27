"use client";

import { useAppData } from "@/lib/data/store";
import { playById } from "@/lib/plays/library";
import { AppShell } from "./AppShell";
import { PlayDetail } from "./PlayDetail";
import { QuizButton, firstNames } from "./QuizButton";

export function PlayScreen({ playId }: { playId: string }) {
  const data = useAppData();
  const play = playById(playId);
  if (!play) {
    return (
      <AppShell title="Play not found" backHref="/plays" tab="plays">
        <p className="text-lg">This play isn&apos;t in the library.</p>
      </AppShell>
    );
  }
  return (
    <AppShell title={play.name} subtitle={play.category} backHref="/plays" tab="plays">
      <PlayDetail play={play} />
      <QuizButton
        plays={[play]}
        count={5}
        playerNames={data ? firstNames(data.players) : undefined}
        title={play.name}
        className="mt-6 h-14 w-full rounded-xl bg-[#c8352e] text-lg font-bold text-white active:bg-[#a92a24]"
      >
        Quiz me on this play
      </QuizButton>
    </AppShell>
  );
}
