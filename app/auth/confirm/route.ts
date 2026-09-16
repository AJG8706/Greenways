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
  const target = next.startsWith("/") ? next : "/admin";

  const supabase = await createClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) redirect(target);
  }

  if (token_hash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash });
    if (!error) redirect(target);
  }

  redirect("/admin/sign-in?error=link");
}
