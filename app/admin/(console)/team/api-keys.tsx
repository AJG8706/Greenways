"use client";

import { useState, useTransition } from "react";
import { KeyRound, Copy, Check } from "lucide-react";
import { createApiKey, revokeApiKey } from "./api-key-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type ApiKeyRow = {
  id: string;
  name: string;
  prefix: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
};

/** Admin-only API key management (docs/API.md; spec at /api/v1/openapi.json). */
export function ApiKeysCard({ keys }: { keys: ApiKeyRow[] }) {
  const [name, setName] = useState("");
  const [secret, setSecret] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <section className="card stack" style={{ gap: "var(--gw-s-3)" }} data-testid="api-keys-card">
      <div>
        <h2>API keys</h2>
        <p className="t-small muted">
          Bearer keys for the Greenways API (<code>/api/v1</code>) — for n8n, GHL, spreadsheets
          and any future tool. The secret is shown <strong>once</strong>; store it where the
          tool lives. Guide: <code>docs/API.md</code> · machine spec:{" "}
          <code>/api/v1/openapi.json</code>.
        </p>
      </div>

      {secret ? (
        <div className="banner banner-warn" data-testid="api-key-secret">
          <div className="grow" style={{ minWidth: 0 }}>
            <p className="t-small">Copy this key now — it will not be shown again.</p>
            <code className="t-small" style={{ wordBreak: "break-all" }}>
              {secret}
            </code>
          </div>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              void navigator.clipboard?.writeText(secret).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              });
            }}
          >
            {copied ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />}
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
      ) : null}

      <div className="row" style={{ gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
        <label className="stack" style={{ gap: 4 }}>
          <span className="t-small">Key name</span>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="n8n booking flow"
            style={{ minHeight: 36, width: 220 }}
            data-testid="api-key-name"
          />
        </label>
        <Button
          variant="secondary"
          disabled={pending || !name.trim()}
          onClick={() => {
            setError(null);
            startTransition(async () => {
              const result = await createApiKey(name.trim());
              if (result.ok && result.secret) {
                setSecret(result.secret);
                setName("");
              } else setError(result.message ?? "Failed");
            });
          }}
          data-testid="api-key-create"
        >
          <KeyRound size={14} aria-hidden /> Create key
        </Button>
        {error ? (
          <span className="t-small" style={{ color: "var(--error)" }}>
            {error}
          </span>
        ) : null}
      </div>

      {keys.length > 0 ? (
        <div className="table-wrap">
          <table data-testid="api-keys-table">
            <tbody>
              {keys.map((k) => (
                <tr key={k.id}>
                  <td className="t-body-m">{k.name}</td>
                  <td>
                    <code className="t-small">{k.prefix}…</code>
                  </td>
                  <td className="t-small muted">
                    {k.last_used_at
                      ? `used ${new Date(k.last_used_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
                      : "never used"}
                  </td>
                  <td style={{ textAlign: "right" }}>
                    {k.revoked_at ? (
                      <span className="pill pill-draft">Revoked</span>
                    ) : (
                      <RevokeKeyButton keyId={k.id} />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}

function RevokeKeyButton({ keyId }: { keyId: string }) {
  const [confirm, setConfirm] = useState(false);
  const [pending, startTransition] = useTransition();
  return (
    <Button
      size="sm"
      variant={confirm ? "danger" : "ghost"}
      disabled={pending}
      onClick={() => {
        if (!confirm) {
          setConfirm(true);
          return;
        }
        startTransition(async () => void (await revokeApiKey(keyId)));
      }}
      data-testid={`api-key-revoke-${keyId}`}
    >
      {confirm ? "Really revoke?" : "Revoke"}
    </Button>
  );
}
