import type { Heatmap } from "@/lib/analytics/heatmap";

/**
 * Where walkers actually went: the lot outline with position-sample
 * density, server-rendered SVG (local tangent feet, no map tiles — the
 * stakes, not the imagery, are the truth on the ground). Darker green =
 * more time spent there.
 */
export function WalkHeatmap({
  ring,
  corners,
  heat,
}: {
  ring: { x: number; y: number }[];
  corners: { n: number; x: number; y: number }[];
  heat: Heatmap;
}) {
  const margin = heat.cellFt * 3 + 10;
  const minX = heat.minX - margin;
  const maxX = heat.maxX + margin;
  const minY = heat.minY - margin;
  const maxY = heat.maxY + margin;
  const w = maxX - minX;
  const h = maxY - minY;
  // Local y grows north; SVG y grows down — flip so north stays up.
  const sy = (y: number) => maxY - y;
  const fontFt = Math.max(10, w / 28);

  return (
    <svg
      viewBox={`${minX} 0 ${w} ${h}`}
      role="img"
      aria-label="Walk heatmap"
      style={{ width: "100%", maxWidth: 560, display: "block" }}
      data-testid="walk-heatmap"
    >
      {heat.cells.map((c) => {
        const x = heat.minX + c.col * heat.cellFt;
        const yTop = heat.minY + (c.row + 1) * heat.cellFt;
        return (
          <rect
            key={`${c.col}:${c.row}`}
            x={x}
            y={sy(yTop)}
            width={heat.cellFt}
            height={heat.cellFt}
            rx={2}
            style={{
              fill: "var(--ok)",
              opacity: heat.max > 0 ? 0.15 + 0.65 * (c.count / heat.max) : 0,
            }}
          />
        );
      })}
      <polygon
        points={ring.map((p) => `${p.x},${sy(p.y)}`).join(" ")}
        style={{
          fill: "none",
          stroke: "var(--text)",
          strokeWidth: Math.max(1.5, w / 300),
          strokeDasharray: `${w / 80} ${w / 120}`,
        }}
      />
      {corners.map((c) => (
        <g key={c.n}>
          <circle
            cx={c.x}
            cy={sy(c.y)}
            r={fontFt * 0.45}
            style={{ fill: "var(--text)" }}
          />
          <text
            x={c.x + fontFt * 0.7}
            y={sy(c.y) + fontFt * 0.35}
            style={{ fill: "var(--text)", fontSize: fontFt, fontFamily: "inherit" }}
          >
            C{c.n}
          </text>
        </g>
      ))}
    </svg>
  );
}
