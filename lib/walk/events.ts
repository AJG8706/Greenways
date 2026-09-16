"use client";

/**
 * Walk-event logger (HUD spec §11): batched, sent when online, queued in
 * localStorage when not. Fire-and-forget — telemetry never breaks the walk.
 */
type QueuedEvent = { name: string; data?: Record<string, unknown>; ts: number };

const STORAGE_KEY = "gw-walk-events";
const FLUSH_INTERVAL_MS = 15000;

export type WalkLogger = {
  log: (name: string, data?: Record<string, unknown>) => void;
  stop: () => void;
};

export function createWalkLogger(input: {
  slug: string;
  locale: string;
  demoKey: string | null;
}): WalkLogger {
  let queue: QueuedEvent[] = restore();
  let sessionId: string | null = null;
  let flushing = false;

  const device = `${input.demoKey ? `demo:${input.demoKey} · ` : ""}${
    typeof navigator === "undefined" ? "" : navigator.userAgent.slice(0, 90)
  }`;

  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(queue.slice(-100)));
    } catch {
      // storage unavailable — memory queue still works for this session
    }
  }

  function restore(): QueuedEvent[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? (parsed as QueuedEvent[]) : [];
    } catch {
      return [];
    }
  }

  async function flush() {
    if (flushing || queue.length === 0) return;
    if (typeof navigator !== "undefined" && navigator.onLine === false) return;
    flushing = true;
    const batch = queue.slice(0, 100);
    try {
      const res = await fetch("/api/walk-events", {
        method: "POST",
        keepalive: true,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: input.slug,
          sessionId: sessionId ?? undefined,
          locale: input.locale,
          device,
          events: batch,
        }),
      });
      if (res.ok) {
        const json = (await res.json()) as { sessionId?: string };
        sessionId = json.sessionId ?? sessionId;
        queue = queue.slice(batch.length);
        persist();
      }
    } catch {
      // offline or blocked — the queue keeps the events for the next flush
    } finally {
      flushing = false;
    }
  }

  const interval =
    typeof window === "undefined" ? null : window.setInterval(() => void flush(), FLUSH_INTERVAL_MS);
  const onHidden = () => {
    if (document.visibilityState === "hidden") void flush();
  };
  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", onHidden);
  }

  return {
    log(name, data) {
      queue.push({ name, data, ts: Date.now() });
      persist();
      if (name === "walk_completed" || name === "walk_opened") void flush();
    },
    stop() {
      if (interval !== null) window.clearInterval(interval);
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", onHidden);
      }
      void flush();
    },
  };
}
