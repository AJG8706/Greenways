import { describe, expect, it } from "vitest";
import { composeDigestText } from "@/lib/digest";

describe("composeDigestText", () => {
  it("totals, sorts by walks, and drops quiet lots", () => {
    const text = composeDigestText(
      [
        { name: "Lot 1", walks: 2, completed: 1, interested: 0, loved: 1 },
        { name: "Lot 2", walks: 5, completed: 4, interested: 2, loved: 0 },
        { name: "Lot 3", walks: 0, completed: 0, interested: 0, loved: 0 },
      ],
      "week of Nov 10",
    );
    expect(text).toContain("7 walks, 5 completed, 2 interested, 1 loved it");
    expect(text.indexOf("Lot 2")).toBeLessThan(text.indexOf("Lot 1"));
    expect(text).not.toContain("Lot 3");
  });

  it("says so when nothing happened", () => {
    expect(composeDigestText([], "week of Nov 10")).toContain("no walks this week");
  });

  it("caps the property list and the total length", () => {
    const rows = Array.from({ length: 12 }, (_, i) => ({
      name: `Lot ${i + 1} with quite a long name`,
      walks: i + 1,
      completed: 0,
      interested: 0,
      loved: 0,
    }));
    const text = composeDigestText(rows, "this week");
    expect(text).toContain("+4 more");
    expect(text.length).toBeLessThanOrEqual(900);
  });
});
