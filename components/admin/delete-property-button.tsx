"use client";

import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { deleteProperty } from "@/app/admin/(console)/properties/actions";
import { Button } from "@/components/ui/button";

export function DeletePropertyButton({
  propertyId,
  propertyName,
}: {
  propertyId: string;
  propertyName: string;
}) {
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function remove() {
    const typed = window.prompt(
      `This permanently deletes "${propertyName}" — corners, photos, content, links. Type the property name to confirm:`,
    );
    if (typed === null) return;
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

  return (
    <div className="stack" style={{ gap: "var(--gw-s-2)" }}>
      <Button
        variant="danger"
        onClick={remove}
        disabled={pending}
        data-testid="delete-property"
      >
        <Trash2 size={16} /> Delete property
      </Button>
      {message ? (
        <p className="t-small" style={{ color: "var(--error)" }}>
          {message}
        </p>
      ) : null}
    </div>
  );
}
