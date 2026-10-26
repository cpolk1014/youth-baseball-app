import type { LineupCardData } from "@/lib/lineup/card";

export type CardSize = "letter" | "half";

export interface CardHeader {
  team: string;
  ageGroup: string;
  opponent: string;
  when: string;
  location: string | null;
}

/** One printed page (8.5in × 11in). "half" holds two identical cards with a cut line. */
export function LineupCardPage({
  size,
  header,
  data,
}: {
  size: CardSize;
  header: CardHeader;
  data: LineupCardData;
}) {
  return (
    <div className="bg-white text-black" style={{ width: "8.5in", height: "11in" }}>
      {size === "letter" ? (
        <div style={{ padding: "0.5in", height: "100%" }} className="flex flex-col">
          <Card header={header} data={data} compact={false} />
        </div>
      ) : (
        <>
          <div style={{ height: "5.5in", padding: "0.35in 0.45in" }} className="flex flex-col">
            <Card header={header} data={data} compact />
          </div>
          <div
            style={{ height: "5.5in", padding: "0.35in 0.45in" }}
            className="flex flex-col border-t-2 border-dashed border-gray-400"
          >
            <Card header={header} data={data} compact />
          </div>
        </>
      )}
    </div>
  );
}

function Card({
  header,
  data,
  compact,
}: {
  header: CardHeader;
  data: LineupCardData;
  compact: boolean;
}) {
  const innings = Array.from({ length: data.innings }, (_, i) => i + 1);
  const base = compact ? "10.5pt" : "12pt";
  const rowH = compact ? "0.26in" : "0.3in";
  const cell = "border border-black px-1 text-center align-middle";

  return (
    <div style={{ fontSize: base }} className="flex flex-1 flex-col">
      <div className="mb-2 flex items-end justify-between gap-4 border-b-2 border-black pb-1">
        <div>
          <p style={{ fontSize: compact ? "13pt" : "18pt" }} className="leading-tight font-bold">
            {header.team} <span className="font-semibold">{header.ageGroup}</span>
          </p>
          <p className="font-semibold">vs {header.opponent}</p>
        </div>
        <div className="text-right leading-snug">
          <p>{header.when}</p>
          {header.location && <p>{header.location}</p>}
        </div>
      </div>

      <table className="w-full border-collapse" style={{ tableLayout: "fixed" }}>
        <colgroup>
          <col style={{ width: "0.35in" }} />
          <col style={{ width: "0.45in" }} />
          <col />
          {innings.map((n) => (
            <col key={n} style={{ width: compact ? "0.42in" : "0.5in" }} />
          ))}
        </colgroup>
        <thead>
          <tr style={{ height: rowH }} className="bg-gray-200">
            <th className={cell}>Bat</th>
            <th className={cell}>No.</th>
            <th className={`${cell} text-left`}>Player</th>
            {innings.map((n) => (
              <th key={n} className={cell}>
                {n}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.rows.map((r) => (
            <tr key={r.playerId} style={{ height: rowH }}>
              <td className={`${cell} font-bold`}>{r.order ?? "–"}</td>
              <td className={`${cell} font-bold`}>{r.jersey}</td>
              <td className={`${cell} truncate text-left font-semibold`}>{r.name}</td>
              {r.positions.map((pos, i) => (
                <td key={i} className={`${cell} ${pos === "BN" ? "text-gray-500" : "font-bold"}`}>
                  {pos}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      {!compact && (
        <>
          <p className="mt-4 mb-1 font-bold">Defense by inning</p>
          <table
            className="w-full border-collapse"
            style={{ tableLayout: "fixed", fontSize: "10pt" }}
          >
            <colgroup>
              <col style={{ width: "0.45in" }} />
              {innings.map((n) => (
                <col key={n} />
              ))}
            </colgroup>
            <thead>
              <tr className="bg-gray-200" style={{ height: "0.26in" }}>
                <th className={cell}>Pos</th>
                {innings.map((n) => (
                  <th key={n} className={cell}>
                    {n}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.defense.map((d) => (
                <tr key={d.position} style={{ height: "0.26in" }}>
                  <td className={`${cell} font-bold`}>{d.position}</td>
                  {d.players.map((name, i) => (
                    <td key={i} className={`${cell} truncate`}>
                      {name}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      <div className="mt-auto flex gap-6 pt-3">
        <p className="flex-1 border-t border-black pt-0.5">Coach</p>
        <p className="w-1/3 border-t border-black pt-0.5">Umpire</p>
      </div>
    </div>
  );
}
