import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { i18nText } from "@/lib/i18n/text";
import { assemblyStages } from "@/lib/assembly";
import { DeletePropertyButton } from "@/components/admin/delete-property-button";
import { DocumentsCard, type PropertyDocument } from "@/components/admin/documents-card";

// Overview tab: the assemble checklist, computed from real data.
export default async function OverviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: property }, { data: corners }, { data: media }, userRes] =
    await Promise.all([
      supabase
        .from("properties")
        .select(
          "id, boundary, geometry_source, status, es_reviewed, published_at, name, media_brief, test_lot",
        )
        .eq("id", id)
        .maybeSingle(),
      supabase
        .from("corners")
        .select("id, n, locked, approach_photo, stake_photo, stake")
        .eq("property_id", id)
        .order("n"),
      supabase
        .from("media_assets")
        .select("slot, type, status")
        .eq("property_id", id),
      supabase.auth.getUser(),
    ]);
  if (!property) notFound();

  const { data: me } = await supabase
    .from("team_users")
    .select("role")
    .eq("user_id", userRes.data.user?.id ?? "")
    .maybeSingle();

  const t = await getTranslations("admin");

  // Property documents (KML/PDF) live in storage under {id}/documents/.
  const { data: docObjects } = await supabase.storage
    .from("property-photos")
    .list(`${id}/documents`, { limit: 100, sortBy: { column: "name", order: "asc" } });
  const docPaths = (docObjects ?? [])
    .filter((o) => o.name && !o.name.startsWith("."))
    .map((o) => ({
      name: o.name,
      sizeKb: o.metadata?.size ? Math.round(Number(o.metadata.size) / 1024) : null,
    }));
  const docSigned = new Map<string, string>();
  if (docPaths.length > 0) {
    const { data: signed } = await supabase.storage
      .from("property-photos")
      .createSignedUrls(docPaths.map((d) => `${id}/documents/${d.name}`), 60 * 60);
    for (const sgn of signed ?? []) {
      if (sgn.signedUrl && sgn.path) docSigned.set(sgn.path, sgn.signedUrl);
    }
  }
  const documents: PropertyDocument[] = docPaths.map((d) => ({
    name: d.name,
    path: `${id}/documents/${d.name}`,
    signedUrl: docSigned.get(`${id}/documents/${d.name}`) ?? null,
    sizeKb: d.sizeKb,
  }));
  const cornerList = corners ?? [];
  const mediaRows = media ?? [];

  const { stages, next } = assemblyStages({
    corners: cornerList.map((c) => ({
      n: c.n,
      locked: c.locked,
      approachPhoto: Boolean(c.approach_photo),
      stakePhoto: Boolean(c.stake_photo),
    })),
    captureSlots: mediaRows.filter((m) => m.type === "capture").map((m) => m.slot),
    briefSaved:
      property.media_brief !== null && Object.keys(property.media_brief as object).length > 0,
    approvedGeneratedSlots: mediaRows
      .filter((m) => m.type !== "capture" && m.status === "approved")
      .map((m) => m.slot),
    esReviewed: property.es_reviewed,
    published: property.status === "published",
  });

  // Where each stage gets done, and what to tell the person standing at it.
  const stageMeta: Record<
    (typeof stages)[number]["key"],
    { label: string; tab: string; todo: string }
  > = {
    geometry: {
      label: "KML imported",
      tab: "corners",
      todo: property.geometry_source
        ? "Re-import the CAD-verified KML on the Corners tab."
        : "Import the CAD-verified KML (or attach it when creating the property).",
    },
    verify: {
      label: "Corners verified and locked",
      tab: "corners",
      todo: "Check each corner against the survey on the map, then lock (CAD-verified).",
    },
    photos: {
      label: "Protocol photos",
      tab: "photos",
      todo: "Upload the capture-protocol photos: aerial, gate, homesite, and each corner's approach + stake.",
    },
    brief: {
      label: "Generation brief",
      tab: "media",
      todo: "Fill and save the generation brief on the Media tab (road, terrain, season).",
    },
    style: {
      label: "Intro + entrance approved (style lock)",
      tab: "media",
      todo: "Generate the intro and entrance, then review and approve both to open the style lock.",
    },
    batch: {
      label: "Corner + homesite clips approved",
      tab: "media",
      todo: "One click: Generate remaining on the Media tab, then review each clip against its source photos.",
    },
    spanish: {
      label: "Spanish reviewed by a person",
      tab: "content",
      todo: "Draft-translate on the Content tab, then have a person review and mark it.",
    },
    publish: {
      label: "Published — link, QR, walk pack",
      tab: "publish",
      todo: "Publish on the Publish tab; the public link, QR and SMS snippets are generated there.",
    },
  };

  const nextMeta = next ? stageMeta[next] : null;

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <section className="card" data-testid="assembly-checklist">
        <div className="stack">
          <h2>Assembly</h2>
          {property.test_lot ? (
            <p className="t-small muted">
              Test lot: GPS field testing only — it can never publish, so the pipeline ends at
              locked corners.
            </p>
          ) : null}
          <ul className="stack" style={{ gap: "var(--gw-s-4)" }}>
            {stages.map((stage) => (
              <li key={stage.key} className="row" style={{ alignItems: "flex-start" }}>
                <span
                  className={`pill ${
                    stage.done ? "pill-live" : stage.key === next ? "pill-working" : "pill-draft"
                  }`}
                  data-testid={`stage-${stage.key}`}
                >
                  {stage.done ? "Done" : stage.key === next ? "Next" : "Later"}
                </span>
                <div className="grow">
                  <Link
                    href={`/admin/properties/${id}/${stageMeta[stage.key].tab}`}
                    className="t-body-m"
                  >
                    {stageMeta[stage.key].label}
                  </Link>
                  {stage.detail ? <p className="t-small muted">{stage.detail}</p> : null}
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>
      <section className="card">
        <div className="stack">
          <h2>Next step</h2>
          <p className="muted" data-testid="next-step">
            {nextMeta ? nextMeta.todo : "Walk is live. Share the link or QR from the Publish tab."}
          </p>
          <Link
            href={`/admin/properties/${id}/${nextMeta ? nextMeta.tab : "publish"}`}
            className="t-body-m"
            data-testid="next-step-link"
          >
            {nextMeta ? stageMeta[next!].label : t("publish.title")} →
          </Link>
        </div>
      </section>
      <div className="lg:col-span-2">
        <DocumentsCard
          propertyId={id}
          documents={documents}
          labels={{
            title: t("documents.title"),
            hint: t("documents.hint"),
            upload: t("documents.upload"),
            uploading: t("documents.uploading"),
            remove: t("documents.remove"),
            removeConfirm: t("documents.removeConfirm"),
            empty: t("documents.empty"),
            badType: t("documents.badType"),
          }}
        />
      </div>
      {me?.role === "admin" ? (
        <section className="card lg:col-span-2" style={{ borderColor: "var(--error)" }}>
          <div className="row between">
            <div>
              <h3>Danger zone</h3>
              <p className="t-small muted">
                Deletes the property with its corners, photos, content and links.
                Admin only; audit-logged.
              </p>
            </div>
            <DeletePropertyButton
              propertyId={id}
              propertyName={i18nText(property.name).en || "this property"}
            />
          </div>
        </section>
      ) : null}
    </div>
  );
}
