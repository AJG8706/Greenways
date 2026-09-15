"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { inviteTeamMember } from "./actions";
import type { ActionResult } from "../properties/actions";

const initialState: ActionResult = { ok: true };

export function InviteForm({
  labels,
}: {
  labels: { email: string; role: string; admin: string; editor: string; invite: string };
}) {
  const [state, formAction, pending] = useActionState(inviteTeamMember, initialState);

  return (
    <form action={formAction} className="stack">
      <label className="field">
        {labels.email}
        <Input type="email" name="email" required data-testid="invite-email" />
      </label>
      <label className="field">
        {labels.role}
        <Select name="role" defaultValue="editor" data-testid="invite-role">
          <option value="editor">{labels.editor}</option>
          <option value="admin">{labels.admin}</option>
        </Select>
      </label>
      {!state.ok && state.message ? (
        <div className="banner banner-error" role="alert">
          {state.message}
        </div>
      ) : null}
      <div className="row">
        <Button type="submit" disabled={pending} data-testid="send-invite">
          {labels.invite}
        </Button>
      </div>
    </form>
  );
}
