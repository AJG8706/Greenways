import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { i18nText } from "@/lib/i18n/text";
import { Pill, statusTone } from "@/components/ui/pill";
import { saleTone } from "@/components/admin/sale-status-select";
import { NewPropertyDialog } from "./new-property-dialog";

export default async function PropertiesPage({
  searchParams,
}: {
  searchParams: Promise<{ welcome?: string }>;
}) {
  const { welcome } = await searchParams;
  const t = await getTranslations("admin.properties");
  const tStatus = await getTranslations("admin.status");
  const tSale = await getTranslations("admin.sale");
  const supabase = await createClient();

  // Code deploys on merge; migrations reach the hosted DB in a separate db-push
  // step. Until migration 20260924100000 lands there, parent_id doesn't exist —
  // fall back to the legacy shape so the console keeps working in the gap.
  const res = await supabase
    .from("properties")
    .select(
      "id, slug, name, county, status, sale_status, demo_mode, test_lot, parent_id, created_at, updated_at, corners(id, locked)",
    )
    .order("updated_at", { ascending: false });
  let properties: NonNullable<typeof res.data>;
  if (res.error) {
    if (!/parent_id/.test(res.error.message)) throw new Error(res.error.message);
    const legacy = await supabase
      .from("properties")
      .select(
        "id, slug, name, county, status, sale_status, demo_mode, test_lot, created_at, updated_at, corners(id, locked)",
      )
      .order("updated_at", { ascending: false });
    if (legacy.error) throw new Error(legacy.error.message);
    properties = legacy.data.map((p) => ({ ...p, parent_id: null }));
  } else {
    properties = res.data;
  }

  // Masters group their lots: lots render indented under the master row, in
  // creation (plat) order. A lot whose master is gone falls back to top level.
  const knownIds = new Set(properties.map((p) => p.id));
  const topLevel = properties.filter((p) => !p.parent_id || !knownIds.has(p.parent_id));
  const lotsByMaster = new Map<string, typeof properties>();
  for (const p of properties) {
    if (p.parent_id && knownIds.has(p.parent_id)) {
      const list = lotsByMaster.get(p.parent_id) ?? [];
      list.push(p);
      lotsByMaster.set(p.parent_id, list);
    }
  }
  for (const list of lotsByMaster.values()) {
    list.sort((a, b) => a.created_at.localeCompare(b.created_at));
  }
  const rows = topLevel.flatMap((p) => [
    { p, isLot: false },
    ...(lotsByMaster.get(p.id) ?? []).map((lot) => ({ p: lot, isLot: true })),
  ]);

  return (
    <div className="stack" style={{ gap: "var(--gw-s-6)" }}>
      {welcome ? (
        <section className="card" data-testid="welcome-card">
          <div className="stack" style={{ gap: "var(--gw-s-2)" }}>
            <h2>{t("welcomeTitle")}</h2>
            <p className="muted">{t("welcomeBody")}</p>
            <p className="t-small muted">{t("welcomeSignIn")}</p>
          </div>
        </section>
      ) : null}
      <div className="row between">
        <h1>{t("title")}</h1>
        <NewPropertyDialog />
      </div>

      {properties.length === 0 ? (
        <div className="card">
          <p className="muted">No properties yet. Import a CAD-verified KML to start.</p>
        </div>
      ) : (
        <div className="table-wrap">
          <table data-testid="properties-table">
            <thead>
              <tr>
                <th>{t("cols.property")}</th>
                <th>{t("cols.county")}</th>
                <th>{t("cols.corners")}</th>
                <th>{t("cols.status")}</th>
                <th>{t("cols.mode")}</th>
                <th>{tSale("label")}</th>
                <th>{t("cols.updated")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ p, isLot }) => {
                const corners = p.corners ?? [];
                const locked = corners.filter((c) => c.locked).length;
                const isMaster = lotsByMaster.has(p.id);
                return (
                  <tr key={p.id} data-lot={isLot ? "true" : undefined}>
                    <td>
                      <span
                        className="row"
                        style={{ gap: 6, paddingLeft: isLot ? "var(--gw-s-5)" : 0 }}
                      >
                        {isLot ? (
                          <span aria-hidden className="muted">
                            ↳
                          </span>
                        ) : null}
                        <Link href={`/admin/properties/${p.id}`} className="t-body-m">
                          {i18nText(p.name).en || p.slug}
                        </Link>
                        {isMaster ? (
                          <Pill tone="draft">{t("master")}</Pill>
                        ) : null}
                      </span>
                    </td>
                    <td>{p.county ?? "—"}</td>
                    <td className="num">
                      {corners.length > 0 ? `${locked}/${corners.length}` : "—"}
                    </td>
                    <td>
                      <Pill tone={statusTone[p.status] ?? "draft"}>
                        {tStatus(p.status)}
                      </Pill>
                    </td>
                    <td>
                      <Pill tone={p.demo_mode ? "working" : "available"}>
                        {p.demo_mode ? t("modeDemo") : t("modeLive")}
                      </Pill>
                      {p.test_lot ? (
                        <Pill tone="draft" className="ml-2">
                          {t("modeTestLot")}
                        </Pill>
                      ) : null}
                    </td>
                    <td>
                      <Pill tone={saleTone[p.sale_status]}>
                        {tSale(
                          p.sale_status === "under_contract"
                            ? "underContract"
                            : p.sale_status,
                        )}
                      </Pill>
                    </td>
                    <td className="num">
                      {new Date(p.updated_at).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      })}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
