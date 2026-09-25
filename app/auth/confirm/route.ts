import { redirect } from "next/navigation";
import { type NextRequest } from "next/server";
import { type EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

/**
 * Magic-link landing. Handles both shapes Supabase can send:
 * - `?code=` — the default email template routes through Supabase's verify
 *   endpoint, which redirects here with a PKCE code (same-browser only).
 * - `?token_hash=&type=` — the customized template links here directly;
 *   works from any device or browser.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next") ?? "/admin";
  // Same-origin paths only: "//evil.com" and "/\evil.com" are
  // protocol-relative redirects, not paths.
  const target = /^\/(?![/\\])/.test(next) ? next : "/admin";

  const supabase = await createClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      await logSignIn(supabase);
      redirect(await landingFor(supabase, target));
    }
  }

  if (token_hash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash });
    if (!error) {
      await logSignIn(supabase);
      redirect(await landingFor(supabase, target));
    }
  }

  redirect("/admin/sign-in?error=link");
}

/**
 * A teammate's very first sign-in (the invite email is a sign-in link, which
 * surprises people expecting a "confirmation" step) lands on a welcome that
 * explains the model instead of a bare property list.
 */
async function landingFor(
  supabase: Awaited<ReturnType<typeof createClient>>,
  target: string,
): Promise<string> {
  try {
    const { data: userRes } = await supabase.auth.getUser();
    const { data: me } = await supabase
      .from("team_users")
      .select("first_signed_in_at")
      .eq("user_id", userRes.user?.id ?? "")
      .maybeSingle();
    const first = me?.first_signed_in_at ? new Date(me.first_signed_in_at).getTime() : null;
    // The invite-acceptance trigger stamps first_signed_in_at during this
    // very request, so "just now" means this is their first session.
    if (first !== null && Date.now() - first < 2 * 60_000) {
      return "/admin/properties?welcome=1";
    }
  } catch {
    // fall through to the normal target
  }
  return target;
}

/** Sign-ins join the audit trail (Activity page). Best-effort — never blocks the login. */
async function logSignIn(supabase: Awaited<ReturnType<typeof createClient>>) {
  try {
    await supabase.rpc("write_audit", {
      p_action: "signed_in",
      p_property_id: null as unknown as string,
      p_detail: {},
    });
  } catch {
    // the session is set either way
  }
}
