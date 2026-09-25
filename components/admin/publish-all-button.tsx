"use client";

import { useState } from "react";
import { publishAllReadyLots } from "@/app/admin/(console)/properties/[id]/publish/actions";
import { Button } from "@/components/ui/button";

/**
 * One click publishes every ready lot (each through the normal publish
 * gates). Reloads on success so the tallies and pills repaint — same
 * deterministic pattern as the master bulk edit.
 */
export function PublishAllButton({
  masterId,
  readyCount,
}: {
  masterId: string;
  readyCount: number;
}) {
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function run() {
    setMessage(null);
    setPending(true);
    try {
      const res = await publishAllReadyLots(masterId);
      if (res.ok) {
        window.location.reload();
        return;
      }
      setMessage(res.message ?? "Publish failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="stack" style={{ gap: "var(--gw-s-2)" }}>
      <Button
        onClick={run}
        disabled={pending || readyCount === 0}
        data-testid="publish-all-lots"
      >
        {pending ? "Publishing..." : `Publish all ready lots (${readyCount})`}
      </Button>
      {message ? (
        <p className="t-small" style={{ color: "var(--error)" }} data-testid="publish-all-result">
          {message}
        </p>
      ) : null}
    </div>
  );
}
