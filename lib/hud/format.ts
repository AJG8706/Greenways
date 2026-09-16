/**
 * Displayed distance (HUD spec §3): whole feet, never tenths; rate-limited to
 * 4 updates/s so the number counts down instead of flickering.
 */
export const DISTANCE_UPDATE_INTERVAL_MS = 250;

export function formatFeet(distFt: number): number {
  return Math.max(0, Math.round(distFt));
}

export function shouldUpdateDistance(
  lastUpdateMs: number | null,
  nowMs: number,
): boolean {
  return lastUpdateMs === null || nowMs - lastUpdateMs >= DISTANCE_UPDATE_INTERVAL_MS;
}
