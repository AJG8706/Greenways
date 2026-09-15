"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { createProperty, type ActionResult } from "./actions";

const initialState: ActionResult = { ok: true };

export function NewPropertyDialog() {
  const t = useTranslations("admin.properties");
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(createProperty, initialState);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button data-testid="new-property">
          <Plus size={18} /> {t("new")}
        </Button>
      </DialogTrigger>
      <DialogContent title={t("new")}>
        <form action={formAction} className="stack">
          <label className="field">
            {t("cols.property")}
            <Input name="name" required placeholder="Broussard Rd — Lot 4 (Gaines Acres)" />
          </label>
          <label className="field">
            Address
            <Input name="address" placeholder="7595 Broussard Rd, Beaumont, TX 77713" />
          </label>
          <label className="field">
            {t("cols.county")}
            <Input name="county" placeholder="Jefferson" />
          </label>
          {!state.ok && state.message ? (
            <div className="banner banner-error" role="alert">
              {state.message}
            </div>
          ) : null}
          <div className="row" style={{ justifyContent: "flex-end" }}>
            <Button type="submit" disabled={pending} data-testid="create-property">
              {t("new")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
