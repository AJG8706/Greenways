import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { aggregateWalks, isDemoDevice } from "@/lib/analytics/walk-aggregate";

/**
 * Walk analytics (plan §3 Phase 5): opened, corners found, hesitation
 * (time-to-corner), boundary exits, compass failures — from walk_sessions +
 * walk_events via the shared aggregator (also serves /api/v1 analytics).
 * Demo sessions are excluded from buyer numbers and shown as their own count.
 */

function fmtSeconds(s: number | null): string {
  if (s === null) return "—";
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}m ${s % 60}s` : `${s}s`;
}

export default async function AnalyticsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: property } = await supabase
    .from("properties")
    .select("id")
    .eq("id", id)
    .maybeSingle();
  if (!property) notFound();

  const { data: links } = await supabase
    .from("walk_links")
    .select("id, kind")
    .eq("property_id", id);
  const linkIds = (links ?? []).map((l) => l.id);
  const prospectLinkIds = new Set(
    (links ?? []).filter((l) => l.kind === "prospect").map((l) => l.id),
  );

  const { data: sessions } = linkIds.length
    ? await supabase
        .from("walk_sessions")
        .select("id, link_id, locale, started_at, ended_at, device")
        .in("link_id", linkIds)
        .order("started_at", { ascending: false })
        .limit(500)
    : { data: [] as never[] };

  const sessionIds = (sessions ?? []).map((s) => s.id);
  const { data: events } = sessionIds.length
    ? await supabase
        .from("walk_events")
        .select("session_id, name, data")
        .in("session_id", sessionIds)
        .limit(10000)
    : { data: [] as never[] };

  const t = await getTranslations("admin.analytics");
  const tCommon = await getTranslations("common");

  const agg = aggregateWalks(sessions ?? [], events ?? [], prospectLinkIds);
  const bySession = agg.perSession;

  const tiles: { label: string; value: string; testId?: string }[] = [
    { label: t("sessions"), value: String(agg.buyerWalks), testId: "stat-sessions" },
    {
      label: t("completion"),
      value: agg.buyerWalks ? `${agg.completed} (${agg.completionPct}%)` : "0",
      testId: "stat-completed",
    },
    { label: t("median"), value: fmtSeconds(agg.medianCornerSeconds) },
    { label: t("boundary"), value: String(agg.boundaryExits) },
    { label: t("compass"), value: String(agg.compassProblems) },
    { label: t("languages"), value: `EN ${agg.languages.en} · ES ${agg.languages.es}` },
    { label: t("prospect"), value: String(agg.prospectWalks) },
    { label: t("demoWalks"), value: String(agg.demoWalks) },
  ];

  return (
    <div className="stack" style={{ gap: "var(--gw-s-5)" }}>
      <h2>{t("title")}</h2>

      {(sessions ?? []).length === 0 ? (
        <div className="card">
          <p className="muted" data-testid="analytics-empty">
            {t("empty")}
          </p>
        </div>
      ) : (
        <>
          <div
            data-testid="analytics-tiles"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))",
              gap: "var(--gw-s-3)",
            }}
          >
            {tiles.map((tile) => (
              <div key={tile.label} className="card" data-testid={tile.testId}>
                <p className="t-label">{tile.label}</p>
                <p className="num" style={{ font: "var(--gw-t-h1)" }}>
                  {tile.value}
                </p>
              </div>
            ))}
          </div>

          {agg.perCorner.length > 0 ? (
            <section className="card stack" style={{ gap: "var(--gw-s-2)" }}>
              <h3>{t("byCorner")}</h3>
              <div className="table-wrap">
                <table data-testid="corner-times">
                  <tbody>
                    {agg.perCorner.map((c) => (
                      <tr key={c.n}>
                        <td>{tCommon("corner", { n: c.n })}</td>
                        <td className="num">{c.count}×</td>
                        <td className="num">{fmtSeconds(c.medianSeconds)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          <section className="card stack" style={{ gap: "var(--gw-s-2)" }}>
            <h3>{t("recent")}</h3>
            <div className="table-wrap">
              <table data-testid="recent-walks">
                <tbody>
                  {(sessions ?? []).slice(0, 20).map((s) => {
                    const agg = bySession.get(s.id);
                    return (
                      <tr key={s.id}>
                        <td className="t-small muted">
                          {new Date(s.started_at).toLocaleString("en-US", {
                            month: "short",
                            day: "numeric",
                            hour: "numeric",
                            minute: "2-digit",
                          })}
                        </td>
                        <td className="t-small">{(s.locale ?? "en").toUpperCase()}</td>
                        <td className="t-small">
                          {isDemoDevice(s.device)
                            ? t("demoTag")
                            : s.link_id && prospectLinkIds.has(s.link_id)
                              ? t("prospectTag")
                              : t("publicTag")}
                        </td>
                        <td className="t-small num">
                          {agg ? `${agg.found} ${t("cornersShort")}` : "—"}
                        </td>
                        <td>
                          {agg?.completed ? (
                            <span className="pill pill-live">{t("completedTag")}</span>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
