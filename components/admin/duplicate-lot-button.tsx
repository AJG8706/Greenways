"use client";

import { useState } from "react";
import { Copy } from "lucide-react";
import { duplicateProperty } from "@/app/admin/(console)/properties/actions";

/**
 * One-click duplicate for a lot row: new draft sibling with the same
 * geometry/content, corners unlocked (the lock step re-runs on the copy).
 * Deterministic reload on success — same pattern as the other bulk cards.
 */
export function DuplicateLotButton({ lotId }: { lotId: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function duplicate() {
    setBusy(true);
    setError(null);
    const result = await duplicateProperty(lotId);
    if (!result.ok) {
      setBusy(false);
      setError(result.message ?? "Duplicate failed");
      return;
    }
    window.location.reload();
  }

  return (
    <span className="row" style={{ gap: 6 }}>
      <button
        type="button"
        className="btn btn-sm btn-ghost"
        disabled={busy}
        onClick={duplicate}
        data-testid={`duplicate-${lotId}`}
      >
        <Copy size={14} /> {busy ? "Duplicating…" : "Duplicate"}
      </button>
      {error ? (
        <span className="t-small" style={{ color: "var(--error)" }} role="alert">
          {error}
        </span>
      ) : null}
    </span>
  );
}
