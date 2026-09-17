import { NextResponse, type NextRequest } from "next/server";
import { authenticateApiKey } from "@/lib/api/auth";
import { aggregateWalks } from "@/lib/analytics/walk-aggregate";
import { createAdminClient } from "@/lib/supabase/admin";

/** GET /api/v1/properties/{slug}/analytics — same numbers as the admin tab. */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const auth = await authenticateApiKey(request);
  if (!auth.ok) return auth.response;
  const { slug } = await params;

  const supabase = createAdminClient();
  const { data: property } = await supabase
    .from("properties")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  if (!property) return NextResponse.json({ error: "unknown property" }, { status: 404 });

  const { data: links } = await supabase
    .from("walk_links")
    .select("id, kind")
    .eq("property_id", property.id);
  const linkIds = (links ?? []).map((l) => l.id);
  const prospectIds = new Set((links ?? []).filter((l) => l.kind === "prospect").map((l) => l.id));

  const { data: sessions } = linkIds.length
    ? await supabase
        .from("walk_sessions")
        .select("id, link_id, locale, started_at, device")
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

  const agg = aggregateWalks(sessions ?? [], events ?? [], prospectIds);
  // perSession (a Map) is internal to the admin tab's per-walk list.
  return NextResponse.json({
    slug,
    buyerWalks: agg.buyerWalks,
    completed: agg.completed,
    completionPct: agg.completionPct,
    medianCornerSeconds: agg.medianCornerSeconds,
    perCorner: agg.perCorner,
    boundaryExits: agg.boundaryExits,
    compassProblems: agg.compassProblems,
    languages: agg.languages,
    prospectWalks: agg.prospectWalks,
    demoWalks: agg.demoWalks,
  });
}
