import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { i18nText } from "@/lib/i18n/text";
import { PROPERTY_PHOTO_SLOTS } from "@/lib/photos";
import { PhotoChecklist, type PhotoItem } from "@/components/admin/photo-checklist";
import { BulkPhotoIntake, type IntakeLot } from "@/components/admin/bulk-photo-intake";

export default async function PhotosPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: property }, { data: corners }, { data: captures }] =
    await Promise.all([
      supabase.from("properties").select("id").eq("id", id).maybeSingle(),
      supabase
        .from("corners")
        .select("id, n, approach_photo, stake_photo")
        .eq("property_id", id)
        .order("n"),
      supabase
        .from("media_assets")
        .select("slot, storage_path")
        .eq("property_id", id)
        .eq("type", "capture"),
    ]);
  if (!property) notFound();

  // Master tract: one intake screen routes a whole field session's photos
  // to the right lot + slot instead of ten separate upload sessions.
  const { data: children } = await supabase
    .from("properties")
    .select("id, slug, name, corners(id, n)")
    .eq("parent_id", id)
    .order("created_at");
  if ((children ?? []).length > 0) {
    const lots: IntakeLot[] = children!.map((lot, i) => ({
      id: lot.id,
      n: i + 1,
      label: i18nText(lot.name).en || lot.slug,
      corners: (lot.corners ?? [])
        .map((c) => ({ id: c.id, n: c.n }))
        .sort((a, b) => a.n - b.n),
    }));
    return (
      <div className="stack" style={{ gap: "var(--gw-s-5)" }}>
        <h2>Photos — all lots</h2>
        <BulkPhotoIntake lots={lots} />
      </div>
    );
  }

  const t = await getTranslations("admin.photos");
  const tCommon = await getTranslations("common");
  const captureBySlot = new Map((captures ?? []).map((m) => [m.slot, m.storage_path]));

  const items: PhotoItem[] = [];
  for (const c of corners ?? []) {
    items.push({
      key: `c${c.n}-approach`,
      label: `${tCommon("cornerShort", { n: c.n })} · ${t("approach")}`,
      kind: "corner",
      cornerId: c.id,
      cornerN: c.n,
      slot: "approach",
      path: c.approach_photo,
    });
    items.push({
      key: `c${c.n}-stake`,
      label: `${tCommon("cornerShort", { n: c.n })} · ${t("stake")}`,
      kind: "corner",
      cornerId: c.id,
      cornerN: c.n,
      slot: "stake",
      path: c.stake_photo,
    });
  }
  for (const slot of PROPERTY_PHOTO_SLOTS) {
    items.push({
      key: slot,
      label: t(slot === "entrance360" ? "entrance360" : slot),
      kind: "property",
      slot,
      path: captureBySlot.get(slot) ?? null,
    });
  }

  return (
    <div className="stack" style={{ gap: "var(--gw-s-5)" }}>
      <h2>{t("title")}</h2>
      {items.length === 0 ? (
        <div className="card">
          <p className="muted">Import the KML first — the checklist follows the corners.</p>
        </div>
      ) : (
        <PhotoChecklist
          propertyId={id}
          items={items}
          labels={{ upload: t("upload"), missing: t("missing"), ready: t("ready") }}
        />
      )}
    </div>
  );
}
