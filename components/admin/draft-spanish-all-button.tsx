"use client";

import { useState } from "react";
import { draftSpanishAllLots } from "@/app/admin/(console)/properties/[id]/content/actions";
import { Button } from "@/components/ui/button";

/**
 * One click drafts Spanish for every lot under the master that still has
 * empty ES fields. Drafts always land unreviewed (guardrail #6) — a person
 * still reads each lot's Spanish on the Content tab before publish.
 */
export function DraftSpanishAllButton({ masterId }: { masterId: string }) {
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [pending, setPending] = useState(false);

  async function run() {
    setMessage(null);
    setPending(true);
    try {
      const res = await draftSpanishAllLots(masterId);
      setError(!res.ok);
      setMessage(res.message ?? (res.ok ? "Done" : "Draft failed"));
      if (res.ok) {
        // Repaint the reviewed/ready pills with the fresh server state.
        window.location.reload();
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="stack" style={{ gap: "var(--gw-s-2)" }}>
      <Button
        variant="secondary"
        onClick={run}
        disabled={pending}
        data-testid="draft-spanish-all"
      >
        {pending ? "Drafting Spanish..." : "Draft Spanish for all lots"}
      </Button>
      {message ? (
        <p
          className="t-small"
          style={{ color: error ? "var(--error)" : "var(--gw-ink-soft, inherit)" }}
          data-testid="draft-spanish-all-result"
        >
          {message}
        </p>
      ) : null}
    </div>
  );
}
