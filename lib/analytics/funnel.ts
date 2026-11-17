// Per-lot conversion funnel: links issued → opened → started → completed →
// interested. Pure, so the master analytics page and tests share one truth.

import { isDemoDevice, type EventRow, type SessionRow } from "./walk-aggregate";

export type FunnelCounts = {
  /** Prospect links issued (not revoked). */
  issued: number;
  /** Buyer sessions that opened the walk (demo excluded). */
  opened: number;
  /** Sessions that pressed Start (disclaimer_acknowledged). */
  started: number;
  /** Sessions that finished all corners. */
  completed: number;
  /** Leads left (form or swipe). */
  interested: number;
};

export function buildFunnel(input: {
  sessions: readonly Pick<SessionRow, "id" | "device">[];
  events: readonly Pick<EventRow, "session_id" | "name">[];
  issuedLinks: number;
  leads: number;
}): FunnelCounts {
  const buyer = input.sessions.filter((s) => !isDemoDevice(s.device));
  const buyerIds = new Set(buyer.map((s) => s.id));
  const started = new Set<string>();
  const completed = new Set<string>();
  for (const e of input.events) {
    if (!e.session_id || !buyerIds.has(e.session_id)) continue;
    if (e.name === "disclaimer_acknowledged") started.add(e.session_id);
    else if (e.name === "walk_completed") completed.add(e.session_id);
  }
  return {
    issued: input.issuedLinks,
    opened: buyer.length,
    started: started.size,
    completed: completed.size,
    interested: input.leads,
  };
}
