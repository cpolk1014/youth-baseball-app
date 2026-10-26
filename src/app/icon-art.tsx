/** App icon: a baseball on navy. Rendered to PNG by next/og (inline styles only). */
export function AppIconArt({ size }: { size: number }) {
  const ball = size * 0.62;
  const stitch = ball * 0.42;
  const seam = {
    position: "absolute" as const,
    top: (ball - stitch * 2) / 2,
    width: stitch * 2,
    height: stitch * 2,
    borderRadius: "50%",
    border: `${Math.max(2, size * 0.022)}px dashed #c8102e`,
  };
  return (
    <div
      style={{
        width: size,
        height: size,
        background: "#0b1f3a",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          width: ball,
          height: ball,
          borderRadius: "50%",
          background: "#ffffff",
          position: "relative",
          display: "flex",
          overflow: "hidden",
        }}
      >
        <div style={{ ...seam, left: -stitch * 1.45 }} />
        <div style={{ ...seam, right: -stitch * 1.45 }} />
      </div>
    </div>
  );
}
