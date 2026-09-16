/**
 * Boundary awareness (HUD spec §7): deliberately lazy. Warn only after the
 * buyer has been more than 10 ft outside for 3 s; clear after 2 s back
 * inside. Edges near the entrance are exempt within a 40 ft radius so
 * shoulder parking never triggers it. Informational, never modal.
 */
export const OUTSIDE_FT = 10; // tune in field
export const WARN_AFTER_MS = 3000;
export const CLEAR_AFTER_MS = 2000;
export const ENTRANCE_EXEMPT_FT = 40;

export type BoundaryState = {
  warning: boolean;
  outsideSinceMs: number | null;
  insideSinceMs: number | null;
};

export function createBoundary(): BoundaryState {
  return { warning: false, outsideSinceMs: null, insideSinceMs: null };
}

export function stepBoundary(
  state: BoundaryState,
  input: {
    /** Signed distance to the polygon: positive inside (lib/geo). */
    signedDistFt: number;
    /** Distance from the buyer to the entrance point. */
    entranceDistFt: number;
    nowMs: number;
  },
): { state: BoundaryState; justWarned: boolean } {
  const clearlyOutside =
    input.signedDistFt < -OUTSIDE_FT && input.entranceDistFt > ENTRANCE_EXEMPT_FT;

  if (clearlyOutside) {
    const since = state.outsideSinceMs ?? input.nowMs;
    if (!state.warning && input.nowMs - since >= WARN_AFTER_MS) {
      return {
        state: { warning: true, outsideSinceMs: since, insideSinceMs: null },
        justWarned: true,
      };
    }
    return {
      state: { ...state, outsideSinceMs: since, insideSinceMs: null },
      justWarned: false,
    };
  }

  // Inside (or within the lazy margin / entrance exemption).
  if (state.warning) {
    const inside = input.signedDistFt >= 0;
    if (inside) {
      const since = state.insideSinceMs ?? input.nowMs;
      if (input.nowMs - since >= CLEAR_AFTER_MS) {
        return { state: createBoundary(), justWarned: false };
      }
      return {
        state: { ...state, outsideSinceMs: null, insideSinceMs: since },
        justWarned: false,
      };
    }
    // Still in the fuzzy band outside the line: keep warning, reset the clear timer.
    return {
      state: { ...state, outsideSinceMs: null, insideSinceMs: null },
      justWarned: false,
    };
  }

  return {
    state: { warning: false, outsideSinceMs: null, insideSinceMs: null },
    justWarned: false,
  };
}
