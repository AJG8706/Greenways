"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, RefreshCw, Sparkles, X } from "lucide-react";
import {
  approveAsset,
  queueSlot,
  refreshJobs,
  rejectAsset,
  saveMediaBrief,
} from "@/app/admin/(console)/properties/[id]/media/actions";
import type { MediaBrief } from "@/lib/media/prompts";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";

/* ------------------------------------------------------------------ */
/* Generation brief                                                    */
/* ------------------------------------------------------------------ */

export function BriefForm({
  propertyId,
  brief,
  labels,
}: {
  propertyId: string;
  brief: MediaBrief;
  labels: {
    title: string;
    hint: string;
    road: string;
    features: string;
    groundCover: string;
    homesite: string;
    entrance: string;
    save: string;
    saved: string;
  };
}) {
  const [form, setForm] = useState<MediaBrief>(brief);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const fields: { key: keyof MediaBrief; label: string }[] = [
    { key: "road", label: labels.road },
    { key: "features", label: labels.features },
    { key: "groundCover", label: labels.groundCover },
    { key: "homesite", label: labels.homesite },
    { key: "entrance", label: labels.entrance },
  ];

  return (
    <section className="card stack" style={{ gap: "var(--gw-s-3)" }}>
      <div>
        <h3>{labels.title}</h3>
        <p className="t-small muted">{labels.hint}</p>
      </div>
      <div className="stack" style={{ gap: "var(--gw-s-2)" }}>
        {fields.map((f) => (
          <label key={f.key} className="stack" style={{ gap: 4 }}>
            <span className="t-small">{f.label}</span>
            <Input
              value={form[f.key] ?? ""}
              onChange={(e) => {
                setMessage(null);
                setForm((prev) => ({ ...prev, [f.key]: e.target.value }));
              }}
              data-testid={`brief-${f.key}`}
            />
          </label>
        ))}
      </div>
      <div className="row" style={{ gap: 8 }}>
        <Button
          variant="secondary"
          disabled={pending}
          onClick={() => {
            startTransition(async () => {
              const result = await saveMediaBrief(propertyId, form);
              setMessage(result.ok ? labels.saved : (result.message ?? "Save failed"));
            });
          }}
          data-testid="brief-save"
        >
          {labels.save}
        </Button>
        {message ? <span className="t-small muted">{message}</span> : null}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Slot cards                                                          */
/* ------------------------------------------------------------------ */

export type SlotView = {
  key: string;
  label: string;
  state: "missing" | "ready" | "generating" | "review" | "approved" | "failed";
  missing: string[];
  error: string | null;
  hasHistory: boolean;
  canGenerate: boolean;
  needsStyleLock: boolean;
};

const STATE_TONE: Record<SlotView["state"], string> = {
  missing: "pill-sold",
  ready: "pill-contract",
  generating: "pill-contract",
  review: "pill-contract",
  approved: "pill-available",
  failed: "pill-sold",
};

export function SlotCard({
  propertyId,
  view,
  labels,
}: {
  propertyId: string;
  view: SlotView;
  labels: {
    generate: string;
    regenerate: string;
    styleLock: string;
    missing: string;
    states: Record<Exclude<SlotView["state"], never>, string>;
  };
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <div className="card stack" style={{ gap: "var(--gw-s-2)" }} data-testid={`slot-${view.key}`}>
      <div className="row" style={{ justifyContent: "space-between", gap: 8 }}>
        <strong>{view.label}</strong>
        <span className={`pill ${STATE_TONE[view.state]}`} data-testid={`slot-${view.key}-state`}>
          {labels.states[view.state]}
        </span>
      </div>
      {view.missing.length > 0 ? (
        <p className="t-small muted">
          {labels.missing} {view.missing.join(", ")}
        </p>
      ) : null}
      {view.needsStyleLock && view.state !== "approved" ? (
        <p className="t-small muted">{labels.styleLock}</p>
      ) : null}
      {view.error ? (
        <p className="t-small" style={{ color: "var(--error)" }}>
          {view.error}
        </p>
      ) : null}
      <div className="row" style={{ gap: 8 }}>
        <Button
          size="sm"
          variant={view.state === "approved" ? "secondary" : "default"}
          disabled={!view.canGenerate || pending}
          onClick={() => {
            setError(null);
            startTransition(async () => {
              const result = await queueSlot(propertyId, view.key);
              if (!result.ok) setError(result.message ?? "Generation failed");
              else router.refresh();
            });
          }}
          data-testid={`generate-${view.key}`}
        >
          <Sparkles aria-hidden size={14} />
          {view.hasHistory ? labels.regenerate : labels.generate}
        </Button>
        {error ? (
          <span className="t-small" style={{ color: "var(--error)" }}>
            {error}
          </span>
        ) : null}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Jobs watcher — polls the provider while anything is in flight       */
/* ------------------------------------------------------------------ */

export function JobsWatcher({
  propertyId,
  activeJobs,
  label,
}: {
  propertyId: string;
  activeJobs: number;
  label: string;
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const busy = useRef(false);

  function refresh() {
    if (busy.current) return;
    busy.current = true;
    startTransition(async () => {
      await refreshJobs(propertyId);
      router.refresh();
      busy.current = false;
    });
  }

  useEffect(() => {
    if (activeJobs === 0) return;
    const timer = setInterval(refresh, 5000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- interval keyed on job count
  }, [activeJobs, propertyId]);

  return (
    <Button size="sm" variant="ghost" disabled={pending} onClick={refresh} data-testid="refresh-jobs">
      <RefreshCw aria-hidden size={14} className={pending ? "animate-spin" : undefined} />
      {label}
      {activeJobs > 0 ? ` (${activeJobs})` : ""}
    </Button>
  );
}

/* ------------------------------------------------------------------ */
/* Review queue                                                        */
/* ------------------------------------------------------------------ */

export type ReviewItem = {
  id: string;
  slotLabel: string;
  isVideo: boolean;
  assetUrl: string | null;
  sourceUrl: string | null;
};

export function ReviewCard({
  propertyId,
  item,
  labels,
}: {
  propertyId: string;
  item: ReviewItem;
  labels: {
    source: string;
    generated: string;
    approve: string;
    reject: string;
    reasonLabel: string;
    reasons: Record<"structure" | "water" | "terrain" | "motion" | "other", string>;
  };
}) {
  const [reasonKey, setReasonKey] = useState<keyof typeof labels.reasons>("structure");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const mediaBox: React.CSSProperties = {
    width: "100%",
    aspectRatio: "9 / 16",
    maxHeight: 360,
    objectFit: "cover",
    borderRadius: "var(--gw-r-2, 8px)",
    background: "var(--gw-pine-3, #24301F)",
  };

  function decide(action: "approve" | "reject") {
    setError(null);
    startTransition(async () => {
      const result =
        action === "approve"
          ? await approveAsset(propertyId, item.id)
          : await rejectAsset(
              propertyId,
              item.id,
              note.trim() ? `${labels.reasons[reasonKey]} — ${note.trim()}` : labels.reasons[reasonKey],
            );
      if (!result.ok) setError(result.message ?? "Review failed");
      else router.refresh();
    });
  }

  return (
    <div className="card stack" style={{ gap: "var(--gw-s-3)" }} data-testid={`review-${item.id}`}>
      <strong>{item.slotLabel}</strong>
      <div className="row" style={{ gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div className="stack" style={{ gap: 4, flex: "1 1 200px", minWidth: 160 }}>
          <span className="t-small muted">{labels.source}</span>
          {item.sourceUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- signed URL, short-lived
            <img src={item.sourceUrl} alt={labels.source} style={mediaBox} />
          ) : (
            <div style={mediaBox} />
          )}
        </div>
        <div className="stack" style={{ gap: 4, flex: "1 1 200px", minWidth: 160 }}>
          <span className="t-small muted">{labels.generated}</span>
          {item.assetUrl && item.isVideo ? (
            <video src={item.assetUrl} controls playsInline style={mediaBox} />
          ) : item.assetUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- signed URL, short-lived
            <img src={item.assetUrl} alt={labels.generated} style={mediaBox} />
          ) : (
            <div style={mediaBox} />
          )}
        </div>
      </div>
      <div className="row" style={{ gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
        <Button
          disabled={pending}
          onClick={() => decide("approve")}
          data-testid={`approve-${item.id}`}
        >
          <Check aria-hidden size={14} />
          {labels.approve}
        </Button>
        <label className="stack" style={{ gap: 4 }}>
          <span className="t-small">{labels.reasonLabel}</span>
          <Select
            value={reasonKey}
            onChange={(e) => setReasonKey(e.target.value as keyof typeof labels.reasons)}
            style={{ width: "auto", minHeight: 36 }}
            data-testid={`reject-reason-${item.id}`}
          >
            {(Object.keys(labels.reasons) as (keyof typeof labels.reasons)[]).map((k) => (
              <option key={k} value={k}>
                {labels.reasons[k]}
              </option>
            ))}
          </Select>
        </label>
        <Textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={1}
          placeholder="…"
          style={{ flex: "1 1 160px", minHeight: 36 }}
          data-testid={`reject-note-${item.id}`}
        />
        <Button
          variant="secondary"
          disabled={pending}
          onClick={() => decide("reject")}
          data-testid={`reject-${item.id}`}
        >
          <X aria-hidden size={14} />
          {labels.reject}
        </Button>
      </div>
      {error ? (
        <p className="t-small" style={{ color: "var(--error)" }}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
