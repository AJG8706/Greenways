import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { StubTab } from "@/components/admin/stub-tab";

export default async function DemoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: scenarios } = await supabase
    .from("demo_scenarios")
    .select("id, name, config")
    .eq("property_id", id);
  if (scenarios === null) notFound();

  const t = await getTranslations("admin.demo");

  return (
    <div className="stack" style={{ gap: "var(--gw-s-4)" }}>
      <StubTab
        phase="Phase 3"
        title={t("title")}
        body={`${t("body")} The simulated walker launches from here once the buyer HUD exists (Phase 3).`}
      />
      {scenarios.length > 0 ? (
        <div className="card">
          <h3>{t("scenario")}s (seeded)</h3>
          <ul className="mt-3 grid gap-2">
            {scenarios.map((s) => (
              <li key={s.id} className="row">
                <span className="pill pill-draft">{s.name}</span>
                <span className="t-small muted num">{JSON.stringify(s.config)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
