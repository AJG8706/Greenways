// Exit-feedback tally: pure so the admin page and tests share one truth.

export type FeedbackEventRow = {
  session_id: string | null;
  name: string;
  data: unknown;
};

export type FeedbackTally = {
  loved: number;
  thinking: number;
  notForMe: number;
  /** reason key → count, for "not for me" votes that gave one. */
  reasons: Record<string, number>;
  /** session id → verdict (first vote wins; the UI sends only one). */
  bySession: Map<string, { verdict: string; reason: string | null }>;
};

const VERDICTS = new Set(["loved", "thinking", "not_for_me"]);

export function tallyFeedback(
  events: readonly FeedbackEventRow[],
  demoSessionIds?: ReadonlySet<string>,
): FeedbackTally {
  const tally: FeedbackTally = {
    loved: 0,
    thinking: 0,
    notForMe: 0,
    reasons: {},
    bySession: new Map(),
  };
  for (const e of events) {
    if (e.name !== "walk_feedback" || !e.session_id) continue;
    if (demoSessionIds?.has(e.session_id)) continue;
    if (tally.bySession.has(e.session_id)) continue; // one vote per walk
    const data = (e.data ?? {}) as { verdict?: unknown; reason?: unknown };
    const verdict = typeof data.verdict === "string" ? data.verdict : "";
    if (!VERDICTS.has(verdict)) continue;
    const reason =
      verdict === "not_for_me" && typeof data.reason === "string" && data.reason
        ? data.reason.slice(0, 40)
        : null;
    tally.bySession.set(e.session_id, { verdict, reason });
    if (verdict === "loved") tally.loved += 1;
    else if (verdict === "thinking") tally.thinking += 1;
    else {
      tally.notForMe += 1;
      if (reason) tally.reasons[reason] = (tally.reasons[reason] ?? 0) + 1;
    }
  }
  return tally;
}
