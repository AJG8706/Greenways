import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { isMockProvider } from "@/lib/media/provider";
import type { MediaBrief } from "@/lib/media/prompts";
import { canGenerateSlot, mediaSlotsFor, styleLocked } from "@/lib/media/slots";
import {
  BriefForm,
  ConnectionTest,
  JobsWatcher,
  ReviewCard,
  SlotCard,
  type ReviewItem,
  type SlotView,
} from "@/components/admin/media-console";

export default async function MediaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: property }, { data: corners }, { data: assets }, { data: jobs }] =
    await Promise.all([
      supabase
        .from("properties")
        .select("id, media_brief")
        .eq("id", id)
        .maybeSingle(),
      supabase
        .from("corners")
        .select("n, approach_photo, stake_photo")
        .eq("property_id", id)
        .order("n"),
      supabase
        .from("media_assets")
        .select("id, slot, type, status, storage_path, source_photo, reject_reason, created_at")
        .eq("property_id", id)
        .order("created_at", { ascending: false }),
      supabase
        .from("generation_jobs")
        .select("id, slot, status, error, created_at")
        .eq("property_id", id)
        .order("created_at", { ascending: false })
        .limit(40),
    ]);
  if (!property) notFound();

  const t = await getTranslations("admin.media");
  const tCommon = await getTranslations("common");

  const captures = (assets ?? []).filter((a) => a.type === "capture");
  const generatedAssets = (assets ?? []).filter((a) => a.type !== "capture");
  const captureBySlot = new Map(captures.map((c) => [c.slot, c.storage_path]));
  const cornerByN = new Map((corners ?? []).map((c) => [c.n, c]));

  const slots = mediaSlotsFor((corners ?? []).map((c) => c.n));
  const approved = new Set(
    generatedAssets.filter((a) => a.status === "approved").map((a) => a.slot),
  );
  const locked = styleLocked(approved);

  const slotLabel = (slot: (typeof slots)[number]) =>
    slot.kind === "corner_approach"
      ? `${tCommon("cornerShort", { n: slot.cornerN! })} · ${t("slots.cornerApproach")}`
      : t(`slots.${slot.kind}`);

  const views: SlotView[] = slots.map((slot) => {
    const missing: string[] = [];
    if (slot.kind === "corner_approach") {
      const c = cornerByN.get(slot.cornerN!);
      if (!c?.approach_photo) missing.push(t("sources.approach"));
      if (!c?.stake_photo) missing.push(t("sources.stake"));
    } else {
      const wanted =
        slot.kind === "intro" ? ["aerial", "gate"] : slot.kind === "entrance" ? ["gate"] : ["homesite"];
      for (const w of wanted) if (!captureBySlot.has(w)) missing.push(t(`sources.${w}`));
    }

    const activeJob = (jobs ?? []).find(
      (j) => j.slot === slot.key && ["queued", "in_progress", "completed"].includes(j.status),
    );
    const failedJob = (jobs ?? []).find(
      (j) => j.slot === slot.key && ["failed", "nsfw"].includes(j.status),
    );
    const slotAssets = generatedAssets.filter((a) => a.slot === slot.key);
    const inReview = slotAssets.some((a) => a.status === "generated");
    const isApproved = approved.has(slot.key);

    return {
      key: slot.key,
      label: slotLabel(slot),
      state: activeJob
        ? "generating"
        : inReview
          ? "review"
          : isApproved
            ? "approved"
            : failedJob
              ? "failed"
              : missing.length > 0
                ? "missing"
                : "ready",
      missing,
      error: !activeJob && !inReview && !isApproved ? (failedJob?.error ?? null) : null,
      hasHistory: slotAssets.length > 0,
      canGenerate:
        missing.length === 0 && !activeJob && canGenerateSlot(slot, approved) && !inReview,
      needsStyleLock:
        slot.kind !== "intro" && slot.kind !== "entrance" && !locked,
    };
  });

  // Review queue: generated assets beside their source photos, signed.
  const pending = generatedAssets.filter((a) => a.status === "generated");
  const signPaths = [
    ...new Set(
      pending.flatMap((a) => [a.storage_path, ...(a.source_photo ? [a.source_photo] : [])]),
    ),
  ];
  const signedByPath = new Map<string, string>();
  if (signPaths.length > 0) {
    const { data: signed } = await supabase.storage
      .from("property-photos")
      .createSignedUrls(signPaths, 60 * 60);
    for (const s of signed ?? []) {
      if (s.signedUrl && s.path) signedByPath.set(s.path, s.signedUrl);
    }
  }
  const slotByKey = new Map(slots.map((s) => [s.key, s]));
  const reviewItems: ReviewItem[] = pending.map((a) => ({
    id: a.id,
    slotLabel: slotByKey.has(a.slot) ? slotLabel(slotByKey.get(a.slot)!) : a.slot,
    isVideo: a.type === "video",
    assetUrl: signedByPath.get(a.storage_path) ?? null,
    sourceUrl: a.source_photo ? (signedByPath.get(a.source_photo) ?? null) : null,
  }));

  const activeJobCount = (jobs ?? []).filter((j) =>
    ["queued", "in_progress", "completed"].includes(j.status),
  ).length;

  return (
    <div className="stack" style={{ gap: "var(--gw-s-5)" }}>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
        <h2>{t("title")}</h2>
        <JobsWatcher
          propertyId={id}
          activeJobs={activeJobCount}
          label={t("refresh")}
        />
      </div>
      <p className="muted">{t("realityRule")}</p>
      <ConnectionTest label={t("testConnection")} />
      {isMockProvider() ? (
        <div className="banner-warn" data-testid="mock-banner">
          {t("mockNotice")}
        </div>
      ) : null}

      <BriefForm
        propertyId={id}
        brief={(property.media_brief ?? {}) as MediaBrief}
        labels={{
          title: t("brief.title"),
          hint: t("brief.hint"),
          road: t("brief.road"),
          features: t("brief.features"),
          groundCover: t("brief.groundCover"),
          homesite: t("brief.homesite"),
          entrance: t("brief.entrance"),
          save: t("brief.save"),
          saved: t("brief.saved"),
        }}
      />

      <section className="stack" style={{ gap: "var(--gw-s-3)" }}>
        <h3>{t("queue")}</h3>
        {(corners ?? []).length === 0 ? (
          <div className="card">
            <p className="muted">{t("noCorners")}</p>
          </div>
        ) : (
          <div
            data-testid="media-slots"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
              gap: "var(--gw-s-3)",
            }}
          >
            {views.map((v) => (
              <SlotCard
                key={v.key}
                propertyId={id}
                view={v}
                labels={{
                  generate: t("generateOne"),
                  regenerate: t("regenerate"),
                  styleLock: t("styleLock"),
                  missing: t("missingPrefix"),
                  states: {
                    missing: t("status.missing"),
                    ready: t("status.ready"),
                    generating: t("status.generating"),
                    review: t("status.review"),
                    approved: t("status.approved"),
                    failed: t("status.failed"),
                  },
                }}
              />
            ))}
          </div>
        )}
      </section>

      <section className="stack" style={{ gap: "var(--gw-s-3)" }}>
        <h3>{t("review")}</h3>
        {reviewItems.length === 0 ? (
          <div className="card">
            <p className="muted" data-testid="review-empty">
              {t("emptyReview")}
            </p>
          </div>
        ) : (
          reviewItems.map((item) => (
            <ReviewCard
              key={item.id}
              propertyId={id}
              item={item}
              labels={{
                source: t("source"),
                generated: t("generated"),
                approve: t("approve"),
                reject: t("rejectSubmit"),
                reasonLabel: t("rejectReason"),
                reasons: {
                  structure: t("reasons.structure"),
                  water: t("reasons.water"),
                  terrain: t("reasons.terrain"),
                  motion: t("reasons.motion"),
                  other: t("reasons.other"),
                },
              }}
            />
          ))
        )}
      </section>
    </div>
  );
}
