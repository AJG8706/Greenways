"use client";

import { useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Play, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { WalkCorner, WalkMedia } from "@/lib/walk/types";

/**
 * Intro flyover on first open (plan §3 Phase 5): full-screen, always
 * skippable, and never load-bearing — any playback problem advances the
 * flow immediately. Only approved media ever reaches here (guardrail #3).
 */
export function IntroOverlay({
  src,
  onDone,
  onSkip,
}: {
  src: string;
  onDone: () => void;
  onSkip: () => void;
}) {
  const t = useTranslations("intro");
  return (
    <div
      className="fixed inset-0 z-50 flex flex-col"
      style={{ background: "var(--gw-pine-3, #1B241A)" }}
      data-testid="intro-overlay"
    >
      <video
        src={src}
        autoPlay
        muted
        playsInline
        onEnded={onDone}
        onError={onDone}
        className="h-full w-full"
        style={{ objectFit: "cover" }}
      />
      <div className="absolute inset-x-0 bottom-0 flex justify-center p-6">
        <Button variant="secondary" size="lg" onClick={onSkip} data-testid="intro-skip">
          {t("skip")}
        </Button>
      </div>
      <span
        className="hud-chip absolute left-4 top-4"
        style={{ background: "rgba(27,36,26,.7)" }}
      >
        {t("label")}
      </span>
    </div>
  );
}

type Chapter = { key: string; label: string; src: string };

/**
 * Preview the walk (off-site "street view" tour): the Prompt Library stitch
 * order — intro → entrance → C1…Cn approaches → homesite — as hard cuts,
 * one player, tappable chapter strip.
 */
export function PreviewSheet({
  media,
  corners,
  onClose,
  onPlayed,
}: {
  media: WalkMedia;
  corners: WalkCorner[];
  onClose: () => void;
  onPlayed: () => void;
}) {
  const t = useTranslations("preview");
  const tc = useTranslations("common");
  const played = useRef(false);

  const chapters = useMemo<Chapter[]>(() => {
    const list: Chapter[] = [];
    if (media.intro) list.push({ key: "intro", label: t("chapterIntro"), src: media.intro });
    if (media.entrance)
      list.push({ key: "entrance", label: t("chapterEntrance"), src: media.entrance });
    for (const c of corners) {
      const src = media.corners[c.n];
      if (src)
        list.push({ key: `c${c.n}`, label: t("chapterCorner", { n: c.n }), src });
    }
    if (media.homesite)
      list.push({ key: "homesite", label: t("chapterHomesite"), src: media.homesite });
    return list;
  }, [media, corners, t]);

  const [index, setIndex] = useState(0);
  const chapter = chapters[index] ?? null;

  function markPlayed() {
    if (played.current) return;
    played.current = true;
    onPlayed();
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: "var(--bg)" }} data-testid="preview-sheet">
      <header className="row between p-4" style={{ gap: 8 }}>
        <div>
          <h2>{t("title")}</h2>
          <p className="t-small muted">{t("body")}</p>
        </div>
        <button type="button" className="hud-chip" onClick={onClose} aria-label={tc("close")}>
          <X size={18} />
        </button>
      </header>

      {chapter ? (
        <video
          key={chapter.key}
          src={chapter.src}
          autoPlay
          playsInline
          controls
          onPlay={markPlayed}
          onEnded={() => {
            if (index < chapters.length - 1) setIndex(index + 1);
          }}
          className="w-full grow"
          style={{ objectFit: "contain", background: "var(--gw-pine-3, #1B241A)", minHeight: 0 }}
          data-testid="preview-player"
        />
      ) : null}

      <div className="p-4" style={{ overflowX: "auto" }}>
        <p className="t-label" style={{ marginBottom: 6 }}>
          {t("chapters")}
        </p>
        <div className="row" style={{ gap: 8, flexWrap: "nowrap" }}>
          {chapters.map((c, i) => (
            <button
              key={c.key}
              type="button"
              className="hud-chip"
              aria-pressed={i === index}
              style={
                i === index
                  ? { background: "var(--gw-trailhead-green)", color: "var(--gw-pine-shadow)" }
                  : undefined
              }
              onClick={() => setIndex(i)}
              data-testid={`preview-chapter-${c.key}`}
            >
              <Play size={14} aria-hidden /> {c.label}
            </button>
          ))}
        </div>
      </div>

      <div className="p-4 pt-0">
        <Button size="lg" className="btn-block" onClick={onClose} data-testid="preview-go-onsite">
          {t("goOnSite")}
        </Button>
      </div>
    </div>
  );
}

export function hasPreviewMedia(media: WalkMedia): boolean {
  return Boolean(
    media.intro || media.entrance || media.homesite || Object.keys(media.corners).length > 0,
  );
}
