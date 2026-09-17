"use client";

import { useState, useTransition } from "react";
import { Check, Copy, Globe, Undo2 } from "lucide-react";
import {
  issueProspectLink,
  publishProperty,
  revokeLink,
  unpublishProperty,
} from "@/app/admin/(console)/properties/[id]/publish/actions";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";

export function PublishToggle({
  propertyId,
  published,
  labels,
}: {
  propertyId: string;
  published: boolean;
  labels: { publish: string; unpublish: string };
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
      <Button
        variant={published ? "secondary" : "default"}
        disabled={pending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const result = published
              ? await unpublishProperty(propertyId)
              : await publishProperty(propertyId);
            if (!result.ok) setError(result.message ?? "Failed");
          });
        }}
        data-testid="publish-toggle"
      >
        {published ? <Undo2 size={16} aria-hidden /> : <Globe size={16} aria-hidden />}
        {published ? labels.unpublish : labels.publish}
      </Button>
      {error ? (
        <span className="t-small" style={{ color: "var(--error)" }} data-testid="publish-error">
          {error}
        </span>
      ) : null}
    </div>
  );
}

export function CopyButton({ text, labels }: { text: string; labels: { copy: string; copied: string } }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      size="sm"
      variant="ghost"
      onClick={() => {
        void navigator.clipboard?.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
    >
      {copied ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />}
      {copied ? labels.copied : labels.copy}
    </Button>
  );
}

export function IssueLinkForm({
  propertyId,
  labels,
}: {
  propertyId: string;
  labels: { issue: string; locale: string; contact: string; expires: string };
}) {
  const [locale, setLocale] = useState<"en" | "es">("en");
  const [contact, setContact] = useState("");
  const [days, setDays] = useState(30);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="row" style={{ gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
      <label className="stack" style={{ gap: 4 }}>
        <span className="t-small">{labels.locale}</span>
        <Select
          value={locale}
          onChange={(e) => setLocale(e.target.value as "en" | "es")}
          style={{ width: "auto", minHeight: 36 }}
          data-testid="issue-locale"
        >
          <option value="en">EN</option>
          <option value="es">ES</option>
        </Select>
      </label>
      <label className="stack" style={{ gap: 4 }}>
        <span className="t-small">{labels.contact}</span>
        <Input
          value={contact}
          onChange={(e) => setContact(e.target.value)}
          placeholder="GHL contact id"
          style={{ minHeight: 36, width: 180 }}
          data-testid="issue-contact"
        />
      </label>
      <label className="stack" style={{ gap: 4 }}>
        <span className="t-small">{labels.expires}</span>
        <Input
          type="number"
          min={1}
          max={365}
          value={days}
          onChange={(e) => setDays(Number(e.target.value) || 30)}
          style={{ minHeight: 36, width: 90 }}
          data-testid="issue-days"
        />
      </label>
      <Button
        variant="secondary"
        disabled={pending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const result = await issueProspectLink(propertyId, {
              locale,
              ghlContactId: contact || undefined,
              expiresDays: days,
            });
            if (!result.ok) setError(result.message ?? "Failed");
            else setContact("");
          });
        }}
        data-testid="issue-link"
      >
        {labels.issue}
      </Button>
      {error ? (
        <span className="t-small" style={{ color: "var(--error)" }}>
          {error}
        </span>
      ) : null}
    </div>
  );
}

export function RevokeButton({
  propertyId,
  linkId,
  label,
}: {
  propertyId: string;
  linkId: string;
  label: string;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      size="sm"
      variant="ghost"
      disabled={pending}
      onClick={() => startTransition(async () => void (await revokeLink(propertyId, linkId)))}
      data-testid={`revoke-${linkId}`}
    >
      {label}
    </Button>
  );
}
