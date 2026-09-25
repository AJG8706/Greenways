import { createClient } from "@/lib/supabase/server";

/**
 * True when the request carries a signed-in team member's session (any
 * role). Draft-only surfaces outside /admin — e.g. an unpublished walk in
 * demo or test-lot mode — gate on this so links to unfinished listings
 * never resolve for the public.
 */
export async function isTeamViewer(): Promise<boolean> {
  try {
    const supabase = await createClient();
    const { data: userRes } = await supabase.auth.getUser();
    if (!userRes.user) return false;
    const { data: me } = await supabase
      .from("team_users")
      .select("user_id")
      .eq("user_id", userRes.user.id)
      .maybeSingle();
    return Boolean(me);
  } catch {
    return false;
  }
}
