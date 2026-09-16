"use client";

import { useLocale, useTranslations } from "next-intl";
import type { PointFt } from "@/lib/geo/types";
import type { WalkCorner } from "@/lib/walk/types";

/**
 * Map mode (HUD spec §10): north-up, framed on the buyer and the tracked
 * corner; screen-pixel-sized pins; Trailhead Green lot line over a dark
 * casing. Drawn rendering so it works offline — satellite tiles layer on in
 * a later pass without changing this contract.
 */
export function MiniMap({
  ringLocal,
  corners,
  cornerLocal,
  buyer,
  trackedId,
  foundIds,
  distanceFt,
}: {
  ringLocal: PointFt[];
  corners: WalkCorner[];
  cornerLocal: ReadonlyMap<string, PointFt>;
  buyer: PointFt | null;
  trackedId: string;
  foundIds: ReadonlySet<string>;
  distanceFt: number | null;
}) {
  const t = useTranslations();
  const locale = useLocale();
  const VIEW = 400;
  const PAD = 64;

  const tracked = cornerLocal.get(trackedId)!;
  const focus: PointFt[] = buyer ? [buyer, tracked] : [tracked];
  const xs = focus.map((p) => p.x);
  const ys = focus.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const span = Math.max(maxX - minX, maxY - minY, 80);
  const scale = (VIEW - 2 * PAD) / span;
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const toScreen = (p: PointFt) => ({
    x: VIEW / 2 + (p.x - cx) * scale,
    y: VIEW / 2 - (p.y - cy) * scale,
  });

  const ringPath =
    ringLocal
      .map((p, i) => {
        const s = toScreen(p);
        return `${i === 0 ? "M" : "L"}${s.x},${s.y}`;
      })
      .join(" ") + " Z";

  const trackedCorner = corners.find((c) => c.id === trackedId)!;
  const trackedS = toScreen(tracked);
  const buyerS = buyer ? toScreen(buyer) : null;
  const label =
    (locale === "es" ? trackedCorner.name.es : trackedCorner.name.en) ||
    t("common.cornerShort", { n: trackedCorner.n });

  return (
    <div className="relative mx-auto w-full" style={{ maxWidth: 340 }} data-testid="mini-map">
      <svg
        viewBox={`0 0 ${VIEW} ${VIEW}`}
        className="w-full rounded-3"
        style={{ background: "var(--gw-pine-3)", aspectRatio: "1" }}
      >
        {/* lot line: casing + Trailhead Green */}
        <path d={ringPath} fill="rgba(141,186,94,.08)" stroke="var(--gw-pine-shadow)" strokeWidth={6} strokeLinejoin="round" />
        <path d={ringPath} fill="none" stroke="var(--gw-trailhead-green)" strokeWidth={2.5} strokeLinejoin="round" />

        {/* guide line buyer → tracked pin */}
        {buyerS ? (
          <>
            <line x1={buyerS.x} y1={buyerS.y} x2={trackedS.x} y2={trackedS.y} stroke="var(--gw-pine-shadow)" strokeWidth={5} />
            <line x1={buyerS.x} y1={buyerS.y} x2={trackedS.x} y2={trackedS.y} stroke="var(--gw-trailhead-green)" strokeWidth={2} strokeDasharray="6 6" />
          </>
        ) : null}

        {/* corner pins in screen pixels */}
        {corners.map((c) => {
          const p = toScreen(cornerLocal.get(c.id)!);
          const found = foundIds.has(c.id);
          const isTracked = c.id === trackedId;
          return (
            <g key={c.id} transform={`translate(${p.x}, ${p.y})`}>
              {isTracked ? (
                <circle r={22} fill="rgba(141,186,94,.25)" className="motion-reduce:hidden">
                  <animate attributeName="r" values="16;26;16" dur="2s" repeatCount="indefinite" />
                </circle>
              ) : null}
              <circle
                r={isTracked ? 14 : 10}
                fill={found ? "var(--gw-trailhead-green)" : isTracked ? "var(--gw-trailhead-green)" : "var(--gw-harvest-gold)"}
                stroke="var(--gw-prairie-cream)"
                strokeWidth={isTracked ? 3 : 2}
              />
              <text
                textAnchor="middle"
                dominantBaseline="central"
                style={{ font: "700 11px var(--gw-font-ui)", fill: "var(--gw-pine-shadow)" }}
              >
                {found ? "✓" : c.n}
              </text>
            </g>
          );
        })}

        {/* tracked corner label, clamped inside the view */}
        <text
          x={Math.min(Math.max(trackedS.x, 50), VIEW - 50)}
          y={trackedS.y > 46 ? trackedS.y - 26 : trackedS.y + 34}
          textAnchor="middle"
          style={{ font: "600 13px var(--gw-font-display)", fill: "var(--gw-prairie-cream)" }}
        >
          {label}
        </text>

        {/* buyer dot */}
        {buyerS ? (
          <g transform={`translate(${buyerS.x}, ${buyerS.y})`}>
            <circle r={8} fill="var(--gw-trailhead-green)" stroke="var(--gw-prairie-cream)" strokeWidth={3} />
          </g>
        ) : null}

        {/* N chip */}
        <g transform="translate(26, 26)">
          <circle r={13} fill="rgba(245,243,233,.14)" />
          <text textAnchor="middle" dominantBaseline="central" style={{ font: "700 12px var(--gw-font-ui)", fill: "var(--gw-prairie-cream)" }}>
            N
          </text>
        </g>
      </svg>
      {/* distance badge lower right (§10) */}
      <span
        className="hud-chip num absolute"
        style={{ right: 8, bottom: 8, background: "var(--gw-pine-2)" }}
      >
        {distanceFt ?? "—"} {t("common.ft")} {t("hud.away")}
      </span>
    </div>
  );
}
