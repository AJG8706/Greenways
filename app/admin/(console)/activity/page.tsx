import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { i18nText } from "@/lib/i18n/text";

/**
 * Admin activity trail: who signed in and who changed what, straight from
 * audit_log (every guarded action writes there — corner locks/unlocks,
 * publishes, media review, uploads, API keys, sign-ins). Admin-only: RLS
 * enforces reads and this page double-checks the role.
 */

// action key → what the row means, in plain words
const ACTION_LABELS: Record<string, string> = {
  signed_in: "Signed in",
  kml_imported: "Imported KML geometry",
  subdivision_imported: "Split a subdivision KML into lots",
  lots_bulk_updated: "Bulk-edited all lots of a master",
  entrance_moved: "Moved the entrance",
  corner_locked: "Locked a corner (CAD-verified)",
  corner_unlocked: "Unlocked a corner",
  test_lot_placed: "Placed the GPS test square",
  demo_mode_changed: "Changed demo mode",
  sale_status_changed: "Changed sale status",
  property_published: "Published the walk",
  property_deleted: "Deleted a property",
  generation_queued: "Queued media generation",
  media_approved: "Approved a clip",
  media_rejected: "Rejected a clip",
  media_uploaded: "Uploaded own footage",
  media_removed: "Removed a clip",
  document_uploaded: "Uploaded a document",
  document_removed: "Removed a document",
  monday_synced: "Synced the Monday walk link",
  api_key_created: "Created an API key",
  api_key_revoked: "Revoked an API key",
  team_member_removed: "Removed a team member",
};

const DETAIL_HIDDEN_KEYS = new Set(["asset_id", "request_id"]);

function detailSummary(detail: unknown): string {
  if (!detail || typeof detail !== "object") return "";
  return Object.entries(detail as Record<string, unknown>)
    .filter(([k, v]) => !DETAIL_HIDDEN_KEYS.has(k) && v !== null && v !== "" && v !== undefined)
    .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`)
    .join(" · ")
    .slice(0, 140);
}

export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ actor?: string }>;
}) {
  const { actor: actorFilter } = await searchParams;
  const supabase = await createClient();
  const { data: userRes } = await supabase.auth.getUser();
  const { data: me } = await supabase
    .from("team_users")
    .select("role")
    .eq("user_id", userRes.user?.id ?? "")
    .maybeSingle();
  if (me?.role !== "admin") redirect("/admin/properties");

  const [{ data: team }, { data: properties }] = await Promise.all([
    supabase.from("team_users").select("user_id, display_name, email"),
    supabase.from("properties").select("id, slug, name"),
  ]);
  const teamByUserId = new Map(
    (team ?? []).map((m) => [m.user_id, m.display_name || m.email]),
  );
  const propertyById = new Map(
    (properties ?? []).map((p) => [p.id, { slug: p.slug, name: i18nText(p.name).en || p.slug }]),
  );

  let query = supabase
    .from("audit_log")
    .select("id, actor, action, property_id, detail, created_at")
    .order("created_at", { ascending: false })
    .limit(200);
  if (actorFilter) query = query.eq("actor", actorFilter);
  const { data: entries } = await query;

  // Last sign-in per person, derived from the same trail.
  const { data: signIns } = await supabase
    .from("audit_log")
    .select("actor, created_at")
    .eq("action", "signed_in")
    .order("created_at", { ascending: false })
    .limit(500);
  const lastSignIn = new Map<string, string>();
  for (const s of signIns ?? []) {
    if (s.actor && !lastSignIn.has(s.actor)) lastSignIn.set(s.actor, s.created_at);
  }

  const fmt = (iso: string) =>
    new Date(iso).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });

  return (
    <div className="stack" style={{ gap: "var(--gw-s-5)" }}>
      <div>
        <h1>Activity</h1>
        <p className="muted">
          Who signed in and who changed what. Every guarded action lands here automatically;
          nothing on this page can be edited or deleted.
        </p>
      </div>

      <section className="card stack" style={{ gap: "var(--gw-s-3)" }} data-testid="sign-ins-card">
        <h2>Team sign-ins</h2>
        <div className="table-wrap">
          <table>
            <tbody>
              {(team ?? []).map((m) => (
                <tr key={m.user_id ?? m.email}>
                  <td className="t-body-m">{m.display_name || m.email}</td>
                  <td className="t-small muted">
                    {m.user_id && lastSignIn.has(m.user_id)
                      ? `last signed in ${fmt(lastSignIn.get(m.user_id)!)}`
                      : "no sign-in recorded yet"}
                  </td>
                  <td style={{ textAlign: "right" }}>
                    {m.user_id ? (
                      <Link className="t-small" href={`/admin/activity?actor=${m.user_id}`}>
                        Their activity →
                      </Link>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card stack" style={{ gap: "var(--gw-s-3)" }} data-testid="activity-table">
        <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
          <h2>{actorFilter ? `Activity — ${teamByUserId.get(actorFilter) ?? "team member"}` : "Latest activity"}</h2>
          {actorFilter ? (
            <Link className="t-small" href="/admin/activity">
              Show everyone
            </Link>
          ) : null}
        </div>
        {(entries ?? []).length === 0 ? (
          <p className="muted" data-testid="activity-empty">
            Nothing recorded yet.
          </p>
        ) : (
          <div className="table-wrap">
            <table>
              <tbody>
                {(entries ?? []).map((e) => {
                  const property = e.property_id ? propertyById.get(e.property_id) : null;
                  const detail = detailSummary(e.detail);
                  return (
                    <tr key={e.id}>
                      <td className="t-small muted" style={{ whiteSpace: "nowrap" }}>
                        {fmt(e.created_at)}
                      </td>
                      <td className="t-body-m" style={{ whiteSpace: "nowrap" }}>
                        {e.actor ? (teamByUserId.get(e.actor) ?? "former member") : "System"}
                      </td>
                      <td>
                        <span className="t-body-m">{ACTION_LABELS[e.action] ?? e.action}</span>
                        {property ? (
                          <>
                            {" "}
                            <Link className="t-small" href={`/admin/properties/${e.property_id}`}>
                              {property.name}
                            </Link>
                          </>
                        ) : null}
                        {detail ? <p className="t-small muted">{detail}</p> : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
