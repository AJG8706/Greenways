import { centroid, makeProjection } from "./project";
import { closestEdgeIndex, isClockwise } from "./polygon";
import type { LatLng } from "./types";

/**
 * Normalize a KML linear ring: drop the closing vertex if it repeats the first,
 * and collapse consecutive duplicates.
 */
export function normalizeRing(ring: LatLng[]): LatLng[] {
  const out: LatLng[] = [];
  for (const p of ring) {
    const last = out[out.length - 1];
    if (last && sameVertex(last, p)) continue;
    out.push(p);
  }
  if (out.length > 1 && sameVertex(out[0]!, out[out.length - 1]!)) out.pop();
  if (out.length < 3) throw new Error("Boundary needs at least 3 corners");
  return out;
}

function sameVertex(a: LatLng, b: LatLng): boolean {
  return Math.abs(a.lat - b.lat) < 1e-9 && Math.abs(a.lng - b.lng) < 1e-9;
}

/** Return the ring in clockwise (compass) order, reversing if needed. */
export function ensureClockwise(ring: LatLng[]): LatLng[] {
  const proj = makeProjection(centroid(ring));
  return isClockwise(ring.map(proj.toLocal)) ? ring : [...ring].reverse();
}

/**
 * Corner numbering (guardrail #2 + Gate 1 decision): corners run clockwise
 * starting at the corner immediately *before* the entrance on the clockwise
 * ring, so walking C1 → C2 crosses the entrance. For Lot 4 (entrance at the
 * midpoint of the Broussard Rd edge) this yields C1=NW, C2=NE, C3=SE, C4=SW.
 */
export function orderCornersFromEntrance(
  ring: LatLng[],
  entrance: LatLng,
): LatLng[] {
  const cw = ensureClockwise(normalizeRing(ring));
  const proj = makeProjection(centroid(cw));
  const local = cw.map(proj.toLocal);
  const start = closestEdgeIndex(proj.toLocal(entrance), local);
  return cw.slice(start).concat(cw.slice(0, start));
}

/** Midpoint of the edge from corner `i` to the next corner. */
export function edgeMidpoint(ring: LatLng[], i: number): LatLng {
  const a = ring[i % ring.length]!;
  const b = ring[(i + 1) % ring.length]!;
  return { lat: (a.lat + b.lat) / 2, lng: (a.lng + b.lng) / 2 };
}

/**
 * Default entrance when a KML carries no entrance hint: the midpoint of the
 * first edge of the clockwise ring. It is a placeholder — the admin confirms
 * or moves it, and numbering re-derives from the confirmed point.
 */
export function defaultEntrance(ring: LatLng[]): LatLng {
  return edgeMidpoint(ensureClockwise(normalizeRing(ring)), 0);
}

/** Polygon area in acres (43,560 sq ft per acre). */
export function areaAcres(ring: LatLng[]): number {
  const cw = normalizeRing(ring);
  const proj = makeProjection(centroid(cw));
  const local = cw.map(proj.toLocal);
  let sum = 0;
  for (let i = 0; i < local.length; i++) {
    const a = local[i]!;
    const b = local[(i + 1) % local.length]!;
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum / 2) / 43560;
}
