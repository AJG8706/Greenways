import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { i18nText } from "@/lib/i18n/text";
import { Pill, statusTone } from "@/components/ui/pill";
import { saleTone } from "@/components/admin/sale-status-select";
import { NewPropertyDialog } from "./new-property-dialog";

export default async function PropertiesPage() {
  const t = await getTranslations("admin.properties");
  const tStatus = await getTranslations("admin.status");
  const tSale = await getTranslations("admin.sale");
  const supabase = await createClient();

  const { data: properties, error } = await supabase
    .from("properties")
    .select(
      "id, slug, name, county, status, sale_status, demo_mode, test_lot, updated_at, corners(id, locked)",
    )
    .order("updated_at", { ascending: false });

  if (error) throw new Error(error.message);

  return (
    <div className="stack" style={{ gap: "var(--gw-s-6)" }}>
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
              {properties.map((p) => {
                const corners = p.corners ?? [];
                const locked = corners.filter((c) => c.locked).length;
                return (
                  <tr key={p.id}>
                    <td>
                      <Link href={`/admin/properties/${p.id}`} className="t-body-m">
                        {i18nText(p.name).en || p.slug}
                      </Link>
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
