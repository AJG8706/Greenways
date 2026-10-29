"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

/**
 * "I'm interested" on the walk's done screen — the one conversion moment the
 * app owns. Phone is the only required field; the submit lands in walk_leads
 * (and forwards to the team when the webhook is configured).
 */
export function InterestCard({
  slug,
  getSessionId,
}: {
  slug: string;
  getSessionId: () => string | null;
}) {
  const t = useTranslations("interest");
  const locale = useLocale();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");

  async function submit() {
    if (state === "sending") return;
    setState("sending");
    try {
      const res = await fetch("/api/walk-leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug,
          sessionId: getSessionId() ?? undefined,
          name,
          phone,
          locale,
        }),
      });
      setState(res.ok ? "sent" : "error");
    } catch {
      setState("error");
    }
  }

  if (state === "sent") {
    return (
      <div className="panel" style={{ background: "var(--bg-2)" }} data-testid="interest-sent">
        <p className="t-body-m">{t("sent")}</p>
      </div>
    );
  }

  return (
    <div className="panel stack text-left" style={{ background: "var(--bg-2)", gap: "var(--gw-s-3)" }}>
      <div>
        <h2>{t("title")}</h2>
        <p className="t-small muted">{t("body")}</p>
      </div>
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={t("name")}
        aria-label={t("name")}
        autoComplete="name"
        className="rounded-1"
        style={inputStyle}
        data-testid="interest-name"
      />
      <input
        type="tel"
        inputMode="tel"
        value={phone}
        onChange={(e) => {
          setPhone(e.target.value);
          if (state === "error") setState("idle");
        }}
        placeholder={t("phone")}
        aria-label={t("phone")}
        autoComplete="tel"
        className="rounded-1"
        style={inputStyle}
        data-testid="interest-phone"
      />
      {state === "error" ? (
        <p className="t-small" role="alert" style={{ color: "var(--error)" }}>
          {t("error")}
        </p>
      ) : null}
      <Button
        size="lg"
        className="btn-block"
        disabled={state === "sending" || phone.replace(/\D/g, "").length < 7}
        onClick={() => void submit()}
        data-testid="interest-send"
      >
        {state === "sending" ? t("sending") : t("send")}
      </Button>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  // ≥16px or iOS zooms the page on focus.
  fontSize: 16,
  padding: "10px 12px",
  background: "var(--bg)",
  color: "var(--text)",
  border: "1px solid rgba(255,255,255,.25)",
};
