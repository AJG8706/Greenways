import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { i18nText } from "@/lib/i18n/text";
import { assemblyStages } from "@/lib/assembly";
import { DeletePropertyButton } from "@/components/admin/delete-property-button";
import { DocumentsCard, type PropertyDocument } from "@/components/admin/documents-card";
import { SubdivisionImportCard } from "@/components/admin/subdivision-import-card";
import { Pill, statusTone } from "@/components/ui/pill";

// Overview tab: the assemble checklist, computed from real data.
export default async function OverviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [propertyRes, { data: lots }, { data: corners }, { data: media }, userRes] =
    await Promise.all([
      supabase
        .from("properties")
        .select(
          "id, boundary, geometry_source, status, es_reviewed, published_at, name, media_brief, test_lot, parent_id",
        )
        .eq("id", id)
        .maybeSingle(),
      // Errors (e.g. parent_id not migrated on the hosted DB yet) leave lots
      // null, which renders as "no lots" — the safe degradation.
      supabase
        .from("properties")
        .select(
          "id, slug, name, acres, status, es_reviewed, media_brief, corners(n, locked, approach_photo, stake_photo), media_assets(slot, type, status)",
        )
        .eq("parent_id", id)
        .order("created_at"),
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
  // Same deploy-before-db-push gap as the list page: retry without parent_id.
  let property = propertyRes.data;
  if (!property && propertyRes.error && /parent_id/.test(propertyRes.error.message)) {
    const legacy = await supabase
      .from("properties")
      .select(
        "id, boundary, geometry_source, status, es_reviewed, published_at, name, media_brief, test_lot",
      )
      .eq("id", id)
      .maybeSingle();
    property = legacy.data ? { ...legacy.data, parent_id: null } : null;
  }
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

  // Master/lot hierarchy: a master's Overview shows its lots instead of the
  // assembly checklist — assembly happens per lot.
  const lotRows = (lots ?? []).map((lot) => {
    const lotCorners = lot.corners ?? [];
    const lotMedia = lot.media_assets ?? [];
    const { next: lotNext } = assemblyStages({
      corners: lotCorners.map((c) => ({
        n: c.n,
        locked: c.locked,
        approachPhoto: Boolean(c.approach_photo),
        stakePhoto: Boolean(c.stake_photo),
      })),
      captureSlots: lotMedia.filter((m) => m.type === "capture").map((m) => m.slot),
      briefSaved: lot.media_brief !== null && Object.keys(lot.media_brief as object).length > 0,
      approvedGeneratedSlots: lotMedia
        .filter((m) => m.type !== "capture" && m.status === "approved")
        .map((m) => m.slot),
      esReviewed: lot.es_reviewed,
      published: lot.status === "published",
    });
    return {
      id: lot.id,
      name: i18nText(lot.name).en || lot.slug,
      acres: lot.acres,
      status: lot.status,
      next: lotNext,
    };
  });
  const isMaster = lotRows.length > 0;

  const parent = property.parent_id
    ? (
        await supabase
          .from("properties")
          .select("id, name, slug")
          .eq("id", property.parent_id)
          .maybeSingle()
      ).data
    : null;

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      {parent ? (
        <p className="t-small muted lg:col-span-2" data-testid="lot-breadcrumb">
          Part of{" "}
          <Link href={`/admin/properties/${parent.id}`}>
            {i18nText(parent.name).en || parent.slug}
          </Link>
        </p>
      ) : null}
      {isMaster ? (
        <section className="card lg:col-span-2" data-testid="lots-card">
          <div className="stack">
            <h2>Lots</h2>
            <p className="t-small muted">
              This is a master tract — each lot below is its own property and walks through
              assembly individually.
            </p>
            <div className="table-wrap">
              <table data-testid="lots-table">
                <thead>
                  <tr>
                    <th>Lot</th>
                    <th>Acres</th>
                    <th>Status</th>
                    <th>Next step</th>
                  </tr>
                </thead>
                <tbody>
                  {lotRows.map((lot) => (
                    <tr key={lot.id}>
                      <td>
                        <Link href={`/admin/properties/${lot.id}`} className="t-body-m">
                          {lot.name}
                        </Link>
                      </td>
                      <td className="num">{lot.acres ?? "—"}</td>
                      <td>
                        <Pill tone={statusTone[lot.status] ?? "draft"}>{t(`status.${lot.status}`)}</Pill>
                      </td>
                      <td className="t-small muted">
                        {lot.next ? stageMeta[lot.next].label : "Walk is live"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      ) : null}
      {!isMaster ? (
      <>
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
      </>
      ) : null}
      {!isMaster && !property.parent_id && !property.test_lot ? (
        <div className="lg:col-span-2">
          <SubdivisionImportCard
            propertyId={id}
            labels={{
              title: t("subdivision.title"),
              hint: t("subdivision.hint"),
              upload: t("subdivision.upload"),
              uploading: t("subdivision.uploading"),
              badType: t("subdivision.badType"),
            }}
          />
        </div>
      ) : null}
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
