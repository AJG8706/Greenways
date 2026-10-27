"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  removeServiceKey,
  saveServiceKey,
  testServiceKey,
} from "@/app/admin/(console)/settings/actions";

export type KeyRow = {
  name: string;
  label: string;
  source: "custom" | "env" | "none";
  last4: string | null;
  updatedAt: string | null;
};

/**
 * Admin-only rotation panel. Paste a fresh vendor key, Save, done — no
 * Vercel, no redeploy. Test runs a live auth check against the vendor
 * with whichever key currently resolves.
 */
export function ServiceKeysCard({ rows }: { rows: KeyRow[] }) {
  return (
    <div className="card stack" data-testid="service-keys">
      <div>
        <h2>Service keys</h2>
        <p className="t-small muted">
          Rotate a vendor key here when it expires — takes effect within a minute, no
          redeploy. Values are stored encrypted; only the last 4 characters are ever
          shown again. Every change lands in the Activity log.
        </p>
      </div>
      {rows.map((row) => (
        <KeyRowView key={row.name} row={row} />
      ))}
    </div>
  );
}

function KeyRowView({ row }: { row: KeyRow }) {
  const [value, setValue] = useState("");
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function run(action: () => Promise<{ ok: boolean; message?: string }>, okText: string) {
    setNote(null);
    startTransition(async () => {
      const result = await action();
      setNote({ ok: result.ok, text: result.ok ? (result.message ?? okText) : (result.message ?? "Failed") });
      if (result.ok) setValue("");
    });
  }

  const status =
    row.source === "custom"
      ? `In use: rotated key ••••${row.last4}${row.updatedAt ? ` (${new Date(row.updatedAt).toLocaleDateString()})` : ""}`
      : row.source === "env"
        ? "In use: deployment value"
        : "Not configured";

  return (
    <div className="stack" style={{ gap: "var(--gw-s-2)" }} data-testid={`key-${row.name}`}>
      <div className="row between">
        <span className="t-body-m">{row.label}</span>
        <span className={`pill ${row.source === "none" ? "pill-draft" : "pill-live"}`}>
          {status}
        </span>
      </div>
      <div className="row" style={{ flexWrap: "wrap" }}>
        <Input
          type="password"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Paste the new key"
          autoComplete="off"
          style={{ flex: "1 1 220px" }}
          data-testid={`key-input-${row.name}`}
        />
        <Button
          size="sm"
          disabled={pending || !value.trim()}
          onClick={() => run(() => saveServiceKey(row.name, value), "Saved — live within a minute.")}
          data-testid={`key-save-${row.name}`}
        >
          Save
        </Button>
        <Button
          size="sm"
          variant="secondary"
          disabled={pending}
          onClick={() => run(() => testServiceKey(row.name), "Auth OK.")}
        >
          Test
        </Button>
        {row.source === "custom" ? (
          <Button
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={() =>
              run(() => removeServiceKey(row.name), "Removed — back to the deployment value.")
            }
          >
            Use deployment value
          </Button>
        ) : null}
      </div>
      {note ? (
        <p className={`t-small ${note.ok ? "muted" : ""}`} style={note.ok ? undefined : { color: "var(--error)" }} role="status">
          {note.text}
        </p>
      ) : null}
    </div>
  );
}
