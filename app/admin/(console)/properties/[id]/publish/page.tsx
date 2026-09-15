import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { StubTab } from "@/components/admin/stub-tab";

export default async function PublishPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: property } = await supabase
    .from("properties")
    .select("es_reviewed")
    .eq("id", id)
    .maybeSingle();
  if (!property) notFound();

  const t = await getTranslations("admin.publish");

  return (
    <div className="stack" style={{ gap: "var(--gw-s-4)" }}>
      {!property.es_reviewed ? (
        <div className="banner banner-warn" role="status" data-testid="publish-blocked">
          Publish is blocked: the Spanish text has not been reviewed by a person
          (Content tab).
        </div>
      ) : null}
      <StubTab
        phase="Phase 5"
        title={t("title")}
        body="Public link + QR, per-prospect tokenized links from the GHL booking, and the walk-pack SMS land in Phase 5."
      />
    </div>
  );
}
