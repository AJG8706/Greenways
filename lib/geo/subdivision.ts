// Subdivision splitting: one surveyor master KML → per-lot rings ready for
// the existing corner pipeline. Pure functions; the server action wires
// them to property creation.

import { areaAcres, normalizeRing } from "./corners";
import { centroid, makeProjection } from "./project";
import type { LatLng, PointFt } from "./types";
import type { ParsedKmlPolygon } from "@/lib/kml";

/**
 * Vertices closer than this to the straight line through their neighbors are
 * surveyor artifacts (a neighboring lot's corner touching a shared edge),
 * not walkable corners — a stake there would sit mid-fence. Real bends in
 * this kind of plat measure tens to hundreds of feet of deviation.
 */
export const PHANTOM_VERTEX_FT = 10;

/**
 * Second guard: removing a true phantom barely changes the lot's area (it
 * sits on the line), while removing a real slight bend cuts a sliver the
 * plat acreage accounts for. In the Warren pilot, phantoms cost ≤ ~1,200
 * sqft; the smallest real bend cost ~3,400 sqft (0.08 acres).
 */
export const PHANTOM_TRIANGLE_SQFT = 2000;

export type SubdivisionLot = {
  /** 1-based lot number in file (plat) order. */
  n: number;
  /** Placemark name when the KML has one; else null (caller derives). */
  name: string | null;
  /** Cleaned ring: deduped, phantom mid-line vertices pruned. */
  ring: LatLng[];
  acres: number;
  /** How many near-collinear vertices were pruned (shown to the admin). */
  prunedVertices: number;
};

/** Is b a phantom vertex on the a→c line: near-collinear AND a negligible sliver. */
function isPhantom(a: PointFt, b: PointFt, c: PointFt, thresholdFt: number): boolean {
  const cross = Math.abs((c.x - a.x) * (a.y - b.y) - (a.x - b.x) * (c.y - a.y));
  const den = Math.hypot(c.x - a.x, c.y - a.y);
  const deviation = den === 0 ? 0 : cross / den;
  return deviation < thresholdFt && cross / 2 < PHANTOM_TRIANGLE_SQFT;
}

/** Drop vertices that deviate less than `thresholdFt` from a straight edge. */
export function pruneCollinear(ring: LatLng[], thresholdFt = PHANTOM_VERTEX_FT): LatLng[] {
  const proj = makeProjection(centroid(ring));
  let pts = [...ring];
  // Iterate: removing one phantom can expose another on the same long edge.
  for (;;) {
    if (pts.length <= 3) return pts;
    const local = pts.map(proj.toLocal);
    const idx = pts.findIndex((_, i) => {
      const a = local[(i - 1 + pts.length) % pts.length]!;
      const b = local[i]!;
      const c = local[(i + 1) % pts.length]!;
      return isPhantom(a, b, c, thresholdFt);
    });
    if (idx === -1) return pts;
    pts = pts.filter((_, i) => i !== idx);
  }
}

/**
 * Split a multi-polygon KML into lots. File order is kept (surveyor exports
 * run in plat order); each ring is deduped and pruned of phantom vertices.
 */
export function splitSubdivision(polygons: ParsedKmlPolygon[]): SubdivisionLot[] {
  return polygons.map((p, i) => {
    const normalized = normalizeRing(p.ring);
    const ring = pruneCollinear(normalized);
    return {
      n: i + 1,
      name: p.name,
      ring,
      acres: Math.round(areaAcres(ring) * 100) / 100,
      prunedVertices: normalized.length - ring.length,
    };
  });
}
