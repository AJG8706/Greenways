import "server-only";

/**
 * Walk milestones → n8n → GoHighLevel opportunity stages. The app never
 * talks to GHL directly (locked decision: GHL goes through n8n); it emits
 * the milestone with an explicit stage intent and the n8n workflow moves
 * the contact's opportunity:
 *
 *   walk_completed → "seen_the_property"  (Seen the property)
 *   walk_lead      → "contract_ready"     (Contract ready)
 *
 * ghlContactId is set when the walk ran on a tokenized prospect link;
 * public-link leads carry only the phone number for n8n to match or
 * create the contact. Best-effort: a milestone never fails the buyer's
 * request. Unset env = no-op.
 */
export type WalkMilestone = {
  kind: "walk_completed" | "walk_lead";
  stage: "seen_the_property" | "contract_ready";
  slug: string;
  lot: string;
  ghlContactId: string | null;
  locale: string;
  sessionId: string | null;
  name?: string | null;
  phone?: string | null;
};

/** The n8n workflow texts the sales team (Laura & Mario — numbers live in
 * n8n, never in this repo) whenever this is true; both milestones set it. */
const NOTIFY_SALES_TEAM = true;

export async function forwardWalkMilestone(milestone: WalkMilestone): Promise<void> {
  const webhook = process.env.N8N_WALK_WEBHOOK_URL || process.env.N8N_LEAD_WEBHOOK_URL;
  if (!webhook) return;
  try {
    await fetch(webhook, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-webhook-secret": process.env.N8N_WEBHOOK_SECRET ?? "",
      },
      body: JSON.stringify({
        ...milestone,
        notifySalesTeam: NOTIFY_SALES_TEAM,
        submittedAt: new Date().toISOString(),
      }),
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    // The row is already stored; the stage move retries on the next milestone.
  }
}
