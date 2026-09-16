"use server";

import { revalidatePath } from "next/cache";
import { createClient as createBareClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "../properties/actions";

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: me } = await supabase
    .from("team_users")
    .select("id, role")
    .eq("user_id", user?.id ?? "")
    .maybeSingle();
  return { supabase, me: me?.role === "admin" ? me : null };
}

/**
 * Send (or resend) the invite email: a magic link through the same invite-gated
 * OTP flow as the sign-in form. Uses a cookie-free client so the admin's own
 * session is untouched.
 */
async function sendInviteEmail(email: string): Promise<{ ok: boolean; message?: string }> {
  const bare = createBareClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const { error } = await bare.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${site}/auth/confirm` },
  });
  if (error) return { ok: false, message: error.message };
  return { ok: true };
}

/** Invite a team member (admin only). Creates the invite and emails the link. */
export async function inviteTeamMember(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const role = String(formData.get("role") ?? "editor");
  if (!email.includes("@")) return { ok: false, message: "Enter a valid email" };
  if (role !== "admin" && role !== "editor") {
    return { ok: false, message: "Role must be admin or editor" };
  }

  const { supabase, me } = await requireAdmin();
  if (!me) return { ok: false, message: "Only an admin can invite" };

  const { error } = await supabase
    .from("invites")
    .insert({ email, role, invited_by: me.id });
  if (error) {
    return {
      ok: false,
      message: error.code === "23505" ? "Already invited" : error.message,
    };
  }

  const sent = await sendInviteEmail(email);
  if (sent.ok) {
    await supabase
      .from("invites")
      .update({ last_sent_at: new Date().toISOString() })
      .eq("email", email);
  }

  revalidatePath("/admin/team");
  return sent.ok
    ? { ok: true }
    : { ok: false, message: `Invite saved, but the email failed to send: ${sent.message}` };
}

/** Resend the invite email for a pending team member (admin only). */
export async function resendInvite(email: string): Promise<ActionResult> {
  const { supabase, me } = await requireAdmin();
  if (!me) return { ok: false, message: "Only an admin can resend invites" };

  const sent = await sendInviteEmail(email);
  if (!sent.ok) return { ok: false, message: sent.message };

  await supabase
    .from("invites")
    .update({ last_sent_at: new Date().toISOString() })
    .eq("email", email);

  revalidatePath("/admin/team");
  return { ok: true };
}

/** Remove a pending invite (admin only). */
export async function removeInvite(inviteId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("invites").delete().eq("id", inviteId);
  if (error) return { ok: false, message: error.message };
  revalidatePath("/admin/team");
  return { ok: true };
}
