import { describe, expect, it } from "vitest";
import { buildFunnel } from "@/lib/analytics/funnel";

describe("buildFunnel", () => {
  it("counts each stage once per session, demo excluded", () => {
    const f = buildFunnel({
      sessions: [
        { id: "a", device: "iPhone" },
        { id: "b", device: null },
        { id: "demo", device: "demo:iPhone" },
      ],
      events: [
        { session_id: "a", name: "disclaimer_acknowledged" },
        { session_id: "a", name: "disclaimer_acknowledged" },
        { session_id: "a", name: "walk_completed" },
        { session_id: "b", name: "walk_opened" },
        { session_id: "demo", name: "disclaimer_acknowledged" },
        { session_id: "stranger", name: "walk_completed" },
        { session_id: null, name: "walk_completed" },
      ],
      issuedLinks: 5,
      leads: 2,
    });
    expect(f).toEqual({ issued: 5, opened: 2, started: 1, completed: 1, interested: 2 });
  });

  it("handles the empty lot", () => {
    expect(buildFunnel({ sessions: [], events: [], issuedLinks: 0, leads: 0 })).toEqual({
      issued: 0,
      opened: 0,
      started: 0,
      completed: 0,
      interested: 0,
    });
  });
});
