import { describe, expect, it } from "vitest";
import {
  ARRIVE_HOLD_MS,
  createArrival,
  stepArrival,
} from "@/lib/hud/arrival";
import {
  CLEAR_AFTER_MS,
  createBoundary,
  ENTRANCE_EXEMPT_FT,
  stepBoundary,
  WARN_AFTER_MS,
} from "@/lib/hud/boundary";
import {
  createPositionFilter,
  positionAlpha,
  stepPositionFilter,
} from "@/lib/hud/filters";
import { formatFeet, shouldUpdateDistance } from "@/lib/hud/format";
import { continuousRotation, normalize, stepHeading } from "@/lib/hud/heading";
import {
  calibrateWalker,
  createWalker,
  SCENARIOS,
  stepWalker,
} from "@/lib/hud/walker";
import { distanceFt } from "@/lib/geo/project";

describe("position filter (HUD spec §3)", () => {
  it("computes α from accuracy with clamping", () => {
    expect(positionAlpha(12)).toBeCloseTo(0.35, 9); // baseline
    expect(positionAlpha(6)).toBeCloseTo(0.35, 9); // accuracy floor at 12
    expect(positionAlpha(28)).toBeCloseTo(0.15, 9); // clamped low
    expect(positionAlpha(100)).toBeCloseTo(0.15, 9);
    expect(positionAlpha(1)).toBeLessThanOrEqual(0.6); // clamped high
  });

  it("seeds from the first fix and smooths after", () => {
    let s = createPositionFilter();
    ({ state: s } = stepPositionFilter(s, {
      point: { x: 0, y: 0 },
      accuracyFt: 12,
      timestampMs: 0,
    }));
    expect(s.fix).toEqual({ x: 0, y: 0 });
    ({ state: s } = stepPositionFilter(s, {
      point: { x: 10, y: 0 },
      accuracyFt: 12,
      timestampMs: 1000,
    }));
    expect(s.fix!.x).toBeCloseTo(3.5, 9); // α = 0.35
  });

  it("rejects fixes worse than 100 ft accuracy", () => {
    let s = createPositionFilter();
    ({ state: s } = stepPositionFilter(s, {
      point: { x: 0, y: 0 },
      accuracyFt: 12,
      timestampMs: 0,
    }));
    const r = stepPositionFilter(s, {
      point: { x: 5, y: 5 },
      accuracyFt: 101,
      timestampMs: 1000,
    });
    expect(r.accepted).toBe(false);
    expect(r.state.fix).toEqual({ x: 0, y: 0 });
  });

  it("rejects teleports faster than 25 ft/s", () => {
    let s = createPositionFilter();
    ({ state: s } = stepPositionFilter(s, {
      point: { x: 0, y: 0 },
      accuracyFt: 12,
      timestampMs: 0,
    }));
    const r = stepPositionFilter(s, {
      point: { x: 30, y: 0 }, // 30 ft in 1 s
      accuracyFt: 12,
      timestampMs: 1000,
    });
    expect(r.accepted).toBe(false);
    // Same jump over 2 s is fine (15 ft/s).
    const ok = stepPositionFilter(s, {
      point: { x: 30, y: 0 },
      accuracyFt: 12,
      timestampMs: 2000,
    });
    expect(ok.accepted).toBe(true);
  });
});

describe("heading filter (HUD spec §3)", () => {
  it("takes the short way across 0°", () => {
    const h = stepHeading(350, 10); // +20 short way
    expect(h).toBeCloseTo(355, 9); // 350 + 0.25·20
  });

  it("continuous rotation never unwinds the long way", () => {
    // Arrow at 350° (CSS rotation 350): target 10° → rotation 370, not 10.
    expect(continuousRotation(350, 10)).toBe(370);
    expect(continuousRotation(370, 350)).toBe(350);
    expect(normalize(370)).toBe(10);
  });
});

describe("arrival (HUD spec §4)", () => {
  it("fires after 2 s continuously within the radius", () => {
    let s = createArrival();
    let r = stepArrival(s, { filteredDistFt: 18, rawDistFt: 22, nowMs: 0 });
    expect(r.justArrived).toBe(false);
    r = stepArrival(r.state, { filteredDistFt: 19, rawDistFt: 22, nowMs: 1000 });
    expect(r.justArrived).toBe(false);
    r = stepArrival(r.state, {
      filteredDistFt: 17,
      rawDistFt: 22,
      nowMs: ARRIVE_HOLD_MS,
    });
    expect(r.justArrived).toBe(true);
    expect(r.state.arrived).toBe(true);
  });

  it("resets the hold when the buyer drifts back out", () => {
    let s = createArrival();
    let r = stepArrival(s, { filteredDistFt: 18, rawDistFt: 22, nowMs: 0 });
    r = stepArrival(r.state, { filteredDistFt: 25, rawDistFt: 30, nowMs: 1500 });
    r = stepArrival(r.state, { filteredDistFt: 18, rawDistFt: 22, nowMs: 2000 });
    r = stepArrival(r.state, { filteredDistFt: 18, rawDistFt: 22, nowMs: 3500 });
    expect(r.state.arrived).toBe(false); // only 1.5 s of the new hold elapsed
  });

  it("fast path: any raw fix ≤ 8 ft arrives immediately", () => {
    const r = stepArrival(createArrival(), {
      filteredDistFt: 30,
      rawDistFt: 7,
      nowMs: 0,
    });
    expect(r.justArrived).toBe(true);
  });

  it("hysteresis: found stays found", () => {
    let r = stepArrival(createArrival(), { filteredDistFt: 5, rawDistFt: 5, nowMs: 0 });
    r = stepArrival(r.state, { filteredDistFt: 80, rawDistFt: 90, nowMs: 5000 });
    expect(r.state.arrived).toBe(true);
    expect(r.justArrived).toBe(false); // fires once
  });
});

describe("boundary warning (HUD spec §7)", () => {
  const far = 1000; // far from entrance

  it("warns only after 3 s more than 10 ft outside", () => {
    let s = createBoundary();
    let r = stepBoundary(s, { signedDistFt: -12, entranceDistFt: far, nowMs: 0 });
    expect(r.state.warning).toBe(false);
    r = stepBoundary(r.state, {
      signedDistFt: -15,
      entranceDistFt: far,
      nowMs: WARN_AFTER_MS,
    });
    expect(r.justWarned).toBe(true);
  });

  it("ignores shallow excursions (≤ 10 ft outside)", () => {
    let s = createBoundary();
    for (const t of [0, 2000, 4000, 8000]) {
      const r = stepBoundary(s, { signedDistFt: -8, entranceDistFt: far, nowMs: t });
      s = r.state;
      expect(r.state.warning).toBe(false);
    }
  });

  it("exempts the entrance radius (shoulder parking)", () => {
    let s = createBoundary();
    for (const t of [0, 2000, 4000, 8000]) {
      const r = stepBoundary(s, {
        signedDistFt: -20,
        entranceDistFt: ENTRANCE_EXEMPT_FT - 5,
        nowMs: t,
      });
      s = r.state;
      expect(r.state.warning).toBe(false);
    }
  });

  it("clears after 2 s back inside", () => {
    let s = createBoundary();
    let r = stepBoundary(s, { signedDistFt: -15, entranceDistFt: far, nowMs: 0 });
    r = stepBoundary(r.state, { signedDistFt: -15, entranceDistFt: far, nowMs: 3000 });
    expect(r.state.warning).toBe(true);
    r = stepBoundary(r.state, { signedDistFt: 5, entranceDistFt: far, nowMs: 4000 });
    expect(r.state.warning).toBe(true); // not yet
    r = stepBoundary(r.state, {
      signedDistFt: 5,
      entranceDistFt: far,
      nowMs: 4000 + CLEAR_AFTER_MS,
    });
    expect(r.state.warning).toBe(false);
  });
});

describe("distance display (HUD spec §3)", () => {
  it("whole feet, never negative", () => {
    expect(formatFeet(41.4)).toBe(41);
    expect(formatFeet(41.6)).toBe(42);
    expect(formatFeet(-0.4)).toBe(0);
  });

  it("rate-limits to 4 updates per second", () => {
    expect(shouldUpdateDistance(null, 0)).toBe(true);
    expect(shouldUpdateDistance(0, 100)).toBe(false);
    expect(shouldUpdateDistance(0, 250)).toBe(true);
  });
});

describe("simulated walker (demo mode)", () => {
  it("is deterministic for a given seed", () => {
    const target = { x: 0, y: 100 };
    let a = createWalker({ x: 0, y: 0 }, 42);
    let b = createWalker({ x: 0, y: 0 }, 42);
    for (let i = 0; i < 10; i++) {
      const ra = stepWalker(a, { target, dtMs: 1000, scenario: SCENARIOS.clean! });
      const rb = stepWalker(b, { target, dtMs: 1000, scenario: SCENARIOS.clean! });
      a = ra.state;
      b = rb.state;
      expect(ra.fix).toEqual(rb.fix);
    }
  });

  it("walks to the target at the scenario speed", () => {
    const target = { x: 0, y: 100 };
    let s = createWalker({ x: 0, y: 0 }, 7);
    for (let i = 0; i < 30; i++) {
      s = stepWalker(s, { target, dtMs: 1000, scenario: SCENARIOS.clean! }).state;
    }
    expect(distanceFt(s.truePos, target)).toBeLessThan(0.001); // clamped at target
  });

  it("reports compass error until calibrated", () => {
    const target = { x: 0, y: 100 }; // due north → course 0°
    let s = createWalker({ x: 0, y: 0 }, 7);
    const before = stepWalker(s, { target, dtMs: 1000, scenario: SCENARIOS.compass! });
    expect(before.headingDeg).toBeCloseTo(30, 9);
    s = calibrateWalker(before.state);
    const after = stepWalker(s, { target, dtMs: 1000, scenario: SCENARIOS.compass! });
    expect(after.headingDeg).toBeCloseTo(0, 9);
  });

  it("wander detours off-course and decays", () => {
    const target = { x: 0, y: 1000 };
    let s = createWalker({ x: 0, y: 0 }, 7);
    const r = stepWalker(s, {
      target,
      dtMs: 1000,
      scenario: SCENARIOS.boundary!,
      startWander: true,
    });
    // 90° off a due-north course → moves east.
    expect(r.state.truePos.x).toBeGreaterThan(0);
    expect(r.state.wanderRemainingFt).toBeLessThan(25);
  });
});
