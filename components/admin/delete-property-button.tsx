"use client";

import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { deleteProperty } from "@/app/admin/(console)/properties/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Type-to-confirm delete, rendered inline (window.prompt blocks the main
 * thread the whole time it is open and trips INP). A master warns that its
 * lots go with it — deleting the folder deletes the contents.
 */
export function DeletePropertyButton({
  propertyId,
  propertyName,
  lotCount = 0,
}: {
  propertyId: string;
  propertyName: string;
  lotCount?: number;
}) {
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function remove() {
    if (typed.trim() !== propertyName) {
      setMessage("Name didn't match — nothing was deleted.");
      return;
    }
    setMessage(null);
    startTransition(async () => {
      const result = await deleteProperty(propertyId);
      if (!result.ok) setMessage(result.message ?? "Delete failed");
    });
  }

  if (!confirming) {
    return (
      <Button
        variant="danger"
        onClick={() => setConfirming(true)}
        data-testid="delete-property"
      >
        <Trash2 size={16} /> Delete property
      </Button>
    );
  }

  return (
    <div className="stack" style={{ gap: "var(--gw-s-2)", maxWidth: 420 }}>
      <p className="t-small">
        This permanently deletes <strong>{propertyName}</strong>
        {lotCount > 0 ? (
          <>
            {" "}
            <strong>and its {lotCount} lots</strong>
          </>
        ) : null}{" "}
        — corners, photos, content, links. Type the property name to confirm:
      </p>
      <Input
        value={typed}
        onChange={(e) => setTyped(e.target.value)}
        placeholder={propertyName}
        disabled={pending}
        data-testid="delete-confirm-input"
      />
      <div className="row" style={{ gap: "var(--gw-s-2)" }}>
        <Button
          variant="danger"
          onClick={remove}
          disabled={pending || typed.trim() !== propertyName}
          data-testid="delete-confirm"
        >
          <Trash2 size={16} /> {pending ? "Deleting..." : "Permanently delete"}
        </Button>
        <Button
          variant="ghost"
          disabled={pending}
          onClick={() => {
            setConfirming(false);
            setTyped("");
            setMessage(null);
          }}
        >
          Cancel
        </Button>
      </div>
      {message ? (
        <p className="t-small" style={{ color: "var(--error)" }}>
          {message}
        </p>
      ) : null}
    </div>
  );
}
