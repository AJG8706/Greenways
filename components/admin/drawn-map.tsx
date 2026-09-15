"use client";

import { useMemo, useRef, useState } from "react";
import { centroid, makeProjection } from "@/lib/geo/project";
import type { LatLng, PointFt } from "@/lib/geo/types";
import type { CornerRow } from "./corners-editor";

const VIEW = 640; // square viewBox
const PAD = 56;

/**
 * Drawn fallback map: the lot in local feet on the dark walk surface, per the
 * Gate 1 prototype. Used whenever no satellite imagery key is configured.
 */
export function DrawnMap({
  corners,
  entrance,
  draggable,
  onCornerDragged,
  onMapClick,
}: {
  corners: CornerRow[];
  entrance: LatLng | null;
  draggable: boolean;
  onCornerDragged: (cornerId: string, next: LatLng) => void;
  onMapClick: (p: LatLng) => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<{ id: string; point: PointFt } | null>(null);

  const { proj, toScreen, fromScreen, screenPoints, entranceScreen } = useMemo(() => {
    const ring = corners.map((c) => ({ lat: c.lat, lng: c.lng }));
    const proj = makeProjection(centroid(ring));
    const local = ring.map(proj.toLocal);
    const xs = local.map((p) => p.x);
    const ys = local.map((p) => p.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const scale = (VIEW - 2 * PAD) / Math.max(maxX - minX, maxY - minY, 1);
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;

    const toScreen = (p: PointFt) => ({
      x: VIEW / 2 + (p.x - cx) * scale,
      y: VIEW / 2 - (p.y - cy) * scale, // y up → SVG y down
    });
    const fromScreen = (sx: number, sy: number): PointFt => ({
      x: cx + (sx - VIEW / 2) / scale,
      y: cy - (sy - VIEW / 2) / scale,
    });

    return {
      proj,
      toScreen,
      fromScreen,
      screenPoints: local.map(toScreen),
      entranceScreen: entrance ? toScreen(proj.toLocal(entrance)) : null,
    };
  }, [corners, entrance]);

  function svgPoint(e: React.PointerEvent): { x: number; y: number } {
    const rect = svgRef.current!.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * VIEW,
      y: ((e.clientY - rect.top) / rect.height) * VIEW,
    };
  }

  const polygonPath =
    screenPoints.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ") + " Z";

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${VIEW} ${VIEW}`}
      className="w-full rounded-2"
      style={{ background: "var(--gw-pine-3)", touchAction: "none", aspectRatio: "1" }}
      data-testid="drawn-map"
      onClick={(e) => {
        if (drag) return;
        const rect = svgRef.current!.getBoundingClientRect();
        const sx = ((e.clientX - rect.left) / rect.width) * VIEW;
        const sy = ((e.clientY - rect.top) / rect.height) * VIEW;
        onMapClick(proj.fromLocal(fromScreen(sx, sy)));
      }}
      onPointerMove={(e) => {
        if (!drag) return;
        const s = svgPoint(e);
        setDrag({ id: drag.id, point: fromScreen(s.x, s.y) });
      }}
      onPointerUp={() => {
        if (!drag) return;
        onCornerDragged(drag.id, proj.fromLocal(drag.point));
        setDrag(null);
      }}
    >
      {/* lot line: Trailhead Green over a dark casing (HUD spec §10) */}
      <path d={polygonPath} fill="rgba(141,186,94,.14)" stroke="var(--gw-pine-shadow)" strokeWidth={7} strokeLinejoin="round" />
      <path d={polygonPath} fill="none" stroke="var(--gw-trailhead-green)" strokeWidth={3} strokeLinejoin="round" />

      {/* entrance */}
      {entranceScreen ? (
        <g transform={`translate(${entranceScreen.x}, ${entranceScreen.y})`}>
          <rect x={-9} y={-9} width={18} height={18} rx={4} fill="var(--gw-prairie-cream)" />
          <path d="M -4 3 L 0 -4 L 4 3 Z" fill="var(--gw-trailhead-deep)" />
        </g>
      ) : null}

      {/* corner pins, numbered */}
      {corners.map((c, i) => {
        const base = screenPoints[i]!;
        const pos = drag?.id === c.id ? toScreen(drag.point) : base;
        return (
          <g
            key={c.id}
            transform={`translate(${pos.x}, ${pos.y})`}
            style={{ cursor: draggable ? "grab" : "default" }}
            data-testid={`map-corner-${c.n}`}
            onPointerDown={(e) => {
              if (!draggable) return;
              e.stopPropagation();
              (e.target as Element).setPointerCapture?.(e.pointerId);
              const s = svgPoint(e);
              setDrag({ id: c.id, point: fromScreen(s.x, s.y) });
            }}
          >
            <circle r={16} fill="var(--gw-harvest-gold)" stroke="var(--gw-prairie-cream)" strokeWidth={2.5} />
            <text
              textAnchor="middle"
              dominantBaseline="central"
              style={{ font: "700 14px var(--gw-font-display)", fill: "var(--gw-pine-shadow)", userSelect: "none" }}
            >
              {c.n}
            </text>
          </g>
        );
      })}

      {/* north chip */}
      <g transform="translate(28, 30)">
        <circle r={14} fill="rgba(245,243,233,.12)" />
        <text
          textAnchor="middle"
          dominantBaseline="central"
          style={{ font: "700 12px var(--gw-font-ui)", fill: "var(--gw-prairie-cream)" }}
        >
          N
        </text>
      </g>
    </svg>
  );
}
