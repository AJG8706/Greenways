"use client";

import { useRef, useState } from "react";
import { ChevronRight } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { InterestCard } from "@/components/walk/interest-card";

/**
 * Slide-to-interest: the buyer's one-gesture "I want this" — always visible
 * under the HUD, no typing in the sun. A booked prospect's swipe submits
 * directly (the link knows who they are); a QR walk-up gets the phone form
 * after the swipe. Keyboard: Enter/End on the focused track completes it.
 */
export function SwipeInterest({
  slug,
  getSessionId,
  prospect,
}: {
  slug: string;
  getSessionId: () => string | null;
  /** True when this walk runs on a tokenized prospect link. */
  prospect: boolean;
}) {
  const t = useTranslations("swipe");
  const locale = useLocale();
  const [state, setState] = useState<"idle" | "form" | "sending" | "sent" | "error">("idle");
  const [drag, setDrag] = useState(0); // 0..1
  const [dragging, setDragging] = useState(false);
  const trackRef = useRef<HTMLDivElement>(null);
  const startX = useRef(0);

  async function complete() {
    if (!prospect) {
      setState("form");
      return;
    }
    setState("sending");
    try {
      const res = await fetch("/api/walk-leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug,
          sessionId: getSessionId() ?? undefined,
          locale,
          source: "swipe",
        }),
      });
      setState(res.ok ? "sent" : "form"); // any hiccup falls back to the form
    } catch {
      setState("form");
    }
  }

  if (state === "form") {
    return <InterestCard slug={slug} getSessionId={getSessionId} />;
  }
  if (state === "sent") {
    return (
      <div
        className="rounded-3 p-3 text-center t-body-m"
        style={{ background: "var(--gw-trailhead-deep, #48712F)", color: "#fff" }}
        data-testid="swipe-sent"
      >
        {t("sent")}
      </div>
    );
  }

  const THUMB = 44;
  const trackW = trackRef.current?.clientWidth ?? 280;
  const travel = Math.max(trackW - THUMB - 8, 60);

  function onPointerDown(e: React.PointerEvent) {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    startX.current = e.clientX - drag * travel;
    setDragging(true);
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!dragging) return;
    const next = Math.min(Math.max((e.clientX - startX.current) / travel, 0), 1);
    setDrag(next);
  }
  function onPointerUp() {
    if (!dragging) return;
    setDragging(false);
    if (drag > 0.85) {
      setDrag(1);
      void complete();
    } else {
      setDrag(0);
    }
  }

  return (
    <div
      ref={trackRef}
      role="slider"
      aria-label={t("label")}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(drag * 100)}
      tabIndex={0}
      className="relative rounded-3"
      style={{
        height: 52,
        background: "var(--bg-2)",
        border: "1px solid rgba(255,255,255,.18)",
        touchAction: "none",
        userSelect: "none",
        overflow: "hidden",
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === "End") {
          setDrag(1);
          void complete();
        }
      }}
      data-testid="swipe-interest"
    >
      <span
        className="absolute inset-0 flex items-center justify-center t-body-m"
        style={{ color: "var(--text-2)", paddingLeft: THUMB / 2 }}
      >
        {state === "sending" ? t("sending") : t("label")}
      </span>
      <span
        className="absolute flex items-center justify-center rounded-3"
        style={{
          top: 3,
          left: 4,
          width: THUMB,
          height: 44,
          background: "var(--gw-trailhead-green, #8DBA5E)",
          color: "var(--gw-pine-shadow, #24301F)",
          transform: `translateX(${drag * travel}px)`,
          transition: dragging ? "none" : "transform .25s ease",
          cursor: "grab",
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        data-testid="swipe-thumb"
      >
        <ChevronRight size={22} aria-hidden />
      </span>
    </div>
  );
}
