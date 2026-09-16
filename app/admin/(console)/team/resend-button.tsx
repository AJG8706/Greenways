"use client";

import { useState, useTransition } from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { resendInvite } from "./actions";

export function ResendInviteButton({
  email,
  label,
  sentLabel,
}: {
  email: string;
  label: string;
  sentLabel: string;
}) {
  const [state, setState] = useState<"idle" | "sent" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function send() {
    setState("idle");
    setMessage(null);
    startTransition(async () => {
      const result = await resendInvite(email);
      if (result.ok) {
        setState("sent");
      } else {
        setState("error");
        setMessage(result.message ?? "Send failed");
      }
    });
  }

  return (
    <span className="row" style={{ gap: 8 }}>
      <Button
        variant="secondary"
        size="sm"
        onClick={send}
        disabled={pending}
        data-testid={`resend-${email}`}
      >
        <Send size={14} /> {state === "sent" ? sentLabel : label}
      </Button>
      {state === "error" && message ? (
        <span className="t-small" style={{ color: "var(--error)" }}>
          {message}
        </span>
      ) : null}
    </span>
  );
}
