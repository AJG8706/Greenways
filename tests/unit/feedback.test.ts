import { describe, expect, it } from "vitest";
import { tallyFeedback } from "@/lib/analytics/feedback";

describe("tallyFeedback", () => {
  it("counts verdicts and not-for-me reasons", () => {
    const t = tallyFeedback([
      { session_id: "a", name: "walk_feedback", data: { verdict: "loved" } },
      { session_id: "b", name: "walk_feedback", data: { verdict: "thinking" } },
      { session_id: "c", name: "walk_feedback", data: { verdict: "not_for_me", reason: "price" } },
      { session_id: "d", name: "walk_feedback", data: { verdict: "not_for_me" } },
      { session_id: "e", name: "walk_completed", data: {} },
    ]);
    expect(t.loved).toBe(1);
    expect(t.thinking).toBe(1);
    expect(t.notForMe).toBe(2);
    expect(t.reasons).toEqual({ price: 1 });
    expect(t.bySession.get("c")).toEqual({ verdict: "not_for_me", reason: "price" });
  });

  it("keeps only the first vote per session", () => {
    const t = tallyFeedback([
      { session_id: "a", name: "walk_feedback", data: { verdict: "loved" } },
      { session_id: "a", name: "walk_feedback", data: { verdict: "not_for_me", reason: "price" } },
    ]);
    expect(t.loved).toBe(1);
    expect(t.notForMe).toBe(0);
  });

  it("ignores demo sessions, junk verdicts, and null sessions", () => {
    const t = tallyFeedback(
      [
        { session_id: "demo1", name: "walk_feedback", data: { verdict: "loved" } },
        { session_id: "x", name: "walk_feedback", data: { verdict: "amazing" } },
        { session_id: null, name: "walk_feedback", data: { verdict: "loved" } },
        { session_id: "y", name: "walk_feedback", data: "not an object" },
      ],
      new Set(["demo1"]),
    );
    expect(t.loved + t.thinking + t.notForMe).toBe(0);
  });

  it("ignores a reason on a positive verdict and truncates long reasons", () => {
    const t = tallyFeedback([
      { session_id: "a", name: "walk_feedback", data: { verdict: "loved", reason: "price" } },
      {
        session_id: "b",
        name: "walk_feedback",
        data: { verdict: "not_for_me", reason: "x".repeat(100) },
      },
    ]);
    expect(t.bySession.get("a")).toEqual({ verdict: "loved", reason: null });
    expect(Object.keys(t.reasons)[0]).toHaveLength(40);
  });
});
