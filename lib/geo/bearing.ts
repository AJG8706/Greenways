import type { PointFt } from "./types";

/**
 * Bearing from `from` to `to` in degrees clockwise from north (HUD spec §2):
 * atan2(Δx, Δy), normalized to [0, 360).
 */
export function bearingDeg(from: PointFt, to: PointFt): number {
  const deg = (Math.atan2(to.x - from.x, to.y - from.y) * 180) / Math.PI;
  return (deg + 360) % 360;
}

/** Shortest signed angular delta from `current` to `target` in [−180, 180), per HUD spec §3. */
export function angularDelta(current: number, target: number): number {
  return ((target - current + 540) % 360) - 180;
}
