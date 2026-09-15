import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { i18nText } from "@/lib/i18n/text";
import { PHOTO_SLOTS_PER_CORNER, PROPERTY_PHOTO_SLOTS } from "@/lib/photos";

// Overview tab: the assemble checklist, computed from real data.
export default async function OverviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: property }, { data: corners }, { data: captures }] =
    await Promise.all([
      supabase
        .from("properties")
        .select("id, boundary, geometry_source, status, es_reviewed, published_at, name")
        .eq("id", id)
        .maybeSingle(),
      supabase
        .from("corners")
        .select("id, n, locked, approach_photo, stake_photo, stake")
        .eq("property_id", id)
        .order("n"),
      supabase
        .from("media_assets")
        .select("slot")
        .eq("property_id", id)
        .eq("type", "capture"),
    ]);
  if (!property) notFound();

  const t = await getTranslations("admin");
  const cornerList = corners ?? [];
  const captureSlots = new Set((captures ?? []).map((m) => m.slot));

  const kmlDone = property.boundary !== null;
  const cornersLocked = cornerList.length > 0 && cornerList.every((c) => c.locked);
  const totalPhotos =
    cornerList.length * PHOTO_SLOTS_PER_CORNER.length + PROPERTY_PHOTO_SLOTS.length;
  const havePhotos =
    cornerList.reduce(
      (sum, c) => sum + (c.approach_photo ? 1 : 0) + (c.stake_photo ? 1 : 0),
      0,
    ) + captureSlots.size;
  const contentDone =
    cornerList.length > 0 &&
    cornerList.every((c) => i18nText(c.stake).en && i18nText(c.stake).es) &&
    Boolean(i18nText(property.name).es);
  const esReviewed = property.es_reviewed;

  const items: { key: string; label: string; detail: string; state: "done" | "open" | "later" }[] = [
    {
      key: "kml",
      label: "KML imported",
      detail: property.geometry_source ?? "Import the CAD-verified KML on the Corners tab",
      state: kmlDone ? "done" : "open",
    },
    {
      key: "corners",
      label: "Corners verified and locked",
      detail:
        cornerList.length > 0
          ? `${cornerList.length} corners, ${t("corners.order").toLowerCase()}`
          : "Corners appear after KML import",
      state: cornersLocked ? "done" : "open",
    },
    {
      key: "photos",
      label: t("photos.title"),
      detail: `${havePhotos} of ${totalPhotos || "—"}`,
      state: totalPhotos > 0 && havePhotos >= totalPhotos ? "done" : "open",
    },
    {
      key: "content",
      label: "Buyer text in English and Spanish",
      detail: esReviewed
        ? "Spanish reviewed by a person"
        : contentDone
          ? "Spanish drafted — needs a person's review before publish"
          : "Fill the paired EN/ES fields on the Content tab",
      state: contentDone && esReviewed ? "done" : "open",
    },
    {
      key: "media",
      label: t("tabs.media"),
      detail: "Higgsfield generation arrives in Phase 4",
      state: "later",
    },
    {
      key: "publish",
      label: t("publish.title"),
      detail:
        property.status === "published"
          ? `Published ${property.published_at ? new Date(property.published_at).toLocaleDateString() : ""}`
          : "Publish + links + QR arrive in Phase 5",
      state: property.status === "published" ? "done" : "later",
    },
  ];

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <section className="card">
        <div className="stack">
          <h2>Assemble status</h2>
          <ul className="stack" style={{ gap: "var(--gw-s-4)" }}>
            {items.map((item) => (
              <li key={item.key} className="row" style={{ alignItems: "flex-start" }}>
                <span
                  className={`pill ${
                    item.state === "done"
                      ? "pill-live"
                      : item.state === "open"
                        ? "pill-working"
                        : "pill-draft"
                  }`}
                >
                  {item.state === "done" ? "Done" : item.state === "open" ? "Open" : "Later"}
                </span>
                <div className="grow">
                  <p className="t-body-m">{item.label}</p>
                  <p className="t-small muted">{item.detail}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>
      <section className="card">
        <div className="stack">
          <h2>Next step</h2>
          <p className="muted">
            {!kmlDone
              ? "Import the CAD-verified KML on the Corners tab."
              : !cornersLocked
                ? "Verify corner positions against the survey, then lock them."
                : havePhotos < totalPhotos
                  ? "Capture and upload the protocol photos."
                  : !esReviewed
                    ? "Have a person review the Spanish text on the Content tab."
                    : "Ready for Phase 4 media generation."}
          </p>
          <Link href={`/admin/properties/${id}/corners`} className="t-body-m">
            {t("tabs.corners")} →
          </Link>
        </div>
      </section>
    </div>
  );
}
