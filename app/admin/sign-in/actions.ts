"use server";

import { cookies, headers } from "next/headers";
import { REMEMBER_COOKIE, REMEMBER_MAX_AGE_S } from "@/lib/supabase/cookies";
import { rateLimitAllowed } from "@/lib/api/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type SignInState = {
  status: "idle" | "sent" | "error";
  message?: string;
};

// Magic-link sign-in, invite-only. The response never reveals whether an
// email is on the team (no enumeration oracle): unknown emails get the same
// "if there's an account…" answer and simply no email arrives. The database
// trigger on auth.users is the hard gate even if this check is bypassed.
export async function signInWithMagicLink(
  _prev: SignInState,
  formData: FormData,
): Promise<SignInState> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  if (!email || !email.includes("@")) {
    return { status: "error", message: "invalid_email" };
  }

  // A handful of attempts a minute is plenty for a person and starves both
  // email-bombing and timing probes.
  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "unknown").split(",")[0]!.trim();
  if (!(await rateLimitAllowed(`signin:${ip}`, 5, 60))) {
    return { status: "error", message: "Too many attempts — try again in a minute." };
  }

  // Record the "remember this device" choice before the magic link round
  // trip; the confirm route and every later refresh read it when setting
  // auth cookies. Remembered → both live 30 days (rolling); not → both are
  // session cookies and end when the browser closes. Set for unknown
  // emails too, so the response stays identical either way.
  const remember = formData.get("remember") === "on";
  (await cookies()).set(REMEMBER_COOKIE, remember ? "1" : "0", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    ...(remember ? { maxAge: REMEMBER_MAX_AGE_S } : {}),
  });

  const supabase = await createClient();

  // The invite pre-check runs with the service role: the RPC's anon grant
  // was revoked (audit v2) so the database no longer answers "is this email
  // on the team?" to anyone holding the public key.
  const { data: invited, error: rpcError } = await createAdminClient().rpc("is_invited", {
    check_email: email,
  });
  if (rpcError) return { status: "error", message: rpcError.message };
  if (!invited) return { status: "sent" };

  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${site}/auth/confirm` },
  });
  if (error) return { status: "error", message: error.message };
  return { status: "sent" };
}
