"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "../properties/actions";

/** Invite a team member (admin only — RLS enforces it). */
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

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: me } = await supabase
    .from("team_users")
    .select("id, role")
    .eq("user_id", user?.id ?? "")
    .maybeSingle();
  if (me?.role !== "admin") {
    return { ok: false, message: "Only an admin can invite" };
  }

  const { error } = await supabase
    .from("invites")
    .insert({ email, role, invited_by: me.id });
  if (error) {
    return {
      ok: false,
      message: error.code === "23505" ? "Already invited" : error.message,
    };
  }
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
