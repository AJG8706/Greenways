import { angularDelta } from "@/lib/geo/bearing";

/**
 * Heading low-pass on the circle (HUD spec §3): interpolate the shortest
 * angular path with β = 0.25 per event; displayed rotation quantized to 1°.
 */
export const HEADING_BETA = 0.25;

export function stepHeading(
  current: number | null,
  target: number,
  beta: number = HEADING_BETA,
): number {
  if (current === null) return normalize(target);
  return normalize(current + beta * angularDelta(current, target));
}

/**
 * Continuous arrow rotation: returns the new *unbounded* rotation value that
 * moves toward `targetDeg` the short way, so a CSS rotate() transition never
 * sweeps the long way around (§3: delta = ((target − current + 540) % 360) − 180).
 */
export function continuousRotation(currentRotation: number, targetDeg: number): number {
  return currentRotation + angularDelta(normalize(currentRotation), targetDeg);
}

export function normalize(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

export function quantizeDeg(deg: number): number {
  return Math.round(deg);
}
