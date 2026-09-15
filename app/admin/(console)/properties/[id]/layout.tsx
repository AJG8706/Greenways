import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { i18nText } from "@/lib/i18n/text";
import { Pill, statusTone } from "@/components/ui/pill";
import { PropertyTabs } from "@/components/admin/property-tabs";

export default async function PropertyLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: property } = await supabase
    .from("properties")
    .select("id, slug, name, address, county, acres, status")
    .eq("id", id)
    .maybeSingle();
  if (!property) notFound();

  const t = await getTranslations("admin");
  const name = i18nText(property.name).en || property.slug;

  return (
    <div className="stack" style={{ gap: "var(--gw-s-5)" }}>
      <nav className="t-small">
        <Link href="/admin/properties">{t("properties.title")}</Link>
        <span className="muted"> › {name}</span>
      </nav>
      <div className="row between">
        <div className="stack" style={{ gap: "var(--gw-s-2)" }}>
          <h1 data-testid="property-title">{name}</h1>
          <div className="row t-small muted">
            {property.address ? <span>{property.address}</span> : null}
            {property.county ? <span>· {property.county} County</span> : null}
            {property.acres ? <span>· {Number(property.acres)} ac</span> : null}
            <Pill tone={statusTone[property.status] ?? "draft"}>
              {t(`status.${property.status}`)}
            </Pill>
          </div>
        </div>
      </div>
      <PropertyTabs
        propertyId={property.id}
        labels={{
          overview: t("tabs.overview"),
          corners: t("tabs.corners"),
          photos: t("tabs.photos"),
          content: t("tabs.content"),
          media: t("tabs.media"),
          publish: t("tabs.publish"),
          analytics: t("tabs.analytics"),
          demo: t("tabs.demo"),
        }}
      />
      <div>{children}</div>
    </div>
  );
}
