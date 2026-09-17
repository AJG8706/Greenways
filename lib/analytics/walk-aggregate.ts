// Pure walk-analytics aggregation, shared by the admin Analytics tab and
// GET /api/v1/properties/{slug}/analytics — one definition of the numbers.

export type SessionRow = {
  id: string;
  link_id: string | null;
  locale: string | null;
  started_at: string;
  device: string | null;
};

export type EventRow = {
  session_id: string | null;
  name: string;
  data: unknown;
};

export type PerCorner = { n: number; count: number; medianSeconds: number | null };

export type WalkAggregate = {
  buyerWalks: number;
  completed: number;
  completionPct: number;
  medianCornerSeconds: number | null;
  perCorner: PerCorner[];
  boundaryExits: number;
  compassProblems: number;
  languages: { en: number; es: number };
  prospectWalks: number;
  demoWalks: number;
  perSession: Map<string, { found: number; completed: boolean }>;
};

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : Math.round((sorted[mid - 1]! + sorted[mid]!) / 2);
}

export function isDemoDevice(device: string | null): boolean {
  return (device ?? "").startsWith("demo:");
}

export function aggregateWalks(
  sessions: SessionRow[],
  events: EventRow[],
  prospectLinkIds: ReadonlySet<string>,
): WalkAggregate {
  const real = sessions.filter((s) => !isDemoDevice(s.device));
  const realIds = new Set(real.map((s) => s.id));

  const perSession = new Map<string, { found: number; completed: boolean }>();
  for (const s of real) perSession.set(s.id, { found: 0, completed: false });

  const cornerSeconds: number[] = [];
  const perCornerSecs = new Map<number, number[]>();
  let boundaryExits = 0;
  let compassProblems = 0;

  for (const e of events) {
    if (!e.session_id || !realIds.has(e.session_id)) continue;
    const agg = perSession.get(e.session_id);
    const data = (e.data ?? {}) as { n?: number; seconds?: number };
    switch (e.name) {
      case "corner_found": {
        if (agg) agg.found += 1;
        if (typeof data.seconds === "number") {
          cornerSeconds.push(data.seconds);
          if (typeof data.n === "number") {
            const list = perCornerSecs.get(data.n) ?? [];
            list.push(data.seconds);
            perCornerSecs.set(data.n, list);
          }
        }
        break;
      }
      case "walk_completed":
        if (agg) agg.completed = true;
        break;
      case "boundary_exit":
        boundaryExits += 1;
        break;
      case "compass_unreliable":
      case "gps_weak":
        compassProblems += 1;
        break;
    }
  }

  const completed = [...perSession.values()].filter((s) => s.completed).length;
  const es = real.filter((s) => s.locale === "es").length;

  return {
    buyerWalks: real.length,
    completed,
    completionPct: real.length ? Math.round((completed / real.length) * 100) : 0,
    medianCornerSeconds: median(cornerSeconds),
    perCorner: [...perCornerSecs.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([n, secs]) => ({ n, count: secs.length, medianSeconds: median(secs) })),
    boundaryExits,
    compassProblems,
    languages: { en: real.length - es, es },
    prospectWalks: real.filter((s) => s.link_id && prospectLinkIds.has(s.link_id)).length,
    demoWalks: sessions.length - real.length,
    perSession,
  };
}
