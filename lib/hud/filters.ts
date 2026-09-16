import type { PointFt } from "@/lib/geo/types";

/**
 * Position filter (HUD spec §3): exponential smoothing weighted by reported
 * accuracy, with outright rejection of junk fixes.
 *
 *   α = clamp(0.35 · (12 / max(accuracyFt, 12)), 0.15, 0.6)
 *
 * Reject when accuracy > 100 ft, or when the fix implies > 25 ft/s from the
 * last accepted fix (teleport guard). The caller keeps showing the last good
 * fix with the "weak GPS" status rather than blanking.
 */
export type RawFix = {
  point: PointFt;
  accuracyFt: number;
  timestampMs: number;
};

export type PositionFilterState = {
  fix: PointFt | null;
  lastAcceptedRaw: PointFt | null;
  lastAcceptedAtMs: number | null;
};

export const ACCURACY_REJECT_FT = 100;
export const TELEPORT_FT_PER_S = 25;

export function createPositionFilter(): PositionFilterState {
  return { fix: null, lastAcceptedRaw: null, lastAcceptedAtMs: null };
}

export function positionAlpha(accuracyFt: number): number {
  const alpha = 0.35 * (12 / Math.max(accuracyFt, 12));
  return Math.min(0.6, Math.max(0.15, alpha));
}

export function stepPositionFilter(
  state: PositionFilterState,
  raw: RawFix,
): { state: PositionFilterState; accepted: boolean } {
  if (raw.accuracyFt > ACCURACY_REJECT_FT) {
    return { state, accepted: false };
  }

  if (state.lastAcceptedRaw !== null && state.lastAcceptedAtMs !== null) {
    const dtS = (raw.timestampMs - state.lastAcceptedAtMs) / 1000;
    if (dtS > 0) {
      const dist = Math.hypot(
        raw.point.x - state.lastAcceptedRaw.x,
        raw.point.y - state.lastAcceptedRaw.y,
      );
      if (dist / dtS > TELEPORT_FT_PER_S) {
        return { state, accepted: false };
      }
    }
  }

  const alpha = positionAlpha(raw.accuracyFt);
  const fix =
    state.fix === null
      ? raw.point
      : {
          x: state.fix.x + alpha * (raw.point.x - state.fix.x),
          y: state.fix.y + alpha * (raw.point.y - state.fix.y),
        };

  return {
    state: { fix, lastAcceptedRaw: raw.point, lastAcceptedAtMs: raw.timestampMs },
    accepted: true,
  };
}
