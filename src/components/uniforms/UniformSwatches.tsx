import { colorHex, UNIFORM_PIECES, type UniformPieces } from "@/lib/uniforms";

/** Each piece with a color dot: Shirt Black · Pants Black · Hat Red… */
export function UniformSwatches({ pieces }: { pieces: UniformPieces }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1">
      {UNIFORM_PIECES.filter(({ key }) => pieces[key]).map(({ key, label }) => (
        <li key={key} className="flex items-center gap-1.5 text-base">
          <Dot color={colorHex(pieces[key])} />
          <span className="text-slate-600">{label}</span>
          <span className="font-semibold">{pieces[key]}</span>
        </li>
      ))}
    </ul>
  );
}

export function Dot({ color, size = 16 }: { color: string | null; size?: number }) {
  return (
    <span
      aria-hidden="true"
      className="inline-block shrink-0 rounded-full border-2 border-slate-400"
      style={{
        width: size,
        height: size,
        background: color ?? "repeating-linear-gradient(45deg, #e2e8f0 0 3px, #f8fafc 3px 6px)",
      }}
    />
  );
}
