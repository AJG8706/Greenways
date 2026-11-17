"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

export type FeedbackVerdict = "loved" | "thinking" | "not_for_me";

const REASONS = ["tooSmall", "price", "access", "location", "other"] as const;
type ReasonKey = (typeof REASONS)[number];

/**
 * One-tap exit feedback on the done screen. "Loved it" / "Still thinking"
 * send immediately; "Not for me" asks one optional follow-up (reason chips
 * or skip) so the team learns WHY a lot doesn't convert. Exactly one
 * walk_feedback event per walk — the buyer can't re-vote.
 */
export function ExitFeedback({
  log,
}: {
  /** Fires the walk_feedback telemetry event with {verdict, reason?}. */
  log: (data: { verdict: FeedbackVerdict; reason?: string }) => void;
}) {
  const t = useTranslations("feedback");
  const [state, setState] = useState<"idle" | "why" | "sent">("idle");

  function pick(verdict: Exclude<FeedbackVerdict, "not_for_me">) {
    log({ verdict });
    setState("sent");
  }

  function pickReason(reason?: ReasonKey) {
    log(reason ? { verdict: "not_for_me", reason } : { verdict: "not_for_me" });
    setState("sent");
  }

  if (state === "sent") {
    return (
      <p className="t-small muted" role="status" data-testid="feedback-thanks">
        {t("thanks")}
      </p>
    );
  }

  return (
    <div className="panel stack" style={{ background: "var(--bg-2)", gap: 10 }} data-testid="exit-feedback">
      {state === "idle" ? (
        <>
          <p className="t-label">{t("title")}</p>
          <div className="row" style={{ gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
            <button type="button" className="hud-chip" onClick={() => pick("loved")} data-testid="feedback-loved">
              {t("loved")}
            </button>
            <button type="button" className="hud-chip" onClick={() => pick("thinking")} data-testid="feedback-thinking">
              {t("thinking")}
            </button>
            <button type="button" className="hud-chip" onClick={() => setState("why")} data-testid="feedback-not-for-me">
              {t("notForMe")}
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="t-label">{t("whyTitle")}</p>
          <div className="row" style={{ gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
            {REASONS.map((r) => (
              <button
                key={r}
                type="button"
                className="hud-chip"
                onClick={() => pickReason(r)}
                data-testid={`feedback-reason-${r}`}
              >
                {t(`reasons.${r}`)}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="t-small muted underline"
            onClick={() => pickReason()}
            data-testid="feedback-skip"
          >
            {t("skip")}
          </button>
        </>
      )}
    </div>
  );
}
