import type { MediaSlot } from "@/lib/media/slots";

/**
 * Prompt Library v1.0 templates, filled from the property record. Pure module
 * so the fills are unit-testable. The HARD RULE (output depicts only what
 * exists on the land) is carried by the global suffix on every prompt and
 * enforced by the human review queue — never skipped.
 */

export const GLOBAL_STYLE_SUFFIX =
  "photorealistic, natural Texas daylight, true-to-source terrain and vegetation, " +
  "no added structures, no added water features, stable horizon, smooth motion, " +
  "documentary realism, no people";

/** Free-text prompt variables; stored in properties.media_brief. */
export type MediaBrief = {
  /** Road the frontage is on, e.g. "Broussard Rd, Beaumont". */
  road?: string;
  /** Defining features seen from the air, e.g. "open grass parcel with mature tree cover along the rear line". */
  features?: string;
  /** Ground cover walked through, e.g. "mowed grass" / "native pasture". */
  groundCover?: string;
  /** Homesite description, e.g. "level ground, scattered mature oaks at the perimeter, open sky". */
  homesite?: string;
  /** Gate/culvert/driveway description for the entrance clip. */
  entrance?: string;
};

export type PromptContext = {
  acres: number | null;
  address: string | null;
  brief: MediaBrief;
  corners: { n: number; label: string; stake: string }[];
};

/** Defaults derived from the record; the brief overrides them. */
export function resolveBrief(ctx: Pick<PromptContext, "address" | "brief">): Required<MediaBrief> {
  const road = ctx.brief.road?.trim() || roadFromAddress(ctx.address) || "the county road";
  return {
    road,
    features: ctx.brief.features?.trim() || "the open parcel and its natural tree cover",
    groundCover: ctx.brief.groundCover?.trim() || "native pasture grass",
    homesite: ctx.brief.homesite?.trim() || "level open ground with natural tree cover at the perimeter",
    entrance: ctx.brief.entrance?.trim() || "the unpaved entrance at the road frontage",
  };
}

/** "8990 Broussard Rd, Beaumont, TX 77713" → "Broussard Rd, Beaumont". */
export function roadFromAddress(address: string | null): string | null {
  if (!address) return null;
  const parts = address.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return null;
  const street = parts[0]!.replace(/^[0-9][0-9a-z-]*\s+/i, "").trim();
  if (!street) return null;
  return parts.length > 1 ? `${street}, ${parts[1]}` : street;
}

export function buildPrompt(slot: MediaSlot, ctx: PromptContext): string {
  const b = resolveBrief(ctx);
  const acres = ctx.acres !== null ? `${ctx.acres}-acre` : "rural";
  let body: string;

  switch (slot.kind) {
    case "intro":
      body =
        `Cinematic aerial establishing shot of a ${acres} rural Texas land parcel ` +
        `bordered by ${b.road}, seen from 300 feet, slowly descending toward the ` +
        `road frontage entrance, revealing ${b.features}, ending at eye level ` +
        `facing the entrance from ${b.road}.`;
      break;
    case "entrance":
      body =
        `Vehicle-perspective arrival shot turning from ${b.road} onto the property ` +
        `entrance of a rural Texas lot, ${b.entrance}, slowing to a stop facing the land.`;
      break;
    case "homesite":
      body =
        `Slow half-orbit around a cleared potential homesite area on a rural Texas ` +
        `land parcel, ${b.homesite}, conveying space and privacy, golden-hour light.`;
      break;
    case "corner_approach": {
      const corner = ctx.corners.find((c) => c.n === slot.cornerN);
      const label = corner?.label || `C${slot.cornerN}`;
      const stake = corner?.stake?.trim() || "an orange cap and flagging";
      body =
        `First-person walking shot moving steadily forward through ${b.groundCover} ` +
        `toward a surveyor's corner stake marked with ${stake}, ${label} corner of a ` +
        `rural Texas lot, ending close on the stake at knee height.`;
      break;
    }
  }

  return `${body} ${GLOBAL_STYLE_SUFFIX}`;
}
