"use client";

import { useState } from "react";
import { Share2 } from "lucide-react";
import { useTranslations } from "next-intl";

/**
 * Send-this-walk: the buyer texts the link to a spouse or partner who
 * couldn't come. Native share sheet where the browser has one, clipboard
 * fallback otherwise; each recipient opens their own session, so both
 * visits land in the visitor log.
 */
export function ShareWalk({
  propertyName,
  log,
}: {
  propertyName: string;
  log: (method: "share" | "copy") => void;
}) {
  const t = useTranslations("share");
  const tDone = useTranslations("done");
  const [copied, setCopied] = useState(false);

  async function share() {
    const url = window.location.href;
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: propertyName, url });
        log("share");
        return;
      } catch {
        // Cancelled or unsupported payload — fall through to copy.
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      log("copy");
    } catch {
      // Clipboard blocked: surface the URL itself so it can be long-pressed.
      setCopied(true);
    }
  }

  return (
    <div className="stack" style={{ gap: 4 }}>
      <button
        type="button"
        className="t-body-m underline row"
        style={{ color: "var(--link)", justifyContent: "center", gap: 6 }}
        onClick={share}
        data-testid="share-walk"
      >
        <Share2 size={16} aria-hidden /> {tDone("share")}
      </button>
      {copied ? (
        <p className="t-small muted" role="status" data-testid="share-copied">
          {t("copied")}
        </p>
      ) : null}
    </div>
  );
}
