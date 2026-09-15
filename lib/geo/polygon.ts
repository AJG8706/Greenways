import type { PointFt } from "./types";

/**
 * Shoelace signed area. With x east / y north, a negative value means the ring
 * runs clockwise as seen on a map (compass order).
 */
export function signedArea(ring: PointFt[]): number {
  let sum = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]!;
    const b = ring[(i + 1) % ring.length]!;
    sum += a.x * b.y - b.x * a.y;
  }
  return sum / 2;
}

export function isClockwise(ring: PointFt[]): boolean {
  return signedArea(ring) < 0;
}

/** Ray-cast point-in-polygon. Points on an edge count as inside. */
export function pointInPolygon(p: PointFt, ring: PointFt[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]!;
    const b = ring[j]!;
    if (distanceToSegment(p, a, b) < 1e-9) return true;
    const intersects =
      a.y > p.y !== b.y > p.y &&
      p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x;
    if (intersects) inside = !inside;
  }
  return inside;
}

export function distanceToSegment(p: PointFt, a: PointFt, b: PointFt): number {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const lenSq = abx * abx + aby * aby;
  const t =
    lenSq === 0
      ? 0
      : Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.y - a.y) * aby) / lenSq));
  return Math.hypot(p.x - (a.x + t * abx), p.y - (a.y + t * aby));
}

/**
 * Signed distance from `p` to the polygon boundary: positive inside,
 * negative outside (HUD spec §7 boundary awareness).
 */
export function signedDistanceToPolygon(p: PointFt, ring: PointFt[]): number {
  let min = Infinity;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    min = Math.min(min, distanceToSegment(p, ring[i]!, ring[j]!));
  }
  return pointInPolygon(p, ring) ? min : -min;
}

/** Closest point on the polygon boundary to `p` (used to snap the entrance to the lot line). */
export function closestPointOnPolygon(p: PointFt, ring: PointFt[]): PointFt {
  let best: PointFt = ring[0]!;
  let bestDist = Infinity;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]!;
    const b = ring[(i + 1) % ring.length]!;
    const abx = b.x - a.x;
    const aby = b.y - a.y;
    const lenSq = abx * abx + aby * aby;
    const t =
      lenSq === 0
        ? 0
        : Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.y - a.y) * aby) / lenSq));
    const candidate = { x: a.x + t * abx, y: a.y + t * aby };
    const d = Math.hypot(p.x - candidate.x, p.y - candidate.y);
    if (d < bestDist) {
      bestDist = d;
      best = candidate;
    }
  }
  return best;
}

/** Index of the polygon edge (i → i+1) closest to `p`. */
export function closestEdgeIndex(p: PointFt, ring: PointFt[]): number {
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < ring.length; i++) {
    const d = distanceToSegment(p, ring[i]!, ring[(i + 1) % ring.length]!);
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  }
  return best;
}
