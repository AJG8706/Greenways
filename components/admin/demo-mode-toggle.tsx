"use client";

import { useState, useTransition } from "react";
import { setDemoMode } from "@/app/admin/(console)/properties/actions";
import { Checkbox } from "@/components/ui/checkbox";

/**
 * Per-property demo switch. On, the buyer walk accepts the simulated walker
 * from the scenario launchers below. Off, the same link runs live device GPS
 * and ignores `?demo=` entirely — which is what a field GPS test needs and
 * what every real listing should stay on.
 */
export function DemoModeToggle({
  propertyId,
  value,
  labels,
}: {
  propertyId: string;
  value: boolean;
  labels: { on: string; off: string; hint: string };
}) {
  const [checked, setChecked] = useState(value);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onToggle(next: boolean) {
    setError(null);
    setChecked(next);
    startTransition(async () => {
      const result = await setDemoMode(propertyId, next);
      if (!result.ok) {
        setChecked(!next);
        setError(result.message ?? "Update failed");
      }
    });
  }

  return (
    <div className="stack" style={{ gap: "var(--gw-s-2)" }}>
      <label className="row" style={{ gap: "var(--gw-s-3)", cursor: "pointer" }}>
        <Checkbox
          checked={checked}
          disabled={pending}
          onCheckedChange={(next) => onToggle(next === true)}
          data-testid="demo-mode-toggle"
          aria-label={labels.on}
        />
        <span className="t-body-m">{checked ? labels.on : labels.off}</span>
      </label>
      <p className="t-small muted">{labels.hint}</p>
      {error ? (
        <p className="t-small" style={{ color: "var(--error)" }}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
