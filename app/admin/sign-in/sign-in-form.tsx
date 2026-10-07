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
      <label
        className="row"
        style={{ gap: "var(--gw-s-3)", cursor: "pointer", flexWrap: "nowrap", alignItems: "center" }}
      >
        <input
          type="checkbox"
          name="remember"
          defaultChecked
          data-testid="remember-device"
          style={{ width: 18, height: 18, flexShrink: 0 }}
        />
        <span className="t-body-m">{t("remember")}</span>
      </label>
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
