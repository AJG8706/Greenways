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
  consecutiveTeleports: number;
};

export const ACCURACY_REJECT_FT = 100;
export const TELEPORT_FT_PER_S = 25;
/**
 * After this many consecutive teleport rejections the filter re-seeds from
 * the raw fix: sustained agreement among "impossible" fixes means the buyer
 * really moved (drove between corners, demo jump) — the old anchor is stale.
 */
export const TELEPORT_RESEED_AFTER = 3;

export function createPositionFilter(): PositionFilterState {
  return {
    fix: null,
    lastAcceptedRaw: null,
    lastAcceptedAtMs: null,
    consecutiveTeleports: 0,
  };
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

  let reseed = false;
  if (state.lastAcceptedRaw !== null && state.lastAcceptedAtMs !== null) {
    const dtS = (raw.timestampMs - state.lastAcceptedAtMs) / 1000;
    if (dtS > 0) {
      const dist = Math.hypot(
        raw.point.x - state.lastAcceptedRaw.x,
        raw.point.y - state.lastAcceptedRaw.y,
      );
      if (dist / dtS > TELEPORT_FT_PER_S) {
        const teleports = state.consecutiveTeleports + 1;
        if (teleports < TELEPORT_RESEED_AFTER) {
          return {
            state: { ...state, consecutiveTeleports: teleports },
            accepted: false,
          };
        }
        reseed = true;
      }
    }
  }

  const alpha = positionAlpha(raw.accuracyFt);
  const fix =
    state.fix === null || reseed
      ? raw.point
      : {
          x: state.fix.x + alpha * (raw.point.x - state.fix.x),
          y: state.fix.y + alpha * (raw.point.y - state.fix.y),
        };

  return {
    state: {
      fix,
      lastAcceptedRaw: raw.point,
      lastAcceptedAtMs: raw.timestampMs,
      consecutiveTeleports: 0,
    },
    accepted: true,
  };
}
