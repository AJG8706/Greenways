import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { i18nText } from "@/lib/i18n/text";
import { ContentForm } from "@/components/admin/content-form";

export default async function ContentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: property }, { data: corners }] = await Promise.all([
    supabase
      .from("properties")
      .select("id, name, es_reviewed, es_reviewed_at, es_reviewed_by, team_users:es_reviewed_by(display_name, email)")
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("corners")
      .select("id, n, name, stake")
      .eq("property_id", id)
      .order("n"),
  ]);
  if (!property) notFound();

  const t = await getTranslations("admin.content");

  return (
    <ContentForm
      propertyId={id}
      name={i18nText(property.name)}
      corners={(corners ?? []).map((c) => ({
        id: c.id,
        n: c.n,
        name: i18nText(c.name),
        stake: i18nText(c.stake),
      }))}
      esReviewed={property.es_reviewed}
      esReviewedBy={
        property.team_users?.display_name ?? property.team_users?.email ?? null
      }
      esReviewedAt={property.es_reviewed_at}
      anthropicConfigured={Boolean(process.env.ANTHROPIC_API_KEY)}
      labels={{
        title: t("title"),
        en: t("en"),
        es: t("es"),
        draftEs: t("draftEs"),
        reviewNote: t("reviewNote"),
        displayName: t("displayName"),
        stake: t("stake"),
      }}
    />
  );
}
