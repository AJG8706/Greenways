"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { signInWithMagicLink, type SignInState } from "./actions";

const initialState: SignInState = { status: "idle" };

export function SignInForm() {
  const t = useTranslations("admin.signIn");
  const [state, formAction, pending] = useActionState(
    signInWithMagicLink,
    initialState,
  );

  if (state.status === "sent") {
    return (
      <div className="banner" role="status">
        {t("sent")}
      </div>
    );
  }

  return (
    <form action={formAction} className="stack">
      <label className="field">
        {t("email")}
        <Input
          type="email"
          name="email"
          required
          autoComplete="email"
          placeholder="you@texasgreenerpastures.com"
        />
      </label>
      {state.status === "notInvited" ? (
        <div className="banner banner-warn" role="alert">
          {t("notInvited")}
        </div>
      ) : null}
      {state.status === "error" ? (
        <div className="banner banner-error" role="alert">
          {state.message}
        </div>
      ) : null}
      <Button type="submit" disabled={pending}>
        {t("cta")}
      </Button>
    </form>
  );
}
