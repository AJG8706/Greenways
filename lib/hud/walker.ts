import { bearingDeg } from "@/lib/geo/bearing";
import { distanceFt } from "@/lib/geo/project";
import type { PointFt } from "@/lib/geo/types";
import type { RawFix } from "./filters";

/**
 * Deterministic simulated walker — the position/heading source for demo mode
 * (admin Demo tab) and for tests. Same downstream code path as the field
 * walk: it emits RawFix + heading, exactly what the sensors emit.
 */
export type WalkerScenario = {
  speedFtS: number;
  gpsNoiseFt: number;
  compassErrDeg: number;
  /** Corner number (1-based) on whose approach the walker wanders outside. */
  wanderAtCorner?: number;
};

export const SCENARIOS: Record<string, WalkerScenario> = {
  clean: { speedFtS: 4.5, gpsNoiseFt: 6, compassErrDeg: 0 },
  noisy: { speedFtS: 3.5, gpsNoiseFt: 18, compassErrDeg: 0 },
  compass: { speedFtS: 4.5, gpsNoiseFt: 6, compassErrDeg: 30 },
  boundary: { speedFtS: 4.5, gpsNoiseFt: 6, compassErrDeg: 0, wanderAtCorner: 3 },
};

export type WalkerState = {
  truePos: PointFt;
  headingDeg: number;
  calibrated: boolean;
  rngState: number;
  clockMs: number;
  wanderRemainingFt: number;
};

/** Mulberry32 — tiny deterministic PRNG so demos and tests replay exactly. */
function nextRandom(state: number): { value: number; state: number } {
  const s = (state + 0x6d2b79f5) | 0;
  let t = Math.imul(s ^ (s >>> 15), 1 | s);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return { value: ((t ^ (t >>> 14)) >>> 0) / 4294967296, state: s };
}

/** Box–Muller from two uniforms. */
function gaussian(state: number): { value: number; state: number } {
  const a = nextRandom(state);
  const b = nextRandom(a.state);
  const u = Math.max(a.value, 1e-12);
  return {
    value: Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * b.value),
    state: b.state,
  };
}

export function createWalker(start: PointFt, seed = 1): WalkerState {
  return {
    truePos: start,
    headingDeg: 0,
    calibrated: false,
    rngState: seed | 0,
    clockMs: 0,
    wanderRemainingFt: 0,
  };
}

/**
 * Advance the walker one tick toward `target` and emit a noisy GPS fix (1 Hz
 * cadence is the caller's choice) plus the compass heading (with scenario
 * error until calibrated).
 */
export function stepWalker(
  state: WalkerState,
  input: {
    target: PointFt;
    dtMs: number;
    scenario: WalkerScenario;
    /** When true this tick, the walker detours straight out sideways ~25 ft. */
    startWander?: boolean;
  },
): { state: WalkerState; fix: RawFix; headingDeg: number } {
  const { target, dtMs, scenario } = input;
  const stepFt = (scenario.speedFtS * dtMs) / 1000;
  const toTarget = bearingDeg(state.truePos, target);

  let wanderRemainingFt = state.wanderRemainingFt;
  if (input.startWander) wanderRemainingFt = 25;

  // Walk course: toward the target, or 90° off while wandering.
  const courseDeg = wanderRemainingFt > 0 ? toTarget + 90 : toTarget;
  const rad = (courseDeg * Math.PI) / 180;
  const remaining = distanceFt(state.truePos, target);
  const advance = wanderRemainingFt > 0 ? stepFt : Math.min(stepFt, remaining);

  const truePos: PointFt = {
    x: state.truePos.x + advance * Math.sin(rad),
    y: state.truePos.y + advance * Math.cos(rad),
  };
  if (wanderRemainingFt > 0) {
    wanderRemainingFt = Math.max(0, wanderRemainingFt - advance);
  }

  // Noisy GPS fix.
  const g1 = gaussian(state.rngState);
  const g2 = gaussian(g1.state);
  const fixPoint: PointFt = {
    x: truePos.x + g1.value * scenario.gpsNoiseFt,
    y: truePos.y + g2.value * scenario.gpsNoiseFt,
  };

  const clockMs = state.clockMs + dtMs;
  const headingDeg =
    (courseDeg + (state.calibrated ? 0 : scenario.compassErrDeg) + 360) % 360;

  return {
    state: {
      truePos,
      headingDeg,
      calibrated: state.calibrated,
      rngState: g2.state,
      clockMs,
      wanderRemainingFt,
    },
    fix: {
      point: fixPoint,
      accuracyFt: Math.max(10, scenario.gpsNoiseFt * 2),
      timestampMs: clockMs,
    },
    headingDeg,
  };
}

export function calibrateWalker(state: WalkerState): WalkerState {
  return { ...state, calibrated: true };
}
