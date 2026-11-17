"use client";

import { useState, useTransition } from "react";
import { setAutomation } from "@/app/admin/(console)/settings/actions";
import { Checkbox } from "@/components/ui/checkbox";

/**
 * Opt-in automations (Alton, Nov 2026): both ship OFF. n8n supplies the
 * clock, the Greenways endpoints do the work, GHL sends the texts — so a
 * toggle here is the single on/off switch for each.
 */
export function AutomationsCard({
  digestEnabled,
  noshowEnabled,
  noshowDays,
  migrated,
}: {
  digestEnabled: boolean;
  noshowEnabled: boolean;
  noshowDays: number;
  migrated: boolean;
}) {
  const [digest, setDigest] = useState(digestEnabled);
  const [noshow, setNoshow] = useState(noshowEnabled);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function toggle(key: "weekly_digest" | "noshow_nudges", next: boolean) {
    setMessage(null);
    const revert = key === "weekly_digest" ? setDigest : setNoshow;
    revert(next);
    startTransition(async () => {
      const res = await setAutomation(key, next);
      if (!res.ok) {
        revert(!next);
        setMessage(res.message ?? "Could not save");
      }
    });
  }

  return (
    <section className="card stack" data-testid="automations-card">
      <h2>Automations</h2>
      <p className="t-small muted">
        Optional — both are off until you turn them on. The texts go out through the same
        GoHighLevel workflow as the walk milestones.
      </p>
      {!migrated ? (
        <div className="banner banner-warn" role="status">
          The automations migration (20261117100000) has not reached the database yet — run the
          DB push workflow first.
        </div>
      ) : null}
      <label className="check">
        <Checkbox
          checked={digest}
          onCheckedChange={(v) => toggle("weekly_digest", v === true)}
          disabled={pending || !migrated}
          data-testid="toggle-digest"
        />
        <span>
          Weekly digest
          <span className="t-small muted">
            {" "}
            — Mondays, one text to the sales team: walks, completions and interested buyers per
            property for the week.
          </span>
        </span>
      </label>
      <label className="check">
        <Checkbox
          checked={noshow}
          onCheckedChange={(v) => toggle("noshow_nudges", v === true)}
          disabled={pending || !migrated}
          data-testid="toggle-noshow"
        />
        <span>
          No-show nudges
          <span className="t-small muted">
            {" "}
            — a booked prospect whose walk link sits unopened for {noshowDays} days gets tagged
            walk-no-show in GoHighLevel (your workflow there sends the nudge). One nudge per
            link, ever.
          </span>
        </span>
      </label>
      {message ? (
        <p className="t-small" style={{ color: "var(--error)" }} role="alert">
          {message}
        </p>
      ) : null}
    </section>
  );
}
