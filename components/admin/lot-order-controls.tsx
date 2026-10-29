"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, ArrowDownAZ } from "lucide-react";
import { Button } from "@/components/ui/button";
import { moveLot, sortLotsByName } from "@/app/admin/(console)/properties/actions";

/**
 * Per-row up/down controls for the master's Lots table. Imports number lots
 * from the plat, but a renamed set can end up out of order — these let the
 * team fix the display order by hand.
 */
export function LotOrderControls({
  masterId,
  lotId,
  first,
  last,
}: {
  masterId: string;
  lotId: string;
  first: boolean;
  last: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function move(direction: "up" | "down") {
    startTransition(async () => {
      const result = await moveLot(masterId, lotId, direction);
      if (result.ok) router.refresh();
    });
  }

  return (
    <span className="row" style={{ gap: 2, flexWrap: "nowrap" }}>
      <Button
        variant="ghost"
        size="sm"
        aria-label="Move lot up"
        disabled={pending || first}
        onClick={() => move("up")}
        data-testid={`lot-up-${lotId}`}
      >
        <ArrowUp size={14} />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        aria-label="Move lot down"
        disabled={pending || last}
        onClick={() => move("down")}
        data-testid={`lot-down-${lotId}`}
      >
        <ArrowDown size={14} />
      </Button>
    </span>
  );
}

/** One click: re-sort every lot by name (natural order, "Lot 2" < "Lot 10"). */
export function SortLotsByNameButton({ masterId }: { masterId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  return (
    <span className="row" style={{ gap: 8 }}>
      <Button
        variant="secondary"
        size="sm"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await sortLotsByName(masterId);
            if (result.ok) router.refresh();
            else setMessage(result.message ?? "Sort failed");
          })
        }
        data-testid="sort-lots-by-name"
      >
        <ArrowDownAZ size={14} /> {pending ? "Sorting…" : "Sort by name"}
      </Button>
      {message ? (
        <span className="t-small" style={{ color: "var(--gw-fence-post-red)" }}>
          {message}
        </span>
      ) : null}
    </span>
  );
}
