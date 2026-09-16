"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import Image from "next/image";
import { HelpCircle, Map as MapIcon, Compass } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LanguageToggle } from "@/components/walk/language-toggle";
import { bearingDeg } from "@/lib/geo/bearing";
import { signedDistanceToPolygon } from "@/lib/geo/polygon";
import { centroid, distanceFt, makeProjection } from "@/lib/geo/project";
import type { PointFt } from "@/lib/geo/types";
import { createArrival, stepArrival, type ArrivalState } from "@/lib/hud/arrival";
import { createBoundary, stepBoundary, type BoundaryState } from "@/lib/hud/boundary";
import {
  createPositionFilter,
  stepPositionFilter,
  type PositionFilterState,
} from "@/lib/hud/filters";
import { formatFeet, shouldUpdateDistance } from "@/lib/hud/format";
import { continuousRotation, normalize, stepHeading } from "@/lib/hud/heading";
import { playArrivalTone, playRetargetTone, unlockAudio, vibrateArrival } from "@/lib/walk/audio";
import { createDemoSource, createSensorSource, type WalkSource } from "@/lib/walk/source";
import type { WalkConfig } from "@/lib/walk/types";
import { ArrowRing, CornerStrip, DistanceReadout, StatusLine } from "./hud-parts";
import { MiniMap } from "./mini-map";
import { ArrivalCard, BoundaryBanner, HelpSheet, PickerSheet } from "./sheets";
import { DemoTray } from "./demo-tray";

type Screen = "welcome" | "permission" | "denied" | "settings" | "hud" | "done";

type Machine = {
  posFilter: PositionFilterState;
  fixLocal: PointFt | null;
  rawLocal: PointFt | null;
  headingDeg: number | null;
  rotation: number;
  arrivals: Map<string, ArrivalState>;
  boundary: BoundaryState;
  lastFixAtMs: number | null;
  lastHeadingAtMs: number | null;
  weakSinceMs: number | null;
  weak: boolean;
  lost: boolean;
  courseMode: boolean;
  compassUnreliable: boolean;
  lastDistDisplayMs: number | null;
  startedAtMs: number | null;
  cornerStartedAtMs: number | null;
};

export function WalkApp({ config }: { config: WalkConfig }) {
  const t = useTranslations();
  const locale = useLocale();

  const geo = useMemo(() => {
    const ring = config.corners.map((c) => ({ lat: c.lat, lng: c.lng }));
    const proj = makeProjection(centroid(ring));
    const cornerLocal = new Map(
      config.corners.map((c) => [c.id, proj.toLocal({ lat: c.lat, lng: c.lng })]),
    );
    return {
      proj,
      cornerLocal,
      ringLocal: config.corners.map((c) => cornerLocal.get(c.id)!),
      entranceLocal: proj.toLocal(config.entrance),
    };
  }, [config]);

  const machine = useRef<Machine>({
    posFilter: createPositionFilter(),
    fixLocal: null,
    rawLocal: null,
    headingDeg: null,
    rotation: 0,
    arrivals: new Map(),
    boundary: createBoundary(),
    lastFixAtMs: null,
    lastHeadingAtMs: null,
    weakSinceMs: null,
    weak: false,
    lost: false,
    courseMode: false,
    compassUnreliable: false,
    lastDistDisplayMs: null,
    startedAtMs: null,
    cornerStartedAtMs: null,
  });

  const [screen, setScreen] = useState<Screen>("welcome");
  const [view, setView] = useState<"compass" | "map">("compass");
  const [trackedId, setTrackedId] = useState<string | null>(null);
  const [foundIds, setFoundIds] = useState<ReadonlySet<string>>(new Set());
  const [foundSeconds, setFoundSeconds] = useState<ReadonlyMap<number, number>>(new Map());
  const [distances, setDistances] = useState<ReadonlyMap<string, number>>(new Map());
  const [distFeet, setDistFeet] = useState<number | null>(null);
  const [rotation, setRotation] = useState(0);
  const [statusKey, setStatusKey] = useState<string | null>(null);
  const [buyerPoint, setBuyerPoint] = useState<PointFt | null>(null);
  const [arrivalFor, setArrivalFor] = useState<string | null>(null);
  const [boundaryVisible, setBoundaryVisible] = useState(false);
  const boundaryDismissedFor = useRef<string | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [totalSeconds, setTotalSeconds] = useState(0);

  const trackedRef = useRef<string | null>(null);
  const foundRef = useRef<Set<string>>(new Set());
  const stopRef = useRef<(() => void) | null>(null);

  const source = useMemo<WalkSource>(() => {
    if (config.demo) {
      return createDemoSource(
        config.demo,
        config.corners.map((c) => ({ lat: c.lat, lng: c.lng })),
        config.entrance,
      );
    }
    return createSensorSource(config.declinationDeg);
  }, [config]);

  const trackedCorner = config.corners.find((c) => c.id === trackedId) ?? null;
  const nearestUnfoundId = useMemo(() => {
    let best: string | null = null;
    let bestDist = Infinity;
    for (const c of config.corners) {
      if (foundIds.has(c.id)) continue;
      const d = distances.get(c.id) ?? Infinity;
      if (d < bestDist) {
        bestDist = d;
        best = c.id;
      }
    }
    return best;
  }, [config.corners, foundIds, distances]);

  const updateStatus = useCallback(() => {
    const m = machine.current;
    const trackedArrived =
      trackedRef.current !== null && foundRef.current.has(trackedRef.current);
    setStatusKey(
      m.lost
        ? "gpsLost"
        : m.weak
          ? "gpsWeak"
          : m.compassUnreliable
            ? "calibrate"
            : m.courseMode && (m.headingDeg === null || m.lost)
              ? "courseMode"
              : trackedArrived
                ? "here"
                : null,
    );
  }, []);

  const updateArrow = useCallback(() => {
    const m = machine.current;
    const target = trackedRef.current ? geo.cornerLocal.get(trackedRef.current) : null;
    if (!m.fixLocal || !target || m.headingDeg === null) return;
    const bearing = bearingDeg(m.fixLocal, target);
    m.rotation = continuousRotation(m.rotation, normalize(bearing - m.headingDeg));
    setRotation(m.rotation);
  }, [geo]);

  const track = useCallback(
    (id: string, silent = false) => {
      trackedRef.current = id;
      setTrackedId(id);
      machine.current.cornerStartedAtMs = Date.now();
      boundaryDismissedFor.current = null;
      const corner = config.corners.find((c) => c.id === id);
      if (corner) source.demo?.setTarget({ lat: corner.lat, lng: corner.lng });
      if (!silent) playRetargetTone();
      updateArrow();
      updateStatus();
    },
    [config, source, updateArrow, updateStatus],
  );

  const onFix = useCallback(
    (f: { lat: number; lng: number; accuracyFt: number; timestampMs: number; courseDeg: number | null; speedFtS: number | null }) => {
      const m = machine.current;
      const now = f.timestampMs;
      const rawLocal = geo.proj.toLocal({ lat: f.lat, lng: f.lng });
      m.rawLocal = rawLocal;
      m.lastFixAtMs = Date.now();
      m.lost = false;

      // Weak GPS: accuracy > 40 ft sustained 5 s (§8).
      if (f.accuracyFt > 40) {
        m.weakSinceMs = m.weakSinceMs ?? now;
        m.weak = now - m.weakSinceMs >= 5000 || m.weak;
      } else {
        m.weakSinceMs = null;
        m.weak = false;
      }

      const stepped = stepPositionFilter(m.posFilter, {
        point: rawLocal,
        accuracyFt: f.accuracyFt,
        timestampMs: now,
      });
      m.posFilter = stepped.state;
      if (stepped.accepted && m.posFilter.fix) m.fixLocal = m.posFilter.fix;
      if (!m.fixLocal) return;

      if (m.startedAtMs === null) m.startedAtMs = Date.now();

      // Course-mode heading from GPS while moving (§8).
      if (m.courseMode && f.courseDeg !== null) {
        m.headingDeg = stepHeading(m.headingDeg, f.courseDeg);
      }

      // First good fix: track the nearest unfound corner (§5).
      if (trackedRef.current === null) {
        let best: string | null = null;
        let bestD = Infinity;
        for (const c of config.corners) {
          const d = distanceFt(m.fixLocal, geo.cornerLocal.get(c.id)!);
          if (d < bestD) {
            bestD = d;
            best = c.id;
          }
        }
        if (best) track(best, true);
      }

      // Distances to every corner (picker/strip), displayed number rate-limited.
      const nextDistances = new Map<string, number>();
      for (const c of config.corners) {
        nextDistances.set(c.id, formatFeet(distanceFt(m.fixLocal, geo.cornerLocal.get(c.id)!)));
      }
      setDistances(nextDistances);
      setBuyerPoint(m.fixLocal);

      const tracked = trackedRef.current;
      if (tracked) {
        const target = geo.cornerLocal.get(tracked)!;
        const filteredDist = distanceFt(m.fixLocal, target);
        const rawDist = distanceFt(rawLocal, target);

        if (shouldUpdateDistance(m.lastDistDisplayMs, Date.now())) {
          m.lastDistDisplayMs = Date.now();
          setDistFeet(formatFeet(filteredDist));
        }

        if (!foundRef.current.has(tracked)) {
          const arrivalState = m.arrivals.get(tracked) ?? createArrival();
          const r = stepArrival(arrivalState, {
            filteredDistFt: filteredDist,
            rawDistFt: rawDist,
            nowMs: now,
          });
          m.arrivals.set(tracked, r.state);
          if (r.justArrived) {
            foundRef.current = new Set(foundRef.current).add(tracked);
            setFoundIds(foundRef.current);
            const corner = config.corners.find((c) => c.id === tracked)!;
            const seconds = m.cornerStartedAtMs
              ? Math.round((Date.now() - m.cornerStartedAtMs) / 1000)
              : 0;
            setFoundSeconds((prev) => new Map(prev).set(corner.n, seconds));
            vibrateArrival();
            playArrivalTone();
            setArrivalFor(tracked);
          }
        }
      }

      // Boundary awareness (§7).
      const signed = signedDistanceToPolygon(m.fixLocal, geo.ringLocal);
      const entranceDist = distanceFt(m.fixLocal, geo.entranceLocal);
      const b = stepBoundary(m.boundary, {
        signedDistFt: signed,
        entranceDistFt: entranceDist,
        nowMs: now,
      });
      m.boundary = b.state;
      setBoundaryVisible(
        b.state.warning && boundaryDismissedFor.current !== trackedRef.current,
      );

      updateArrow();
      updateStatus();
    },
    [config, geo, track, updateArrow, updateStatus],
  );

  const onHeading = useCallback(
    (deg: number, accuracyDeg: number | null) => {
      const m = machine.current;
      m.lastHeadingAtMs = Date.now();
      m.courseMode = false;
      m.compassUnreliable = accuracyDeg !== null && accuracyDeg > 30;
      m.headingDeg = stepHeading(m.headingDeg, normalize(deg));
      updateArrow();
      updateStatus();
    },
    [updateArrow, updateStatus],
  );

  const startSource = useCallback(() => {
    stopRef.current?.();
    stopRef.current = source.start({
      onFix,
      onHeading,
      onPositionError: (code) => {
        setScreen(code === "denied" ? "denied" : "settings");
      },
      onHeadingUnavailable: () => {
        machine.current.courseMode = true;
        updateStatus();
      },
    });
    setScreen("hud");
  }, [source, onFix, onHeading, updateStatus]);

  // GPS-lost watchdog (§8): no fix for 10 s.
  useEffect(() => {
    if (screen !== "hud") return;
    const id = window.setInterval(() => {
      const m = machine.current;
      if (m.lastFixAtMs !== null && Date.now() - m.lastFixAtMs > 10000) {
        m.lost = true;
        updateStatus();
      }
    }, 1000);
    return () => window.clearInterval(id);
  }, [screen, updateStatus]);

  // Wake lock while on the HUD; re-acquire on return (§8).
  useEffect(() => {
    if (screen !== "hud") return;
    let lock: WakeLockSentinel | null = null;
    const acquire = () => {
      navigator.wakeLock
        ?.request("screen")
        .then((l) => {
          lock = l;
        })
        .catch(() => undefined);
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") acquire();
    };
    acquire();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      void lock?.release().catch(() => undefined);
    };
  }, [screen]);

  useEffect(() => () => stopRef.current?.(), []);

  function begin() {
    if (config.demo) {
      unlockAudio();
      startSource();
    } else {
      setScreen("permission");
    }
  }

  function allowSensors() {
    // Order matters (§6): audio unlock + orientation permission inside the tap.
    unlockAudio();
    type RequestableOrientation = typeof DeviceOrientationEvent & {
      requestPermission?: () => Promise<"granted" | "denied">;
    };
    const doe = DeviceOrientationEvent as RequestableOrientation;
    if (typeof doe.requestPermission === "function") {
      void doe.requestPermission().catch(() => undefined).then(() => startSource());
    } else {
      startSource();
    }
  }

  function nextCorner() {
    setArrivalFor(null);
    if (foundRef.current.size >= config.corners.length) {
      const m = machine.current;
      setTotalSeconds(m.startedAtMs ? Math.round((Date.now() - m.startedAtMs) / 1000) : 0);
      setScreen("done");
      return;
    }
    if (nearestUnfoundId) track(nearestUnfoundId);
  }

  function restart() {
    machine.current = {
      ...machine.current,
      posFilter: createPositionFilter(),
      arrivals: new Map(),
      boundary: createBoundary(),
      startedAtMs: null,
      cornerStartedAtMs: null,
    };
    foundRef.current = new Set();
    trackedRef.current = null;
    setFoundIds(new Set());
    setFoundSeconds(new Map());
    setTrackedId(null);
    setArrivalFor(null);
    source.demo?.reset();
    setScreen("hud");
  }

  const propertyName = (locale === "es" ? config.name.es : config.name.en) || config.name.en;
  const allFound = foundIds.size >= config.corners.length;

  return (
    <main
      data-surface="walk"
      className="gw relative mx-auto flex min-h-dvh w-full max-w-md flex-col px-4 pb-4"
      style={{ background: "var(--bg)", color: "var(--text)", overflowX: "hidden" }}
    >
      {/* portrait-only prompt (§9) */}
      <div className="rotate-overlay" aria-hidden>
        <p className="t-display">{t("hud.rotate")}</p>
      </div>
      <style>{`
        .rotate-overlay { display: none; }
        @media (orientation: landscape) and (max-height: 500px) {
          .rotate-overlay { position: fixed; inset: 0; z-index: 60; display: grid; place-items: center; background: var(--gw-pine-3); }
        }
      `}</style>

      {screen === "welcome" ? (
        <section className="flex grow flex-col justify-center gap-5 py-8 text-center">
          <div className="absolute right-4 top-4">
            <LanguageToggle />
          </div>
          <Image
            src="/brand/greenways-logo-stacked-reversed.svg"
            alt="Greenways"
            width={160}
            height={120}
            className="mx-auto"
            priority
          />
          <div>
            <p className="t-label">{t("welcome.eyebrow")}</p>
            <h1 style={{ font: "var(--gw-t-h1)" }}>{propertyName}</h1>
            {config.acres !== null ? (
              <p className="t-small muted">{t("common.acres", { n: config.acres })}</p>
            ) : null}
          </div>
          <h2 className="t-display" style={{ color: "var(--heading)" }}>
            {t("welcome.title")}
          </h2>
          <p className="muted">{t("welcome.body")}</p>
          <Button size="lg" className="btn-block" onClick={begin} data-testid="start-walking">
            {t("welcome.start")}
          </Button>
          <p className="t-small muted">{t("welcome.loadHint")}</p>
        </section>
      ) : null}

      {screen === "permission" || screen === "denied" || screen === "settings" ? (
        <section className="flex grow flex-col justify-center gap-5 py-8 text-center">
          <h1>{t("permission.title")}</h1>
          <p className="muted">{t("permission.body")}</p>
          <p className="t-small muted">{t("permission.iosNote")}</p>
          {screen === "denied" ? (
            <div className="banner banner-warn" role="alert">
              {t("permission.denied")}
            </div>
          ) : null}
          {screen === "settings" ? (
            <div className="banner banner-error" role="alert">
              {t("permission.openSettings")}
            </div>
          ) : null}
          <Button size="lg" className="btn-block" onClick={allowSensors} data-testid="allow-sensors">
            {screen === "permission" ? t("permission.cta") : t("permission.retry")}
          </Button>
        </section>
      ) : null}

      {screen === "hud" && trackedCorner ? (
        <section className="flex grow flex-col gap-3 py-3">
          <header className="row between">
            <span className="hud-chip" data-testid="found-count">
              {t("hud.foundCount", { found: foundIds.size, total: config.corners.length })}
            </span>
            <span className="row" style={{ gap: 8 }}>
              <button
                type="button"
                className="hud-chip"
                onClick={() => setShowHelp(true)}
                aria-label={t("hud.help")}
              >
                <HelpCircle size={18} />
              </button>
              <LanguageToggle />
            </span>
          </header>

          {boundaryVisible ? (
            <BoundaryBanner
              onDismiss={() => {
                boundaryDismissedFor.current = trackedRef.current;
                setBoundaryVisible(false);
              }}
            />
          ) : null}

          <p className="text-center">
            <span className="t-label">{t("hud.tracking")}</span>
            <br />
            <span className="hud-corner" data-testid="tracked-name">
              {(locale === "es" ? trackedCorner.name.es : trackedCorner.name.en) ||
                t("common.corner", { n: trackedCorner.n })}
            </span>
          </p>

          {view === "compass" ? (
            <ArrowRing
              rotationDeg={rotation}
              arrived={foundIds.has(trackedCorner.id)}
              dimmed={statusKey === "calibrate"}
            />
          ) : (
            <MiniMap
              ringLocal={geo.ringLocal}
              corners={config.corners}
              cornerLocal={geo.cornerLocal}
              buyer={buyerPoint}
              trackedId={trackedCorner.id}
              foundIds={foundIds}
              distanceFt={distFeet}
            />
          )}

          {view === "compass" ? <DistanceReadout feet={distFeet} /> : null}
          <StatusLine statusKey={statusKey === null && foundIds.has(trackedCorner.id) ? "here" : statusKey} />

          <CornerStrip
            corners={config.corners}
            trackedId={trackedCorner.id}
            foundIds={foundIds}
            distances={distances}
            onTrack={track}
          />

          <div className="row" style={{ gap: 8 }}>
            <Button
              variant="secondary"
              size="lg"
              className="grow"
              onClick={() => setView(view === "compass" ? "map" : "compass")}
              data-testid="toggle-map"
            >
              {view === "compass" ? (
                <>
                  <MapIcon size={18} /> {t("hud.map")}
                </>
              ) : (
                <>
                  <Compass size={18} /> {t("hud.compass")}
                </>
              )}
            </Button>
            <Button
              variant="secondary"
              size="lg"
              className="grow"
              onClick={() => setShowPicker(true)}
              data-testid="open-picker"
            >
              {t("hud.corners")}
            </Button>
          </div>

          <p className="t-small text-center" style={{ color: "var(--text-2)" }}>
            {t("hud.honesty")}
          </p>
        </section>
      ) : null}

      {screen === "done" ? (
        <section className="flex grow flex-col justify-center gap-5 py-8 text-center">
          <h1 className="t-display" style={{ color: "var(--heading)" }} data-testid="done-title">
            {t("done.title", { n: config.corners.length })}
          </h1>
          <p className="muted">{t("done.body")}</p>
          <div className="panel" style={{ background: "var(--bg-2)" }}>
            <ul className="stack" style={{ gap: 6 }}>
              {config.corners.map((c) => (
                <li key={c.id} className="row between">
                  <span>{t("common.corner", { n: c.n })}</span>
                  <span className="num muted">
                    {foundSeconds.get(c.n) ?? "—"} s
                  </span>
                </li>
              ))}
              <li className="row between t-body-m">
                <span>{t("hud.foundCount", { found: config.corners.length, total: config.corners.length })}</span>
                <span className="num">{totalSeconds} s</span>
              </li>
            </ul>
          </div>
          <Button size="lg" className="btn-block" onClick={restart} data-testid="walk-again">
            {t("done.again")}
          </Button>
        </section>
      ) : null}

      {showPicker && trackedCorner ? (
        <PickerSheet
          corners={config.corners}
          trackedId={trackedCorner.id}
          nearestUnfoundId={nearestUnfoundId}
          foundIds={foundIds}
          distances={distances}
          onTrack={track}
          onClose={() => setShowPicker(false)}
        />
      ) : null}

      {arrivalFor ? (
        <ArrivalCard
          corner={config.corners.find((c) => c.id === arrivalFor)!}
          allFound={allFound}
          onNext={nextCorner}
          onStay={() => setArrivalFor(null)}
        />
      ) : null}

      {showHelp ? <HelpSheet onClose={() => setShowHelp(false)} /> : null}

      {config.demo && screen === "hud" ? (
        <DemoTray source={source} scenarioKey={config.demo.key} />
      ) : null}
    </main>
  );
}
