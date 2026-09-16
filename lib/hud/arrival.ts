/**
 * Arrival rule (HUD spec §4): fire when the *filtered* distance has been
 * ≤ R_arrive for 2 consecutive seconds, or the raw distance is ≤ 8 ft on any
 * fix. Hysteresis: once arrived, the corner stays found.
 */
export const ARRIVE_RADIUS_FT = 20; // tune in field (15–25 expected)
export const ARRIVE_HOLD_MS = 2000;
export const ARRIVE_FAST_PATH_FT = 8;

export type ArrivalState = {
  arrived: boolean;
  withinSinceMs: number | null;
};

export function createArrival(): ArrivalState {
  return { arrived: false, withinSinceMs: null };
}

export function stepArrival(
  state: ArrivalState,
  input: {
    filteredDistFt: number;
    rawDistFt: number;
    nowMs: number;
    radiusFt?: number;
  },
): { state: ArrivalState; justArrived: boolean } {
  if (state.arrived) return { state, justArrived: false };

  const radius = input.radiusFt ?? ARRIVE_RADIUS_FT;

  if (input.rawDistFt <= ARRIVE_FAST_PATH_FT) {
    return { state: { arrived: true, withinSinceMs: null }, justArrived: true };
  }

  if (input.filteredDistFt <= radius) {
    const since = state.withinSinceMs ?? input.nowMs;
    if (input.nowMs - since >= ARRIVE_HOLD_MS) {
      return { state: { arrived: true, withinSinceMs: null }, justArrived: true };
    }
    return { state: { arrived: false, withinSinceMs: since }, justArrived: false };
  }

  return { state: { arrived: false, withinSinceMs: null }, justArrived: false };
}
