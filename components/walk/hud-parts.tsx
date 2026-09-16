"use client";

import { useTranslations } from "next-intl";
import type { WalkCorner } from "@/lib/walk/types";

/** Big arrow in its ring (HUD spec §9/§10). Rotation is continuous degrees. */
export function ArrowRing({
  rotationDeg,
  arrived,
  dimmed,
}: {
  rotationDeg: number;
  arrived: boolean;
  dimmed: boolean;
}) {
  return (
    <div
      className="relative mx-auto grid place-items-center rounded-full"
      style={{
        width: "min(64vw, 260px)",
        aspectRatio: "1",
        border: "2px solid var(--line)",
        background: "var(--bg-2)",
        opacity: dimmed ? 0.55 : 1,
      }}
      data-testid="arrow-ring"
    >
      {arrived ? (
        <span
          className="absolute inset-0 animate-ping rounded-full motion-reduce:hidden"
          style={{ background: "rgba(141,186,94,.15)" }}
        />
      ) : null}
      <svg
        viewBox="0 0 100 100"
        style={{
          width: "62%",
          transform: `rotate(${rotationDeg}deg)`,
          transition: "transform 180ms ease-out",
        }}
        className="motion-reduce:transition-none"
        data-testid="hud-arrow"
        data-rotation={Math.round(((rotationDeg % 360) + 360) % 360)}
      >
        <path
          d="M50 6 L72 62 L50 50 L28 62 Z"
          fill="var(--gw-trailhead-green)"
          stroke="var(--gw-pine-3)"
          strokeWidth={3}
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

export function DistanceReadout({ feet }: { feet: number | null }) {
  const t = useTranslations();
  return (
    <p className="text-center" data-testid="hud-distance">
      <span className="hud-distance num">{feet === null ? "—" : feet}</span>{" "}
      <span className="hud-unit">{t("common.ft")}</span>{" "}
      <span className="t-small muted">{t("hud.away")}</span>
    </p>
  );
}

export function StatusLine({ statusKey }: { statusKey: string | null }) {
  const t = useTranslations("hud");
  return (
    <p
      className="t-small text-center"
      style={{ color: "var(--text-2)", minHeight: "1.5em" }}
      role="status"
      data-testid="hud-status"
    >
      {statusKey ? t(statusKey) : " "}
    </p>
  );
}

/** One-tap strip under the arrow mirroring the picker (spec §5). */
export function CornerStrip({
  corners,
  trackedId,
  foundIds,
  distances,
  onTrack,
}: {
  corners: WalkCorner[];
  trackedId: string;
  foundIds: ReadonlySet<string>;
  distances: ReadonlyMap<string, number>;
  onTrack: (id: string) => void;
}) {
  const t = useTranslations("common");
  return (
    <div className="row" style={{ justifyContent: "center", gap: 8 }}>
      {corners.map((c) => {
        const found = foundIds.has(c.id);
        const active = c.id === trackedId;
        return (
          <button
            key={c.id}
            type="button"
            onClick={() => onTrack(c.id)}
            aria-pressed={active}
            className="grid place-items-center rounded-2"
            style={{
              minWidth: 56,
              minHeight: 56,
              border: active
                ? "2px solid var(--gw-trailhead-green)"
                : "1.5px solid var(--line)",
              background: found ? "rgba(141,186,94,.16)" : "var(--bg-2)",
              color: "var(--text)",
            }}
            data-testid={`strip-c${c.n}`}
          >
            <span style={{ font: "700 1rem/1 var(--gw-font-display)" }}>
              {found ? "✓" : t("cornerShort", { n: c.n })}
            </span>
            <span className="t-small num" style={{ color: "var(--text-2)" }}>
              {found ? t("cornerShort", { n: c.n }) : (distances.get(c.id) ?? "—")}
            </span>
          </button>
        );
      })}
    </div>
  );
}
