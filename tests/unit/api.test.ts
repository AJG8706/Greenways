import { describe, expect, it } from "vitest";
import { KEY_PREFIX, generateApiKey, hashApiKey, hashesEqual } from "@/lib/api/keys";
import {
  aggregateWalks,
  isDemoDevice,
  median,
  type EventRow,
  type SessionRow,
} from "@/lib/analytics/walk-aggregate";

describe("API key material", () => {
  it("generates gw_live_ secrets with a stored sha256 and display prefix", () => {
    const { secret, hash, prefix } = generateApiKey();
    expect(secret.startsWith(KEY_PREFIX)).toBe(true);
    expect(secret.length).toBe(KEY_PREFIX.length + 43); // 32 bytes base64url
    expect(hash).toBe(hashApiKey(secret));
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(prefix).toBe(secret.slice(0, 12));
    expect(secret.includes(hash)).toBe(false);
  });

  it("generates unique secrets", () => {
    const seen = new Set(Array.from({ length: 50 }, () => generateApiKey().secret));
    expect(seen.size).toBe(50);
  });

  it("hashes deterministically and compares in constant time", () => {
    const a = hashApiKey("gw_live_abc");
    expect(hashApiKey("gw_live_abc")).toBe(a);
    expect(hashApiKey("gw_live_abd")).not.toBe(a);
    expect(hashesEqual(a, a)).toBe(true);
    expect(hashesEqual(a, hashApiKey("gw_live_abd"))).toBe(false);
    expect(hashesEqual(a, "abc")).toBe(false); // length mismatch never throws
  });
});

describe("walk aggregation", () => {
  it("median handles empty, odd, even", () => {
    expect(median([])).toBeNull();
    expect(median([7])).toBe(7);
    expect(median([3, 9, 5])).toBe(5);
    expect(median([4, 10])).toBe(7);
  });

  it("flags demo devices by prefix only", () => {
    expect(isDemoDevice("demo:chrome")).toBe(true);
    expect(isDemoDevice("Android 14 · Chrome")).toBe(false);
    expect(isDemoDevice(null)).toBe(false);
  });

  const sessions: SessionRow[] = [
    { id: "s1", link_id: "pub", locale: "en", started_at: "2026-09-17T00:00:00Z", device: "Android" },
    { id: "s2", link_id: "pro", locale: "es", started_at: "2026-09-17T01:00:00Z", device: "iPhone" },
    { id: "s3", link_id: "pub", locale: "en", started_at: "2026-09-17T02:00:00Z", device: "demo:qa" },
  ];
  const events: EventRow[] = [
    { session_id: "s1", name: "corner_found", data: { n: 1, seconds: 30 } },
    { session_id: "s1", name: "corner_found", data: { n: 2, seconds: 50 } },
    { session_id: "s1", name: "walk_completed", data: {} },
    { session_id: "s2", name: "corner_found", data: { n: 1, seconds: 40 } },
    { session_id: "s2", name: "boundary_exit", data: {} },
    { session_id: "s2", name: "gps_weak", data: {} },
    // demo session events must not leak into buyer numbers
    { session_id: "s3", name: "corner_found", data: { n: 1, seconds: 5 } },
    { session_id: "s3", name: "walk_completed", data: {} },
    { session_id: null, name: "corner_found", data: { n: 9, seconds: 1 } },
  ];

  it("aggregates buyer walks, excluding demo sessions entirely", () => {
    const agg = aggregateWalks(sessions, events, new Set(["pro"]));
    expect(agg.buyerWalks).toBe(2);
    expect(agg.demoWalks).toBe(1);
    expect(agg.completed).toBe(1);
    expect(agg.completionPct).toBe(50);
    expect(agg.medianCornerSeconds).toBe(40);
    expect(agg.perCorner).toEqual([
      { n: 1, count: 2, medianSeconds: 35 },
      { n: 2, count: 1, medianSeconds: 50 },
    ]);
    expect(agg.boundaryExits).toBe(1);
    expect(agg.compassProblems).toBe(1);
    expect(agg.languages).toEqual({ en: 1, es: 1 });
    expect(agg.prospectWalks).toBe(1);
    expect(agg.perSession.has("s3")).toBe(false);
  });

  it("is safe on empty input", () => {
    const agg = aggregateWalks([], [], new Set());
    expect(agg.buyerWalks).toBe(0);
    expect(agg.completionPct).toBe(0);
    expect(agg.medianCornerSeconds).toBeNull();
    expect(agg.perCorner).toEqual([]);
  });
});
