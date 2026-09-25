"use server";

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

  const supabase = await createClient();

  const { data: invited, error: rpcError } = await supabase.rpc("is_invited", {
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
