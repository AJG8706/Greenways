"use client";

import { useState, useTransition } from "react";
import { setSaleStatus } from "@/app/admin/(console)/properties/actions";
import { Select } from "@/components/ui/input";

export type SaleStatus = "available" | "under_contract" | "sold";

export const saleTone: Record<SaleStatus, "available" | "contract" | "sold"> = {
  available: "available",
  under_contract: "contract",
  sold: "sold",
};

export function SaleStatusSelect({
  propertyId,
  value,
  labels,
}: {
  propertyId: string;
  value: SaleStatus;
  labels: Record<SaleStatus, string> & { label: string };
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onChange(next: SaleStatus) {
    setError(null);
    startTransition(async () => {
      const result = await setSaleStatus(propertyId, next);
      if (!result.ok) setError(result.message ?? "Update failed");
    });
  }

  return (
    <span className="row" style={{ gap: 8 }}>
      <span className={`pill pill-${saleTone[value]}`} data-testid="sale-pill">
        {labels[value]}
      </span>
      <Select
        aria-label={labels.label}
        value={value}
        disabled={pending}
        onChange={(e) => onChange(e.target.value as SaleStatus)}
        style={{ width: "auto", minHeight: 32, padding: "2px 8px" }}
        data-testid="sale-select"
      >
        <option value="available">{labels.available}</option>
        <option value="under_contract">{labels.under_contract}</option>
        <option value="sold">{labels.sold}</option>
      </Select>
      {error ? (
        <span className="t-small" style={{ color: "var(--error)" }}>
          {error}
        </span>
      ) : null}
    </span>
  );
}
