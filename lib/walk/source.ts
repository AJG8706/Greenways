import type { LatLng } from "@/lib/geo/types";
import type { WalkerScenario } from "@/lib/hud/walker";
import {
  calibrateWalker,
  createWalker,
  stepWalker,
  type WalkerState,
} from "@/lib/hud/walker";
import { centroid, makeProjection, type Projection } from "@/lib/geo/project";

/**
 * One interface for both position/heading sources — the device sensors in the
 * field, the simulated walker in demo/QA mode. Everything downstream (filters,
 * arrival, boundary, UI) is identical: the demo is the QA tool because it
 * exercises the same code path (locked decision).
 */
export type SourceFix = {
  lat: number;
  lng: number;
  accuracyFt: number;
  timestampMs: number;
  /** GPS course over ground, degrees true, when moving (course-mode fallback). */
  courseDeg: number | null;
  speedFtS: number | null;
};

export type SourceCallbacks = {
  onFix: (fix: SourceFix) => void;
  /** Heading in degrees clockwise from true north. */
  onHeading: (deg: number, accuracyDeg: number | null) => void;
  onPositionError: (code: "denied" | "unavailable") => void;
  onHeadingUnavailable: () => void;
};

export type WalkSource = {
  start: (cb: SourceCallbacks) => () => void;
  /** Demo-only controls; no-ops in the field. */
  demo: DemoControls | null;
};

export type DemoControls = {
  setTarget: (t: LatLng) => void;
  setAutoWalk: (on: boolean) => void;
  calibrate: () => void;
  stepOutside: () => void;
  jumpToTarget: () => void;
  reset: () => void;
};

const M_TO_FT = 3.28084;
const MPH_1_5_IN_FT_S = 2.2;

/** Real device sensors (HUD spec §1, §6, §8). */
export function createSensorSource(declinationDeg: number): WalkSource {
  return {
    demo: null,
    start(cb) {
      let headingSeen = false;
      const cleanups: (() => void)[] = [];

      // Position — high accuracy watch.
      if (!navigator.geolocation) {
        cb.onPositionError("unavailable");
      } else {
        const watchId = navigator.geolocation.watchPosition(
          (pos) => {
            cb.onFix({
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
              accuracyFt: pos.coords.accuracy * M_TO_FT,
              timestampMs: pos.timestamp,
              courseDeg:
                pos.coords.heading !== null &&
                !Number.isNaN(pos.coords.heading) &&
                (pos.coords.speed ?? 0) * M_TO_FT > MPH_1_5_IN_FT_S
                  ? pos.coords.heading
                  : null,
              speedFtS: pos.coords.speed !== null ? pos.coords.speed * M_TO_FT : null,
            });
          },
          (err) => {
            cb.onPositionError(err.code === err.PERMISSION_DENIED ? "denied" : "unavailable");
          },
          { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 },
        );
        cleanups.push(() => navigator.geolocation.clearWatch(watchId));
      }

      // Heading — iOS webkitCompassHeading (already true north); Android
      // absolute orientation (magnetic; apply declination).
      type IOSOrientationEvent = DeviceOrientationEvent & {
        webkitCompassHeading?: number;
        webkitCompassAccuracy?: number;
      };
      const onOrientation = (e: DeviceOrientationEvent) => {
        const ios = e as IOSOrientationEvent;
        if (typeof ios.webkitCompassHeading === "number") {
          headingSeen = true;
          cb.onHeading(ios.webkitCompassHeading, ios.webkitCompassAccuracy ?? null);
        } else if (e.absolute && e.alpha !== null) {
          headingSeen = true;
          cb.onHeading(((360 - e.alpha) % 360) + declinationDeg, null);
        }
      };
      // Prefer 'deviceorientationabsolute' where the browser fires it.
      window.addEventListener("deviceorientationabsolute", onOrientation as EventListener);
      window.addEventListener("deviceorientation", onOrientation);
      cleanups.push(() => {
        window.removeEventListener(
          "deviceorientationabsolute",
          onOrientation as EventListener,
        );
        window.removeEventListener("deviceorientation", onOrientation);
      });

      // No orientation event within 2 s of start → course mode (§8).
      const timer = window.setTimeout(() => {
        if (!headingSeen) cb.onHeadingUnavailable();
      }, 2000);
      cleanups.push(() => window.clearTimeout(timer));

      return () => cleanups.forEach((fn) => fn());
    },
  };
}

/** Simulated walker source for demo/QA mode. */
export function createDemoSource(
  scenario: WalkerScenario,
  boundaryRing: LatLng[],
  entrance: LatLng,
): WalkSource {
  const proj: Projection = makeProjection(centroid(boundaryRing));
  const start = proj.toLocal(entrance);

  let walker: WalkerState = createWalker(start, 1037);
  let target = start;
  let autoWalk = true;
  let pendingWander = false;

  const controls: DemoControls = {
    setTarget: (t) => {
      target = proj.toLocal(t);
    },
    setAutoWalk: (on) => {
      autoWalk = on;
    },
    calibrate: () => {
      walker = calibrateWalker(walker);
    },
    stepOutside: () => {
      pendingWander = true;
    },
    jumpToTarget: () => {
      walker = { ...walker, truePos: { ...target } };
    },
    reset: () => {
      walker = createWalker(start, 1037);
    },
  };

  return {
    demo: controls,
    start(cb) {
      const tick = () => {
        const result = stepWalker(walker, {
          target,
          dtMs: 1000,
          scenario: { ...scenario, speedFtS: autoWalk ? scenario.speedFtS : 0 },
          startWander: pendingWander,
        });
        pendingWander = false;
        walker = result.state;
        const ll = proj.fromLocal(result.fix.point);
        cb.onFix({
          lat: ll.lat,
          lng: ll.lng,
          accuracyFt: result.fix.accuracyFt,
          timestampMs: Date.now(),
          courseDeg: null,
          speedFtS: autoWalk ? scenario.speedFtS : 0,
        });
        cb.onHeading(result.headingDeg, null);
      };
      tick();
      const id = window.setInterval(tick, 1000);
      return () => window.clearInterval(id);
    },
  };
}
