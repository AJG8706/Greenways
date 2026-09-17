import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ExternalLink } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { DemoModeToggle } from "@/components/admin/demo-mode-toggle";
import { SCENARIOS } from "@/lib/hud/walker";

/**
 * Demo & QA launcher (locked decision): runs the real buyer walk with the
 * simulated walker through the same code path as the field walk.
 *
 * Demo is per-property and off by default. With it off the walk is live device
 * GPS only and `?demo=` on the link does nothing — that is the mode a field
 * GPS test runs in, and the mode every real listing should stay in.
 */
export default async function DemoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: property }, { data: corners }] = await Promise.all([
    supabase
      .from("properties")
      .select("id, slug, demo_mode, test_lot")
      .eq("id", id)
      .maybeSingle(),
    supabase.from("corners").select("id, locked").eq("property_id", id),
  ]);
  if (!property) notFound();

  const t = await getTranslations("admin.demo");
  const ready = (corners ?? []).length >= 3 && (corners ?? []).every((c) => c.locked);
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "";

  const scenarioMeta: { key: keyof typeof SCENARIOS; label: string }[] = [
    { key: "clean", label: t("scenarios.clean") },
    { key: "noisy", label: t("scenarios.noisy") },
    { key: "compass", label: t("scenarios.compass") },
    { key: "boundary", label: t("scenarios.boundary") },
  ];

  return (
    <div className="stack" style={{ gap: "var(--gw-s-5)" }}>
      <div>
        <h2>{t("title")}</h2>
        <p className="muted">{t("body")}</p>
      </div>

      <section className="card">
        <DemoModeToggle
          propertyId={property.id}
          value={property.demo_mode}
          labels={{
            on: t("modeOn"),
            off: t("modeOff"),
            hint: property.test_lot ? t("modeHintTestLot") : t("modeHint"),
          }}
        />
      </section>

      {!ready ? (
        <div className="banner banner-warn" role="status">
          The walk serves only CAD-verified, locked corners (guardrail #2).
          Import and lock the corners first.
        </div>
      ) : !property.demo_mode ? (
        <div className="stack" style={{ gap: "var(--gw-s-3)" }}>
          <div className="banner" role="status" data-testid="live-gps-banner">
            {t("liveOnly")}
          </div>
          <section className="card">
            <div className="stack" style={{ gap: "var(--gw-s-3)" }}>
              <h3>{t("liveWalkTitle")}</h3>
              <p className="t-small muted">{t("liveWalkBody")}</p>
              <p className="t-small num">
                {site}/walk/{property.slug}
              </p>
              <Button asChild variant="secondary" data-testid="launch-live-walk">
                <a href={`/walk/${property.slug}`} target="_blank" rel="noopener">
                  <ExternalLink size={16} /> {t("openLiveWalk")}
                </a>
              </Button>
            </div>
          </section>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {scenarioMeta.map((s) => {
            const scenario = SCENARIOS[s.key]!;
            return (
              <section className="card" key={s.key}>
                <div className="stack" style={{ gap: "var(--gw-s-3)" }}>
                  <h3>{s.label}</h3>
                  <p className="t-small muted num">
                    {t("speed")}: {scenario.speedFtS} ft/s · {t("noise")}: σ{" "}
                    {scenario.gpsNoiseFt} ft · {t("compassErr")}: {scenario.compassErrDeg}°
                  </p>
                  <Button asChild data-testid={`launch-demo-${s.key}`}>
                    <a
                      href={`/walk/${property.slug}?demo=${s.key}`}
                      target="_blank"
                      rel="noopener"
                    >
                      <ExternalLink size={16} /> {t("launch")}
                    </a>
                  </Button>
                </div>
              </section>
            );
          })}
        </div>
      )}

      {ready && property.demo_mode ? (
        <p className="t-small muted">
          Phone QA: open{" "}
          <span className="num">
            {site}/walk/{property.slug}?demo=clean
          </span>{" "}
          on the device. The Demo &amp; QA tray sits top-right inside the walk.
        </p>
      ) : null}
    </div>
  );
}
