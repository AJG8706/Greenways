"use client";

import { useRef, useState, useTransition } from "react";
import { Lock, LockOpen, Upload } from "lucide-react";
import {
  importKml,
  lockCorners,
  moveCorner,
  moveEntrance,
  unlockCorners,
} from "@/app/admin/(console)/properties/actions";
import { Button } from "@/components/ui/button";
import { closestPointOnPolygon } from "@/lib/geo/polygon";
import { centroid, makeProjection } from "@/lib/geo/project";
import type { LatLng } from "@/lib/geo/types";
import { DrawnMap } from "./drawn-map";
import { SatelliteMap } from "./satellite-map";

export type CornerRow = {
  id: string;
  n: number;
  lat: number;
  lng: number;
  name: { en: string; es: string };
  stake: { en: string; es: string };
  approachPhoto: string | null;
  stakePhoto: string | null;
  locked: boolean;
};

export type CornersLabels = {
  title: string;
  importKml: string;
  source: string;
  verified: string;
  locked: string;
  unlock: string;
  order: string;
  entrance: string;
  stakeDesc: string;
  corner: string;
  lat: string;
  lng: string;
  stake: string;
  photos: string;
};

export function CornersEditor({
  propertyId,
  corners,
  entrance,
  geometrySource,
  isAdmin,
  lastLockEvent,
  labels,
}: {
  propertyId: string;
  corners: CornerRow[];
  entrance: LatLng | null;
  geometrySource: string | null;
  isAdmin: boolean;
  lastLockEvent: { action: string; at: string } | null;
  labels: CornersLabels;
}) {
  const [error, setError] = useState<string | null>(null);
  const [entranceMode, setEntranceMode] = useState(false);
  const [pending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  const hasGeometry = corners.length >= 3;
  const allLocked = hasGeometry && corners.every((c) => c.locked);
  const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

  function run(action: () => Promise<{ ok: boolean; message?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) setError(result.message ?? "Something went wrong");
    });
  }

  function onKmlChosen(file: File | undefined) {
    if (!file) return;
    const formData = new FormData();
    formData.set("kml", file);
    run(() => importKml(propertyId, formData));
  }

  function onCornerDragged(cornerId: string, next: LatLng) {
    run(() => moveCorner(cornerId, propertyId, next.lat, next.lng));
  }

  function onMapClick(p: LatLng) {
    if (!entranceMode || !hasGeometry) return;
    // Snap the entrance onto the lot line.
    const ring = corners.map((c) => ({ lat: c.lat, lng: c.lng }));
    const proj = makeProjection(centroid(ring));
    const snapped = proj.fromLocal(
      closestPointOnPolygon(proj.toLocal(p), ring.map(proj.toLocal)),
    );
    setEntranceMode(false);
    run(() => moveEntrance(propertyId, snapped));
  }

  return (
    <div className="stack" style={{ gap: "var(--gw-s-5)" }}>
      <div className="row" data-testid="corners-status">
        {allLocked ? (
          <span className="pill pill-live">{labels.verified}</span>
        ) : hasGeometry ? (
          <span className="pill pill-working">{labels.verified}?</span>
        ) : null}
        {geometrySource ? <span className="t-small muted">{geometrySource}</span> : null}
        {lastLockEvent ? (
          <span className="t-small muted">
            · {lastLockEvent.action === "corner_locked" ? labels.locked : labels.unlock}{" "}
            {new Date(lastLockEvent.at).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
            })}
          </span>
        ) : null}
      </div>

      <div className="row">
        <input
          ref={fileRef}
          type="file"
          accept=".kml,application/vnd.google-earth.kml+xml"
          className="sr-only"
          data-testid="kml-input"
          onChange={(e) => onKmlChosen(e.target.files?.[0])}
        />
        <Button
          variant="secondary"
          disabled={pending || allLocked}
          onClick={() => fileRef.current?.click()}
          data-testid="import-kml"
        >
          <Upload size={16} /> {labels.importKml}
        </Button>
        {hasGeometry && !allLocked ? (
          <Button disabled={pending} onClick={() => run(() => lockCorners(propertyId))}>
            <Lock size={16} /> {labels.verified}
          </Button>
        ) : null}
        {allLocked && isAdmin ? (
          <Button
            variant="secondary"
            disabled={pending}
            onClick={() => run(() => unlockCorners(propertyId))}
            data-testid="unlock-corners"
          >
            <LockOpen size={16} /> {labels.unlock}
          </Button>
        ) : null}
        {hasGeometry && !allLocked ? (
          <Button
            variant={entranceMode ? "default" : "ghost"}
            disabled={pending}
            onClick={() => setEntranceMode((v) => !v)}
          >
            {entranceMode ? "Click the lot line…" : "Move entrance"}
          </Button>
        ) : null}
      </div>

      {error ? (
        <div className="banner banner-error" role="alert" data-testid="corners-error">
          {error}
        </div>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[minmax(320px,1fr)_minmax(420px,1fr)]">
        <section className="card" style={{ padding: "var(--gw-s-3)" }}>
          {hasGeometry ? (
            <div className="stack" style={{ gap: "var(--gw-s-3)" }}>
              {mapboxToken ? (
                <SatelliteMap
                  token={mapboxToken}
                  corners={corners}
                  entrance={entrance}
                  draggable={!allLocked}
                  onCornerDragged={onCornerDragged}
                  onMapClick={onMapClick}
                />
              ) : (
                <DrawnMap
                  corners={corners}
                  entrance={entrance}
                  draggable={!allLocked}
                  onCornerDragged={onCornerDragged}
                  onMapClick={onMapClick}
                />
              )}
              <p className="t-small muted" style={{ padding: "0 var(--gw-s-2)" }}>
                {labels.order} · drag a pin only after unlocking
                {!mapboxToken ? " · drawn fallback (no imagery key configured)" : null}
              </p>
            </div>
          ) : (
            <div className="stack items-center p-8 text-center">
              <p className="muted">
                No geometry yet. {labels.importKml} — CAD-verified boundaries only.
              </p>
            </div>
          )}
        </section>

        <div className="stack" style={{ gap: "var(--gw-s-5)" }}>
          <section className="table-wrap">
            <table data-testid="corners-table">
              <thead>
                <tr>
                  <th>{labels.corner}</th>
                  <th>{labels.lat}</th>
                  <th>{labels.lng}</th>
                  <th>{labels.stake}</th>
                  <th>{labels.photos}</th>
                </tr>
              </thead>
              <tbody>
                {corners.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <strong>C{c.n}</strong>
                      {c.name.en ? <p className="t-small muted">{c.name.en}</p> : null}
                    </td>
                    <td className="num">{c.lat.toFixed(6)}</td>
                    <td className="num">{c.lng.toFixed(6)}</td>
                    <td>{c.stake.en || "—"}</td>
                    <td>
                      <span
                        className={`pill ${
                          c.approachPhoto && c.stakePhoto ? "pill-live" : "pill-draft"
                        }`}
                      >
                        {(c.approachPhoto ? 1 : 0) + (c.stakePhoto ? 1 : 0)} / 2
                      </span>
                    </td>
                  </tr>
                ))}
                {corners.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="muted">
                      —
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </section>

          <section className="card">
            <div className="stack" style={{ gap: "var(--gw-s-2)" }}>
              <h3>{labels.entrance}</h3>
              <p className="t-small muted">
                Sets corner numbering and, later, the intro flyover&apos;s end frame.
              </p>
              {entrance ? (
                <p className="num" data-testid="entrance-coords">
                  {entrance.lat.toFixed(6)}, {entrance.lng.toFixed(6)}
                </p>
              ) : (
                <p className="muted">Set after KML import.</p>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
