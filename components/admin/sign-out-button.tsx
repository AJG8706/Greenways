"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function SignOutButton({ label }: { label: string }) {
  const router = useRouter();

  async function signOut() {
    await createClient().auth.signOut();
    router.push("/admin/sign-in");
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={signOut}
      className="text-left underline"
      style={{ color: "var(--gw-sage-mist)", font: "var(--gw-t-small)" }}
    >
      {label}
    </button>
  );
}
