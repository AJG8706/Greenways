"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateAllLots } from "@/app/admin/(console)/properties/actions";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";

/**
 * Master-page bulk editor: applies shared attributes to every lot at once.
 * Empty fields are left as they are; per-lot editing stays available on
 * each lot's own pages afterwards.
 */
export function LotsBulkEdit({ masterId, lotCount }: { masterId: string; lotCount: number }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function submit(formData: FormData) {
    setResult(null);
    startTransition(async () => {
      const res = await updateAllLots(masterId, formData);
      setResult({ ok: res.ok, message: res.message ?? (res.ok ? "Applied." : "Update failed") });
      if (res.ok) {
        formRef.current?.reset();
        // Same pattern as DocumentsCard/SubdivisionImportCard: the Lots table
        // is server-rendered, so pull the fresh tree explicitly.
        router.refresh();
      }
    });
  }

  return (
    <section className="card stack" style={{ gap: "var(--gw-s-3)" }} data-testid="lots-bulk-edit">
      <div>
        <h3>Edit all lots</h3>
        <p className="t-small muted">
          Applies to all {lotCount} lots at once. Fields left empty or on &ldquo;leave as
          is&rdquo; don&rsquo;t change anything; each lot stays individually editable.
        </p>
      </div>
      <form ref={formRef} action={submit} className="stack" style={{ gap: "var(--gw-s-3)" }}>
        <div className="row" style={{ gap: "var(--gw-s-3)", flexWrap: "wrap" }}>
          <label className="field grow">
            Address
            <Input name="address" placeholder="Leave empty to keep each lot's address" />
          </label>
          <label className="field">
            County
            <Input name="county" placeholder="Leave empty to keep" />
          </label>
        </div>
        <div className="row" style={{ gap: "var(--gw-s-3)", flexWrap: "wrap" }}>
          <label className="field">
            Sale status
            <Select name="sale_status" defaultValue="" data-testid="bulk-sale-select">
              <option value="">Leave as is</option>
              <option value="available">Available</option>
              <option value="under_contract">Under contract</option>
              <option value="sold">Sold</option>
            </Select>
          </label>
          <label className="field">
            Demo mode
            <Select name="demo_mode" defaultValue="" data-testid="bulk-demo-select">
              <option value="">Leave as is</option>
              <option value="on">On (simulated walks)</option>
              <option value="off">Off (live GPS)</option>
            </Select>
          </label>
          <div className="field" style={{ justifyContent: "flex-end" }}>
            <Button type="submit" disabled={pending} data-testid="bulk-apply">
              {pending ? "Applying..." : "Apply to all lots"}
            </Button>
          </div>
        </div>
        {result ? (
          <p
            className="t-small"
            style={{ color: result.ok ? "var(--ok)" : "var(--error)" }}
            data-testid="bulk-result"
            role={result.ok ? "status" : "alert"}
          >
            {result.message}
          </p>
        ) : null}
      </form>
    </section>
  );
}
