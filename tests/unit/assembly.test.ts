import { describe, expect, it } from "vitest";
import { assemblyStages, type AssemblyInput } from "@/lib/assembly";

const corner = (n: number, over: Partial<AssemblyInput["corners"][number]> = {}) => ({
  n,
  locked: false,
  approachPhoto: false,
  stakePhoto: false,
  ...over,
});

const base: AssemblyInput = {
  corners: [],
  captureSlots: [],
  briefSaved: false,
  approvedGeneratedSlots: [],
  esReviewed: false,
  published: false,
};

describe("assembly stages", () => {
  it("bare property: everything open, next is geometry", () => {
    const { stages, next } = assemblyStages(base);
    expect(next).toBe("geometry");
    expect(stages.every((s) => !s.done)).toBe(true);
  });

  it("imported but unlocked corners advance to verify", () => {
    const { next } = assemblyStages({
      ...base,
      corners: [corner(1), corner(2), corner(3), corner(4)],
    });
    expect(next).toBe("verify");
  });

  it("counts photos across property captures and corner pairs", () => {
    const { stages, next } = assemblyStages({
      ...base,
      corners: [
        corner(1, { locked: true, approachPhoto: true, stakePhoto: true }),
        corner(2, { locked: true, approachPhoto: true }),
        corner(3, { locked: true }),
        corner(4, { locked: true }),
      ],
      captureSlots: ["aerial", "gate"],
    });
    expect(next).toBe("photos");
    // 2 property captures + 3 corner photos of 3 + 4*2 needed
    expect(stages.find((s) => s.key === "photos")!.detail).toBe("5/11");
  });

  it("style lock waits on intro AND entrance; batch waits on all clips", () => {
    const ready = {
      ...base,
      corners: [1, 2, 3, 4].map((n) =>
        corner(n, { locked: true, approachPhoto: true, stakePhoto: true }),
      ),
      captureSlots: ["aerial", "gate", "homesite"],
      briefSaved: true,
    };
    expect(assemblyStages({ ...ready, approvedGeneratedSlots: ["intro"] }).next).toBe("style");

    const styled = { ...ready, approvedGeneratedSlots: ["intro", "entrance", "corner_1_approach"] };
    const result = assemblyStages(styled);
    expect(result.next).toBe("batch");
    expect(result.stages.find((s) => s.key === "batch")!.detail).toBe("1/5");
  });

  it("full pipeline done ends with publish, then null", () => {
    const done: AssemblyInput = {
      corners: [1, 2, 3, 4].map((n) =>
        corner(n, { locked: true, approachPhoto: true, stakePhoto: true }),
      ),
      captureSlots: ["aerial", "gate", "homesite"],
      briefSaved: true,
      approvedGeneratedSlots: [
        "intro",
        "entrance",
        "corner_1_approach",
        "corner_2_approach",
        "corner_3_approach",
        "corner_4_approach",
        "homesite",
      ],
      esReviewed: true,
      published: false,
    };
    expect(assemblyStages(done).next).toBe("publish");
    expect(assemblyStages({ ...done, published: true }).next).toBeNull();
  });
});
