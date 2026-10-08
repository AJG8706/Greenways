"use client";

import { useState, useTransition } from "react";
import { updateAcres } from "@/app/admin/(console)/properties/actions";

/**
 * Inline acreage editor for the master's Lots table. The imported geometry
 * only approximates the surveyed plat, so the team can type the plat number
 * right where the discrepancy shows. Saves on blur or Enter.
 */
export function AcresCell({
  propertyId,
  acres,
}: {
  propertyId: string;
  acres: number | null;
}) {
  const [value, setValue] = useState(acres === null ? "" : String(acres));
  const [invalid, setInvalid] = useState(false);
  const [pending, startTransition] = useTransition();

  function save() {
    const next = Number(value);
    if (value.trim() === "" || !Number.isFinite(next) || next <= 0) {
      // Empty or junk input: restore what's saved rather than erroring.
      setValue(acres === null ? "" : String(acres));
      setInvalid(false);
      return;
    }
    if (acres !== null && Math.abs(next - acres) < 0.005) return;
    startTransition(async () => {
      const result = await updateAcres(propertyId, next);
      if (!result.ok) setInvalid(true);
      else window.location.reload();
    });
  }

  return (
    <input
      inputMode="decimal"
      value={value}
      disabled={pending}
      aria-label="Acres"
      aria-invalid={invalid}
      data-testid={`acres-${propertyId}`}
      onChange={(e) => {
        setValue(e.target.value);
        setInvalid(false);
      }}
      onBlur={save}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
      className="num rounded-1"
      style={{
        width: 84,
        textAlign: "right",
        padding: "4px 8px",
        // ≥16px or iOS zooms the whole page on focus.
        fontSize: 16,
        background: "transparent",
        border: `1px solid ${invalid ? "var(--gw-fence-post-red)" : "var(--gw-border, rgba(36,48,31,.25))"}`,
        opacity: pending ? 0.6 : 1,
      }}
    />
  );
}
