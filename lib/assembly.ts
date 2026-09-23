// Assembly pipeline for a listing: the ordered stages from bare property to
// published walk, derived purely from data so the checklist can never disagree
// with the tabs. Used by the Overview checklist (and anything else that needs
// "what's next" for a property).

import { mediaSlotsFor, STYLE_LOCK_SLOTS } from "@/lib/media/slots";

export type AssemblyCornerInput = {
  n: number;
  locked: boolean;
  approachPhoto: boolean;
  stakePhoto: boolean;
};

export type AssemblyInput = {
  corners: AssemblyCornerInput[];
  /** Slots of capture-type media_assets present (aerial, gate, homesite, …). */
  captureSlots: readonly string[];
  briefSaved: boolean;
  /** Non-capture media_assets as slot → status (newest wins upstream). */
  approvedGeneratedSlots: readonly string[];
  esReviewed: boolean;
  published: boolean;
};

export type AssemblyStageKey =
  | "geometry"
  | "verify"
  | "photos"
  | "brief"
  | "style"
  | "batch"
  | "spanish"
  | "publish";

export type AssemblyStage = {
  key: AssemblyStageKey;
  done: boolean;
  /** Progress note for partially complete stages, e.g. "7 of 11 photos". */
  detail?: string;
};

export const PROPERTY_CAPTURE_SLOTS = ["aerial", "gate", "homesite"] as const;

export function assemblyStages(input: AssemblyInput): {
  stages: AssemblyStage[];
  /** First stage still to do, or null when the walk is live. */
  next: AssemblyStageKey | null;
} {
  const corners = [...input.corners].sort((a, b) => a.n - b.n);
  const captures = new Set(input.captureSlots);
  const approved = new Set(input.approvedGeneratedSlots);

  const geometryDone = corners.length >= 3;
  const verifyDone = geometryDone && corners.every((c) => c.locked);

  const photosNeeded = PROPERTY_CAPTURE_SLOTS.length + corners.length * 2;
  const photosHave =
    PROPERTY_CAPTURE_SLOTS.filter((s) => captures.has(s)).length +
    corners.reduce(
      (sum, c) => sum + (c.approachPhoto ? 1 : 0) + (c.stakePhoto ? 1 : 0),
      0,
    );
  const photosDone = geometryDone && photosHave >= photosNeeded;

  const styleDone = STYLE_LOCK_SLOTS.every((s) => approved.has(s));

  const styleKeys = new Set<string>(STYLE_LOCK_SLOTS);
  const batchSlots = mediaSlotsFor(corners.map((c) => c.n)).filter((s) => !styleKeys.has(s.key));
  const batchApproved = batchSlots.filter((s) => approved.has(s.key)).length;
  const batchDone = geometryDone && batchApproved >= batchSlots.length;

  const stages: AssemblyStage[] = [
    { key: "geometry", done: geometryDone },
    { key: "verify", done: verifyDone },
    {
      key: "photos",
      done: photosDone,
      detail: geometryDone && !photosDone ? `${photosHave}/${photosNeeded}` : undefined,
    },
    { key: "brief", done: input.briefSaved },
    { key: "style", done: styleDone },
    {
      key: "batch",
      done: batchDone,
      detail:
        geometryDone && !batchDone && batchApproved > 0
          ? `${batchApproved}/${batchSlots.length}`
          : undefined,
    },
    { key: "spanish", done: input.esReviewed },
    { key: "publish", done: input.published },
  ];

  return { stages, next: stages.find((s) => !s.done)?.key ?? null };
}
