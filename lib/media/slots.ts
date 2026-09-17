// Media slots per the Higgsfield Prompt Library v1.0. Each generated slot
// names its source captures (Photos tab paths) and how the provider should
// move the camera. Panorama stills (library §5) are deferred until the
// outpaint endpoint is validated with the real key — noted in the Gate 4
// report — so v1 covers the four video asset types.

export type MediaSlotKind = "intro" | "entrance" | "homesite" | "corner_approach";

export type MediaSlot = {
  /** media_assets.slot key, e.g. "intro" or "corner_2_approach". */
  key: string;
  kind: MediaSlotKind;
  /** Corner number for corner_approach slots. */
  cornerN?: number;
  /**
   * Higgsfield motion to search for by name (resolved at submit time against
   * GET /v1/motions; generation proceeds without a motion when unmatched).
   */
  motionQuery: string;
  /** Target clip length in seconds (library spec; provider may quantize). */
  targetSeconds: number;
};

/** Style lock (credits discipline): these two validate the look first. */
export const STYLE_LOCK_SLOTS = ["intro", "entrance"] as const;

export function mediaSlotsFor(cornerNs: number[]): MediaSlot[] {
  return [
    { key: "intro", kind: "intro", motionQuery: "crane down", targetSeconds: 18 },
    { key: "entrance", kind: "entrance", motionQuery: "dolly in", targetSeconds: 7 },
    ...cornerNs.map<MediaSlot>((n) => ({
      key: `corner_${n}_approach`,
      kind: "corner_approach",
      cornerN: n,
      motionQuery: "dolly in",
      targetSeconds: 7,
    })),
    { key: "homesite", kind: "homesite", motionQuery: "arc right", targetSeconds: 12 },
  ];
}

/**
 * Whether batch slots (corners, homesite) may generate yet: the style is
 * locked once intro AND entrance each have an approved asset (library
 * workflow step 2 — cheapest to validate first).
 */
export function styleLocked(approvedSlots: ReadonlySet<string>): boolean {
  return STYLE_LOCK_SLOTS.every((s) => approvedSlots.has(s));
}

export function canGenerateSlot(
  slot: MediaSlot,
  approvedSlots: ReadonlySet<string>,
): boolean {
  if (slot.kind === "intro" || slot.kind === "entrance") return true;
  return styleLocked(approvedSlots);
}
