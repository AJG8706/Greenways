import { describe, expect, it } from "vitest";
import { findMotion } from "@/lib/higgsfield/motion";
import {
  buildPrompt,
  GLOBAL_STYLE_SUFFIX,
  resolveBrief,
  roadFromAddress,
} from "@/lib/media/prompts";
import {
  canGenerateSlot,
  mediaSlotsFor,
  styleLocked,
} from "@/lib/media/slots";

const LOT4 = {
  acres: 1.49,
  address: "8990 Broussard Rd, Beaumont, TX 77713",
  brief: {},
  corners: [
    { n: 1, label: "Northwest", stake: "orange cap and pink flagging" },
    { n: 2, label: "Northeast", stake: "orange cap and pink flagging" },
    { n: 3, label: "Southeast", stake: "" },
    { n: 4, label: "", stake: "" },
  ],
};

describe("media slots (Prompt Library)", () => {
  it("builds intro, entrance, one approach per corner, homesite", () => {
    const slots = mediaSlotsFor([1, 2, 3, 4]);
    expect(slots.map((s) => s.key)).toEqual([
      "intro",
      "entrance",
      "corner_1_approach",
      "corner_2_approach",
      "corner_3_approach",
      "corner_4_approach",
      "homesite",
    ]);
  });

  it("credits discipline: corners and homesite wait for the style lock", () => {
    const slots = mediaSlotsFor([1, 2]);
    const none = new Set<string>();
    const introOnly = new Set(["intro"]);
    const locked = new Set(["intro", "entrance"]);

    expect(styleLocked(none)).toBe(false);
    expect(styleLocked(introOnly)).toBe(false);
    expect(styleLocked(locked)).toBe(true);

    const corner = slots.find((s) => s.key === "corner_1_approach")!;
    const homesite = slots.find((s) => s.key === "homesite")!;
    const intro = slots.find((s) => s.key === "intro")!;
    expect(canGenerateSlot(intro, none)).toBe(true);
    expect(canGenerateSlot(corner, introOnly)).toBe(false);
    expect(canGenerateSlot(homesite, introOnly)).toBe(false);
    expect(canGenerateSlot(corner, locked)).toBe(true);
  });
});

describe("prompt templating (Prompt Library v1.0)", () => {
  it("derives the road from the address", () => {
    expect(roadFromAddress("8990 Broussard Rd, Beaumont, TX 77713")).toBe(
      "Broussard Rd, Beaumont",
    );
    expect(roadFromAddress("Broussard Rd")).toBe("Broussard Rd");
    expect(roadFromAddress(null)).toBeNull();
    expect(roadFromAddress("")).toBeNull();
  });

  it("brief overrides beat derived defaults", () => {
    const b = resolveBrief({
      address: "8990 Broussard Rd, Beaumont, TX 77713",
      brief: { road: "FM 365", groundCover: "mowed grass" },
    });
    expect(b.road).toBe("FM 365");
    expect(b.groundCover).toBe("mowed grass");
    expect(b.features.length).toBeGreaterThan(0); // default kicks in
  });

  it("intro fill matches the library's Broussard example shape", () => {
    const p = buildPrompt(mediaSlotsFor([1])[0]!, LOT4);
    expect(p).toContain("Cinematic aerial establishing shot of a 1.49-acre rural Texas land parcel");
    expect(p).toContain("bordered by Broussard Rd, Beaumont");
    expect(p).toContain("seen from 300 feet");
    expect(p.endsWith(GLOBAL_STYLE_SUFFIX)).toBe(true);
  });

  it("every prompt carries the HARD-RULE style suffix", () => {
    for (const slot of mediaSlotsFor([1, 2, 3, 4])) {
      expect(buildPrompt(slot, LOT4).endsWith(GLOBAL_STYLE_SUFFIX)).toBe(true);
    }
  });

  it("corner approach uses the corner's own stake description and label", () => {
    const slots = mediaSlotsFor([1, 2, 3, 4]);
    const c1 = buildPrompt(slots.find((s) => s.key === "corner_1_approach")!, LOT4);
    expect(c1).toContain("orange cap and pink flagging");
    expect(c1).toContain("Northwest corner");

    // Missing stake text falls back honestly, missing label falls back to Cn.
    const c4 = buildPrompt(slots.find((s) => s.key === "corner_4_approach")!, LOT4);
    expect(c4).toContain("an orange cap and flagging");
    expect(c4).toContain("C4 corner");
  });
});

describe("motion lookup", () => {
  const motions = [
    { id: "a", name: "Crane Down", start_end_frame: true },
    { id: "b", name: "Slow Dolly In" },
    { id: "c", name: "Arc Right" },
  ];

  it("matches exact, substring, then word-wise", () => {
    expect(findMotion(motions, "crane down")?.id).toBe("a");
    expect(findMotion(motions, "dolly in")?.id).toBe("b");
    expect(findMotion(motions, "right arc")?.id).toBe("c");
    expect(findMotion(motions, "vertigo")).toBeNull();
    expect(findMotion([], "crane down")).toBeNull();
  });
});

describe("provider response parsing (v1 job-set + v2 request dialects)", async () => {
  const { parseStatusResponse, parseSubmitResponse } = await import("@/lib/higgsfield/parse");
  const BASE = "https://platform.example";

  it("v1 submit: job-set id polls at /v1/job-sets/{id}", () => {
    const r = parseSubmitResponse({ id: "js1", jobs: [{ status: "queued" }] }, BASE);
    expect(r).toEqual({ requestId: "js1", statusUrl: `${BASE}/v1/job-sets/js1` });
  });

  it("v2 submit: request_id + status_url pass through verbatim", () => {
    const r = parseSubmitResponse(
      { request_id: "r1", status_url: "https://x/requests/r1/status" },
      BASE,
    );
    expect(r).toEqual({ requestId: "r1", statusUrl: "https://x/requests/r1/status" });
    expect(parseSubmitResponse({}, BASE)).toBeNull();
  });

  it("v1 status: derives overall status and the completed job's media URL", () => {
    expect(parseStatusResponse({ jobs: [{ status: "queued" }] }).status).toBe("queued");
    expect(parseStatusResponse({ jobs: [{ status: "in_progress" }] }).status).toBe("in_progress");
    const done = parseStatusResponse({
      jobs: [{ status: "completed", results: { raw: { url: "https://cdn/x.mp4" } } }],
    });
    expect(done.status).toBe("completed");
    expect(done.resultUrl).toBe("https://cdn/x.mp4");
    expect(parseStatusResponse({ jobs: [{ status: "nsfw" }] }).status).toBe("nsfw");
    expect(parseStatusResponse({ jobs: [{ status: "failed" }] }).status).toBe("failed");
  });

  it("v2 status: video/image URLs and error detail", () => {
    const r = parseStatusResponse({ status: "completed", video: { url: "https://cdn/v.mp4" } });
    expect(r.resultUrl).toBe("https://cdn/v.mp4");
    const f = parseStatusResponse({ status: "failed", detail: [{ msg: "boom" }] });
    expect(f.status).toBe("failed");
    expect(f.error).toContain("boom");
  });
});
