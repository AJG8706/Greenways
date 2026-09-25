import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { i18nText } from "@/lib/i18n/text";
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

/** Per-lot rollup for a master: same aggregator, one row per lot + totals. */
async function MasterRollup({
  lots,
}: {
  lots: { id: string; slug: string; name: unknown }[];
}) {
  const supabase = await createClient();
  const t = await getTranslations("admin.analytics");
  const lotIds = lots.map((l) => l.id);

  const { data: links } = await supabase
    .from("walk_links")
    .select("id, kind, property_id")
    .in("property_id", lotIds);
  const linkIds = (links ?? []).map((l) => l.id);
  const { data: sessions } = linkIds.length
    ? await supabase
        .from("walk_sessions")
        .select("id, link_id, locale, started_at, ended_at, device")
        .in("link_id", linkIds)
        .order("started_at", { ascending: false })
        .limit(2000)
    : { data: [] as never[] };
  const sessionIds = (sessions ?? []).map((s) => s.id);
  const { data: events } = sessionIds.length
    ? await supabase
        .from("walk_events")
        .select("session_id, name, data")
        .in("session_id", sessionIds)
        .limit(20000)
    : { data: [] as never[] };

  const linkToLot = new Map((links ?? []).map((l) => [l.id, l.property_id]));
  const sessionToLot = new Map(
    (sessions ?? []).map((s) => [s.id, s.link_id ? linkToLot.get(s.link_id) : undefined]),
  );

  const rows = lots.map((lot) => {
    const lotProspects = new Set(
      (links ?? []).filter((l) => l.property_id === lot.id && l.kind === "prospect").map((l) => l.id),
    );
    const lotSessions = (sessions ?? []).filter(
      (s) => s.link_id && linkToLot.get(s.link_id) === lot.id,
    );
    const lotEvents = (events ?? []).filter(
      (e) => e.session_id && sessionToLot.get(e.session_id) === lot.id,
    );
    return {
      id: lot.id,
      name: i18nText(lot.name as never).en || lot.slug,
      agg: aggregateWalks(lotSessions, lotEvents, lotProspects),
    };
  });
  const totals = rows.reduce(
    (acc, r) => ({
      walks: acc.walks + r.agg.buyerWalks,
      completed: acc.completed + r.agg.completed,
      es: acc.es + r.agg.languages.es,
      prospect: acc.prospect + r.agg.prospectWalks,
    }),
    { walks: 0, completed: 0, es: 0, prospect: 0 },
  );

  return (
    <div className="stack" style={{ gap: "var(--gw-s-5)" }}>
      <h2>{t("title")}</h2>
      <p className="t-small muted">{t("perLotHint")}</p>
      <div className="table-wrap">
        <table data-testid="master-analytics">
          <thead>
            <tr>
              <th>{t("lotCol")}</th>
              <th>{t("sessions")}</th>
              <th>{t("completion")}</th>
              <th>{t("median")}</th>
              <th>{t("languages")}</th>
              <th>{t("prospect")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>
                  <a href={`/admin/properties/${r.id}/analytics`} className="t-body-m">
                    {r.name}
                  </a>
                </td>
                <td className="num">{r.agg.buyerWalks}</td>
                <td className="num">
                  {r.agg.buyerWalks ? `${r.agg.completed} (${r.agg.completionPct}%)` : "—"}
                </td>
                <td className="num">{fmtSeconds(r.agg.medianCornerSeconds)}</td>
                <td className="num">
                  EN {r.agg.languages.en} · ES {r.agg.languages.es}
                </td>
                <td className="num">{r.agg.prospectWalks}</td>
              </tr>
            ))}
            <tr>
              <td className="t-body-m">{t("totalRow")}</td>
              <td className="num t-body-m">{totals.walks}</td>
              <td className="num t-body-m">{totals.completed}</td>
              <td />
              <td className="num t-body-m">ES {totals.es}</td>
              <td className="num t-body-m">{totals.prospect}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
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

  // Master tract: roll the same aggregation up per lot — one table answers
  // which lots get walked, finished, and in which language.
  const { data: masterLots } = await supabase
    .from("properties")
    .select("id, slug, name")
    .eq("parent_id", id)
    .order("created_at");
  if ((masterLots ?? []).length > 0) {
    return <MasterRollup lots={masterLots!} />;
  }

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
