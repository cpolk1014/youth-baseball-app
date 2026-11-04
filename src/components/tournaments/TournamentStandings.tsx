"use client";

import { useEffect, useMemo, useState } from "react";
import type { Tournament, TournamentGame, TournamentTeam } from "@/lib/data/tournament-backend";
import type { AppData } from "@/lib/data/types";
import { MAX_SCREENSHOTS } from "@/lib/tournaments/event";
import { ourSide, parsePlaceholder, placeOf, time12 } from "@/lib/tournaments/schedule";
import {
  describeTerm,
  firstGameForSeed,
  scenarios,
  type Scenarios,
} from "@/lib/tournaments/scenarios";
import {
  bracketFills,
  ordinal,
  remainingPoolGames,
  seedingMessage,
  seedsFrom,
  standings,
  type Seed,
  type StandingRow,
  type StandingsInput,
} from "@/lib/tournaments/standings";
import {
  CRITERIA,
  CRITERION_LABEL,
  RUN_CRITERIA,
  describeCriterion,
  type Criterion,
  type ReadRules,
  type RuleSet,
} from "@/lib/tournaments/tiebreak";
import { GroupMePost } from "../GroupMePost";
import { Sheet } from "../Sheet";
import { ScreenshotButton, Thumb, sendScreenshots } from "./AddTournament";
import { saveScheduleGames } from "./TournamentSchedule";

const heading = "mb-2 text-sm font-bold tracking-wide text-slate-600 uppercase";
const field =
  "h-12 w-full rounded-xl border-2 border-slate-300 bg-white px-3 text-base focus:border-[var(--team)] focus:outline-none";
const backend = () => import("@/lib/data/tournament-backend");
const OPEN_TEXT: Record<NonNullable<StandingRow["open"]>, string> = {
  runs: "Tied: depends on runs",
  coin: "Tied: coin flip",
  tied: "Still tied",
};
const names = (list: string[]) =>
  list.length <= 1 ? (list[0] ?? "") : `${list.slice(0, -1).join(", ")} and ${list.at(-1)}`;

/** Why a team sits where it does, in plain words. */
function howText(r: StandingRow, rows: StandingRow[]): string {
  const others = names(
    rows.filter((x) => x.seed === r.seed && x.teamId !== r.teamId).map((x) => x.name),
  );
  if (r.open === "coin") return `Tied with ${others}; a coin flip decides`;
  if (r.open === "tied") return `Tied with ${others}; the tie-breakers don't separate them`;
  if (r.open === "runs") return `Tied with ${others}; runs will decide`;
  return r.decidedBy ? `Tie broken by ${r.decidedBy.toLowerCase()}` : "";
}

/** Standings from the pool games, the tie-breakers behind them, what-ifs and seeding. */
export function TournamentStandings({
  data,
  tournament: t,
  teams,
  games,
  canEdit,
  onChanged,
}: {
  data: AppData;
  tournament: Tournament;
  teams: TournamentTeam[];
  games: TournamentGame[] | null;
  canEdit: boolean;
  onChanged: () => Promise<void>;
}) {
  const [sets, setSets] = useState<RuleSet[] | null>(null);
  const [sheet, setSheet] = useState<"rules" | "tomorrow" | "lock" | "post" | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const teamId = data.team.id;

  const loadSets = async () => setSets(await (await backend()).listRuleSets(teamId));
  useEffect(() => {
    let current = true;
    backend()
      .then((b) => b.listRuleSets(teamId))
      .then(
        (s) => current && setSets(s),
        () => current && setSets([]),
      );
    return () => {
      current = false;
    };
  }, [teamId]);

  const ruleSet = sets?.find((s) => s.id === t.tiebreakSetId) ?? null;
  const us = teams.find((x) => x.isUs) ?? null;
  const input: StandingsInput | null = useMemo(
    () =>
      games && {
        teams: teams.map((x) => ({ id: x.id, name: x.name })),
        games,
        rules: ruleSet?.rules ?? [],
        restart: ruleSet?.restart ?? true,
        seeding: t.seeding,
      },
    [games, teams, ruleSet, t.seeding],
  );
  const tables = useMemo(() => (input ? standings(input) : []), [input]);
  const fills = useMemo(
    () => (games && t.seeds ? bracketFills(games, t.seeds) : []),
    [games, t.seeds],
  );

  if (!games || !input) return null;
  const pool = games.filter((g) => g.stage === "pool");
  if (pool.length === 0) return null;
  const left = remainingPoolGames(games, input.teams);
  const scored = pool.filter((g) => g.scoreHome !== null).length;

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const fillBracket = (seeds: Seed[]) =>
    saveScheduleGames({
      data,
      tournament: t,
      teams,
      saved: games,
      ourName: us?.name ?? null,
      items: bracketFills(games, seeds).flatMap((f) => {
        const g = games.find((x) => x.id === f.id);
        return g ? [{ id: g.id, g: { ...g, home: f.home, away: f.away }, linked: g.gameId }] : [];
      }),
    });

  return (
    <section className="rounded-xl border-2 border-slate-200 bg-white p-4 md:col-span-2">
      <h2 className={heading}>Standings</h2>
      <button
        onClick={() => setSheet("tomorrow")}
        className="mb-3 flex min-h-14 w-full items-center justify-center rounded-xl bg-[var(--team)] px-4 text-lg font-bold text-white active:bg-[var(--team-press)] md:w-auto"
      >
        🕘 What time do we play tomorrow?
      </button>

      {t.seedsLockedAt && t.seeds ? (
        <>
          <p className="mb-2 text-base font-semibold">
            🔒 Seeds locked{" "}
            {new Date(t.seedsLockedAt).toLocaleString("en-US", {
              weekday: "short",
              hour: "numeric",
              minute: "2-digit",
            })}
          </p>
          <ol className="flex flex-col divide-y divide-slate-100">
            {t.seeds.map((s) => (
              <li
                key={s.teamId}
                className={`flex items-center gap-3 py-2 ${s.teamId === us?.id ? "font-bold text-[var(--team)]" : ""}`}
              >
                <span className="w-10 text-lg font-bold tabular-nums">
                  {s.pool ? `${s.pool}${s.seed}` : s.seed}
                </span>
                <span className="text-base">{s.name}</span>
              </li>
            ))}
          </ol>
          {canEdit && (
            <div className="mt-3 flex flex-col gap-2 md:flex-row">
              {fills.length > 0 && (
                <button
                  onClick={() =>
                    void run("Filling in the bracket…", async () => {
                      await fillBracket(t.seeds!);
                      await onChanged();
                    })
                  }
                  disabled={busy !== null}
                  className="h-12 rounded-xl bg-[var(--team)] px-4 text-base font-bold text-white disabled:opacity-40"
                >
                  Fill in the bracket ({fills.length} game{fills.length === 1 ? "" : "s"})
                </button>
              )}
              {data.groupme && (
                <button
                  onClick={() => setSheet("post")}
                  className="h-12 rounded-xl border-2 border-slate-400 bg-white px-4 text-base font-bold"
                >
                  Post seeds to GroupMe
                </button>
              )}
              <button
                onClick={() =>
                  void run("Unlocking…", async () => {
                    await (await backend()).lockSeeds(t.id, null);
                    await onChanged();
                  })
                }
                disabled={busy !== null}
                className="h-12 rounded-xl border-2 border-slate-300 bg-white px-4 text-base font-semibold disabled:opacity-40"
              >
                Unlock the seeds
              </button>
            </div>
          )}
        </>
      ) : (
        <>
          <p className="mb-2 text-sm text-slate-600">
            {scored === 0
              ? `No scores yet. Standings start when the first of the ${pool.length} pool games is scored.`
              : `${scored} of ${pool.length} pool games scored${left.length ? "" : ". Pool play is done."}`}
          </p>
          {tables.map((tb) => (
            <StandingsTable
              key={tb.pool ?? "all"}
              pool={tb.pool}
              rows={tb.rows}
              usId={us?.id}
              started={scored > 0}
            />
          ))}
          {scored > 0 && (
            <p className="text-sm text-slate-600">
              T-2 means tied for 2nd. RS: runs scored. RA: runs allowed.
            </p>
          )}
          <div className="mt-3 flex flex-col gap-2 md:flex-row">
            {canEdit && scored > 0 && (
              <button
                onClick={() => setSheet("lock")}
                className="h-12 rounded-xl bg-[var(--team)] px-4 text-base font-bold text-white"
              >
                Lock the seeds
              </button>
            )}
          </div>
        </>
      )}
      <details
        open={!ruleSet && canEdit}
        className="mt-3 rounded-lg bg-slate-50 p-3 [&_summary::-webkit-details-marker]:hidden"
      >
        <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-2 text-base font-semibold">
          <span>Tie-breakers: {ruleSet ? ruleSet.name : "not added yet"}</span>
          <span aria-hidden className="text-slate-500">
            ▾
          </span>
        </summary>
        {ruleSet ? (
          <ol className="mt-1 list-decimal pl-5 text-sm text-slate-700">
            {ruleSet.rules.map((c, i) => (
              <li key={i}>{describeCriterion(c)}</li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-slate-600">
            Teams are ranked by record; ties stay ties until the tournament&apos;s tie-break rules
            are added.
          </p>
        )}
        <p className="mt-1 text-sm text-slate-600">
          Seeds {t.seeding === "pool" ? "within each pool" : "across all pool games"}.
        </p>
        {canEdit && (
          <button
            onClick={() => setSheet("rules")}
            className="mt-2 h-11 rounded-lg border-2 border-slate-400 bg-white px-4 text-base font-bold"
          >
            {ruleSet ? "Change tie-breakers" : "Add tie-breakers"}
          </button>
        )}
      </details>
      {busy && (
        <p role="status" className="mt-2 text-base font-semibold text-slate-700">
          {busy}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-2 text-base font-semibold text-red-700">
          {error}
        </p>
      )}

      <Sheet open={sheet === "rules"} title="Tie-breakers" onClose={() => setSheet(null)}>
        {sheet === "rules" && sets && (
          <RulesSheet
            data={data}
            tournament={t}
            sets={sets}
            onSaved={async () => {
              await loadSets();
              await onChanged();
              setSheet(null);
            }}
          />
        )}
      </Sheet>
      <Sheet
        open={sheet === "tomorrow"}
        title="What time do we play tomorrow?"
        onClose={() => setSheet(null)}
      >
        {sheet === "tomorrow" && (
          <PlayTimes
            input={input}
            games={games}
            tournament={t}
            us={us}
            ourPool={tables.flatMap((x) => x.rows).find((r) => r.teamId === us?.id)?.pool ?? null}
            teamCount={tables.reduce((n, x) => Math.max(n, x.rows.length), 0)}
            note={`Based on ${scored} of ${pool.length} pool games scored${ruleSet ? ` and the ${ruleSet.name} tie-breakers` : " (no tie-breakers added yet, so ties stay ties)"}.`}
          />
        )}
      </Sheet>
      <Sheet open={sheet === "lock"} title="Lock the seeds" onClose={() => setSheet(null)}>
        {sheet === "lock" && (
          <LockSeeds
            tables={tables}
            unscored={left.length}
            usId={us?.id}
            onLock={async (seeds) => {
              await (await backend()).lockSeeds(t.id, seeds);
              await fillBracket(seeds);
              await onChanged();
              setSheet(data.groupme ? "post" : null);
            }}
          />
        )}
      </Sheet>
      <Sheet open={sheet === "post"} title="Post the seeds" onClose={() => setSheet(null)}>
        {sheet === "post" && t.seeds && (
          <GroupMePost
            rows={10}
            initialText={seedingMessage({
              tournament: t.name,
              seeds: t.seeds,
              rows: tables.flatMap((x) => x.rows),
              ourId: us?.id ?? null,
              next: nextGameFor(games, us?.name ?? null),
            })}
            onSent={() => setSheet(null)}
          />
        )}
      </Sheet>
    </section>
  );
}

/** Our first bracket game with a known opponent, for the post. */
function nextGameFor(games: TournamentGame[], ourName: string | null) {
  const g = games
    .filter((x) => x.stage === "bracket" && x.scoreHome === null && ourSide(x, ourName))
    .sort(
      (a, b) =>
        (a.date ?? "").localeCompare(b.date ?? "") ||
        (a.startTime ?? "").localeCompare(b.startTime ?? ""),
    )[0];
  if (!g) return null;
  const day = g.date
    ? new Date(`${g.date}T12:00`).toLocaleDateString("en-US", { weekday: "short" })
    : "";
  return {
    when: [day, g.startTime ? time12(g.startTime) : null].filter(Boolean).join(" "),
    place: placeOf(g) || null,
    opponent: ourSide(g, ourName)!.opponent,
  };
}

function StandingsTable({
  pool,
  rows,
  usId,
  started,
}: {
  pool: string | null;
  rows: StandingRow[];
  usId?: string;
  started: boolean;
}) {
  const shown = started ? rows : [...rows].sort((a, b) => a.name.localeCompare(b.name));
  return (
    <div className="mb-2 overflow-x-auto">
      {pool && <h3 className="mb-1 text-base font-bold">Pool {pool}</h3>}
      <table className="w-full text-left text-base">
        <thead>
          <tr className="border-b-2 border-slate-200 text-sm text-slate-600">
            <th className="w-12 py-1 pr-2">Seed</th>
            <th className="py-1 pr-2">Team</th>
            <th className="py-1 pr-2 text-center">W-L</th>
            <th className="py-1 pr-2 text-center">RS</th>
            <th className="py-1 pr-2 text-center">RA</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((r) => {
            const how = started ? howText(r, rows) : "";
            return (
              <tr
                key={r.teamId}
                className={`border-b border-slate-100 align-top ${r.teamId === usId ? "bg-[var(--team)]/5 font-bold" : ""}`}
              >
                <td className="py-2 pr-2 tabular-nums">
                  {!started ? "–" : r.seedTo > r.seed ? `T-${r.seed}` : r.seed}
                </td>
                <td className="py-2 pr-2">
                  {r.name}
                  {r.teamId === usId && <span className="font-normal text-slate-600"> (us)</span>}
                  {how && <span className="block text-sm font-normal text-slate-600">{how}</span>}
                </td>
                <td className="py-2 pr-2 text-center tabular-nums">
                  {r.w}-{r.l}
                  {r.t ? `-${r.t}` : ""}
                </td>
                <td className="py-2 pr-2 text-center tabular-nums">
                  {started ? (r.rs ?? "–") : "–"}
                </td>
                <td className="py-2 pr-2 text-center tabular-nums">
                  {started ? (r.ra ?? "–") : "–"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Check the order (move teams still tied), then lock. */
function LockSeeds({
  tables,
  unscored,
  usId,
  onLock,
}: {
  tables: { pool: string | null; rows: StandingRow[] }[];
  unscored: number;
  usId?: string;
  onLock: (seeds: Seed[]) => Promise<void>;
}) {
  const [seeds, setSeeds] = useState<Seed[]>(() => seedsFrom(tables));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rows = new Map(tables.flatMap((t) => t.rows).map((r) => [r.teamId, r]));

  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= seeds.length || seeds[i]!.pool !== seeds[j]!.pool) return;
    const next = [...seeds];
    [next[i], next[j]] = [next[j]!, next[i]!];
    setSeeds(
      next.map((s, k) => ({ ...s, seed: k - next.findIndex((x) => x.pool === s.pool) + 1 })),
    );
  };

  return (
    <div className="flex flex-col gap-4">
      {unscored > 0 && (
        <p className="rounded-xl border-2 border-amber-500 bg-amber-50 p-3 text-base">
          {unscored} pool game{unscored === 1 ? " has" : "s have"} no score yet. Lock anyway only if
          the tournament has posted its seeds.
        </p>
      )}
      <p className="text-base text-slate-700">
        Check the order against the tournament&apos;s seeds. Teams still tied (a coin flip, say) can
        be moved. Locking fills in the bracket and adds our bracket games to Games.
      </p>
      <ol className="flex flex-col gap-1">
        {seeds.map((s, i) => {
          const r = rows.get(s.teamId);
          return (
            <li
              key={s.teamId}
              className={`flex items-center gap-2 rounded-lg border-2 px-2 py-1 ${s.teamId === usId ? "border-[var(--team)]" : "border-slate-200"}`}
            >
              <span className="w-10 text-lg font-bold tabular-nums">
                {s.pool ? `${s.pool}${s.seed}` : s.seed}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-base font-semibold">{s.name}</span>
                {r?.open && (
                  <span className="block text-xs text-amber-800">{OPEN_TEXT[r.open]}</span>
                )}
              </span>
              <button
                onClick={() => move(i, -1)}
                aria-label={`Move ${s.name} up`}
                className="size-11 rounded-lg border-2 border-slate-300 text-lg"
              >
                ↑
              </button>
              <button
                onClick={() => move(i, 1)}
                aria-label={`Move ${s.name} down`}
                className="size-11 rounded-lg border-2 border-slate-300 text-lg"
              >
                ↓
              </button>
            </li>
          );
        })}
      </ol>
      {error && (
        <p role="alert" className="rounded-xl bg-red-50 p-3 text-base font-semibold text-red-900">
          {error}
        </p>
      )}
      <button
        onClick={() => {
          setBusy(true);
          setError(null);
          onLock(seeds).catch((e: unknown) => {
            setError(e instanceof Error ? e.message : String(e));
            setBusy(false);
          });
        }}
        disabled={busy}
        className="h-14 rounded-xl bg-green-700 text-lg font-bold text-white disabled:opacity-40"
      >
        {busy ? "Locking…" : "Lock these seeds"}
      </button>
    </div>
  );
}

/** Pick a saved rule set (or read new rules from a screenshot) and how teams are seeded. */
function RulesSheet({
  data,
  tournament: t,
  sets,
  onSaved,
}: {
  data: AppData;
  tournament: Tournament;
  sets: RuleSet[];
  onSaved: () => Promise<void>;
}) {
  const [chosen, setChosen] = useState<string | null>(t.tiebreakSetId);
  const [seeding, setSeeding] = useState(t.seeding);
  const [editing, setEditing] = useState<(Omit<RuleSet, "id"> & { id?: string }) | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const org = (t.organization ?? "").toLowerCase();
  const sorted = [...sets].sort(
    (a, b) =>
      Number((b.organization ?? "").toLowerCase() === org) -
        Number((a.organization ?? "").toLowerCase() === org) || a.name.localeCompare(b.name),
  );

  const save = async (fn: () => Promise<void>) => {
    setBusy("Saving…");
    setError(null);
    try {
      await fn();
      await onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(null);
    }
  };

  const read = async () => {
    setBusy("Reading the rules…");
    setError(null);
    try {
      const { rules } = await sendScreenshots<{ rules?: ReadRules }>(
        { teamId: data.team.id, kind: "tiebreak" },
        files,
      );
      if (!rules) throw new Error("Couldn't read the rules. Try again.");
      const organization = rules.organization ?? t.organization;
      setEditing({
        name: `${organization ?? "Tournament"} Tiebreak`.slice(0, 60),
        organization,
        rules: rules.rules,
        restart: rules.restart,
        notes: rules.notes,
      });
      if (rules.seeding) setSeeding(rules.seeding);
      setWarnings(rules.warnings);
      setFiles([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  if (busy) {
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-center" role="status">
        <div className="size-10 animate-spin rounded-full border-4 border-slate-300 border-t-[var(--team)]" />
        <p className="text-lg font-semibold">{busy}</p>
      </div>
    );
  }

  if (editing) {
    return (
      <RulesEditor
        value={editing}
        warnings={warnings}
        seeding={seeding}
        onSeeding={setSeeding}
        error={error}
        onChange={setEditing}
        onBack={() => setEditing(null)}
        onSave={() =>
          void save(async () => {
            const b = await backend();
            const id = await b.saveRuleSet(data.team.id, editing);
            await b.setTournamentRules(t.id, { tiebreakSetId: id, seeding });
          })
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {sorted.length > 0 && (
        <section>
          <h3 className={heading}>Your saved rules</h3>
          <ul className="flex flex-col gap-2">
            {sorted.map((s) => (
              <li key={s.id}>
                <label
                  className={`flex cursor-pointer items-start gap-3 rounded-xl border-2 bg-white p-3 ${chosen === s.id ? "border-[var(--team)]" : "border-slate-200"}`}
                >
                  <input
                    type="radio"
                    name="ruleset"
                    checked={chosen === s.id}
                    onChange={() => setChosen(s.id)}
                    className="mt-1 size-5 accent-[var(--team)]"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-base font-bold">{s.name}</span>
                    <span className="block text-sm text-slate-600">
                      {[s.organization, s.rules.map((c) => CRITERION_LABEL[c.type]).join(" → ")]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </section>
      )}
      <SeedingChoice value={seeding} onChange={setSeeding} />
      {sorted.length > 0 && (
        <div className="flex gap-2">
          <button
            onClick={() =>
              void save(async () =>
                (await backend()).setTournamentRules(t.id, { tiebreakSetId: chosen, seeding }),
              )
            }
            className="h-14 flex-[2] rounded-xl bg-green-700 text-lg font-bold text-white"
          >
            Use these
          </button>
          {chosen && (
            <button
              onClick={() => {
                const s = sets.find((x) => x.id === chosen);
                if (s) setEditing(s);
              }}
              className="h-14 flex-1 rounded-xl border-2 border-slate-400 text-base font-bold"
            >
              Edit
            </button>
          )}
        </div>
      )}

      <section className="flex flex-col gap-2 border-t-2 border-slate-100 pt-3">
        <h3 className={heading}>New rules from a screenshot</h3>
        <p className="text-base text-slate-700">
          Screenshot the tournament&apos;s tie-breaker rules (often on its Rules tab). You&apos;ll
          name them, like “2D Tiebreak”, and can use them again at that organization&apos;s other
          tournaments.
        </p>
        {files.length > 0 && (
          <ul className="grid grid-cols-3 gap-2">
            {files.map((f, i) => (
              <li key={`${f.name}-${i}`} className="relative">
                <Thumb file={f} />
                <button
                  onClick={() => setFiles(files.filter((_, j) => j !== i))}
                  aria-label={`Remove screenshot ${i + 1}`}
                  className="absolute top-1 right-1 flex size-9 items-center justify-center rounded-full bg-slate-900/75 text-lg font-bold text-white"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
        {files.length < MAX_SCREENSHOTS && (
          <ScreenshotButton
            onFiles={(f) => setFiles([...files, ...f].slice(0, MAX_SCREENSHOTS))}
            label={files.length ? "Add more screenshots" : "Add screenshots of the rules"}
            primary={sorted.length === 0 && files.length === 0}
          />
        )}
        {files.length > 0 && (
          <button
            onClick={() => void read()}
            className="h-14 rounded-xl bg-[var(--team)] text-lg font-bold text-white"
          >
            Read the rules
          </button>
        )}
        <button
          onClick={() =>
            setEditing({
              name: `${t.organization ?? "Tournament"} Tiebreak`.slice(0, 60),
              organization: t.organization,
              rules: [{ type: "head_to_head", cap: null, text: "" }],
              restart: true,
              notes: null,
            })
          }
          className="self-start text-base underline"
        >
          Or type them in
        </button>
      </section>
      {error && (
        <p role="alert" className="rounded-xl bg-red-50 p-3 text-base font-semibold text-red-900">
          {error}
        </p>
      )}
    </div>
  );
}

function SeedingChoice({
  value,
  onChange,
}: {
  value: "overall" | "pool";
  onChange: (v: "overall" | "pool") => void;
}) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-base font-semibold">How teams are seeded</legend>
      {(
        [
          ["overall", "Across all pool games (Seed 1, 2, 3…)"],
          ["pool", "Within each pool (1st Pool A, 2nd Pool A…)"],
        ] as const
      ).map(([v, label]) => (
        <label key={v} className="flex min-h-11 cursor-pointer items-center gap-3">
          <input
            type="radio"
            name="seeding"
            checked={value === v}
            onChange={() => onChange(v)}
            className="size-5 accent-[var(--team)]"
          />
          <span className="text-base">{label}</span>
        </label>
      ))}
    </fieldset>
  );
}

/** Name the rules and check each tie-breaker, in order. */
function RulesEditor({
  value,
  warnings,
  seeding,
  onSeeding,
  error,
  onChange,
  onBack,
  onSave,
}: {
  value: Omit<RuleSet, "id"> & { id?: string };
  warnings: string[];
  seeding: "overall" | "pool";
  onSeeding: (v: "overall" | "pool") => void;
  error: string | null;
  onChange: (v: Omit<RuleSet, "id"> & { id?: string }) => void;
  onBack: () => void;
  onSave: () => void;
}) {
  const setRule = (i: number, c: Criterion | null) => {
    const rules = [...value.rules];
    if (c) rules[i] = c;
    else rules.splice(i, 1);
    onChange({ ...value, rules });
  };
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= value.rules.length) return;
    const rules = [...value.rules];
    [rules[i], rules[j]] = [rules[j]!, rules[i]!];
    onChange({ ...value, rules });
  };
  const [localError, setLocalError] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-4">
      {warnings.length > 0 && (
        <ul className="rounded-xl border-2 border-amber-500 bg-amber-50 p-3 text-base text-amber-950">
          {warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}
      <label className="flex flex-col gap-1">
        <span className="text-base font-semibold">Name</span>
        <input
          value={value.name}
          onChange={(e) => onChange({ ...value, name: e.target.value })}
          maxLength={60}
          className={field}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-base font-semibold">Organization</span>
        <input
          value={value.organization ?? ""}
          onChange={(e) => onChange({ ...value, organization: e.target.value || null })}
          maxLength={80}
          placeholder="2D Sports, USSSA, Perfect Game…"
          className={field}
        />
      </label>
      <section>
        <h3 className={heading}>Tie-breakers, in order</h3>
        <ol className="flex flex-col gap-2">
          {value.rules.map((c, i) => (
            <li key={i} className="rounded-xl border-2 border-slate-200 p-2">
              <div className="flex items-center gap-2">
                <span className="w-6 text-base font-bold">{i + 1}.</span>
                <select
                  value={c.type}
                  onChange={(e) =>
                    setRule(i, {
                      ...c,
                      type: e.target.value as Criterion["type"],
                      cap: RUN_CRITERIA.has(e.target.value as Criterion["type"]) ? c.cap : null,
                    })
                  }
                  className="h-11 min-w-0 flex-1 rounded-lg border-2 border-slate-300 bg-white px-2 text-base"
                >
                  {CRITERIA.map((x) => (
                    <option key={x} value={x}>
                      {CRITERION_LABEL[x]}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => move(i, -1)}
                  aria-label="Move up"
                  className="size-11 rounded-lg border-2 border-slate-300"
                >
                  ↑
                </button>
                <button
                  onClick={() => move(i, 1)}
                  aria-label="Move down"
                  className="size-11 rounded-lg border-2 border-slate-300"
                >
                  ↓
                </button>
                <button
                  onClick={() => setRule(i, null)}
                  aria-label="Remove"
                  className="size-11 rounded-lg text-xl text-slate-500"
                >
                  ×
                </button>
              </div>
              {RUN_CRITERIA.has(c.type) && (
                <label className="mt-2 flex items-center gap-2 pl-8 text-sm">
                  Most runs counted a game
                  <input
                    inputMode="numeric"
                    value={c.cap ?? ""}
                    onChange={(e) => {
                      const n = Number(e.target.value.replace(/\D/g, ""));
                      setRule(i, { ...c, cap: n > 0 && n <= 99 ? n : null });
                    }}
                    placeholder="no cap"
                    className="h-10 w-20 rounded-lg border-2 border-slate-300 px-2"
                  />
                </label>
              )}
              {c.text && <p className="mt-1 pl-8 text-sm text-slate-600">“{c.text}”</p>}
            </li>
          ))}
        </ol>
        {value.rules.length < 12 && (
          <button
            onClick={() =>
              onChange({
                ...value,
                rules: [...value.rules, { type: "runs_allowed", cap: null, text: "" }],
              })
            }
            className="mt-2 h-11 rounded-lg border-2 border-dashed border-slate-400 px-4 text-base font-semibold"
          >
            + Add a tie-breaker
          </button>
        )}
      </section>
      <label className="flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          checked={value.restart}
          onChange={(e) => onChange({ ...value, restart: e.target.checked })}
          className="mt-1 size-5 accent-[var(--team)]"
        />
        <span className="text-base">
          When three or more are tied and one is separated, the rest start over at the first
          tie-breaker (the usual rule)
        </span>
      </label>
      <SeedingChoice value={seeding} onChange={onSeeding} />
      {(error ?? localError) && (
        <p role="alert" className="rounded-xl bg-red-50 p-3 text-base font-semibold text-red-900">
          {error ?? localError}
        </p>
      )}
      <div className="sticky bottom-0 -mx-4 flex gap-3 bg-white px-4 pt-2 pb-1">
        <button
          onClick={onBack}
          className="h-14 flex-1 rounded-xl border-2 border-slate-400 text-lg font-bold"
        >
          Back
        </button>
        <button
          onClick={() => {
            if (!value.name.trim()) return setLocalError("Give the rules a name.");
            setLocalError(null);
            onSave();
          }}
          className="h-14 flex-[2] rounded-xl bg-green-700 text-lg font-bold text-white"
        >
          Save and use
        </button>
      </div>
    </div>
  );
}

/** "the 5 seed", "the winner of Game 3", or the team's name. */
function sideWords(name: string): string {
  const p = parsePlaceholder(name);
  if (!p) return name;
  if (p.kind === "seed") return `the #${p.n} seed`;
  if (p.kind === "pool") return `the ${ordinal(p.n)} in Pool ${p.pool}`;
  return `the ${p.kind} of Game ${p.gameNo}`;
}

const when = (g: { date: string | null; startTime: string | null }) =>
  [
    g.date ? new Date(`${g.date}T12:00`).toLocaleDateString("en-US", { weekday: "short" }) : null,
    g.startTime ? time12(g.startTime) : "time TBD",
  ]
    .filter(Boolean)
    .join(" ");

/** Every seed we can still get, the first bracket game for it, and what has to happen. */
function PlayTimes({
  input,
  games,
  tournament: t,
  us,
  ourPool,
  teamCount,
  note,
}: {
  input: StandingsInput;
  games: TournamentGame[];
  tournament: Tournament;
  us: TournamentTeam | null;
  ourPool: string | null;
  teamCount: number;
  note: string;
}) {
  const [result, setResult] = useState<Scenarios | null>(null);
  const usId = us?.id;
  useEffect(() => {
    if (!usId || t.seedsLockedAt) return;
    // Let the sheet open first; trying every outcome can take a moment.
    const timer = setTimeout(() => setResult(scenarios(input, usId)), 30);
    return () => clearTimeout(timer);
  }, [input, usId, t.seedsLockedAt]);

  if (!us) {
    return (
      <p className="text-base">
        Mark your team first: tap “That&apos;s us” on it in the tournament&apos;s team list.
      </p>
    );
  }
  const pool = t.seeding === "pool" ? ourPool : null;
  const slot = (seed: number) => {
    const f = firstGameForSeed(games, seed, pool);
    return (
      <p key={seed} className="text-base">
        <span className="font-bold">{f ? when(f.game) : "Time not on the bracket yet"}</span>
        {f && (
          <span className="text-slate-700">
            {placeOf(f.game) ? ` · ${placeOf(f.game)}` : ""} · vs {sideWords(f.opponent)}
          </span>
        )}
      </p>
    );
  };
  const seedName = (n: number) => (pool ? `${ordinal(n)} in Pool ${pool}` : `#${n} seed`);

  if (t.seedsLockedAt && t.seeds) {
    const mine = t.seeds.find((s) => s.teamId === us.id);
    const next = games
      .filter((g) => g.stage === "bracket" && g.scoreHome === null && ourSide(g, us.name))
      .sort(
        (a, b) =>
          (a.date ?? "").localeCompare(b.date ?? "") ||
          (a.startTime ?? "").localeCompare(b.startTime ?? ""),
      )[0];
    return (
      <div className="flex flex-col gap-2">
        {mine && <p className="text-lg font-bold">We&apos;re the {seedName(mine.seed)}.</p>}
        {next ? (
          <p className="text-base">
            <span className="font-bold">{when(next)}</span>
            {placeOf(next) ? ` · ${placeOf(next)}` : ""} · vs{" "}
            {sideWords(ourSide(next, us.name)!.opponent)}
          </p>
        ) : mine ? (
          slot(mine.seed)
        ) : null}
      </div>
    );
  }

  if (!result) {
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-center" role="status">
        <div className="size-10 animate-spin rounded-full border-4 border-slate-300 border-t-[var(--team)]" />
        <p className="text-lg font-semibold">Working out every way it could go…</p>
      </div>
    );
  }

  if (result.tooMany) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-base text-slate-700">
          It&apos;s early: {result.remaining} pool games are left, so any of these is still
          possible. Check back as scores come in.
        </p>
        <ul className="flex flex-col gap-2">
          {Array.from({ length: teamCount }, (_, i) => i + 1).map((n) => (
            <li key={n} className="rounded-xl border-2 border-slate-200 p-3">
              <p className="text-sm font-semibold text-slate-600">{seedName(n)}</p>
              {slot(n)}
            </li>
          ))}
        </ul>
        <p className="text-sm text-slate-600">{note}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-base text-slate-700">
        {result.outcomes.length === 1
          ? "It's settled."
          : `${result.outcomes.length} ways it can go, with ${result.remaining} pool game${result.remaining === 1 ? "" : "s"} left:`}
      </p>
      <ul className="flex flex-col gap-3">
        {result.outcomes.map((o) => {
          const seeds = Array.from({ length: o.seedTo - o.seed + 1 }, (_, i) => o.seed + i);
          const shown = o.terms.slice(0, 4);
          return (
            <li
              key={`${o.seed}-${o.seedTo}-${o.open}`}
              className="rounded-xl border-2 border-[var(--team)] p-3"
            >
              <p className="text-lg font-bold">
                {seeds.length === 1
                  ? seedName(o.seed)
                  : `${seeds.map(seedName).join(" or ")} (${o.open === "coin" ? "coin flip" : "tie the rules don't break"})`}
              </p>
              {seeds.map((n) => slot(n))}
              <p className="mt-2 text-sm font-bold tracking-wide text-slate-600 uppercase">If</p>
              <ul className="flex flex-col gap-1">
                {shown.map((term, i) => (
                  <li key={i} className="text-base">
                    {i > 0 && <span className="font-semibold text-slate-500">or </span>}
                    {describeTerm(term, games, input, us.id)}
                  </li>
                ))}
              </ul>
              {o.terms.length > shown.length && (
                <p className="text-sm text-slate-600">
                  …or {o.terms.length - shown.length} other way
                  {o.terms.length - shown.length === 1 ? "" : "s"}
                </p>
              )}
            </li>
          );
        })}
      </ul>
      <p className="text-sm text-slate-600">{note}</p>
    </div>
  );
}
