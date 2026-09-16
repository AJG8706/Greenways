"use client";

import { useState, useTransition } from "react";
import { UserX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { removeInvite, removeTeamMember } from "./actions";

export function RemoveAccessButton({
  target,
  name,
  label,
  confirmText,
}: {
  target: { kind: "member"; id: string } | { kind: "invite"; id: string };
  name: string;
  label: string;
  confirmText: string;
}) {
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function remove() {
    if (!window.confirm(`${confirmText} ${name}?`)) return;
    setMessage(null);
    startTransition(async () => {
      const result =
        target.kind === "member"
          ? await removeTeamMember(target.id)
          : await removeInvite(target.id);
      if (!result.ok) setMessage(result.message ?? "Remove failed");
    });
  }

  return (
    <span className="row" style={{ gap: 8 }}>
      <Button
        variant="ghost"
        size="sm"
        onClick={remove}
        disabled={pending}
        style={{ color: "var(--error)" }}
        data-testid={`remove-${name}`}
      >
        <UserX size={14} /> {label}
      </Button>
      {message ? (
        <span className="t-small" style={{ color: "var(--error)" }}>
          {message}
        </span>
      ) : null}
    </span>
  );
}
