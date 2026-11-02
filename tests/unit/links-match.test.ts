import { describe, expect, it } from "vitest";
import { matchPropertyByArea, normalizeArea, type MatchableProperty } from "@/lib/links-match";

// The real shape of the inventory: masters with lot children whose names
// contain the master's name — the case the equality-first ranking exists for.
const P = (
  id: string,
  slug: string,
  nameEn: string,
  address: string | null,
  parentId: string | null,
  published = true,
): MatchableProperty => ({ id, slug, nameEn, address, parentId, published });

const inventory: MatchableProperty[] = [
  P("m1", "cr-4800-warren-tx", "CR 4800 Warren, TX", "CR 4800, Warren, TX", null),
  P("l1", "cr-4800-warren-tx-lot-1", "CR 4800 Warren, TX — Lot 1", "CR 4800, Warren, TX", "m1"),
  P("l3", "cr-4800-warren-tx-lot-3", "CR 4800 Warren, TX — Lot 8", "CR 4800, Warren, TX", "m1"),
  P("m2", "fm-1504-wills-point-tx", "FM 1504 Wills Point TX", "FM 1504, Wills Point, TX", null),
  P("l4", "fm-1504-wills-point-tx-lot-4", "FM 1504 Wills Point TX — Lot 4 - 11.04 ac", null, "m2"),
  P("m3", "broussard-rd-beaumont-tx", "Broussard Rd (Gaines Acres)", "7535 Broussard Rd, Beaumont, TX", null, false),
];

describe("normalizeArea", () => {
  it("strips punctuation and case", () => {
    expect(normalizeArea("CR 4800, Warren — TX!")).toBe("cr 4800 warren tx");
  });
});

describe("matchPropertyByArea", () => {
  it("exact name match lands on the master, not a lot that contains it", () => {
    expect(matchPropertyByArea(inventory, "CR 4800 Warren, TX")?.id).toBe("m1");
  });

  it("punctuation and dash drift still match exactly", () => {
    expect(matchPropertyByArea(inventory, "cr-4800 warren tx")?.id).toBe("m1");
  });

  it("a lot-specific area lands on that lot", () => {
    expect(matchPropertyByArea(inventory, "FM 1504 Wills Point TX — Lot 4 - 11.04 ac")?.id).toBe(
      "l4",
    );
  });

  it("free text containing the property name matches by containment", () => {
    expect(
      matchPropertyByArea(inventory, "interested in FM 1504 Wills Point TX acreage")?.id,
    ).toBe("m2");
  });

  it("matches the address when the marketing name differs", () => {
    expect(matchPropertyByArea(inventory, "7535 Broussard Rd, Beaumont, TX")?.id).toBe("m3");
  });

  it("unknown areas return null instead of a guess", () => {
    expect(matchPropertyByArea(inventory, "County Road 9999 Nowhere")).toBeNull();
    expect(matchPropertyByArea(inventory, "tx")).toBeNull();
  });
});
