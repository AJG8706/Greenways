"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore } from "lucide-react";
import { Button } from "@/components/ui/button";
import { setArchived } from "@/app/admin/(console)/properties/actions";

/** One-click, reversible, so no confirm dialog — unlike delete. */
export function ArchivePropertyButton({
  propertyId,
  archived,
}: {
  propertyId: string;
  archived: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  return (
    <div className="stack" style={{ gap: 6, alignItems: "flex-end" }}>
      <Button
        variant="secondary"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setMessage(null);
            const result = await setArchived(propertyId, !archived);
            if (result.ok) router.refresh();
            else setMessage(result.message ?? "Could not update");
          })
        }
        data-testid="archive-property"
      >
        {archived ? <ArchiveRestore size={16} /> : <Archive size={16} />}{" "}
        {pending ? "Working…" : archived ? "Unarchive" : "Archive"}
      </Button>
      {message ? (
        <p className="t-small" role="alert" style={{ color: "var(--error)" }}>
          {message}
        </p>
      ) : null}
    </div>
  );
}
