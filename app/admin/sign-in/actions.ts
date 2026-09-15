"use server";

import { createClient } from "@/lib/supabase/server";

export type SignInState = {
  status: "idle" | "sent" | "notInvited" | "error";
  message?: string;
};

// Magic-link sign-in, invite-only. The friendly check runs first so the form
// can say "ask an admin to invite you"; the database trigger on auth.users is
// the hard gate even if this check is bypassed.
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

  const supabase = await createClient();

  const { data: invited, error: rpcError } = await supabase.rpc("is_invited", {
    check_email: email,
  });
  if (rpcError) return { status: "error", message: rpcError.message };
  if (!invited) return { status: "notInvited" };

  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${site}/auth/confirm` },
  });
  if (error) return { status: "error", message: error.message };
  return { status: "sent" };
}
