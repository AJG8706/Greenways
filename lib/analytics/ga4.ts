// Pure GA4 Measurement Protocol payload builder — vendor logic in one place
// (same isolation rule as lib/media/provider), unit-tested separately from
// the server-only dispatcher in lib/analytics/index.ts.

export type WalkEventInput = {
  name: string;
  data?: Record<string, unknown>;
};

export type WalkEventContext = {
  slug: string;
  /** walk_sessions id — doubles as the GA client id so funnels line up. */
  sessionId: string;
  locale: string;
  demo: boolean;
};

type Ga4Event = { name: string; params: Record<string, string | number> };

export type Ga4Payload = {
  client_id: string;
  events: Ga4Event[];
};

/** GA4 MP allows at most 25 events per request. */
export const GA4_MAX_EVENTS = 25;

export function buildGa4Payload(
  events: WalkEventInput[],
  ctx: WalkEventContext,
): Ga4Payload {
  return {
    client_id: ctx.sessionId,
    events: events.slice(0, GA4_MAX_EVENTS).map((e) => {
      const params: Record<string, string | number> = {
        property_slug: ctx.slug,
        locale: ctx.locale,
        demo: ctx.demo ? 1 : 0,
      };
      for (const [k, v] of Object.entries(e.data ?? {})) {
        if (typeof v === "number") params[k] = v;
        else if (typeof v === "string") params[k] = v.slice(0, 100);
        else if (typeof v === "boolean") params[k] = v ? 1 : 0;
      }
      // GA4 event names: letters, digits, underscores — ours already are,
      // but sanitize so a future event name can't silently fail.
      return { name: e.name.replace(/[^a-zA-Z0-9_]/g, "_").slice(0, 40), params };
    }),
  };
}
