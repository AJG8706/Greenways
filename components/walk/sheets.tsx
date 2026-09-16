"use client";

import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import type { WalkCorner } from "@/lib/walk/types";
import type { I18nText } from "@/lib/i18n/text";

function pick(text: I18nText, locale: string): string {
  return (locale === "es" ? text.es : text.en) || text.en || text.es;
}

/** Corner picker sheet (HUD spec §5): one at a time, the arrow follows. */
export function PickerSheet({
  corners,
  trackedId,
  nearestUnfoundId,
  foundIds,
  distances,
  onTrack,
  onClose,
}: {
  corners: WalkCorner[];
  trackedId: string;
  nearestUnfoundId: string | null;
  foundIds: ReadonlySet<string>;
  distances: ReadonlyMap<string, number>;
  onTrack: (id: string) => void;
  onClose: () => void;
}) {
  const t = useTranslations();
  const locale = useLocale();
  return (
    <div className="fixed inset-0 z-40 flex flex-col justify-end" role="dialog" aria-modal>
      <button
        type="button"
        aria-label={t("common.close")}
        className="absolute inset-0"
        style={{ background: "rgba(27,36,26,.6)" }}
        onClick={onClose}
      />
      <div
        className="relative rounded-t-3 p-5"
        style={{ background: "var(--bg)", maxHeight: "80dvh", overflowY: "auto" }}
        data-testid="picker-sheet"
      >
        <div className="stack">
          <div>
            <h2>{t("picker.title")}</h2>
            <p className="t-small muted">{t("picker.subtitle")}</p>
          </div>
          {corners.map((c) => {
            const found = foundIds.has(c.id);
            return (
              <button
                key={c.id}
                type="button"
                className={`corner-tile${found ? " found" : ""}`}
                aria-pressed={c.id === trackedId}
                onClick={() => {
                  onTrack(c.id);
                  onClose();
                }}
                data-testid={`pick-c${c.n}`}
              >
                <span className="id">{found ? "✓" : c.n}</span>
                <span className="grow" style={{ textAlign: "left" }}>
                  <span className="t-body-m">
                    {pick(c.name, locale) || t("common.corner", { n: c.n })}
                  </span>
                  {found ? (
                    <span className="t-small muted"> · {t("picker.found")}</span>
                  ) : c.id === nearestUnfoundId ? (
                    <span className="t-small" style={{ color: "var(--gw-trailhead-green)" }}>
                      {" "}
                      · {t("picker.nearest")}
                    </span>
                  ) : null}
                </span>
                <span className="dist num">
                  {distances.get(c.id) ?? "—"} {t("common.ft")}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** Arrival card (HUD spec §4): stake description + photo, Next / Stay. */
export function ArrivalCard({
  corner,
  allFound,
  onNext,
  onStay,
}: {
  corner: WalkCorner;
  allFound: boolean;
  onNext: () => void;
  onStay: () => void;
}) {
  const t = useTranslations();
  const locale = useLocale();
  return (
    <div className="fixed inset-0 z-40 flex flex-col justify-end">
      <div
        className="rounded-t-3 p-5"
        style={{ background: "var(--bg-2)", boxShadow: "var(--shadow-2)" }}
        role="dialog"
        aria-modal
        data-testid="arrival-card"
      >
        <div className="stack">
          <h2>{t("arrival.title", { n: corner.n })}</h2>
          <p className="muted">{t("arrival.subtitle")}</p>
          {corner.stakePhotoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- signed URL host varies
            <img
              src={corner.stakePhotoUrl}
              alt={pick(corner.stake, locale)}
              className="w-full rounded-2"
              style={{ maxHeight: 200, objectFit: "cover" }}
            />
          ) : null}
          {pick(corner.stake, locale) ? (
            <p>
              <span className="t-label">{t("arrival.lookFor")}</span>
              <br />
              {pick(corner.stake, locale)}
            </p>
          ) : null}
          <div className="stack" style={{ gap: "var(--gw-s-2)" }}>
            <Button size="lg" className="btn-block" onClick={onNext} data-testid="arrival-next">
              {allFound ? t("arrival.allDone") : t("arrival.next")}
            </Button>
            {!allFound ? (
              <Button variant="secondary" className="btn-block" onClick={onStay}>
                {t("arrival.stay")}
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Boundary banner (HUD spec §7): informational, never covers arrow or number. */
export function BoundaryBanner({ onDismiss }: { onDismiss: () => void }) {
  const t = useTranslations("boundary");
  return (
    <div
      className="banner banner-warn"
      role="status"
      style={{ background: "var(--bg-2)" }}
      data-testid="boundary-banner"
    >
      <div className="grow">
        <p className="t-body-m">{t("title")}</p>
        <p className="t-small muted">{t("body")}</p>
      </div>
      <Button variant="ghost" size="sm" onClick={onDismiss}>
        {t("dismiss")}
      </Button>
    </div>
  );
}

/** Help sheet (§ help catalog). */
export function HelpSheet({ onClose }: { onClose: () => void }) {
  const t = useTranslations("help");
  const tc = useTranslations("common");
  return (
    <div className="fixed inset-0 z-40 flex flex-col justify-end" role="dialog" aria-modal>
      <button
        type="button"
        aria-label={tc("close")}
        className="absolute inset-0"
        style={{ background: "rgba(27,36,26,.6)" }}
        onClick={onClose}
      />
      <div className="relative rounded-t-3 p-5" style={{ background: "var(--bg)" }}>
        <div className="stack">
          <h2>{t("title")}</h2>
          {(["s1", "s2", "s3", "s4"] as const).map((k) => (
            <p key={k} className="muted">
              {t(k)}
            </p>
          ))}
          <Button variant="secondary" onClick={onClose}>
            {tc("close")}
          </Button>
        </div>
      </div>
    </div>
  );
}
