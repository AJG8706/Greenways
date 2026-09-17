import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Walk analytics (plan §3 Phase 5): opened, corners found, hesitation
 * (time-to-corner), boundary exits, compass failures — from walk_sessions +
 * walk_events. Demo sessions (device "demo:…") are excluded from buyer
 * numbers and shown as their own count.
 */

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : Math.round((sorted[mid - 1]! + sorted[mid]!) / 2);
}

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

  const isDemo = (device: string | null) => (device ?? "").startsWith("demo:");
  const real = (sessions ?? []).filter((s) => !isDemo(s.device));
  const demoCount = (sessions ?? []).length - real.length;
  const realIds = new Set(real.map((s) => s.id));
  const realEvents = (events ?? []).filter((e) => e.session_id && realIds.has(e.session_id));

  const bySession = new Map<string, { found: number; completed: boolean }>();
  for (const s of real) bySession.set(s.id, { found: 0, completed: false });
  const cornerSeconds: number[] = [];
  const perCorner = new Map<number, number[]>();
  let boundaryExits = 0;
  let compassProblems = 0;
  let gpsWeak = 0;

  for (const e of realEvents) {
    const agg = e.session_id ? bySession.get(e.session_id) : undefined;
    const data = (e.data ?? {}) as { n?: number; seconds?: number };
    switch (e.name) {
      case "corner_found": {
        if (agg) agg.found += 1;
        if (typeof data.seconds === "number") {
          cornerSeconds.push(data.seconds);
          if (typeof data.n === "number") {
            const list = perCorner.get(data.n) ?? [];
            list.push(data.seconds);
            perCorner.set(data.n, list);
          }
        }
        break;
      }
      case "walk_completed":
        if (agg) agg.completed = true;
        break;
      case "boundary_exit":
        boundaryExits += 1;
        break;
      case "compass_unreliable":
        compassProblems += 1;
        break;
      case "gps_weak":
        gpsWeak += 1;
        break;
    }
  }

  const completed = [...bySession.values()].filter((s) => s.completed).length;
  const esSessions = real.filter((s) => s.locale === "es").length;
  const prospectSessions = real.filter(
    (s) => s.link_id && prospectLinkIds.has(s.link_id),
  ).length;

  const tiles: { label: string; value: string; testId?: string }[] = [
    { label: t("sessions"), value: String(real.length), testId: "stat-sessions" },
    {
      label: t("completion"),
      value: real.length ? `${completed} (${Math.round((completed / real.length) * 100)}%)` : "0",
      testId: "stat-completed",
    },
    { label: t("median"), value: fmtSeconds(median(cornerSeconds)) },
    { label: t("boundary"), value: String(boundaryExits) },
    { label: t("compass"), value: String(compassProblems + gpsWeak) },
    { label: t("languages"), value: `EN ${real.length - esSessions} · ES ${esSessions}` },
    { label: t("prospect"), value: String(prospectSessions) },
    { label: t("demoWalks"), value: String(demoCount) },
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

          {perCorner.size > 0 ? (
            <section className="card stack" style={{ gap: "var(--gw-s-2)" }}>
              <h3>{t("byCorner")}</h3>
              <div className="table-wrap">
                <table data-testid="corner-times">
                  <tbody>
                    {[...perCorner.entries()]
                      .sort((a, b) => a[0] - b[0])
                      .map(([n, secs]) => (
                        <tr key={n}>
                          <td>{tCommon("corner", { n })}</td>
                          <td className="num">{secs.length}×</td>
                          <td className="num">{fmtSeconds(median(secs))}</td>
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
                          {isDemo(s.device)
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
